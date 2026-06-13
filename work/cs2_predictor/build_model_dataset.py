from __future__ import annotations

import argparse
import csv
import json
import math
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from .paths import DATA_ROOT
from .validation import accuracy_at_threshold, brier_score, log_loss, make_purged_time_folds
from .warehouse import WAREHOUSE_PATH, connect


MODEL_ROOT = DATA_ROOT / "model"
TRAINING_CSV_PATH = MODEL_ROOT / "training_matches.csv"
REPORT_PATH = Path("outputs") / "cs2_model_ready_dataset_status.md"


PHASE_ORDER = {
    "grand_final": 100,
    "final": 95,
    "semifinal": 85,
    "quarterfinal": 75,
    "round_of_16": 65,
    "round_of_32": 55,
    "playoffs": 50,
    "swiss_high": 45,
    "swiss_mid": 35,
    "swiss_low": 30,
    "swiss_round": 25,
    "group_stage": 20,
    "qualifier": 10,
    "showmatch": 5,
    "regular": 1,
    "unknown": 0,
}


NUMERIC_FEATURES = [
    "elo_diff",
    "elo_prob_team1",
    "hltv_rank_advantage",
    "team1_rank_known",
    "team2_rank_known",
    "vrs_rank_advantage",
    "vrs_points_diff",
    "team1_vrs_rank_known",
    "team2_vrs_rank_known",
    "prior_win_rate_diff",
    "recent_win_rate_10_diff",
    "prior_playoff_win_rate_diff",
    "prior_elimination_win_rate_diff",
    "h2h_win_rate_team1",
    "h2h_match_count",
    "days_rest_diff",
    "best_of",
    "phase_order",
    "is_lan",
    "is_playoff",
    "is_elimination_match",
]


def safe_int(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(parsed) or math.isinf(parsed):
        return default
    return parsed


def sigmoid(value: float) -> float:
    value = max(min(value, 35.0), -35.0)
    return 1.0 / (1.0 + math.exp(-value))


def elo_probability(elo_diff: float) -> float:
    return 1.0 / (1.0 + 10 ** (-elo_diff / 400.0))


def parse_best_of(value: str | None) -> int:
    text = (value or "").casefold()
    for number in (7, 5, 3, 2, 1):
        if f"bo{number}" in text or f"best of {number}" in text:
            return number
    return 3


def rate(wins: int, total: int, neutral: float = 0.5) -> float:
    return wins / total if total > 0 else neutral


def classify_model_tier(row: sqlite3.Row) -> str:
    event_tier = (row["liquipedia_event_tier"] or "").casefold()
    publisher_tier = (row["liquipedia_publisher_tier"] or "").casefold()
    event_type = (row["event_type"] or "").casefold()
    phase = (row["match_phase"] or "").casefold()
    ranks = [rank for rank in (row["team1_rank"], row["team2_rank"]) if rank is not None]
    best_rank = min(ranks) if ranks else 999
    worst_rank = max(ranks) if ranks else 999
    offline = "offline" in event_type

    if "major" in publisher_tier or "tier 1" in publisher_tier:
        return "T1"
    if event_tier == "s-tier" and offline and best_rank <= 50:
        return "T1"
    if event_tier == "s-tier" or (event_tier == "a-tier" and offline and best_rank <= 80):
        return "T1_5"
    if best_rank <= 30 and worst_rank <= 100 and phase != "qualifier":
        return "T1_5"
    if event_tier in {"a-tier", "b-tier"} or best_rank <= 120:
        return "T2"
    return "T3"


def classify_integrity_risk(row: sqlite3.Row, model_tier: str) -> str:
    event_tier = (row["liquipedia_event_tier"] or "").casefold()
    publisher_tier = (row["liquipedia_publisher_tier"] or "").casefold()
    event_type = (row["event_type"] or "").casefold()
    phase = (row["match_phase"] or "").casefold()
    ranks = [rank for rank in (row["team1_rank"], row["team2_rank"]) if rank is not None]
    worst_rank = max(ranks) if ranks else 999

    if "showmatch" in phase or "showmatch" in event_tier:
        return "high"
    if model_tier in {"T1", "T1_5"} and "offline" in event_type and "qualifier" not in publisher_tier:
        return "low"
    if model_tier == "T2" and worst_rank <= 120:
        return "medium"
    return "high"


@dataclass
class TeamState:
    elo: float = 1500.0
    matches: int = 0
    wins: int = 0
    playoff_matches: int = 0
    playoff_wins: int = 0
    elimination_matches: int = 0
    elimination_wins: int = 0
    last_timestamp: int | None = None
    recent_results: list[int] = field(default_factory=list)

    def recent_rate(self, n: int = 10) -> float:
        values = self.recent_results[-n:]
        return sum(values) / len(values) if values else 0.5


def h2h_key(team1: str, team2: str) -> tuple[str, str]:
    return tuple(sorted((team1.casefold(), team2.casefold())))


def h2h_rate_for_team1(h2h: dict[tuple[str, str], dict[str, int]], team1: str, team2: str) -> tuple[float, int]:
    key = h2h_key(team1, team2)
    row = h2h.get(key, {})
    total = safe_int(row.get("total"), 0) or 0
    if total == 0:
        return 0.5, 0
    team1_wins = safe_int(row.get(team1.casefold()), 0) or 0
    return team1_wins / total, total


def match_target(row: sqlite3.Row) -> int:
    return 1 if int(row["team1_score"]) > int(row["team2_score"]) else 0


def make_feature_row(
    row: sqlite3.Row,
    team_states: defaultdict[str, TeamState],
    h2h: dict[tuple[str, str], dict[str, int]],
) -> dict[str, Any]:
    team1 = row["team1_name"]
    team2 = row["team2_name"]
    state1 = team_states[team1.casefold()]
    state2 = team_states[team2.casefold()]
    target = match_target(row)
    timestamp = int(row["match_timestamp"])
    model_tier = classify_model_tier(row)
    integrity_risk = classify_integrity_risk(row, model_tier)
    h2h_team1_rate, h2h_count = h2h_rate_for_team1(h2h, team1, team2)
    team1_rank = safe_int(row["team1_rank"])
    team2_rank = safe_int(row["team2_rank"])
    hltv_rank_advantage = (team2_rank or 101) - (team1_rank or 101)
    team1_vrs_rank = safe_int(row["team1_vrs_rank"])
    team2_vrs_rank = safe_int(row["team2_vrs_rank"])
    team1_vrs_points = safe_float(row["team1_vrs_points"])
    team2_vrs_points = safe_float(row["team2_vrs_points"])
    vrs_rank_advantage = (team2_vrs_rank or 401) - (team1_vrs_rank or 401)
    vrs_points_diff = team1_vrs_points - team2_vrs_points
    days_rest1 = (timestamp - state1.last_timestamp) / 86400.0 if state1.last_timestamp else 14.0
    days_rest2 = (timestamp - state2.last_timestamp) / 86400.0 if state2.last_timestamp else 14.0
    days_rest1 = min(days_rest1, 30.0)
    days_rest2 = min(days_rest2, 30.0)
    is_lan = 1 if "offline" in (row["event_type"] or "").casefold() else 0
    is_playoff = safe_int(row["is_playoff"], 0) or 0
    is_elimination = safe_int(row["is_elimination_match"], 0) or 0
    elo_diff = state1.elo - state2.elo

    return {
        "match_id": row["match_id"],
        "match_date": row["match_date"],
        "match_timestamp": timestamp,
        "event_name": row["event_name"],
        "team1_name": team1,
        "team2_name": team2,
        "target_team1_win": target,
        "team1_score": row["team1_score"],
        "team2_score": row["team2_score"],
        "model_tier": model_tier,
        "integrity_risk": integrity_risk,
        "liquipedia_event_tier": row["liquipedia_event_tier"] or "",
        "liquipedia_publisher_tier": row["liquipedia_publisher_tier"] or "",
        "event_type": row["event_type"] or "",
        "match_phase": row["match_phase"] or "unknown",
        "stage_name": row["liquipedia_stage_name"] or "",
        "round_name": row["liquipedia_round_name"] or "",
        "team1_hltv_rank": team1_rank or "",
        "team2_hltv_rank": team2_rank or "",
        "team1_vrs_rank": team1_vrs_rank or "",
        "team2_vrs_rank": team2_vrs_rank or "",
        "team1_vrs_points": team1_vrs_points,
        "team2_vrs_points": team2_vrs_points,
        "elo_diff": elo_diff,
        "elo_prob_team1": elo_probability(elo_diff),
        "hltv_rank_advantage": hltv_rank_advantage,
        "team1_rank_known": 1 if team1_rank else 0,
        "team2_rank_known": 1 if team2_rank else 0,
        "vrs_rank_advantage": vrs_rank_advantage,
        "vrs_points_diff": vrs_points_diff,
        "team1_vrs_rank_known": 1 if team1_vrs_rank else 0,
        "team2_vrs_rank_known": 1 if team2_vrs_rank else 0,
        "team1_prior_win_rate": rate(state1.wins, state1.matches),
        "team2_prior_win_rate": rate(state2.wins, state2.matches),
        "prior_win_rate_diff": rate(state1.wins, state1.matches) - rate(state2.wins, state2.matches),
        "team1_recent_win_rate_10": state1.recent_rate(10),
        "team2_recent_win_rate_10": state2.recent_rate(10),
        "recent_win_rate_10_diff": state1.recent_rate(10) - state2.recent_rate(10),
        "team1_prior_playoff_win_rate": rate(state1.playoff_wins, state1.playoff_matches),
        "team2_prior_playoff_win_rate": rate(state2.playoff_wins, state2.playoff_matches),
        "prior_playoff_win_rate_diff": rate(state1.playoff_wins, state1.playoff_matches)
        - rate(state2.playoff_wins, state2.playoff_matches),
        "team1_prior_elimination_win_rate": rate(state1.elimination_wins, state1.elimination_matches),
        "team2_prior_elimination_win_rate": rate(state2.elimination_wins, state2.elimination_matches),
        "prior_elimination_win_rate_diff": rate(state1.elimination_wins, state1.elimination_matches)
        - rate(state2.elimination_wins, state2.elimination_matches),
        "h2h_win_rate_team1": h2h_team1_rate,
        "h2h_match_count": h2h_count,
        "team1_days_rest": days_rest1,
        "team2_days_rest": days_rest2,
        "days_rest_diff": days_rest1 - days_rest2,
        "best_of": parse_best_of(row["format"]),
        "phase_order": PHASE_ORDER.get((row["match_phase"] or "unknown").casefold(), 0),
        "is_lan": is_lan,
        "is_playoff": is_playoff,
        "is_elimination_match": is_elimination,
    }


def update_state_from_feature_row(
    feature_row: dict[str, Any],
    team_states: defaultdict[str, TeamState],
    h2h: dict[tuple[str, str], dict[str, int]],
) -> None:
    team1 = str(feature_row["team1_name"])
    team2 = str(feature_row["team2_name"])
    team1_key = team1.casefold()
    team2_key = team2.casefold()
    state1 = team_states[team1_key]
    state2 = team_states[team2_key]
    target = int(feature_row["target_team1_win"])
    timestamp = int(feature_row["match_timestamp"])
    model_tier = str(feature_row["model_tier"])
    is_playoff = safe_int(feature_row["is_playoff"], 0) or 0
    is_elimination = safe_int(feature_row["is_elimination_match"], 0) or 0

    expected1 = elo_probability(state1.elo - state2.elo)
    k_factor = 28.0 if model_tier in {"T1", "T1_5"} else 20.0
    state1.elo += k_factor * (target - expected1)
    state2.elo += k_factor * ((1 - target) - (1 - expected1))
    state1.matches += 1
    state2.matches += 1
    state1.wins += target
    state2.wins += 1 - target
    state1.recent_results.append(target)
    state2.recent_results.append(1 - target)
    if is_playoff:
        state1.playoff_matches += 1
        state2.playoff_matches += 1
        state1.playoff_wins += target
        state2.playoff_wins += 1 - target
    if is_elimination:
        state1.elimination_matches += 1
        state2.elimination_matches += 1
        state1.elimination_wins += target
        state2.elimination_wins += 1 - target
    state1.last_timestamp = timestamp
    state2.last_timestamp = timestamp

    pair_key = h2h_key(team1, team2)
    pair = h2h.setdefault(pair_key, {"total": 0})
    pair["total"] += 1
    pair[team1_key] = pair.get(team1_key, 0) + target
    pair[team2_key] = pair.get(team2_key, 0) + (1 - target)


def fetch_matches(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    connection.row_factory = sqlite3.Row
    return connection.execute(
        """
        SELECT
            m.match_id,
            m.match_date,
            m.match_timestamp,
            m.event_name,
            m.team1_name,
            m.team1_key,
            m.team2_name,
            m.team2_key,
            m.team1_rank,
            m.team2_rank,
            (
                SELECT vr.rank
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= m.match_date
                  AND (vr.team_key = m.team1_key OR lower(vr.team_name) = lower(m.team1_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team1_vrs_rank,
            (
                SELECT vr.points
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= m.match_date
                  AND (vr.team_key = m.team1_key OR lower(vr.team_name) = lower(m.team1_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team1_vrs_points,
            (
                SELECT vr.rank
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= m.match_date
                  AND (vr.team_key = m.team2_key OR lower(vr.team_name) = lower(m.team2_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team2_vrs_rank,
            (
                SELECT vr.points
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= m.match_date
                  AND (vr.team_key = m.team2_key OR lower(vr.team_name) = lower(m.team2_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team2_vrs_points,
            m.team1_score,
            m.team2_score,
            m.format,
            m.status,
            m.liquipedia_event_tier,
            m.liquipedia_publisher_tier,
            m.liquipedia_stage_name,
            m.liquipedia_round_name,
            m.match_phase,
            m.is_playoff,
            m.is_elimination_match,
            e.event_type,
            e.organizer,
            e.series,
            e.team_count
        FROM hltv_result_matches m
        LEFT JOIN liquipedia_events e
          ON e.source_title = m.liquipedia_event_source_title
        WHERE m.match_timestamp IS NOT NULL
          AND m.team1_name IS NOT NULL
          AND m.team2_name IS NOT NULL
          AND m.team1_score IS NOT NULL
          AND m.team2_score IS NOT NULL
          AND m.team1_score != m.team2_score
          AND m.match_date IS NOT NULL
        ORDER BY m.match_timestamp, m.match_id
        """
    ).fetchall()


def build_rows(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    team_states: defaultdict[str, TeamState] = defaultdict(TeamState)
    h2h: dict[tuple[str, str], dict[str, int]] = {}
    output: list[dict[str, Any]] = []

    for row in fetch_matches(connection):
        team1 = row["team1_name"]
        team2 = row["team2_name"]
        if not team1 or not team2:
            continue
        feature_row = make_feature_row(row, team_states, h2h)
        output.append(feature_row)
        update_state_from_feature_row(feature_row, team_states, h2h)

    return output


def write_training_csv(rows: list[dict[str, Any]], path: Path = TRAINING_CSV_PATH) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return 0
    fields = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def store_training_table(connection: sqlite3.Connection, rows: list[dict[str, Any]]) -> int:
    connection.execute("DROP TABLE IF EXISTS model_training_matches")
    if not rows:
        connection.commit()
        return 0
    fields = list(rows[0].keys())
    type_by_field = {
        field: "REAL" if field in NUMERIC_FEATURES or field.startswith("team") and field.endswith("_rate") else "TEXT"
        for field in fields
    }
    type_by_field.update(
        {
            "match_id": "INTEGER PRIMARY KEY",
            "match_timestamp": "INTEGER",
            "target_team1_win": "INTEGER",
            "team1_score": "INTEGER",
            "team2_score": "INTEGER",
            "team1_hltv_rank": "INTEGER",
            "team2_hltv_rank": "INTEGER",
        }
    )
    columns = ", ".join(f"{field} {type_by_field[field]}" for field in fields)
    connection.execute(f"CREATE TABLE model_training_matches ({columns})")
    placeholders = ", ".join("?" for _ in fields)
    connection.executemany(
        f"INSERT INTO model_training_matches ({', '.join(fields)}) VALUES ({placeholders})",
        [[row.get(field) for field in fields] for row in rows],
    )
    connection.commit()
    return len(rows)


def fit_logistic_regression(
    x_train: np.ndarray,
    y_train: np.ndarray,
    *,
    epochs: int = 1200,
    learning_rate: float = 0.04,
    l2: float = 0.01,
) -> np.ndarray:
    x_aug = np.c_[np.ones(x_train.shape[0]), x_train]
    weights = np.zeros(x_aug.shape[1], dtype=float)
    for _ in range(epochs):
        logits = np.clip(x_aug @ weights, -35.0, 35.0)
        probs = 1.0 / (1.0 + np.exp(-logits))
        gradient = (x_aug.T @ (probs - y_train)) / len(y_train)
        gradient[1:] += l2 * weights[1:]
        weights -= learning_rate * gradient
    return weights


def predict_logistic(weights: np.ndarray, x: np.ndarray) -> np.ndarray:
    x_aug = np.c_[np.ones(x.shape[0]), x]
    logits = np.clip(x_aug @ weights, -35.0, 35.0)
    return 1.0 / (1.0 + np.exp(-logits))


def evaluate_rows(rows: list[dict[str, Any]], *, tiers: set[str], risk_levels: set[str]) -> dict[str, Any]:
    filtered = [
        row
        for row in rows
        if row["model_tier"] in tiers and row["integrity_risk"] in risk_levels
    ]
    if len(filtered) < 180:
        return {"rows": len(filtered), "error": "not enough rows for time validation"}

    timestamps = [datetime.fromtimestamp(int(row["match_timestamp"]), tz=timezone.utc) for row in filtered]
    try:
        folds = make_purged_time_folds(timestamps, n_splits=5, purge_days=7, min_train_size=100)
    except ValueError as exc:
        return {"rows": len(filtered), "error": str(exc)}

    x_all = np.array([[safe_float(row.get(feature)) for feature in NUMERIC_FEATURES] for row in filtered], dtype=float)
    y_all = np.array([int(row["target_team1_win"]) for row in filtered], dtype=float)
    elo_probs = np.array([safe_float(row["elo_prob_team1"], 0.5) for row in filtered], dtype=float)
    fold_metrics = []
    for fold in folds:
        x_train = x_all[fold.train_indices]
        y_train = y_all[fold.train_indices]
        x_test = x_all[fold.test_indices]
        y_test = y_all[fold.test_indices]

        mean = x_train.mean(axis=0)
        std = x_train.std(axis=0)
        std[std == 0] = 1.0
        x_train_scaled = (x_train - mean) / std
        x_test_scaled = (x_test - mean) / std
        weights = fit_logistic_regression(x_train_scaled, y_train)
        probs = predict_logistic(weights, x_test_scaled)
        elo_test = elo_probs[fold.test_indices]

        fold_metrics.append(
            {
                "train_rows": len(fold.train_indices),
                "test_rows": len(fold.test_indices),
                "test_start": fold.test_start.date().isoformat(),
                "test_end": fold.test_end.date().isoformat(),
                "logistic_accuracy": accuracy_at_threshold(y_test.astype(int).tolist(), probs.tolist()),
                "logistic_log_loss": log_loss(y_test.astype(int).tolist(), probs.tolist()),
                "logistic_brier": brier_score(y_test.astype(int).tolist(), probs.tolist()),
                "elo_accuracy": accuracy_at_threshold(y_test.astype(int).tolist(), elo_test.tolist()),
                "elo_log_loss": log_loss(y_test.astype(int).tolist(), elo_test.tolist()),
                "elo_brier": brier_score(y_test.astype(int).tolist(), elo_test.tolist()),
            }
        )

    averages = {
        key: sum(fold[key] for fold in fold_metrics) / len(fold_metrics)
        for key in (
            "logistic_accuracy",
            "logistic_log_loss",
            "logistic_brier",
            "elo_accuracy",
            "elo_log_loss",
            "elo_brier",
        )
    }
    return {
        "rows": len(filtered),
        "folds": len(fold_metrics),
        "fold_metrics": fold_metrics,
        "averages": averages,
    }


def count_by(rows: Iterable[dict[str, Any]], field: str) -> dict[str, int]:
    counts: defaultdict[str, int] = defaultdict(int)
    for row in rows:
        counts[str(row.get(field) or "unknown")] += 1
    return dict(sorted(counts.items()))


def write_report(rows: list[dict[str, Any]], evaluation: dict[str, Any], path: Path = REPORT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tier_counts = count_by(rows, "model_tier")
    risk_counts = count_by(rows, "integrity_risk")
    phase_counts = count_by(rows, "match_phase")
    averages = evaluation.get("averages") or {}

    def fmt(value: Any) -> str:
        return f"{float(value):.3f}" if isinstance(value, (float, int)) else "n/a"

    lines = [
        "# CS2 Model-Ready Dataset Status",
        "",
        f"Date: {datetime.now(timezone.utc).date().isoformat()}",
        "",
        "## Dataset",
        "",
        f"- Training rows: {len(rows)}",
        f"- CSV: `{TRAINING_CSV_PATH}`",
        "- SQLite table: `model_training_matches`",
        "- Target: `target_team1_win` at series level",
        "- Leakage guard: rolling team, h2h, rest, pressure, and Elo features are computed before each match is added to history.",
        "",
        "## Tier Counts",
        "",
        "| Model tier | Rows |",
        "|---|---:|",
    ]
    lines.extend(f"| {tier} | {count} |" for tier, count in tier_counts.items())
    lines.extend(
        [
            "",
            "## Integrity Risk Counts",
            "",
            "| Integrity risk | Rows |",
            "|---|---:|",
        ]
    )
    lines.extend(f"| {risk} | {count} |" for risk, count in risk_counts.items())
    lines.extend(
        [
            "",
            "## Baseline Validation",
            "",
            "Validation scope: T1/T1.5/T2 rows with low or medium integrity risk, using purged forward time folds.",
            "",
            f"- Rows evaluated: {evaluation.get('rows', 0)}",
            f"- Folds: {evaluation.get('folds', 0)}",
            f"- Logistic baseline accuracy: {fmt(averages.get('logistic_accuracy'))}",
            f"- Logistic baseline log loss: {fmt(averages.get('logistic_log_loss'))}",
            f"- Logistic baseline Brier: {fmt(averages.get('logistic_brier'))}",
            f"- Elo-only baseline accuracy: {fmt(averages.get('elo_accuracy'))}",
            f"- Elo-only baseline log loss: {fmt(averages.get('elo_log_loss'))}",
            f"- Elo-only baseline Brier: {fmt(averages.get('elo_brier'))}",
            "",
            "These metrics are sanity checks on the current seed data, not final model claims. The sample is still too small and too Tier-1-heavy for a serious 60%+ accuracy claim.",
            "",
            "## Largest Phase Buckets",
            "",
            "| Phase | Rows |",
            "|---|---:|",
        ]
    )
    for phase, count in sorted(phase_counts.items(), key=lambda item: (-item[1], item[0]))[:12]:
        lines.append(f"| {phase} | {count} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build model-ready CS2 match rows and run baseline validation.")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--csv-path", default=str(TRAINING_CSV_PATH))
    parser.add_argument("--report-path", default=str(REPORT_PATH))
    args = parser.parse_args()

    connection = connect(Path(args.db_path))
    rows = build_rows(connection)
    write_training_csv(rows, Path(args.csv_path))
    store_training_table(connection, rows)
    evaluation = evaluate_rows(rows, tiers={"T1", "T1_5", "T2"}, risk_levels={"low", "medium"})
    write_report(rows, evaluation, Path(args.report_path))
    print(
        json.dumps(
            {
                "rows": len(rows),
                "csv_path": args.csv_path,
                "sqlite_table": "model_training_matches",
                "tier_counts": count_by(rows, "model_tier"),
                "integrity_risk_counts": count_by(rows, "integrity_risk"),
                "evaluation": evaluation,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
