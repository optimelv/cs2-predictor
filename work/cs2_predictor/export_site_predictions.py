from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sqlite3
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .benchmark_event_holdouts import BENCHMARK_EVENTS, fetch_scored_matches, row_is_clean_training, should_update_state
from .build_model_dataset import TeamState, elo_probability, make_feature_row, safe_float, safe_int, update_state_from_feature_row
from .paths import DATA_ROOT
from .warehouse import WAREHOUSE_PATH, connect


SITE_DATA_PATH = Path("docs") / "data" / "predictions.json"
SITE_DATA_JS_PATH = Path("docs") / "data" / "predictions.js"
BENCHMARK_PREDICTIONS_CSV = DATA_ROOT / "model" / "event_holdout_predictions.csv"
TEAM_TIERS_CSV = Path("outputs") / "cs2_team_tier_assignments.csv"
BEST_PRE_MODEL = ("rolling_in_event", "logistic")
BEST_POST_VETO_MODEL = ("rolling_in_event", "post_veto_map_tuned")
STATE_POLICY = "ranked_top120"
MAP_STATE_POLICY = "clean_only"
LIVE_MATCH_DETAILS_PATH = DATA_ROOT / "raw" / "hltv" / "flaresolverr_match_details_stage2_deciders_2026_06_09.json"
MANUAL_TEAM_MAP_BANS = {
    "pain": {"Ancient"},
    "pain gaming": {"Ancient"},
}
TEAM_LOGO_URLS = {
    "9z": "https://liquipedia.net/commons/images/thumb/9/9b/9z_Team_2024_darkmode.png/600px-9z_Team_2024_darkmode.png",
    "Astralis": "https://liquipedia.net/commons/images/thumb/3/3d/Astralis_2020_allmode.png/41px-Astralis_2020_allmode.png",
    "Aurora": "https://liquipedia.net/commons/images/thumb/3/32/Aurora_Gaming_2025_full_allmode.png/600px-Aurora_Gaming_2025_full_allmode.png",
    "B8": "https://liquipedia.net/commons/images/thumb/a/a6/B8_darkmode.png/600px-B8_darkmode.png",
    "BIG": "https://liquipedia.net/commons/images/thumb/6/69/BIG_2020_darkmode.png/35px-BIG_2020_darkmode.png",
    "BetBoom": "https://liquipedia.net/commons/images/thumb/5/5b/BetBoom_Team_2024_allmode.png/56px-BetBoom_Team_2024_allmode.png",
    "FURIA": "https://liquipedia.net/commons/images/thumb/a/aa/FURIA_Esports_allmode.png/51px-FURIA_Esports_allmode.png",
    "FUT": "https://liquipedia.net/commons/images/thumb/0/08/Futbolist_2021_darkmode.png/600px-Futbolist_2021_darkmode.png",
    "Falcons": "https://liquipedia.net/commons/images/thumb/8/83/Team_Falcons_2022_allmode.png/41px-Team_Falcons_2022_allmode.png",
    "FlyQuest": "https://liquipedia.net/commons/images/thumb/b/b2/FlyQuest_2021_allmode.png/51px-FlyQuest_2021_allmode.png",
    "G2": "https://liquipedia.net/commons/images/thumb/4/4b/G2_Esports_2020_lightmode.png/43px-G2_Esports_2020_lightmode.png",
    "GamerLegion": "https://liquipedia.net/commons/images/thumb/2/21/GamerLegion_2026_allmode.png/600px-GamerLegion_2026_allmode.png",
    "Legacy": "https://liquipedia.net/commons/images/thumb/3/34/Legacy_allmode.png/49px-Legacy_allmode.png",
    "M80": "https://liquipedia.net/commons/images/thumb/5/55/M80_2023_allmode.png/600px-M80_2023_allmode.png",
    "MIBR": "https://liquipedia.net/commons/images/thumb/7/72/MIBR_2018_darkmode.png/600px-MIBR_2018_darkmode.png",
    "MOUZ": "https://liquipedia.net/commons/images/thumb/c/c2/MOUZ_2021_allmode.png/47px-MOUZ_2021_allmode.png",
    "Monte": "https://liquipedia.net/commons/images/thumb/2/22/Monte_2022_allmode.png/600px-Monte_2022_allmode.png",
    "NAVI": "https://liquipedia.net/commons/images/thumb/9/95/Natus_Vincere_2021_allmode.png/57px-Natus_Vincere_2021_allmode.png",
    "Natus Vincere": "https://liquipedia.net/commons/images/thumb/9/95/Natus_Vincere_2021_allmode.png/57px-Natus_Vincere_2021_allmode.png",
    "PARIVISION": "https://liquipedia.net/commons/images/thumb/9/9d/PARIVISION_allmode.png/600px-PARIVISION_allmode.png",
    "Spirit": "https://liquipedia.net/commons/images/thumb/8/80/Team_Spirit_2022_darkmode.png/43px-Team_Spirit_2022_darkmode.png",
    "TYLOO": "https://liquipedia.net/commons/images/thumb/5/5f/TyLoo_2016_allmode.png/600px-TyLoo_2016_allmode.png",
    "The MongolZ": "https://liquipedia.net/commons/images/thumb/2/2b/The_MongolZ_2024_03_allmode.png/600px-The_MongolZ_2024_03_allmode.png",
    "Vitality": "https://liquipedia.net/commons/images/thumb/9/96/Team_Vitality_2023_darkmode.png/41px-Team_Vitality_2023_darkmode.png",
    "paiN": "https://liquipedia.net/commons/images/d/d3/PaiN_Gaming_2023_darkmode.png",
}
COLOGNE_STAGE3_SOURCE_URLS = {
    "hltv_stage2": "https://www.hltv.org/events/9029/iem-cologne-major-2026-stage-2",
    "hltv_stage3": "https://www.hltv.org/events/8301/iem-cologne-major-2026",
    "liquipedia_stage3": "https://liquipedia.net/counterstrike/Intel_Extreme_Masters/2026/Cologne/Stage_3",
}
COLOGNE_STAGE3_LOCKED_SEEDS = [
    (1, "Vitality"),
    (2, "Spirit"),
    (3, "Falcons"),
    (4, "NAVI"),
    (5, "MOUZ"),
    (7, "The MongolZ"),
    (8, "FUT"),
    (9, "Aurora"),
    (10, "FURIA"),
    (11, "G2"),
    (13, "9z"),
    (15, "BetBoom"),
    (16, "PARIVISION"),
]
COLOGNE_STAGE2_DECIDERS = [
    {"match_id": 2394895, "seed": 12, "team1": "Monte", "team2": "paiN", "starts_at": "2026-06-09T14:00:00+02:00"},
    {"match_id": 2394896, "seed": 6, "team1": "Legacy", "team2": "TYLOO", "starts_at": "2026-06-09T16:30:00+02:00"},
    {"match_id": 2394897, "seed": 14, "team1": "B8", "team2": "BIG", "starts_at": "2026-06-09T19:00:00+02:00"},
]


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def round_prob(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 4)


def confidence_label(probability: float) -> str:
    confidence = max(probability, 1.0 - probability)
    if confidence >= 0.75:
        return "strong"
    if confidence >= 0.65:
        return "watch"
    if confidence >= 0.58:
        return "lean"
    return "thin"


def normalize_team_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.casefold()).strip()


def team_assets_payload() -> dict[str, dict[str, str]]:
    return {
        normalize_team_name(team_name): {
            "name": team_name,
            "logo_url": logo_url,
            "source": "Liquipedia",
        }
        for team_name, logo_url in TEAM_LOGO_URLS.items()
    }


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_prediction_rows(rows: list[dict[str, str]], *, mode: str, model: str) -> dict[str, Any]:
    subset = [row for row in rows if row.get("mode") == mode and row.get("model") == model]
    if not subset:
        return {"rows": 0, "correct": 0, "accuracy": None}
    correct = sum(int(row.get("correct") or 0) for row in subset)
    return {"rows": len(subset), "correct": correct, "accuracy": round(correct / len(subset), 4)}


def benchmark_cards(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    by_match: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row["match_id"])
        card = by_match.setdefault(
            key,
            {
                "match_id": safe_int(row["match_id"], 0),
                "event_label": row.get("event_label", ""),
                "event_name": row.get("event_name", ""),
                "match_date": row.get("match_date", ""),
                "stage_name": row.get("stage_name", ""),
                "round_name": row.get("round_name", ""),
                "match_phase": row.get("match_phase", ""),
                "is_playoff": safe_int(row.get("is_playoff"), 0) or 0,
                "team1_name": row.get("team1_name", ""),
                "team2_name": row.get("team2_name", ""),
                "team1_score": safe_int(row.get("team1_score"), None),
                "team2_score": safe_int(row.get("team2_score"), None),
                "actual_winner": row.get("actual_winner", ""),
                "model_tier": row.get("model_tier", ""),
                "integrity_risk": row.get("integrity_risk", ""),
                "pre": None,
                "post_veto": None,
            },
        )
        model_key = (row.get("mode"), row.get("model"))
        if model_key == BEST_PRE_MODEL:
            card["pre"] = prediction_payload(row)
        elif model_key == BEST_POST_VETO_MODEL:
            card["post_veto"] = prediction_payload(row)
    cards = [card for card in by_match.values() if card.get("pre") or card.get("post_veto")]
    cards.sort(key=lambda card: (card.get("match_date") or "", int(card.get("match_id") or 0)))
    return cards


def prediction_payload(row: dict[str, str]) -> dict[str, Any]:
    probability = safe_float(row.get("prob_team1"), 0.5)
    confidence = max(probability, 1.0 - probability)
    return {
        "model": row.get("model"),
        "mode": row.get("mode"),
        "prob_team1": round_prob(probability),
        "confidence": round_prob(confidence),
        "confidence_label": confidence_label(probability),
        "predicted_winner": row.get("predicted_winner", ""),
        "correct": safe_int(row.get("correct"), None),
    }


def benchmark_event_summaries(rows: list[dict[str, str]], *, mode: str, model: str) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row.get("mode") == mode and row.get("model") == model:
            grouped[row.get("event_label", "unknown")].append(row)
    summaries = []
    for event_label, bucket in sorted(grouped.items()):
        correct = sum(int(row.get("correct") or 0) for row in bucket)
        summaries.append(
            {
                "event_label": event_label,
                "rows": len(bucket),
                "correct": correct,
                "accuracy": round(correct / len(bucket), 4) if bucket else None,
            }
        )
    return summaries


def fetch_upcoming_rows(connection: sqlite3.Connection) -> list[sqlite3.Row]:
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
                  AND vr.ranking_date <= COALESCE(m.match_date, date('now'))
                  AND (vr.team_key = m.team1_key OR lower(vr.team_name) = lower(m.team1_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team1_vrs_rank,
            (
                SELECT vr.points
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= COALESCE(m.match_date, date('now'))
                  AND (vr.team_key = m.team1_key OR lower(vr.team_name) = lower(m.team1_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team1_vrs_points,
            (
                SELECT vr.rank
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= COALESCE(m.match_date, date('now'))
                  AND (vr.team_key = m.team2_key OR lower(vr.team_name) = lower(m.team2_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team2_vrs_rank,
            (
                SELECT vr.points
                FROM valve_rankings vr
                WHERE vr.region = 'global'
                  AND vr.ranking_date <= COALESCE(m.match_date, date('now'))
                  AND (vr.team_key = m.team2_key OR lower(vr.team_name) = lower(m.team2_name))
                ORDER BY vr.ranking_date DESC
                LIMIT 1
            ) AS team2_vrs_points,
            m.format,
            m.status,
            m.liquipedia_event_tier,
            m.liquipedia_publisher_tier,
            m.liquipedia_stage_name,
            m.liquipedia_round_name,
            m.match_phase,
            m.is_playoff,
            m.is_elimination_match,
            m.liquipedia_source_title,
            m.liquipedia_event_source_title,
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
          AND (m.team1_score IS NULL OR m.team2_score IS NULL OR m.status = 'Scheduled')
        ORDER BY m.match_timestamp, m.match_id
        """
    ).fetchall()


def build_team_state(matches: list[sqlite3.Row]) -> tuple[defaultdict[str, TeamState], dict[tuple[str, str], dict[str, int]]]:
    team_states: defaultdict[str, TeamState] = defaultdict(TeamState)
    h2h: dict[tuple[str, str], dict[str, int]] = {}
    for row in matches:
        feature_row = make_feature_row(row, team_states, h2h)
        if should_update_state(feature_row, STATE_POLICY):
            update_state_from_feature_row(feature_row, team_states, h2h)
    return team_states, h2h


def ranked_probability(row: sqlite3.Row, elo_probability_team1: float) -> float:
    hltv_rank_advantage = (safe_int(row["team2_rank"], 101) or 101) - (safe_int(row["team1_rank"], 101) or 101)
    vrs_rank_advantage = (safe_int(row["team2_vrs_rank"], 401) or 401) - (safe_int(row["team1_vrs_rank"], 401) or 401)
    vrs_points_diff = safe_float(row["team1_vrs_points"]) - safe_float(row["team2_vrs_points"])
    elo_logit = math.log(max(1e-6, min(1.0 - 1e-6, elo_probability_team1)) / max(1e-6, 1.0 - elo_probability_team1))
    hltv_logit = 0.055 * hltv_rank_advantage if row["team1_rank"] and row["team2_rank"] else 0.0
    vrs_logit = (
        0.0115 * vrs_rank_advantage + 0.00045 * vrs_points_diff
        if row["team1_vrs_rank"] and row["team2_vrs_rank"]
        else 0.0
    )
    logit = 0.42 * elo_logit + 0.31 * hltv_logit + 0.27 * vrs_logit
    return 1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, logit))))


def upcoming_predictions(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    scored_matches = fetch_scored_matches(connection)
    team_states, _ = build_team_state(scored_matches)
    output = []
    for row in fetch_upcoming_rows(connection):
        team1 = str(row["team1_name"])
        team2 = str(row["team2_name"])
        state1 = team_states[team1.casefold()]
        state2 = team_states[team2.casefold()]
        elo_prob = elo_probability(state1.elo - state2.elo)
        power_prob = ranked_probability(row, elo_prob)
        predicted_winner = team1 if power_prob >= 0.5 else team2
        output.append(
            {
                "match_id": row["match_id"],
                "match_date": row["match_date"],
                "match_timestamp": row["match_timestamp"],
                "event_name": row["event_name"],
                "stage_name": row["liquipedia_stage_name"] or "",
                "round_name": row["liquipedia_round_name"] or "",
                "match_phase": row["match_phase"] or "scheduled",
                "team1_name": team1,
                "team2_name": team2,
                "format": row["format"] or "",
                "status": row["status"] or "Scheduled",
                "team1_hltv_rank": row["team1_rank"],
                "team2_hltv_rank": row["team2_rank"],
                "team1_vrs_rank": row["team1_vrs_rank"],
                "team2_vrs_rank": row["team2_vrs_rank"],
                "prob_team1": round_prob(power_prob),
                "elo_prob_team1": round_prob(elo_prob),
                "confidence": round_prob(max(power_prob, 1.0 - power_prob)),
                "confidence_label": confidence_label(power_prob),
                "predicted_winner": predicted_winner,
                "model": "live_pre_match_power",
                "mode": "upcoming_frozen_state",
                "source": "warehouse_scheduled",
            }
        )
    return output


def model_state_snapshot(connection: sqlite3.Connection) -> dict[str, Any]:
    scored_matches = fetch_scored_matches(connection)
    team_states, _ = build_team_state(scored_matches)
    latest_ranks = {
        row["team_name"].casefold(): {
            "team_name": row["team_name"],
            "vrs_rank": row["rank"],
            "vrs_points": row["points"],
            "ranking_date": row["ranking_date"],
        }
        for row in connection.execute(
            """
            SELECT ranking_date, rank, points, team_name
            FROM valve_rankings
            WHERE region='global'
              AND ranking_date=(SELECT MAX(ranking_date) FROM valve_rankings WHERE region='global')
            """
        ).fetchall()
    }
    teams = []
    for team_key, state in team_states.items():
        if state.matches < 3 and team_key not in latest_ranks:
            continue
        rank = latest_ranks.get(team_key, {})
        teams.append(
            {
                "team_key": team_key,
                "team_name": rank.get("team_name") or team_key,
                "elo": round(state.elo, 2),
                "matches": state.matches,
                "recent_win_rate_10": round(sum(state.recent_results[-10:]) / len(state.recent_results[-10:]), 3)
                if state.recent_results[-10:]
                else 0.5,
                "vrs_rank": rank.get("vrs_rank"),
                "vrs_points": rank.get("vrs_points"),
            }
        )
    teams.sort(key=lambda team: (team["vrs_rank"] or 9999, -team["matches"], team["team_name"]))
    return {
        "state_policy": STATE_POLICY,
        "map_state_policy": MAP_STATE_POLICY,
        "team_count": len(teams),
        "teams": teams[:500],
    }


def team_lookup(model_state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup = {}
    aliases = {
        "navi": "natus vincere",
    }
    for team in model_state.get("teams", []):
        if not isinstance(team, dict):
            continue
        team_name = str(team.get("team_name") or "")
        team_key = str(team.get("team_key") or team_name)
        for value in (team_name, team_key):
            normalized = normalize_team_name(value)
            if normalized:
                lookup[normalized] = team
    for alias, target in aliases.items():
        if target in lookup:
            lookup[alias] = lookup[target]
    return lookup


def projection_team(name: str, model_state: dict[str, Any]) -> dict[str, Any]:
    lookup = team_lookup(model_state)
    team = lookup.get(normalize_team_name(name), {})
    return {
        "name": name,
        "display_name": str(team.get("team_name") or name),
        "elo": round(safe_float(team.get("elo"), 1500.0), 2),
        "vrs_rank": safe_int(team.get("vrs_rank"), None),
        "vrs_points": safe_float(team.get("vrs_points"), 0.0),
        "recent_win_rate_10": safe_float(team.get("recent_win_rate_10"), 0.5),
    }


def logit_probability(probability: float) -> float:
    probability = max(1e-6, min(1.0 - 1e-6, probability))
    return math.log(probability / (1.0 - probability))


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, value))))


def projection_probability(team1_name: str, team2_name: str, model_state: dict[str, Any]) -> float:
    team1 = projection_team(team1_name, model_state)
    team2 = projection_team(team2_name, model_state)
    elo_logit = logit_probability(elo_probability(team1["elo"] - team2["elo"]))
    vrs_rank_advantage = (team2["vrs_rank"] or 400) - (team1["vrs_rank"] or 400)
    vrs_points_diff = team1["vrs_points"] - team2["vrs_points"]
    recent_diff = team1["recent_win_rate_10"] - team2["recent_win_rate_10"]
    return sigmoid(elo_logit + 0.0115 * vrs_rank_advantage + 0.00045 * vrs_points_diff + 0.35 * recent_diff)


def logit(value: float) -> float:
    value = max(1e-6, min(1.0 - 1e-6, value))
    return math.log(value / (1.0 - value))


def active_map_pool(connection: sqlite3.Connection) -> list[str]:
    rows = connection.execute(
        """
        SELECT map_name
        FROM map_pool_snapshots
        WHERE snapshot_date=(SELECT MAX(snapshot_date) FROM map_pool_snapshots)
          AND status='active_duty'
        ORDER BY map_name
        """
    ).fetchall()
    return [str(row["map_name"]) for row in rows] or ["Ancient", "Anubis", "Dust2", "Inferno", "Mirage", "Nuke", "Overpass"]


def team_map_profile(connection: sqlite3.Connection, team_name: str) -> dict[str, dict[str, Any]]:
    team_key = normalize_team_name(team_name)
    rows = connection.execute(
        """
        SELECT map_name, matches, wins, win_rate, avg_round_diff
        FROM team_map_win_rates
        WHERE source='hltv'
          AND opponent_filter='all'
          AND as_of_date=(SELECT MAX(as_of_date) FROM team_map_win_rates WHERE source='hltv')
          AND team_key=?
        """,
        (team_key,),
    ).fetchall()
    return {
        str(row["map_name"]): {
            "matches": safe_int(row["matches"], 0) or 0,
            "wins": safe_int(row["wins"], 0) or 0,
            "win_rate": safe_float(row["win_rate"], 0.5),
            "avg_round_diff": safe_float(row["avg_round_diff"], 0.0),
        }
        for row in rows
    }


def rate_with_prior(profile: dict[str, Any], prior: float = 4.0) -> float:
    matches = safe_float(profile.get("matches"), 0.0)
    wins = safe_float(profile.get("wins"), 0.0)
    return (wins + 0.5 * prior) / (matches + prior) if matches > 0 else 0.5


def live_match_details() -> dict[int, dict[str, Any]]:
    if not LIVE_MATCH_DETAILS_PATH.exists():
        return {}
    try:
        payload = json.loads(LIVE_MATCH_DETAILS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    details = payload.get("details") if isinstance(payload, dict) else payload
    output = {}
    for detail in details or []:
        match_id = safe_int(detail.get("match_id"), None)
        if match_id is not None:
            output[match_id] = detail
    return output


def likely_banned_maps(team_name: str, pool: list[str], profile: dict[str, dict[str, Any]]) -> set[str]:
    normalized = normalize_team_name(team_name)
    banned = set(MANUAL_TEAM_MAP_BANS.get(normalized, set()))
    total_maps = sum(safe_int(row.get("matches"), 0) or 0 for row in profile.values())
    if total_maps < 18:
        return banned
    for map_name in pool:
        matches = safe_int(profile.get(map_name, {}).get("matches"), 0) or 0
        share = matches / total_maps if total_maps else 0.0
        if matches == 0 or (total_maps >= 35 and matches <= 2) or (total_maps >= 55 and share <= 0.04):
            banned.add(map_name)
    return banned


def known_veto_maps(connection: sqlite3.Connection, match_id: int | None) -> list[str]:
    if match_id is None:
        return []
    rows = connection.execute(
        """
        SELECT DISTINCT map_name
        FROM hltv_match_vetoes
        WHERE match_id=?
          AND map_name IS NOT NULL
          AND action IN ('picked', 'leftover', 'decider')
        ORDER BY veto_index
        """,
        (match_id,),
    ).fetchall()
    maps = [str(row["map_name"]) for row in rows]
    if maps:
        return maps
    detail = live_match_details().get(match_id)
    raw_maps = [
        str(row.get("map_name"))
        for row in detail.get("maps", [])
        if row.get("map_name")
    ] if detail else []
    if raw_maps:
        return raw_maps
    raw_vetoes = [
        str(row.get("map_name"))
        for row in detail.get("vetoes", [])
        if row.get("map_name") and row.get("action") in {"picked", "leftover", "decider"}
    ] if detail else []
    return raw_vetoes


def projected_map_read(
    connection: sqlite3.Connection,
    team1_name: str,
    team2_name: str,
    model_state: dict[str, Any],
    *,
    match_id: int | None = None,
    best_of: int = 3,
) -> dict[str, Any]:
    base_probability = projection_probability(team1_name, team2_name, model_state)
    pool = active_map_pool(connection)
    profile1 = team_map_profile(connection, team1_name)
    profile2 = team_map_profile(connection, team2_name)
    banned1 = likely_banned_maps(team1_name, pool, profile1)
    banned2 = likely_banned_maps(team2_name, pool, profile2)
    unavailable_maps = banned1 | banned2

    def map_payload(map_name: str, source: str) -> dict[str, Any]:
        p1 = profile1.get(map_name, {})
        p2 = profile2.get(map_name, {})
        rate1 = rate_with_prior(p1)
        rate2 = rate_with_prior(p2)
        evidence = (safe_int(p1.get("matches"), 0) or 0) + (safe_int(p2.get("matches"), 0) or 0)
        evidence_weight = min(1.0, evidence / 28.0)
        probability = sigmoid(logit(base_probability) + evidence_weight * 1.85 * (rate1 - rate2))
        return {
            "map_name": map_name,
            "source": source,
            "prob_team1": round_prob(probability),
            "predicted_winner": team1_name if probability >= 0.5 else team2_name,
            "confidence": round_prob(max(probability, 1.0 - probability)),
            "team1_map_win_rate": round_prob(rate1),
            "team2_map_win_rate": round_prob(rate2),
            "evidence_maps": evidence,
        }

    known_maps = known_veto_maps(connection, match_id)
    if known_maps:
        maps = [map_payload(map_name, "known_veto") for map_name in known_maps[:best_of]]
        status = "known_veto"
    else:
        scored = []
        for map_name in pool:
            if map_name in unavailable_maps:
                continue
            p1 = profile1.get(map_name, {})
            p2 = profile2.get(map_name, {})
            rate1 = rate_with_prior(p1)
            rate2 = rate_with_prior(p2)
            evidence = (safe_int(p1.get("matches"), 0) or 0) + (safe_int(p2.get("matches"), 0) or 0)
            if evidence < 8:
                continue
            scored.append((map_name, rate1 - rate2, evidence))
        if not scored:
            return {
                "status": "insufficient_map_data",
                "base_prob_team1": round_prob(base_probability),
                "maps": [],
                "note": "Not enough current active-duty map evidence for this matchup.",
            }
        team1_pick = max(scored, key=lambda item: (item[1], item[2]))[0]
        team2_pick = min(scored, key=lambda item: (item[1], -item[2]))[0]
        remaining = [item for item in scored if item[0] not in {team1_pick, team2_pick}]
        decider = max(remaining, key=lambda item: item[2] - abs(item[1]) * 10)[0] if remaining else team1_pick
        projected_maps = []
        for map_name in (team1_pick, team2_pick, decider):
            if map_name not in projected_maps:
                projected_maps.append(map_name)
        maps = [map_payload(map_name, "projected_veto") for map_name in projected_maps[:best_of]]
        status = "projected_veto"

    if maps:
        avg_probability = sum(map_row["prob_team1"] for map_row in maps) / len(maps)
    else:
        avg_probability = base_probability
    return {
        "status": status,
        "base_prob_team1": round_prob(base_probability),
        "map_adjusted_prob_team1": round_prob(avg_probability),
        "map_adjusted_predicted_winner": team1_name if avg_probability >= 0.5 else team2_name,
        "map_adjusted_confidence": round_prob(max(avg_probability, 1.0 - avg_probability)),
        "maps": maps,
        "excluded_maps": {
            team1_name: sorted(banned1),
            team2_name: sorted(banned2),
        },
        "note": "Known maps are used when HLTV data is available. Projected maps exclude likely permabans.",
    }


def projection_match_payload(
    team1_name: str,
    team2_name: str,
    model_state: dict[str, Any],
    *,
    round_name: str,
    starts_at: str | None = None,
    connection: sqlite3.Connection | None = None,
    match_id: int | None = None,
) -> dict[str, Any]:
    probability = projection_probability(team1_name, team2_name, model_state)
    confidence = max(probability, 1.0 - probability)
    predicted_winner = team1_name if probability >= 0.5 else team2_name
    return {
        "round": round_name,
        "starts_at": starts_at,
        "team1_name": team1_name,
        "team2_name": team2_name,
        "prob_team1": round_prob(probability),
        "confidence": round_prob(confidence),
        "confidence_label": confidence_label(probability),
        "predicted_winner": predicted_winner,
        "map_read": projected_map_read(connection, team1_name, team2_name, model_state, match_id=match_id)
        if connection is not None
        else None,
    }


def round_number_from_label(label: str | None) -> int | None:
    match = re.search(r"round\s+(\d+)", (label or "").casefold())
    return safe_int(match.group(1), None) if match else None


def fetch_map_scores(connection: sqlite3.Connection, match_ids: list[int]) -> dict[int, list[sqlite3.Row]]:
    if not match_ids:
        return {}
    placeholders = ",".join("?" for _ in match_ids)
    rows = connection.execute(
        f"""
        SELECT match_id, map_index, map_name, team1_score, team2_score
        FROM hltv_match_maps
        WHERE match_id IN ({placeholders})
          AND team1_score IS NOT NULL
          AND team2_score IS NOT NULL
        ORDER BY match_id, map_index
        """,
        match_ids,
    ).fetchall()
    grouped: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        grouped[int(row["match_id"])].append(row)
    return grouped


def compact_score_label(row: sqlite3.Row, maps: list[sqlite3.Row]) -> str:
    team1_score = safe_int(row["team1_score"], 0) or 0
    team2_score = safe_int(row["team2_score"], 0) or 0
    if team1_score + team2_score <= 1 and maps:
        first_map = maps[0]
        return f"{first_map['team1_score']}:{first_map['team2_score']}"
    return f"{team1_score}:{team2_score}"


def board_match_payload(
    *,
    round_number: int,
    record_before: str,
    team1_name: str,
    team2_name: str,
    score_label: str,
    winner_name: str,
    status: str,
    confidence: float | None = None,
    starts_at: str | None = None,
) -> dict[str, Any]:
    return {
        "round": round_number,
        "record_before": record_before,
        "team1_name": team1_name,
        "team2_name": team2_name,
        "score_label": score_label,
        "winner_name": winner_name,
        "status": status,
        "confidence": round_prob(confidence) if confidence is not None else None,
        "starts_at": starts_at,
    }


def current_stage2_board(connection: sqlite3.Connection, model_state: dict[str, Any]) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT match_id, match_date, match_timestamp, team1_name, team2_name, team1_score, team2_score,
               liquipedia_round_name, liquipedia_stage_name, match_phase
        FROM hltv_result_matches
        WHERE event_name='IEM Cologne Major 2026 Stage 2'
          AND team1_score IS NOT NULL
          AND team2_score IS NOT NULL
        ORDER BY match_timestamp, match_id
        """
    ).fetchall()
    map_scores = fetch_map_scores(connection, [int(row["match_id"]) for row in rows])
    records: defaultdict[str, list[int]] = defaultdict(lambda: [0, 0])
    projected_teams = set()
    rounds: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))

    for row in rows:
        round_number = round_number_from_label(row["liquipedia_round_name"]) or 1
        team1 = str(row["team1_name"])
        team2 = str(row["team2_name"])
        record_before = f"{records[team1][0]}-{records[team1][1]}"
        team1_score = safe_int(row["team1_score"], 0) or 0
        team2_score = safe_int(row["team2_score"], 0) or 0
        winner = team1 if team1_score > team2_score else team2
        loser = team2 if winner == team1 else team1
        rounds[round_number][record_before].append(
            board_match_payload(
                round_number=round_number,
                record_before=record_before,
                team1_name=team1,
                team2_name=team2,
                score_label=compact_score_label(row, map_scores.get(int(row["match_id"]), [])),
                winner_name=winner,
                status="locked",
            )
        )
        records[winner][0] += 1
        records[loser][1] += 1

    for match in COLOGNE_STAGE2_DECIDERS:
        payload = projection_match_payload(
            match["team1"],
            match["team2"],
            model_state,
            round_name="Stage 2 final decider",
            starts_at=match["starts_at"],
            connection=connection,
            match_id=match.get("match_id"),
        )
        team1 = match["team1"]
        team2 = match["team2"]
        winner = payload["predicted_winner"]
        loser = team2 if winner == team1 else team1
        confidence = payload["confidence"]
        projected_teams.update({team1, team2})
        rounds[5]["2-2"].append(
            board_match_payload(
                round_number=5,
                record_before="2-2",
                team1_name=team1,
                team2_name=team2,
                score_label=f"{round(confidence * 100)}%",
                winner_name=winner,
                status="projected",
                confidence=confidence,
                starts_at=match["starts_at"],
            )
        )
        records[winner][0] += 1
        records[loser][1] += 1

    final_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for team, record in records.items():
        label = f"{record[0]}-{record[1]}"
        final_groups[label].append(
            {
                "team_name": team,
                "record": label,
                "status": "projected" if team in projected_teams else "locked",
            }
        )
    for teams in final_groups.values():
        teams.sort(key=lambda item: (item["status"] == "projected", item["team_name"]))

    round_order = {
        1: ["0-0"],
        2: ["1-0", "0-1"],
        3: ["2-0", "1-1", "0-2"],
        4: ["2-1", "1-2"],
        5: ["2-2"],
    }
    return {
        "stage": "IEM Cologne Major 2026 Stage 2",
        "view": "current_major_board",
        "legend": {
            "locked": "Known result",
            "projected": "Model projection",
        },
        "rounds": [
            {
                "round": round_number,
                "groups": [
                    {"record": record, "matches": rounds[round_number].get(record, [])}
                    for record in records_for_round
                ],
            }
            for round_number, records_for_round in round_order.items()
        ],
        "final_groups": [
            {"record": record, "teams": final_groups.get(record, [])}
            for record in ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"]
        ],
    }


def stage3_seed_list(
    model_state: dict[str, Any],
    connection: sqlite3.Connection | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    stage2_deciders = []
    projected_slots = []
    for match in COLOGNE_STAGE2_DECIDERS:
        payload = projection_match_payload(
            match["team1"],
            match["team2"],
            model_state,
            round_name="Stage 2 final decider",
            starts_at=match["starts_at"],
            connection=connection,
            match_id=match.get("match_id"),
        )
        payload["seed"] = match["seed"]
        payload["source"] = "projected_stage2_slot"
        stage2_deciders.append(payload)
        projected_slots.append((match["seed"], payload["predicted_winner"]))

    seeds = [
        {"seed": seed, "team_name": team, "slot_status": "locked"}
        for seed, team in COLOGNE_STAGE3_LOCKED_SEEDS
    ]
    seeds.extend(
        {"seed": seed, "team_name": team, "slot_status": "projected_from_stage2"}
        for seed, team in projected_slots
    )
    seeds.sort(key=lambda row: row["seed"])
    return seeds, stage2_deciders


def pair_swiss_group(names: list[str], seeds: dict[str, int], played: dict[str, set[str]]) -> list[tuple[str, str]]:
    pool = sorted(names, key=lambda name: seeds[name])
    pairs = []
    while pool:
        team1 = pool.pop(0)
        opponent_index = None
        for index in range(len(pool) - 1, -1, -1):
            if pool[index] not in played[team1]:
                opponent_index = index
                break
        if opponent_index is None:
            opponent_index = len(pool) - 1
        team2 = pool.pop(opponent_index)
        pairs.append((team1, team2))
    return pairs


def simulate_stage3_swiss(model_state: dict[str, Any], connection: sqlite3.Connection | None = None) -> dict[str, Any]:
    seed_rows, stage2_deciders = stage3_seed_list(model_state, connection)
    seeds = {row["team_name"]: int(row["seed"]) for row in seed_rows}
    records = {row["team_name"]: [0, 0] for row in seed_rows}
    played = {row["team_name"]: set() for row in seed_rows}
    round_pairings = [
        (seed_rows[index]["team_name"], seed_rows[-(index + 1)]["team_name"])
        for index in range(len(seed_rows) // 2)
    ]
    rounds = []
    for round_number in range(1, 6):
        round_matches = []
        for team1, team2 in round_pairings:
            payload = projection_match_payload(
                team1,
                team2,
                model_state,
                round_name=f"Swiss round {round_number}",
                connection=connection,
            )
            winner = payload["predicted_winner"]
            loser = team2 if winner == team1 else team1
            records[winner][0] += 1
            records[loser][1] += 1
            played[team1].add(team2)
            played[team2].add(team1)
            payload["winner_record_after"] = f"{records[winner][0]}-{records[winner][1]}"
            payload["loser_record_after"] = f"{records[loser][0]}-{records[loser][1]}"
            round_matches.append(payload)
        rounds.append({"round": round_number, "matches": round_matches})
        if round_number == 5:
            break
        active = [team for team, record in records.items() if record[0] < 3 and record[1] < 3]
        grouped: dict[tuple[int, int], list[str]] = defaultdict(list)
        for team in active:
            grouped[tuple(records[team])].append(team)
        round_pairings = []
        for record in sorted(grouped, key=lambda value: (-value[0], value[1])):
            round_pairings.extend(pair_swiss_group(grouped[record], seeds, played))

    final_records = [
        {
            "team_name": team,
            "seed": seeds[team],
            "record": f"{record[0]}-{record[1]}",
            "wins": record[0],
            "losses": record[1],
        }
        for team, record in records.items()
    ]
    final_records.sort(key=lambda row: (-row["wins"], row["losses"], row["seed"]))
    return {
        "stage": "IEM Cologne Major 2026 Stage 3",
        "generated_from": "current_stage2_state_plus_model_projected_deciders",
        "format": "16-team Swiss, all BO3, top eight advance",
        "source_urls": COLOGNE_STAGE3_SOURCE_URLS,
        "seed_rows": seed_rows,
        "stage2_deciders": stage2_deciders,
        "rounds": rounds,
        "final_records": final_records,
        "buckets": {
            "three_zero": [row for row in final_records if row["record"] == "3-0"],
            "advance": [row for row in final_records if row["record"] in {"3-1", "3-2"}],
            "zero_three": [row for row in final_records if row["record"] == "0-3"],
            "eliminated": [row for row in final_records if row["losses"] == 3],
        },
    }


def value_from_paths(item: dict[str, Any], paths: list[tuple[str, ...]]) -> Any:
    for path in paths:
        current: Any = item
        for key in path:
            if not isinstance(current, dict) or key not in current:
                current = None
                break
            current = current[key]
        if current not in (None, ""):
            return current
    return None


def team_name_from_api_item(item: dict[str, Any], side: int) -> str:
    direct_paths = [
        (f"team{side}_name",),
        (f"team{side}Name",),
        (f"team{side}", "name"),
        (f"team{side}", "teamName"),
        ("teams", str(side - 1), "name"),
    ]
    value = value_from_paths(item, direct_paths)
    if value:
        return str(value)
    teams = item.get("teams")
    if isinstance(teams, list) and len(teams) >= side:
        team = teams[side - 1]
        if isinstance(team, dict):
            return str(team.get("name") or team.get("teamName") or "")
        return str(team)
    return ""


def timestamp_from_api_item(item: dict[str, Any]) -> int | None:
    for key in ("timestamp", "matchTimestamp", "startTime", "startTimestamp", "dateUnix"):
        value = item.get(key)
        parsed = safe_int(value, None)
        if parsed:
            return parsed // 1000 if parsed > 10_000_000_000 else parsed
    for key in ("date", "matchDate", "startsAt"):
        value = item.get(key)
        if not value:
            continue
        try:
            text = str(value).replace("Z", "+00:00")
            return int(datetime.fromisoformat(text).timestamp())
        except ValueError:
            continue
    return None


def event_name_from_api_item(item: dict[str, Any]) -> str:
    value = value_from_paths(
        item,
        [
            ("event_name",),
            ("eventName",),
            ("event", "name"),
            ("tournament", "name"),
            ("competition", "name"),
        ],
    )
    return str(value or "HLTV live feed")


def api_items_from_feed(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = read_json(path)
    items = data.get("items") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def prediction_from_snapshot_match(item: dict[str, Any], model_state: dict[str, Any]) -> dict[str, Any] | None:
    team1 = team_name_from_api_item(item, 1)
    team2 = team_name_from_api_item(item, 2)
    if not team1 or not team2:
        return None
    teams = {
        normalize_team_name(team["team_name"]): team
        for team in model_state.get("teams", [])
        if isinstance(team, dict) and team.get("team_name")
    }
    state1 = teams.get(normalize_team_name(team1), {})
    state2 = teams.get(normalize_team_name(team2), {})
    elo1 = safe_float(state1.get("elo"), 1500.0)
    elo2 = safe_float(state2.get("elo"), 1500.0)
    probability = elo_probability(elo1 - elo2)
    predicted_winner = team1 if probability >= 0.5 else team2
    timestamp = timestamp_from_api_item(item)
    match_date = datetime.fromtimestamp(timestamp, tz=UTC).date().isoformat() if timestamp else ""
    return {
        "match_id": item.get("match_id") or item.get("matchId") or item.get("id") or "",
        "match_date": match_date,
        "match_timestamp": timestamp,
        "event_name": event_name_from_api_item(item),
        "stage_name": str(item.get("stage") or item.get("stage_name") or ""),
        "round_name": str(item.get("round") or item.get("round_name") or ""),
        "match_phase": str(item.get("match_phase") or item.get("phase") or "scheduled"),
        "team1_name": team1,
        "team2_name": team2,
        "format": str(item.get("format") or item.get("matchFormat") or ""),
        "status": str(item.get("status") or "Scheduled"),
        "team1_hltv_rank": item.get("team1_rank") or item.get("team1Rank"),
        "team2_hltv_rank": item.get("team2_rank") or item.get("team2Rank"),
        "team1_vrs_rank": state1.get("vrs_rank"),
        "team2_vrs_rank": state2.get("vrs_rank"),
        "prob_team1": round_prob(probability),
        "elo_prob_team1": round_prob(probability),
        "confidence": round_prob(max(probability, 1.0 - probability)),
        "confidence_label": confidence_label(probability),
        "predicted_winner": predicted_winner,
        "model": "live_snapshot_elo",
        "mode": "api_feed_snapshot_state",
        "source": "apify_hltv_feed",
    }


def fallback_payload_from_existing(output_path: Path, apify_feed_path: Path | None) -> dict[str, Any]:
    payload = read_json(output_path)
    if not payload:
        raise FileNotFoundError(
            "No SQLite warehouse and no existing site JSON found. Generate docs/data/predictions.json locally first."
        )
    payload["generated_at_utc"] = utc_now()
    payload.setdefault("updater", {})
    payload["updater"].update(
        {
            "status": "snapshot_refresh",
            "detail": "SQLite warehouse was unavailable, so the updater reused the published model snapshot.",
        }
    )
    if apify_feed_path:
        predictions = [
            prediction
            for prediction in (
                prediction_from_snapshot_match(item, payload.get("model_state", {}))
                for item in api_items_from_feed(apify_feed_path)
            )
            if prediction is not None
        ]
        if predictions:
            payload["upcoming_predictions"] = predictions
            payload["updater"]["apify_feed_items"] = len(predictions)
    return payload


def database_summary(connection: sqlite3.Connection) -> dict[str, Any]:
    row = connection.execute("SELECT COUNT(*) AS rows, MIN(match_date) AS min_date, MAX(match_date) AS max_date FROM hltv_result_matches").fetchone()
    tiers = {
        tier: count
        for tier, count in connection.execute(
            "SELECT model_tier, COUNT(*) FROM model_training_matches GROUP BY model_tier"
        ).fetchall()
    }
    risk = {
        level: count
        for level, count in connection.execute(
            "SELECT integrity_risk, COUNT(*) FROM model_training_matches GROUP BY integrity_risk"
        ).fetchall()
    }
    return {
        "match_rows": row["rows"],
        "date_min": row["min_date"],
        "date_max": row["max_date"],
        "tier_counts": tiers,
        "integrity_counts": risk,
    }


def upcoming_event_coverage(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT source_title, event_name, start_date, end_date, event_tier, publisher_tier,
               event_type, organizer, series, team_count
        FROM liquipedia_events
        WHERE end_date >= date('now')
        ORDER BY start_date, event_name
        LIMIT 12
        """
    ).fetchall()
    return [
        {
            "source_title": row["source_title"],
            "event_name": row["event_name"],
            "start_date": row["start_date"],
            "end_date": row["end_date"],
            "event_tier": row["event_tier"],
            "publisher_tier": row["publisher_tier"],
            "event_type": row["event_type"],
            "organizer": row["organizer"],
            "series": row["series"],
            "team_count": row["team_count"],
        }
        for row in rows
    ]


def load_team_tier_rows() -> list[dict[str, Any]]:
    rows = read_csv_rows(TEAM_TIERS_CSV)
    output = []
    for row in rows:
        output.append(
            {
                "team_name": row["team_name"],
                "primary_tier": row["primary_tier_by_entries"],
                "t1_entries": safe_int(row["t1_entries"], 0) or 0,
                "t1_5_entries": safe_int(row["t1_5_entries"], 0) or 0,
                "clean_t2_entries": safe_int(row["clean_t2_entries"], 0) or 0,
                "all_t2_entries": safe_int(row["all_t2_entries"], 0) or 0,
                "t3_entries": safe_int(row["t3_entries"], 0) or 0,
                "total_entries": safe_int(row["total_entries"], 0) or 0,
            }
        )
    return output


def build_payload(db_path: Path) -> dict[str, Any]:
    benchmark_rows = read_csv_rows(BENCHMARK_PREDICTIONS_CSV)
    connection = connect(db_path)
    connection.row_factory = sqlite3.Row
    model_state = model_state_snapshot(connection)
    major_projection = simulate_stage3_swiss(model_state, connection)
    major_projection["current_stage_board"] = current_stage2_board(connection, model_state)
    return {
        "generated_at_utc": utc_now(),
        "product": "CS2 Predictor",
        "team_assets": team_assets_payload(),
        "model": {
            "state_policy": STATE_POLICY,
            "map_state_policy": MAP_STATE_POLICY,
            "best_pre_match": {
                "mode": BEST_PRE_MODEL[0],
                "model": BEST_PRE_MODEL[1],
                **summarize_prediction_rows(benchmark_rows, mode=BEST_PRE_MODEL[0], model=BEST_PRE_MODEL[1]),
            },
            "best_post_veto": {
                "mode": BEST_POST_VETO_MODEL[0],
                "model": BEST_POST_VETO_MODEL[1],
                **summarize_prediction_rows(
                    benchmark_rows,
                    mode=BEST_POST_VETO_MODEL[0],
                    model=BEST_POST_VETO_MODEL[1],
                ),
            },
        },
        "major_projection": major_projection,
        "event_coverage": upcoming_event_coverage(connection),
        "upcoming_predictions": major_projection["stage2_deciders"],
        "model_state": model_state,
        "notices": [
            "Post-veto accuracy uses known maps and should not be treated as a pre-veto number.",
            "Stage 3 projections use deterministic Swiss pairing logic and model-projected winners for unfilled Stage 2 slots.",
            "GitHub Pages serves generated JSON; API secrets stay in scheduled update jobs.",
        ],
        "updater": {
            "status": "warehouse_refresh",
            "detail": "Generated from the local SQLite warehouse and benchmark CSV.",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export compact JSON used by the GitHub Pages predictor app.")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--out", default=str(SITE_DATA_PATH))
    parser.add_argument("--allow-missing-db", action="store_true")
    parser.add_argument("--apify-feed", default=None)
    args = parser.parse_args()

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    db_path = Path(args.db_path)
    if db_path.exists():
        payload = build_payload(db_path)
    elif args.allow_missing_db:
        payload = fallback_payload_from_existing(
            output_path,
            Path(args.apify_feed) if args.apify_feed else None,
        )
    else:
        raise FileNotFoundError(f"SQLite warehouse not found: {db_path}")
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    js_output_path = output_path.with_suffix(".js")
    js_output_path.write_text(
        "window.__STRIKESIGNAL_DATA__ = "
        + json.dumps(payload, indent=2, sort_keys=True)
        + ";\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "out": str(output_path),
                "out_js": str(js_output_path),
                "benchmark_predictions": len(payload.get("benchmark_predictions", [])),
                "upcoming_predictions": len(payload.get("upcoming_predictions", [])),
                "generated_at_utc": payload["generated_at_utc"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
