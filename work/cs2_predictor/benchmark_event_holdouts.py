from __future__ import annotations

import argparse
import copy
import csv
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from .build_model_dataset import (
    NUMERIC_FEATURES,
    TeamState,
    fit_logistic_regression,
    log_loss,
    make_feature_row,
    predict_logistic,
    safe_float,
    update_state_from_feature_row,
)
from .paths import DATA_ROOT
from .validation import accuracy_at_threshold, brier_score
from .warehouse import WAREHOUSE_PATH, connect


BENCHMARK_EVENTS = {
    "cologne_major_2026": "Intel Extreme Masters/2026/Cologne",
    "pgl_astana_2026": "PGL/2026/Astana",
    "iem_atlanta_2026": "Intel Extreme Masters/2026/Atlanta",
}
BENCHMARK_SOURCE_TITLES = set(BENCHMARK_EVENTS.values())
PREDICTIONS_PATH = DATA_ROOT / "model" / "event_holdout_predictions.csv"
REPORT_PATH = Path("outputs") / "cs2_event_holdout_benchmark.md"
STATE_UPDATE_POLICIES = ("all", "no_t3", "clean_only", "ranked_top120", "ranked_top200")
DEFAULT_MAP_CONFIG = {
    "rank_coef": 0.055,
    "map_coef": 2.1,
    "evidence_denominator": 18.0,
    "prior_strength": 0.0,
}

LOGISTIC_FEATURE_SETS = {
    "all": NUMERIC_FEATURES,
    "rank_core": [
        "elo_diff",
        "elo_prob_team1",
        "hltv_rank_advantage",
        "team1_rank_known",
        "team2_rank_known",
        "vrs_rank_advantage",
        "vrs_points_diff",
        "team1_vrs_rank_known",
        "team2_vrs_rank_known",
        "best_of",
        "phase_order",
        "is_lan",
        "is_playoff",
        "is_elimination_match",
    ],
    "rank_form": [
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
        "days_rest_diff",
        "best_of",
        "phase_order",
        "is_lan",
        "is_playoff",
        "is_elimination_match",
    ],
    "rank_pressure": [
        "elo_diff",
        "elo_prob_team1",
        "hltv_rank_advantage",
        "team1_rank_known",
        "team2_rank_known",
        "vrs_rank_advantage",
        "vrs_points_diff",
        "team1_vrs_rank_known",
        "team2_vrs_rank_known",
        "prior_playoff_win_rate_diff",
        "prior_elimination_win_rate_diff",
        "best_of",
        "phase_order",
        "is_lan",
        "is_playoff",
        "is_elimination_match",
    ],
}


def fetch_scored_matches(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    connection.row_factory = sqlite3.Row
    return connection.execute(
        """
        SELECT
            m.match_id,
            m.match_date,
            m.match_timestamp,
            m.event_name,
            m.match_url,
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
            m.liquipedia_source_title,
            m.liquipedia_event_source_title,
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
          AND COALESCE(m.match_phase, '') != 'showmatch'
          AND COALESCE(m.event_name, '') NOT LIKE '%Showmatch%'
        ORDER BY m.match_timestamp, m.match_id
        """
    ).fetchall()


def fetch_match_maps(connection: sqlite3.Connection) -> dict[int, list[sqlite3.Row]]:
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """
        SELECT
            match_id,
            map_index,
            map_name,
            team1_name,
            team2_name,
            team1_score,
            team2_score,
            winner_team_name,
            picked_by_team_name
        FROM hltv_match_maps
        WHERE map_name IS NOT NULL
          AND map_name NOT IN ('TBA', 'Default')
          AND team1_score IS NOT NULL
          AND team2_score IS NOT NULL
        ORDER BY match_id, map_index
        """
    ).fetchall()
    grouped: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        grouped[int(row["match_id"])].append(row)
    return grouped


def map_key(team_name: str, map_name: str) -> tuple[str, str]:
    return (team_name.casefold(), map_name.casefold())


def map_win_rate(
    map_state: dict[tuple[str, str], dict[str, int]],
    team_name: str,
    map_name: str,
    neutral: float = 0.5,
    prior_strength: float = 0.0,
) -> tuple[float, int]:
    row = map_state.get(map_key(team_name, map_name), {})
    matches = int(row.get("matches", 0))
    wins = int(row.get("wins", 0))
    if matches and prior_strength > 0:
        return ((wins + neutral * prior_strength) / (matches + prior_strength), matches)
    return (wins / matches if matches else neutral, matches)


def update_map_state(map_state: dict[tuple[str, str], dict[str, int]], map_rows: list[sqlite3.Row]) -> None:
    for row in map_rows:
        team1 = row["team1_name"]
        team2 = row["team2_name"]
        map_name = row["map_name"]
        if not team1 or not team2 or not map_name:
            continue
        team1_win = int(row["team1_score"]) > int(row["team2_score"])
        for team, won in ((team1, team1_win), (team2, not team1_win)):
            state = map_state.setdefault(map_key(team, map_name), {"wins": 0, "matches": 0})
            state["matches"] += 1
            state["wins"] += int(won)


def map_advantage_for_match(
    feature_row: dict[str, Any],
    map_rows: list[sqlite3.Row],
    map_state: dict[tuple[str, str], dict[str, int]],
    *,
    prior_strength: float = 0.0,
) -> tuple[float, int]:
    team1 = str(feature_row["team1_name"])
    team2 = str(feature_row["team2_name"])
    diffs = []
    evidence = 0
    for row in map_rows:
        map_name = row["map_name"]
        team1_rate, team1_maps = map_win_rate(map_state, team1, map_name, prior_strength=prior_strength)
        team2_rate, team2_maps = map_win_rate(map_state, team2, map_name, prior_strength=prior_strength)
        diffs.append(team1_rate - team2_rate)
        evidence += team1_maps + team2_maps
    if not diffs:
        return 0.0, 0
    return sum(diffs) / len(diffs), evidence


def map_probability(
    feature_row: dict[str, Any],
    map_rows: list[sqlite3.Row],
    map_state: dict[tuple[str, str], dict[str, int]],
    *,
    config: dict[str, float] | None = None,
) -> float:
    effective_config = config or DEFAULT_MAP_CONFIG
    map_advantage, evidence = map_advantage_for_match(
        feature_row,
        map_rows,
        map_state,
        prior_strength=float(effective_config["prior_strength"]),
    )
    rank_logit = float(effective_config["rank_coef"]) * safe_float(feature_row["hltv_rank_advantage"], 0.0)
    evidence_weight = min(1.0, evidence / float(effective_config["evidence_denominator"]))
    logit = rank_logit + evidence_weight * (float(effective_config["map_coef"]) * map_advantage)
    return float(1.0 / (1.0 + np.exp(-logit)))


def source_to_label(source_title: str) -> str:
    for label, source in BENCHMARK_EVENTS.items():
        if source_title == source:
            return label
    return source_title


def is_benchmark(row: sqlite3.Row) -> bool:
    return str(row["liquipedia_event_source_title"]) in BENCHMARK_SOURCE_TITLES


def row_is_clean_training(feature_row: dict[str, Any]) -> bool:
    return (
        feature_row["model_tier"] in {"T1", "T1_5", "T2"}
        and feature_row["integrity_risk"] in {"low", "medium"}
    )


def both_teams_ranked_within(feature_row: dict[str, Any], max_rank: int) -> bool:
    hltv_ranks = [
        safe_float(feature_row.get("team1_hltv_rank"), 999.0),
        safe_float(feature_row.get("team2_hltv_rank"), 999.0),
    ]
    vrs_ranks = [
        safe_float(feature_row.get("team1_vrs_rank"), 999.0),
        safe_float(feature_row.get("team2_vrs_rank"), 999.0),
    ]
    hltv_known = bool(feature_row.get("team1_rank_known")) and bool(feature_row.get("team2_rank_known"))
    vrs_known = bool(feature_row.get("team1_vrs_rank_known")) and bool(feature_row.get("team2_vrs_rank_known"))
    return (hltv_known and max(hltv_ranks) <= max_rank) or (vrs_known and max(vrs_ranks) <= max_rank)


def should_update_state(feature_row: dict[str, Any], state_policy: str) -> bool:
    if state_policy == "all":
        return True
    if state_policy == "clean_only":
        return row_is_clean_training(feature_row)
    if state_policy == "no_t3":
        return feature_row["model_tier"] in {"T1", "T1_5", "T2"}
    if state_policy == "ranked_top120":
        return row_is_clean_training(feature_row) or both_teams_ranked_within(feature_row, 120)
    if state_policy == "ranked_top200":
        return row_is_clean_training(feature_row) or both_teams_ranked_within(feature_row, 200)
    raise ValueError(f"unknown state policy: {state_policy}")


def sigmoid_array(logits: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(logits, -35.0, 35.0)))


def logit_from_probabilities(probs: np.ndarray) -> np.ndarray:
    clipped = np.clip(probs, 1e-6, 1.0 - 1e-6)
    return np.log(clipped / (1.0 - clipped))


def base_probabilities(
    rows: list[dict[str, Any]],
    logistic_probs: np.ndarray | None = None,
    extra_probs: dict[str, np.ndarray] | None = None,
) -> dict[str, np.ndarray]:
    elo = np.array([safe_float(row["elo_prob_team1"], 0.5) for row in rows], dtype=float)
    elo_logit = logit_from_probabilities(elo)
    hltv_logit = np.array(
        [
            0.055 * safe_float(row["hltv_rank_advantage"], 0.0)
            if row["team1_rank_known"] and row["team2_rank_known"]
            else 0.0
            for row in rows
        ],
        dtype=float,
    )
    rank = sigmoid_array(hltv_logit)
    vrs_logit = np.array(
        [
            (
                0.0115 * safe_float(row["vrs_rank_advantage"], 0.0)
                + 0.00045 * safe_float(row["vrs_points_diff"], 0.0)
            )
            if row["team1_vrs_rank_known"] and row["team2_vrs_rank_known"]
            else 0.0
            for row in rows
        ],
        dtype=float,
    )
    vrs = sigmoid_array(vrs_logit)
    rank_vrs = sigmoid_array(0.52 * hltv_logit + 0.48 * vrs_logit)
    elo_rank_vrs = sigmoid_array(0.42 * elo_logit + 0.31 * hltv_logit + 0.27 * vrs_logit)
    form = np.array(
        [
            1.0
            / (
                1.0
                + np.exp(
                    -(
                        1.6 * safe_float(row["recent_win_rate_10_diff"], 0.0)
                        + 1.0 * safe_float(row["prior_win_rate_diff"], 0.0)
                        + 0.55 * safe_float(row["prior_playoff_win_rate_diff"], 0.0)
                        + 0.35 * safe_float(row["prior_elimination_win_rate_diff"], 0.0)
                        + 0.025 * safe_float(row["days_rest_diff"], 0.0)
                    )
                )
            )
            for row in rows
        ],
        dtype=float,
    )
    probs = {"elo": elo, "rank": rank, "vrs": vrs, "rank_vrs": rank_vrs, "elo_rank_vrs": elo_rank_vrs, "form": form}
    if logistic_probs is not None:
        probs["logistic"] = logistic_probs
    if extra_probs is not None:
        probs.update(extra_probs)
    return probs


def rows_to_xy(rows: list[dict[str, Any]], features: list[str] | None = None) -> tuple[np.ndarray, np.ndarray]:
    selected_features = features or NUMERIC_FEATURES
    x = np.array([[safe_float(row.get(feature)) for feature in selected_features] for row in rows], dtype=float)
    y = np.array([int(row["target_team1_win"]) for row in rows], dtype=float)
    return x, y


def fit_predict_logistic(
    train_rows: list[dict[str, Any]],
    test_rows: list[dict[str, Any]],
    *,
    features: list[str] | None = None,
    l2: float = 0.015,
    learning_rate: float = 0.035,
    epochs: int = 1400,
) -> tuple[np.ndarray, dict[str, Any]]:
    selected_features = features or NUMERIC_FEATURES
    x_train, y_train = rows_to_xy(train_rows, selected_features)
    x_test, _ = rows_to_xy(test_rows, selected_features)
    mean = x_train.mean(axis=0)
    std = x_train.std(axis=0)
    std[std == 0] = 1.0
    weights = fit_logistic_regression(
        (x_train - mean) / std,
        y_train,
        epochs=epochs,
        learning_rate=learning_rate,
        l2=l2,
    )
    probs = predict_logistic(weights, (x_test - mean) / std)
    return probs, {
        "l2": l2,
        "learning_rate": learning_rate,
        "epochs": epochs,
        "features": selected_features,
    }


def chronological_split(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ordered = sorted(rows, key=lambda row: (int(row["match_timestamp"]), int(row["match_id"])))
    split = max(80, int(len(ordered) * 0.72))
    split = min(split, len(ordered) - 40)
    return ordered[:split], ordered[split:]


def tune_logistic_config(train_rows: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    default_config = {
        "name": "all_l2_0.015",
        "features": LOGISTIC_FEATURE_SETS["all"],
        "l2": 0.015,
        "learning_rate": 0.035,
        "epochs": 1400,
    }
    if len(train_rows) < 180:
        return default_config, {"reason": "small_training_default"}

    fit_rows, validation_rows = chronological_split(train_rows)
    y_val = [int(row["target_team1_win"]) for row in validation_rows]
    configs = []
    for feature_name, features in LOGISTIC_FEATURE_SETS.items():
        for l2 in (0.005, 0.015, 0.05, 0.12):
            configs.append(
                {
                    "name": f"{feature_name}_l2_{l2}",
                    "features": features,
                    "l2": l2,
                    "learning_rate": 0.035,
                    "epochs": 1100,
                }
            )

    candidates = []
    for config in configs:
        probs, _ = fit_predict_logistic(
            fit_rows,
            validation_rows,
            features=config["features"],
            l2=float(config["l2"]),
            learning_rate=float(config["learning_rate"]),
            epochs=int(config["epochs"]),
        )
        candidates.append(
            (
                log_loss(y_val, probs.tolist()),
                -accuracy_at_threshold(y_val, probs.tolist()),
                config,
            )
        )
    best_log_loss, neg_accuracy, best_config = min(candidates, key=lambda item: (item[0], item[1]))
    return best_config, {
        "validation_rows": len(validation_rows),
        "fit_rows": len(fit_rows),
        "validation_log_loss": best_log_loss,
        "validation_accuracy": -neg_accuracy,
        "candidate_count": len(candidates),
    }


def tune_blend(train_rows: list[dict[str, Any]]) -> tuple[dict[str, float], dict[str, Any]]:
    if len(train_rows) < 180:
        return {"logistic": 0.5, "elo": 0.3, "rank": 0.1, "form": 0.1}, {"reason": "small_training_default"}

    rows = sorted(train_rows, key=lambda row: (int(row["match_timestamp"]), int(row["match_id"])))
    split = max(80, int(len(rows) * 0.72))
    split = min(split, len(rows) - 40)
    fit_rows = rows[:split]
    validation_rows = rows[split:]
    y_val = [int(row["target_team1_win"]) for row in validation_rows]
    logistic_probs, logistic_params = fit_predict_logistic(fit_rows, validation_rows)
    probs = base_probabilities(validation_rows, logistic_probs)
    candidates = []
    steps = [0.0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9]
    for w_logistic in steps:
        for w_elo in steps:
            for w_rank in steps:
                for w_form in steps:
                    total = w_logistic + w_elo + w_rank + w_form
                    if not 0.99 <= total <= 1.01:
                        continue
                    blended = (
                        w_logistic * probs["logistic"]
                        + w_elo * probs["elo"]
                        + w_rank * probs["rank"]
                        + w_form * probs["form"]
                    )
                    candidates.append(
                        (
                            log_loss(y_val, blended.tolist()),
                            {
                                "logistic": w_logistic,
                                "elo": w_elo,
                                "rank": w_rank,
                                "form": w_form,
                            },
                            accuracy_at_threshold(y_val, blended.tolist()),
                        )
                    )
    if not candidates:
        return {"logistic": 0.5, "elo": 0.3, "rank": 0.1, "form": 0.1}, {"reason": "no_grid_candidate"}
    best_log_loss, best_weights, best_accuracy = min(candidates, key=lambda item: (item[0], -item[2]))
    return best_weights, {
        "validation_rows": len(validation_rows),
        "fit_rows": len(fit_rows),
        "validation_log_loss": best_log_loss,
        "validation_accuracy": best_accuracy,
        "logistic_params": logistic_params,
    }


def tune_phase_selector(train_rows: list[dict[str, Any]]) -> tuple[dict[str, str], dict[str, Any]]:
    if len(train_rows) < 180:
        return {"non_playoff": "rank", "playoff": "logistic"}, {"reason": "small_training_default"}

    rows = sorted(train_rows, key=lambda row: (int(row["match_timestamp"]), int(row["match_id"])))
    split = max(80, int(len(rows) * 0.72))
    split = min(split, len(rows) - 40)
    fit_rows = rows[:split]
    validation_rows = rows[split:]
    logistic_probs, logistic_params = fit_predict_logistic(fit_rows, validation_rows)
    probs = base_probabilities(validation_rows, logistic_probs)
    selector = {}
    diagnostics = {"validation_rows": len(validation_rows), "fit_rows": len(fit_rows), "logistic_params": logistic_params}
    for bucket_name, bucket_rows in (
        ("non_playoff", [row for row in validation_rows if int(row["is_playoff"]) == 0]),
        ("playoff", [row for row in validation_rows if int(row["is_playoff"]) == 1]),
    ):
        if len(bucket_rows) < 8:
            selector[bucket_name] = "rank" if bucket_name == "non_playoff" else "logistic"
            diagnostics[f"{bucket_name}_reason"] = "small_bucket_default"
            continue
        bucket_indices = [index for index, row in enumerate(validation_rows) if (int(row["is_playoff"]) == 1) == (bucket_name == "playoff")]
        y_true = [int(validation_rows[index]["target_team1_win"]) for index in bucket_indices]
        candidates = []
        for model_name in ("elo", "rank", "form", "logistic"):
            model_probs = [float(probs[model_name][index]) for index in bucket_indices]
            candidates.append(
                (
                    accuracy_at_threshold(y_true, model_probs),
                    -log_loss(y_true, model_probs),
                    model_name,
                )
            )
        best_accuracy, neg_log_loss, model_name = max(candidates, key=lambda item: (item[0], item[1]))
        selector[bucket_name] = model_name
        diagnostics[f"{bucket_name}_rows"] = len(bucket_rows)
        diagnostics[f"{bucket_name}_accuracy"] = best_accuracy
        diagnostics[f"{bucket_name}_log_loss"] = -neg_log_loss
    return selector, diagnostics


def candidate_weight_sets(candidate_names: tuple[str, ...]) -> list[dict[str, float]]:
    candidates: list[dict[str, float]] = [{name: 1.0} for name in candidate_names]
    for left_index, left in enumerate(candidate_names):
        for right in candidate_names[left_index + 1 :]:
            for left_weight in (0.25, 0.4, 0.5, 0.6, 0.75):
                candidates.append({left: left_weight, right: 1.0 - left_weight})
    for first_index, first in enumerate(candidate_names):
        for second_index, second in enumerate(candidate_names[first_index + 1 :], start=first_index + 1):
            for third in candidate_names[second_index + 1 :]:
                candidates.append({first: 1 / 3, second: 1 / 3, third: 1 / 3})
                for lead in (first, second, third):
                    weights = {first: 0.25, second: 0.25, third: 0.25}
                    weights[lead] = 0.5
                    candidates.append(weights)
    # Preserve the old hand-tuned shape as one candidate in the larger pool.
    if {"logistic", "elo", "rank", "form"}.issubset(set(candidate_names)):
        candidates.append({"logistic": 0.5, "elo": 0.3, "rank": 0.1, "form": 0.1})
    return candidates


def blend_from_weights(probs: dict[str, np.ndarray], weights: dict[str, float]) -> np.ndarray:
    blended = None
    for name, weight in weights.items():
        component = weight * probs[name]
        blended = component if blended is None else blended + component
    if blended is None:
        raise ValueError("empty blend weights")
    return blended


def tune_challenger_ensembles(train_rows: list[dict[str, Any]]) -> tuple[dict[str, float], dict[str, float], dict[str, Any]]:
    default_accuracy = {"elo_rank_vrs": 1.0}
    default_calibrated = {"logistic": 0.5, "elo_rank_vrs": 0.5}
    if len(train_rows) < 180:
        return default_accuracy, default_calibrated, {"reason": "small_training_default"}

    fit_rows, validation_rows = chronological_split(train_rows)
    y_val = [int(row["target_team1_win"]) for row in validation_rows]
    logistic_probs, logistic_params = fit_predict_logistic(fit_rows, validation_rows)
    tuned_config, tuned_meta = tune_logistic_config(fit_rows)
    logistic_tuned_probs, logistic_tuned_params = fit_predict_logistic(
        fit_rows,
        validation_rows,
        features=tuned_config["features"],
        l2=float(tuned_config["l2"]),
        learning_rate=float(tuned_config["learning_rate"]),
        epochs=int(tuned_config["epochs"]),
    )
    probs = base_probabilities(
        validation_rows,
        logistic_probs,
        {"logistic_tuned": logistic_tuned_probs},
    )
    candidate_names = (
        "elo",
        "rank",
        "vrs",
        "rank_vrs",
        "elo_rank_vrs",
        "form",
        "logistic",
        "logistic_tuned",
    )
    scored = []
    for weights in candidate_weight_sets(candidate_names):
        blended = blend_from_weights(probs, weights)
        scored.append(
            {
                "weights": weights,
                "accuracy": accuracy_at_threshold(y_val, blended.tolist()),
                "log_loss": log_loss(y_val, blended.tolist()),
                "brier": brier_score(y_val, blended.tolist()),
            }
        )
    best_accuracy = max(scored, key=lambda row: (row["accuracy"], -row["log_loss"]))
    best_calibrated = min(scored, key=lambda row: (row["log_loss"], -row["accuracy"]))
    return best_accuracy["weights"], best_calibrated["weights"], {
        "validation_rows": len(validation_rows),
        "fit_rows": len(fit_rows),
        "candidate_count": len(scored),
        "accuracy_blend_validation_accuracy": best_accuracy["accuracy"],
        "accuracy_blend_validation_log_loss": best_accuracy["log_loss"],
        "calibrated_blend_validation_accuracy": best_calibrated["accuracy"],
        "calibrated_blend_validation_log_loss": best_calibrated["log_loss"],
        "logistic_params": logistic_params,
        "logistic_tuned_config": {
            key: value for key, value in logistic_tuned_params.items() if key != "features"
        },
        "logistic_tuned_feature_count": len(logistic_tuned_params["features"]),
        "logistic_tuned_meta": tuned_meta,
    }


def tune_map_config(
    train_rows: list[dict[str, Any]],
    match_maps: dict[int, list[sqlite3.Row]],
) -> tuple[dict[str, float], dict[str, Any]]:
    rows_with_maps = [row for row in train_rows if match_maps.get(int(row["match_id"]))]
    if len(rows_with_maps) < 160:
        return dict(DEFAULT_MAP_CONFIG), {"reason": "small_map_training_default", "map_rows": len(rows_with_maps)}

    fit_rows, validation_rows = chronological_split(train_rows)
    base_map_history: dict[tuple[str, str], dict[str, int]] = {}
    for row in fit_rows:
        update_map_state(base_map_history, match_maps.get(int(row["match_id"]), []))

    configs = []
    for rank_coef in (0.04, 0.055, 0.07):
        for map_coef in (1.4, 2.1, 2.8, 3.5):
            for evidence_denominator in (8.0, 12.0, 18.0, 26.0):
                for prior_strength in (0.0, 2.0, 4.0, 8.0):
                    configs.append(
                        {
                            "rank_coef": rank_coef,
                            "map_coef": map_coef,
                            "evidence_denominator": evidence_denominator,
                            "prior_strength": prior_strength,
                        }
                    )

    y_val = [int(row["target_team1_win"]) for row in validation_rows]
    scored = []
    for config in configs:
        map_history = copy.deepcopy(base_map_history)
        probs = []
        for row in validation_rows:
            match_id = int(row["match_id"])
            probs.append(map_probability(row, match_maps.get(match_id, []), map_history, config=config))
            update_map_state(map_history, match_maps.get(match_id, []))
        scored.append(
            {
                "config": config,
                "accuracy": accuracy_at_threshold(y_val, probs),
                "log_loss": log_loss(y_val, probs),
                "brier": brier_score(y_val, probs),
            }
        )
    best_calibrated = min(scored, key=lambda row: (row["log_loss"], -row["accuracy"]))
    best_accuracy = max(scored, key=lambda row: (row["accuracy"], -row["log_loss"]))
    return best_calibrated["config"], {
        "fit_rows": len(fit_rows),
        "validation_rows": len(validation_rows),
        "map_training_rows": len(rows_with_maps),
        "candidate_count": len(scored),
        "selected_validation_accuracy": best_calibrated["accuracy"],
        "selected_validation_log_loss": best_calibrated["log_loss"],
        "best_accuracy_config": best_accuracy["config"],
        "best_accuracy_validation_accuracy": best_accuracy["accuracy"],
        "best_accuracy_validation_log_loss": best_accuracy["log_loss"],
    }


def predict_models(
    train_rows: list[dict[str, Any]],
    test_rows: list[dict[str, Any]],
    *,
    match_maps: dict[int, list[sqlite3.Row]] | None = None,
    map_state: dict[tuple[str, str], dict[str, int]] | None = None,
    state_policy: str = "all",
    map_state_policy: str | None = None,
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    if len(train_rows) < 80:
        base = base_probabilities(test_rows)
        return {"elo": base["elo"], "rank": base["rank"], "form": base["form"], "blend": base["elo"]}, {
            "error": "not_enough_training_rows",
            "state_policy": state_policy,
            "map_state_policy": map_state_policy or state_policy,
        }

    logistic_probs, logistic_params = fit_predict_logistic(train_rows, test_rows)
    tuned_config, tuned_logistic_meta = tune_logistic_config(train_rows)
    logistic_tuned_probs, logistic_tuned_params = fit_predict_logistic(
        train_rows,
        test_rows,
        features=tuned_config["features"],
        l2=float(tuned_config["l2"]),
        learning_rate=float(tuned_config["learning_rate"]),
        epochs=int(tuned_config["epochs"]),
    )
    base = base_probabilities(test_rows, logistic_probs, {"logistic_tuned": logistic_tuned_probs})
    blend_weights, blend_meta = tune_blend(train_rows)
    blend = sum(blend_weights[name] * base[name] for name in blend_weights)
    accuracy_blend_weights, calibrated_blend_weights, challenger_meta = tune_challenger_ensembles(train_rows)
    accuracy_blend = blend_from_weights(base, accuracy_blend_weights)
    calibrated_blend = blend_from_weights(base, calibrated_blend_weights)
    phase_selector, phase_selector_meta = tune_phase_selector(train_rows)
    phase_selected = np.array(
        [
            base[phase_selector["playoff" if int(row["is_playoff"]) == 1 else "non_playoff"]][index]
            for index, row in enumerate(test_rows)
        ],
        dtype=float,
    )
    map_probs = None
    map_probs_tuned = None
    phase_map_selector = None
    phase_map_selector_tuned = None
    map_config = dict(DEFAULT_MAP_CONFIG)
    map_config_meta: dict[str, Any] = {}
    if match_maps is not None and map_state is not None:
        map_config, map_config_meta = tune_map_config(train_rows, match_maps)
        map_probs = np.array(
            [
                map_probability(row, match_maps.get(int(row["match_id"]), []), map_state)
                for row in test_rows
            ],
            dtype=float,
        )
        map_probs_tuned = np.array(
            [
                map_probability(row, match_maps.get(int(row["match_id"]), []), map_state, config=map_config)
                for row in test_rows
            ],
            dtype=float,
        )
        phase_map_selector = np.array(
            [
                map_probs[index] if int(row["is_playoff"]) == 1 else base["rank"][index]
                for index, row in enumerate(test_rows)
            ],
            dtype=float,
        )
        phase_map_selector_tuned = np.array(
            [
                map_probs_tuned[index] if int(row["is_playoff"]) == 1 else base["rank"][index]
                for index, row in enumerate(test_rows)
            ],
            dtype=float,
        )
    return {
        "elo": base["elo"],
        "rank": base["rank"],
        "vrs": base["vrs"],
        "rank_vrs": base["rank_vrs"],
        "elo_rank_vrs": base["elo_rank_vrs"],
        "form": base["form"],
        "logistic": base["logistic"],
        "logistic_tuned": base["logistic_tuned"],
        "blend": blend,
        "accuracy_blend": accuracy_blend,
        "calibrated_blend": calibrated_blend,
        "phase_selector": phase_selected,
        **(
            {
                "post_veto_map": map_probs,
                "post_veto_map_tuned": map_probs_tuned,
                "phase_map_selector": phase_map_selector,
                "phase_map_selector_tuned": phase_map_selector_tuned,
            }
            if map_probs is not None
            else {}
        ),
    }, {
        "state_policy": state_policy,
        "map_state_policy": map_state_policy or state_policy,
        "training_rows": len(train_rows),
        "blend_weights": blend_weights,
        "blend_meta": blend_meta,
        "accuracy_blend_weights": accuracy_blend_weights,
        "calibrated_blend_weights": calibrated_blend_weights,
        "challenger_meta": challenger_meta,
        "phase_selector": phase_selector,
        "phase_selector_meta": phase_selector_meta,
        "logistic_params": logistic_params,
        "logistic_tuned_config": {
            key: value for key, value in logistic_tuned_params.items() if key != "features"
        },
        "logistic_tuned_feature_count": len(logistic_tuned_params["features"]),
        "logistic_tuned_meta": tuned_logistic_meta,
        "map_config": map_config,
        "map_config_meta": map_config_meta,
    }


def build_train_state_and_rows(
    matches: list[sqlite3.Row],
    *,
    event_start_timestamp: int,
    match_maps: dict[int, list[sqlite3.Row]] | None = None,
    state_policy: str = "all",
    map_state_policy: str | None = None,
) -> tuple[list[dict[str, Any]], defaultdict[str, TeamState], dict[tuple[str, str], dict[str, int]]]:
    team_states: defaultdict[str, TeamState] = defaultdict(TeamState)
    h2h: dict[tuple[str, str], dict[str, int]] = {}
    map_state: dict[tuple[str, str], dict[str, int]] = {}
    train_rows: list[dict[str, Any]] = []
    effective_map_policy = map_state_policy or state_policy
    for row in matches:
        if int(row["match_timestamp"]) >= event_start_timestamp:
            break
        if is_benchmark(row):
            continue
        feature_row = make_feature_row(row, team_states, h2h)
        if row_is_clean_training(feature_row):
            train_rows.append(feature_row)
        if should_update_state(feature_row, state_policy):
            update_state_from_feature_row(feature_row, team_states, h2h)
        if match_maps is not None and should_update_state(feature_row, effective_map_policy):
            update_map_state(map_state, match_maps.get(int(row["match_id"]), []))
    if match_maps is None:
        return train_rows, team_states, h2h
    return train_rows, team_states, h2h, map_state


def make_test_rows(
    event_rows: list[sqlite3.Row],
    team_states: defaultdict[str, TeamState],
    h2h: dict[tuple[str, str], dict[str, int]],
    *,
    mode: str,
    state_policy: str = "all",
) -> list[dict[str, Any]]:
    state = copy.deepcopy(team_states)
    pair_history = copy.deepcopy(h2h)
    rows: list[dict[str, Any]] = []
    for row in event_rows:
        feature_row = make_feature_row(row, state, pair_history)
        feature_row["event_label"] = source_to_label(str(row["liquipedia_event_source_title"]))
        feature_row["liquipedia_source_title"] = row["liquipedia_source_title"]
        feature_row["liquipedia_event_source_title"] = row["liquipedia_event_source_title"]
        rows.append(feature_row)
        if mode == "rolling_in_event" and should_update_state(feature_row, state_policy):
            update_state_from_feature_row(feature_row, state, pair_history)
    return rows


def make_test_rows_with_map_state(
    event_rows: list[sqlite3.Row],
    team_states: defaultdict[str, TeamState],
    h2h: dict[tuple[str, str], dict[str, int]],
    map_state: dict[tuple[str, str], dict[str, int]],
    match_maps: dict[int, list[sqlite3.Row]],
    *,
    mode: str,
    state_policy: str = "all",
    map_state_policy: str | None = None,
) -> tuple[list[dict[str, Any]], dict[tuple[str, str], dict[str, int]]]:
    state = copy.deepcopy(team_states)
    pair_history = copy.deepcopy(h2h)
    map_history = copy.deepcopy(map_state)
    rows: list[dict[str, Any]] = []
    effective_map_policy = map_state_policy or state_policy
    for row in event_rows:
        feature_row = make_feature_row(row, state, pair_history)
        feature_row["event_label"] = source_to_label(str(row["liquipedia_event_source_title"]))
        feature_row["liquipedia_source_title"] = row["liquipedia_source_title"]
        feature_row["liquipedia_event_source_title"] = row["liquipedia_event_source_title"]
        rows.append(feature_row)
        if mode == "rolling_in_event" and should_update_state(feature_row, state_policy):
            update_state_from_feature_row(feature_row, state, pair_history)
        if mode == "rolling_in_event" and should_update_state(feature_row, effective_map_policy):
            update_map_state(map_history, match_maps.get(int(row["match_id"]), []))
    return rows, map_history


def metric_summary(y_true: list[int], probs: list[float]) -> dict[str, Any]:
    if not y_true:
        return {"rows": 0}
    predictions = [1 if prob >= 0.5 else 0 for prob in probs]
    return {
        "rows": len(y_true),
        "accuracy": sum(int(pred == truth) for pred, truth in zip(predictions, y_true)) / len(y_true),
        "log_loss": log_loss(y_true, probs),
        "brier": brier_score(y_true, probs),
        "favorites": sum(predictions),
        "avg_prob_team1": sum(probs) / len(probs),
    }


def add_prediction_rows(
    output: list[dict[str, Any]],
    test_rows: list[dict[str, Any]],
    model_probs: dict[str, np.ndarray],
    *,
    mode: str,
    model_meta: dict[str, Any],
) -> None:
    for index, row in enumerate(test_rows):
        for model_name, probs in model_probs.items():
            prob = float(probs[index])
            pred = 1 if prob >= 0.5 else 0
            target = int(row["target_team1_win"])
            output.append(
                {
                    "mode": mode,
                    "model": model_name,
                    "event_label": row["event_label"],
                    "match_id": row["match_id"],
                    "match_date": row["match_date"],
                    "event_name": row["event_name"],
                    "stage_name": row["stage_name"],
                    "round_name": row["round_name"],
                    "match_phase": row["match_phase"],
                    "is_playoff": row["is_playoff"],
                    "is_elimination_match": row["is_elimination_match"],
                    "team1_name": row["team1_name"],
                    "team2_name": row["team2_name"],
                    "team1_score": row["team1_score"],
                    "team2_score": row["team2_score"],
                    "actual_winner": row["team1_name"] if target == 1 else row["team2_name"],
                    "predicted_winner": row["team1_name"] if pred == 1 else row["team2_name"],
                    "prob_team1": round(prob, 6),
                    "correct": int(pred == target),
                    "model_tier": row["model_tier"],
                    "integrity_risk": row["integrity_risk"],
                    "state_policy": model_meta.get("state_policy", ""),
                    "map_state_policy": model_meta.get("map_state_policy", ""),
                    "training_rows": model_meta.get("training_rows", ""),
                    "blend_weights": json.dumps(model_meta.get("blend_weights", {}), sort_keys=True),
                    "accuracy_blend_weights": json.dumps(model_meta.get("accuracy_blend_weights", {}), sort_keys=True),
                    "calibrated_blend_weights": json.dumps(
                        model_meta.get("calibrated_blend_weights", {}), sort_keys=True
                    ),
                    "phase_selector": json.dumps(model_meta.get("phase_selector", {}), sort_keys=True),
                    "logistic_tuned_config": json.dumps(
                        model_meta.get("logistic_tuned_config", {}), sort_keys=True
                    ),
                    "map_config": json.dumps(model_meta.get("map_config", {}), sort_keys=True),
                    "liquipedia_source_title": row["liquipedia_source_title"],
                }
            )


def write_csv_rows(path: Path, rows: list[dict[str, Any]]) -> int:
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


def summarize_predictions(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    output = {}
    for mode in sorted({row["mode"] for row in rows}):
        for model in sorted({row["model"] for row in rows if row["mode"] == mode}):
            subset = [row for row in rows if row["mode"] == mode and row["model"] == model]
            y_true = [int(row["correct"]) for row in subset]
            # For accuracy we can directly average correctness; log-loss needs original target/prob.
            output[f"{mode}:{model}"] = {
                "rows": len(subset),
                "accuracy": sum(y_true) / len(y_true) if y_true else 0,
            }
    return output


def group_metrics(rows: list[dict[str, Any]], *, mode: str, model: str, fields: list[str]) -> list[dict[str, Any]]:
    buckets: defaultdict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["mode"] != mode or row["model"] != model:
            continue
        buckets[tuple(row[field] for field in fields)].append(row)
    output = []
    for key, bucket in buckets.items():
        correct = sum(int(row["correct"]) for row in bucket)
        payload = {field: value for field, value in zip(fields, key)}
        payload.update({"rows": len(bucket), "correct": correct, "accuracy": correct / len(bucket)})
        output.append(payload)
    output.sort(key=lambda row: tuple(str(row[field]) for field in fields))
    return output


def confidence_metrics(rows: list[dict[str, Any]], *, mode: str, model: str) -> list[dict[str, Any]]:
    subset = [row for row in rows if row["mode"] == mode and row["model"] == model]
    output = []
    for threshold in (0.55, 0.60, 0.65, 0.70, 0.75, 0.80):
        bucket = []
        for row in subset:
            prob = float(row["prob_team1"])
            confidence = max(prob, 1.0 - prob)
            if confidence >= threshold:
                bucket.append(row)
        if not bucket:
            output.append({"threshold": threshold, "rows": 0, "coverage": 0.0, "accuracy": 0.0})
            continue
        correct = sum(int(row["correct"]) for row in bucket)
        output.append(
            {
                "threshold": threshold,
                "rows": len(bucket),
                "coverage": len(bucket) / len(subset) if subset else 0.0,
                "accuracy": correct / len(bucket),
            }
        )
    return output


def write_report(rows: list[dict[str, Any]], meta: dict[str, Any], path: Path = REPORT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    def model_accuracy(mode: str, model: str) -> float:
        subset = [row for row in rows if row["mode"] == mode and row["model"] == model]
        if not subset:
            return -1.0
        return sum(int(row["correct"]) for row in subset) / len(subset)

    pure_pre_match_candidates = [
        (mode, model)
        for mode in ("pre_event_frozen", "rolling_in_event")
        for model in (
            "elo",
            "rank",
            "vrs",
            "rank_vrs",
            "elo_rank_vrs",
            "form",
            "logistic",
            "logistic_tuned",
            "blend",
            "accuracy_blend",
            "calibrated_blend",
            "phase_selector",
        )
    ]
    post_veto_candidates = [
        (mode, model)
        for mode in ("pre_event_frozen", "rolling_in_event")
        for model in ("post_veto_map", "post_veto_map_tuned", "phase_map_selector", "phase_map_selector_tuned")
    ]
    pre_match_mode, pre_match_model = max(pure_pre_match_candidates, key=lambda item: model_accuracy(*item))
    post_veto_mode, post_veto_model = max(post_veto_candidates, key=lambda item: model_accuracy(*item))
    pre_match_overall = group_metrics(rows, mode=pre_match_mode, model=pre_match_model, fields=["event_label"])
    post_veto_overall = group_metrics(rows, mode=post_veto_mode, model=post_veto_model, fields=["event_label"])
    phases = group_metrics(rows, mode=post_veto_mode, model=post_veto_model, fields=["event_label", "event_name", "match_phase"])
    playoffs = group_metrics(rows, mode=post_veto_mode, model=post_veto_model, fields=["event_label", "is_playoff"])
    pre_match_confidence = confidence_metrics(rows, mode=pre_match_mode, model=pre_match_model)
    post_veto_confidence = confidence_metrics(rows, mode=post_veto_mode, model=post_veto_model)
    state_policy = next((value.get("state_policy") for value in meta.values() if value.get("state_policy")), "")
    map_state_policy = next(
        (value.get("map_state_policy") for value in meta.values() if value.get("map_state_policy")), ""
    )

    def pct(value: float) -> str:
        return f"{value:.3f}"

    def append_overall_table(lines: list[str], summary_rows: list[dict[str, Any]]) -> None:
        for row in summary_rows:
            lines.append(f"| {row['event_label']} | {row['rows']} | {row['correct']} | {pct(row['accuracy'])} |")
        all_rows = sum(row["rows"] for row in summary_rows)
        all_correct = sum(row["correct"] for row in summary_rows)
        lines.append(
            f"| **Overall** | **{all_rows}** | **{all_correct}** | **{pct(all_correct / all_rows) if all_rows else '0.000'}** |"
        )

    lines = [
        "# CS2 Event Holdout Benchmark",
        "",
        f"Date: {datetime.now(timezone.utc).date().isoformat()}",
        "",
        "## Benchmark Setup",
        "",
        "- Holdout events: IEM Cologne Major 2026, PGL Astana 2026, IEM Atlanta 2026.",
        "- Training excludes all three holdout event source titles.",
        "- For each event, model training uses only non-holdout matches before that event starts.",
        "- `pre_event_frozen` keeps team state fixed at event start.",
        "- `rolling_in_event` updates team state with earlier known results from the same event, but does not retrain model weights.",
        f"- State/history update policy: `{state_policy or 'all'}`.",
        f"- Map-history update policy: `{map_state_policy or state_policy or 'all'}`.",
        "- Showmatches and unscored/scheduled rows are excluded.",
        "",
        "## Best Current Benchmarks",
        "",
        f"- Best pure pre-match readout: `{pre_match_mode}` + `{pre_match_model}`.",
        f"- Best post-veto/map-known readout: `{post_veto_mode}` + `{post_veto_model}`.",
        "- The post-veto result is not a fair substitute for predictions made before map vetoes are known.",
        "",
        "### Pure Pre-Match",
        "",
        "| Event | Rows | Correct | Accuracy |",
        "|---|---:|---:|---:|",
    ]
    append_overall_table(lines, pre_match_overall)
    lines.extend(
        [
            "",
            "### Post-Veto / Map Known",
            "",
            "| Event | Rows | Correct | Accuracy |",
            "|---|---:|---:|---:|",
        ]
    )
    append_overall_table(lines, post_veto_overall)
    lines.extend(
        [
            "",
            "## Confidence Thresholds",
            "",
            "| Product | Min confidence | Rows | Coverage | Accuracy |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for product, confidence_rows in (
        ("pure_pre_match", pre_match_confidence),
        ("post_veto_map_known", post_veto_confidence),
    ):
        for row in confidence_rows:
            lines.append(
                f"| {product} | {row['threshold']:.2f} | {row['rows']} | {pct(row['coverage'])} | {pct(row['accuracy'])} |"
            )
    lines.extend(
        [
            "",
            "## Stage / Phase Accuracy",
            "",
            f"Readout: `{post_veto_mode}` + `{post_veto_model}`.",
            "",
            "| Event | Stage | Phase | Rows | Correct | Accuracy |",
            "|---|---|---|---:|---:|---:|",
        ]
    )
    for row in phases:
        lines.append(
            f"| {row['event_label']} | {row['event_name']} | {row['match_phase']} | {row['rows']} | {row['correct']} | {pct(row['accuracy'])} |"
        )
    lines.extend(
        [
            "",
            "## Playoff Split",
            "",
            "| Event | Playoff flag | Rows | Correct | Accuracy |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for row in playoffs:
        lines.append(
            f"| {row['event_label']} | {row['is_playoff']} | {row['rows']} | {row['correct']} | {pct(row['accuracy'])} |"
        )
    lines.extend(
        [
            "",
            "## Model Comparison",
            "",
            "| Mode | Model | Rows | Correct | Accuracy |",
            "|---|---|---:|---:|---:|",
        ]
    )
    for mode in ("pre_event_frozen", "rolling_in_event"):
        for model in (
            "elo",
            "rank",
            "vrs",
            "rank_vrs",
            "elo_rank_vrs",
            "form",
            "logistic",
            "logistic_tuned",
            "blend",
            "accuracy_blend",
            "calibrated_blend",
            "phase_selector",
            "post_veto_map",
            "post_veto_map_tuned",
            "phase_map_selector",
            "phase_map_selector_tuned",
        ):
            subset = [row for row in rows if row["mode"] == mode and row["model"] == model]
            if not subset:
                continue
            correct = sum(int(row["correct"]) for row in subset)
            lines.append(f"| {mode} | {model} | {len(subset)} | {correct} | {pct(correct / len(subset))} |")
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- The Cologne benchmark uses scored local warehouse rows only; any still-scheduled or unscored current Major rows are excluded.",
            "- This benchmark measures event-holdout behavior, not random k-fold performance.",
            "- The blend and phase selector are tuned only on pre-event non-holdout validation rows, then applied to the held-out event.",
            "- `post_veto_map` uses known map rows and prior team-map history, so it belongs to the post-veto product path.",
            "- `post_veto_map_tuned` tunes map-model weights only on pre-event non-holdout validation rows.",
            "",
            "## Training Rows By Event",
            "",
            "| Event | Training rows | Accuracy blend | Calibrated blend | Phase selector |",
            "|---|---:|---|---|---|",
        ]
    )
    for key, value in meta.items():
        lines.append(
            f"| {key} | {value.get('training_rows', '')} | `{json.dumps(value.get('accuracy_blend_weights', {}), sort_keys=True)}` | `{json.dumps(value.get('calibrated_blend_weights', {}), sort_keys=True)}` | `{json.dumps(value.get('phase_selector', {}), sort_keys=True)}` |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_benchmark(
    connection: sqlite3.Connection,
    *,
    state_policy: str = "all",
    map_state_policy: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    matches = fetch_scored_matches(connection)
    match_maps = fetch_match_maps(connection)
    effective_map_policy = map_state_policy or state_policy
    by_event = {
        label: [row for row in matches if row["liquipedia_event_source_title"] == source]
        for label, source in BENCHMARK_EVENTS.items()
    }
    prediction_rows: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    for label, event_rows in by_event.items():
        if not event_rows:
            continue
        event_rows = sorted(event_rows, key=lambda row: (int(row["match_timestamp"]), int(row["match_id"])))
        event_start = int(event_rows[0]["match_timestamp"])
        train_rows, team_states, h2h, map_state = build_train_state_and_rows(
            matches,
            event_start_timestamp=event_start,
            match_maps=match_maps,
            state_policy=state_policy,
            map_state_policy=effective_map_policy,
        )
        for mode in ("pre_event_frozen", "rolling_in_event"):
            test_rows, test_map_state = make_test_rows_with_map_state(
                event_rows,
                team_states,
                h2h,
                map_state,
                match_maps,
                mode=mode,
                state_policy=state_policy,
                map_state_policy=effective_map_policy,
            )
            model_probs, model_meta = predict_models(
                train_rows,
                test_rows,
                match_maps=match_maps,
                map_state=test_map_state,
                state_policy=state_policy,
                map_state_policy=effective_map_policy,
            )
            meta[f"{label}:{mode}"] = model_meta
            add_prediction_rows(prediction_rows, test_rows, model_probs, mode=mode, model_meta=model_meta)
    return prediction_rows, meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Run leakage-safe event holdout benchmarks for CS2 events.")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--predictions-path", default=str(PREDICTIONS_PATH))
    parser.add_argument("--report-path", default=str(REPORT_PATH))
    parser.add_argument("--state-policy", choices=STATE_UPDATE_POLICIES, default="all")
    parser.add_argument("--map-state-policy", choices=STATE_UPDATE_POLICIES, default=None)
    args = parser.parse_args()

    connection = connect(Path(args.db_path))
    rows, meta = run_benchmark(connection, state_policy=args.state_policy, map_state_policy=args.map_state_policy)
    write_csv_rows(Path(args.predictions_path), rows)
    write_report(rows, meta, Path(args.report_path))
    print(
        json.dumps(
            {
                "prediction_rows": len(rows),
                "predictions_path": args.predictions_path,
                "report_path": args.report_path,
                "summary": summarize_predictions(rows),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
