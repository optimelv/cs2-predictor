from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
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
LEGACY_MATCH_DETAILS_PATH = DATA_ROOT / "raw" / "hltv" / "flaresolverr_match_details_stage2_deciders_2026_06_09.json"
MANUAL_TEAM_MAP_BANS = {
    "pain": {"Ancient"},
    "pain gaming": {"Ancient"},
}
TEAM_LOGO_URLS = {
    "9z": "./assets/logos/9z.png",
    "Astralis": "./assets/logos/astralis.png",
    "Aurora": "https://img-cdn.hltv.org/teamlogo/yJzPNOeXlyiniNxanYJCrv.png?ixlib=java-2.1.0&w=100&s=f23524510b9d49ea59166e6e2efee1ac",
    "B8": "./assets/logos/b8.png",
    "BIG": "./assets/logos/big.png",
    "BetBoom": "./assets/logos/betboom.png",
    "FURIA": "./assets/logos/furia.png",
    "FUT": "./assets/logos/fut.png",
    "Falcons": "./assets/logos/falcons.png",
    "FlyQuest": "./assets/logos/flyquest.png",
    "G2": "./assets/logos/g2.png",
    "GamerLegion": "./assets/logos/gamerlegion.png",
    "Legacy": "./assets/logos/legacy.png",
    "M80": "./assets/logos/m80.png",
    "MIBR": "./assets/logos/mibr.png",
    "MOUZ": "./assets/logos/mouz.png",
    "Monte": "./assets/logos/monte.png",
    "NAVI": "./assets/logos/navi.png",
    "Natus Vincere": "./assets/logos/natus_vincere.png",
    "PARIVISION": "./assets/logos/parivision.png",
    "Spirit": "./assets/logos/spirit.png",
    "TYLOO": "./assets/logos/tyloo.png",
    "The MongolZ": "./assets/logos/the_mongolz.png",
    "Vitality": "./assets/logos/vitality.png",
    "paiN": "./assets/logos/pain.png",
}
COLOGNE_STAGE3_SOURCE_URLS = {
    "hltv_stage3": "https://www.hltv.org/events/8301/iem-cologne-major-2026",
    "liquipedia_stage3": "https://liquipedia.net/counterstrike/Intel_Extreme_Masters/2026/Cologne/Stage_3",
}
COLOGNE_STAGE3_SEEDS = [
    (1, "Vitality"),
    (2, "NAVI"),
    (3, "Falcons"),
    (4, "The MongolZ"),
    (5, "PARIVISION"),
    (6, "Aurora"),
    (7, "FURIA"),
    (8, "MOUZ"),
    (9, "FUT"),
    (10, "Spirit"),
    (11, "G2"),
    (12, "BetBoom"),
    (13, "9z"),
    (14, "Monte"),
    (15, "B8"),
    (16, "Legacy"),
]
COLOGNE_STAGE3_CURRENT_MATCHES = [
    {"round": 1, "record": "0-0", "team1": "Vitality", "team2": "FUT", "score": "2:1", "winner": "Vitality"},
    {"round": 1, "record": "0-0", "team1": "NAVI", "team2": "Spirit", "score": "0:2", "winner": "Spirit"},
    {"round": 1, "record": "0-0", "team1": "Falcons", "team2": "G2", "score": "2:1", "winner": "Falcons"},
    {"round": 1, "record": "0-0", "team1": "The MongolZ", "team2": "BetBoom", "score": "1:2", "winner": "BetBoom"},
    {"round": 1, "record": "0-0", "team1": "PARIVISION", "team2": "9z", "score": "1:2", "winner": "9z"},
    {"round": 1, "record": "0-0", "team1": "Aurora", "team2": "Monte", "score": "2:0", "winner": "Aurora"},
    {"round": 1, "record": "0-0", "team1": "FURIA", "team2": "B8", "score": "2:0", "winner": "FURIA"},
    {"round": 1, "record": "0-0", "team1": "MOUZ", "team2": "Legacy", "score": "2:0", "winner": "MOUZ"},
    {"round": 2, "record": "1-0", "team1": "Vitality", "team2": "9z"},
    {"round": 2, "record": "1-0", "team1": "Falcons", "team2": "BetBoom"},
    {"round": 2, "record": "1-0", "team1": "Aurora", "team2": "Spirit"},
    {"round": 2, "record": "1-0", "team1": "FURIA", "team2": "MOUZ", "score": "2:1", "winner": "FURIA"},
    {"round": 2, "record": "0-1", "team1": "NAVI", "team2": "Legacy"},
    {"round": 2, "record": "0-1", "team1": "The MongolZ", "team2": "B8", "score": "2:0", "winner": "The MongolZ"},
    {"round": 2, "record": "0-1", "team1": "PARIVISION", "team2": "Monte"},
    {"round": 2, "record": "0-1", "team1": "FUT", "team2": "G2"},
]
_APIFY_LIVE_DETAILS: dict[int, dict[str, Any]] = {}



def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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
        "has_state": bool(team),
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
    rank1 = team1["vrs_rank"]
    rank2 = team2["vrs_rank"]
    vrs_rank_advantage = max(-40, min(40, rank2 - rank1)) if rank1 and rank2 else 0
    vrs_points_diff = max(-650.0, min(650.0, team1["vrs_points"] - team2["vrs_points"]))
    recent_diff = max(-0.5, min(0.5, team1["recent_win_rate_10"] - team2["recent_win_rate_10"]))
    probability = sigmoid(elo_logit + 0.009 * vrs_rank_advantage + 0.00035 * vrs_points_diff + 0.3 * recent_diff)
    if not team1["has_state"] or not team2["has_state"]:
        probability = 0.5 + (probability - 0.5) * 0.45
    return max(0.08, min(0.92, probability))


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
    output = {}
    if LEGACY_MATCH_DETAILS_PATH.exists():
        try:
            payload = json.loads(LEGACY_MATCH_DETAILS_PATH.read_text(encoding="utf-8"))
            details = payload.get("details") if isinstance(payload, dict) else payload
            for detail in details or []:
                match_id = safe_int(detail.get("match_id"), None)
                if match_id is not None:
                    output[match_id] = detail
        except Exception:
            pass
    # Merge dynamically loaded/parsed Apify feed details
    output.update(_APIFY_LIVE_DETAILS)
    return output


def parse_apify_detail(item: dict[str, Any]) -> dict[str, Any]:
    # Extract maps
    raw_maps = item.get("maps") or []
    maps = []
    if isinstance(raw_maps, list):
        for m in raw_maps:
            if not isinstance(m, dict):
                continue
            map_name = m.get("map_name") or m.get("mapName") or m.get("name") or m.get("map")
            if map_name:
                maps.append({
                    "map_name": str(map_name),
                    "team1_score": safe_int(m.get("team1_score") or m.get("team1Score"), None),
                    "team2_score": safe_int(m.get("team2_score") or m.get("team2Score"), None),
                })

    # Extract vetoes
    raw_vetoes = item.get("vetoes") or []
    vetoes = []
    if isinstance(raw_vetoes, list):
        for v in raw_vetoes:
            if not isinstance(v, dict):
                continue
            map_name = v.get("map_name") or v.get("mapName") or v.get("name") or v.get("map")
            action = v.get("action")
            if action:
                action = str(action).lower()
                if "pick" in action:
                    action = "picked"
                elif "left" in action or "decider" in action:
                    action = "leftover"
                elif "remove" in action or "ban" in action:
                    action = "removed"
            if map_name and action:
                vetoes.append({
                    "map_name": str(map_name),
                    "action": action,
                })
    return {
        "match_id": safe_int(item.get("match_id") or item.get("matchId") or item.get("id"), None),
        "maps": maps,
        "vetoes": vetoes,
    }


def canonical_map_name(name: str) -> str:
    normalized = normalize_team_name(name).replace(" ", "")
    aliases = {
        "dustii": "Dust2",
        "dust2": "Dust2",
        "de_dust2": "Dust2",
    }
    if normalized in aliases:
        return aliases[normalized]
    return str(name).strip().title().replace(" ", "")


def oriented_api_scores(item: dict[str, Any], team1_name: str) -> tuple[int | None, int | None]:
    score1 = safe_int(item.get("team1_score") or item.get("team1Score"), None)
    score2 = safe_int(item.get("team2_score") or item.get("team2Score"), None)
    api_team1 = team_name_from_api_item(item, 1)
    if api_team1 and normalize_team_name(api_team1) != normalize_team_name(team1_name):
        return score2, score1
    return score1, score2


def live_map_read_from_snapshot(
    match: dict[str, Any],
    feed_item: dict[str, Any],
    model_state: dict[str, Any],
) -> dict[str, Any] | None:
    detail = parse_apify_detail(feed_item)
    known_maps = [canonical_map_name(row["map_name"]) for row in detail.get("maps", []) if row.get("map_name")]
    if not known_maps:
        known_maps = [
            canonical_map_name(row["map_name"])
            for row in detail.get("vetoes", [])
            if row.get("map_name") and row.get("action") in {"picked", "leftover"}
        ]
    known_maps = [name for index, name in enumerate(known_maps) if name and name not in known_maps[:index]]
    if not known_maps:
        return None

    team1 = str(match.get("team1_name") or "")
    team2 = str(match.get("team2_name") or "")
    base_probability = safe_float(match.get("prob_team1"), 0.5)
    profiles = model_state.get("map_profiles", {})
    profile1 = profiles.get(normalize_team_name(team1), {})
    profile2 = profiles.get(normalize_team_name(team2), {})
    maps = []
    for map_name in known_maps[:3]:
        row1 = profile1.get(map_name, {})
        row2 = profile2.get(map_name, {})
        rate1 = rate_with_prior(row1)
        rate2 = rate_with_prior(row2)
        evidence = (safe_int(row1.get("matches"), 0) or 0) + (safe_int(row2.get("matches"), 0) or 0)
        weight = min(1.0, evidence / 28.0)
        probability = sigmoid(logit(base_probability) + weight * 1.85 * (rate1 - rate2))
        maps.append(
            {
                "map_name": map_name,
                "source": "known_veto",
                "prob_team1": round_prob(probability),
                "predicted_winner": team1 if probability >= 0.5 else team2,
                "confidence": round_prob(max(probability, 1.0 - probability)),
                "team1_map_win_rate": round_prob(rate1),
                "team2_map_win_rate": round_prob(rate2),
                "evidence_maps": evidence,
            }
        )
    probability = sum(row["prob_team1"] for row in maps) / len(maps)
    return {
        "status": "known_veto",
        "base_prob_team1": round_prob(base_probability),
        "map_adjusted_prob_team1": round_prob(probability),
        "map_adjusted_predicted_winner": team1 if probability >= 0.5 else team2,
        "map_adjusted_confidence": round_prob(max(probability, 1.0 - probability)),
        "maps": maps,
        "excluded_maps": match.get("map_read", {}).get("excluded_maps", {}),
        "note": "Official veto loaded. The series probability now uses the selected maps.",
    }


def update_major_projection_from_apify(payload: dict[str, Any], apify_feed_path: Path) -> None:
    apify_items = api_items_from_feed(apify_feed_path)
    if not apify_items:
        return

    apify_lookup = {}
    for item in apify_items:
        t1 = team_name_from_api_item(item, 1)
        t2 = team_name_from_api_item(item, 2)
        if t1 and t2:
            key1 = (normalize_team_name(t1), normalize_team_name(t2))
            key2 = (normalize_team_name(t2), normalize_team_name(t1))
            apify_lookup[key1] = item
            apify_lookup[key2] = item

    major = payload.get("major_projection", {})
    if not major:
        return

    # Update current Stage 3 board.
    board = major.get("current_stage_board", {})
    for round_obj in board.get("rounds", []):
        for group in round_obj.get("groups", []):
            for match in group.get("matches", []):
                if match.get("status") == "locked":
                    continue
                t1 = match.get("team1_name")
                t2 = match.get("team2_name")
                if not (t1 and t2):
                    continue
                key = (normalize_team_name(t1), normalize_team_name(t2))
                feed_item = apify_lookup.get(key)
                if feed_item:
                    status = str(feed_item.get("status") or "Scheduled").lower()
                    t1_score, t2_score = oriented_api_scores(feed_item, t1)

                    if "live" in status or "playing" in status:
                        match["status"] = "live"
                        match["score_label"] = f"{t1_score or 0}:{t2_score or 0}"
                    elif "completed" in status or "finished" in status or t1_score is not None or t2_score is not None:
                        match["status"] = "locked"
                        if t1_score is not None and t2_score is not None:
                            match["score_label"] = f"{t1_score}:{t2_score}"
                            match["winner_name"] = t1 if t1_score > t2_score else t2

    for prediction in payload.get("upcoming_predictions", []):
        team1 = prediction.get("team1_name")
        team2 = prediction.get("team2_name")
        if not (team1 and team2):
            continue
        feed_item = apify_lookup.get((normalize_team_name(team1), normalize_team_name(team2)))
        if not feed_item:
            continue
        status = str(feed_item.get("status") or "scheduled").lower()
        score1, score2 = oriented_api_scores(feed_item, team1)
        prediction["status"] = "live" if "live" in status or "playing" in status else status
        if score1 is not None and score2 is not None:
            prediction["score_label"] = f"{score1}:{score2}"
        live_map_read = live_map_read_from_snapshot(prediction, feed_item, payload.get("model_state", {}))
        if live_map_read:
            prediction["map_read"] = live_map_read



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


def current_stage3_snapshot(
    connection: sqlite3.Connection,
    model_state: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rounds: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    upcoming = []
    for index, match in enumerate(COLOGNE_STAGE3_CURRENT_MATCHES, start=1):
        team1 = str(match["team1"])
        team2 = str(match["team2"])
        round_number = int(match["round"])
        record = str(match["record"])
        winner = match.get("winner")
        if winner:
            rounds[round_number][record].append(
                board_match_payload(
                    round_number=round_number,
                    record_before=record,
                    team1_name=team1,
                    team2_name=team2,
                    score_label=str(match.get("score") or "final"),
                    winner_name=str(winner),
                    status="locked",
                )
            )
            continue

        prediction = projection_match_payload(
            team1,
            team2,
            model_state,
            round_name=f"Stage 3 round {round_number}",
            connection=connection,
        )
        prediction.update(
            {
                "seed": index,
                "source": "current_stage3_schedule",
                "status": "scheduled",
            }
        )
        upcoming.append(prediction)
        rounds[round_number][record].append(
            board_match_payload(
                round_number=round_number,
                record_before=record,
                team1_name=team1,
                team2_name=team2,
                score_label=f"{round(prediction['confidence'] * 100)}%",
                winner_name=str(prediction["predicted_winner"]),
                status="projected",
                confidence=float(prediction["confidence"]),
            )
        )

    round_order = {
        1: ["0-0"],
        2: ["1-0", "0-1"],
        3: ["2-0", "1-1", "0-2"],
        4: ["2-1", "1-2"],
        5: ["2-2"],
    }
    board = {
        "stage": "IEM Cologne Major 2026 Stage 3",
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
        "final_groups": [],
    }
    return board, upcoming


def stage3_seed_list() -> list[dict[str, Any]]:
    return [
        {"seed": seed, "team_name": team, "slot_status": "locked"}
        for seed, team in COLOGNE_STAGE3_SEEDS
    ]


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
    seed_rows = stage3_seed_list()
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
        "generated_from": "current_stage3_state_plus_model_projection",
        "format": "16-team Swiss, all BO3, top eight advance",
        "source_urls": COLOGNE_STAGE3_SOURCE_URLS,
        "seed_rows": seed_rows,
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
    lookup = team_lookup(model_state)
    state1 = lookup.get(normalize_team_name(team1), {})
    state2 = lookup.get(normalize_team_name(team2), {})
    probability = projection_probability(team1, team2, model_state)
    predicted_winner = team1 if probability >= 0.5 else team2
    timestamp = timestamp_from_api_item(item)
    match_date = datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat() if timestamp else ""
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
        "model": "live_snapshot_power_bounded",
        "mode": "api_feed_snapshot_state",
        "data_quality": "full" if state1 and state2 else "partial",
        "source": "apify_hltv_feed",
    }


def fallback_payload_from_existing(output_path: Path, apify_feed_path: Path | None) -> dict[str, Any]:
    payload = read_json(output_path)
    if not payload:
        raise FileNotFoundError(
            "No SQLite warehouse and no existing site JSON found. Generate docs/data/predictions.json locally first."
        )
    payload.setdefault("updater", {})
    if apify_feed_path and apify_feed_path.exists():
        apify_items = api_items_from_feed(apify_feed_path)
        if not apify_items:
            return payload
        payload["generated_at_utc"] = utc_now()
        payload["updater"].update(
            {
                "status": "live_feed_refresh",
                "detail": "Live schedules, scores, and veto details refreshed from the verified event feed.",
            }
        )
        for item in apify_items:
            detail_item = parse_apify_detail(item)
            match_id = detail_item.get("match_id")
            if match_id:
                _APIFY_LIVE_DETAILS[match_id] = item

        update_major_projection_from_apify(payload, apify_feed_path)

        predictions = [
            prediction
            for prediction in (
                prediction_from_snapshot_match(item, payload.get("model_state", {}))
                for item in apify_items
            )
            if prediction is not None
        ]
        if predictions:
            existing_pairs = {
                frozenset(
                    {
                        normalize_team_name(str(row.get("team1_name") or "")),
                        normalize_team_name(str(row.get("team2_name") or "")),
                    }
                )
                for row in payload.get("upcoming_predictions", [])
            }
            extras = [
                row
                for row in predictions
                if frozenset(
                    {
                        normalize_team_name(str(row.get("team1_name") or "")),
                        normalize_team_name(str(row.get("team2_name") or "")),
                    }
                )
                not in existing_pairs
                and str(row.get("status") or "").casefold() not in {"completed", "finished"}
            ]
            payload["upcoming_predictions"] = [*payload.get("upcoming_predictions", []), *extras[:9]]
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


def build_payload(db_path: Path, apify_feed_path: Path | None = None) -> dict[str, Any]:
    benchmark_rows = read_csv_rows(BENCHMARK_PREDICTIONS_CSV)
    connection = connect(db_path)
    connection.row_factory = sqlite3.Row

    # Load Apify feed first to populate map/veto overrides
    if apify_feed_path and apify_feed_path.exists():
        apify_items = api_items_from_feed(apify_feed_path)
        for item in apify_items:
            detail_item = parse_apify_detail(item)
            match_id = detail_item.get("match_id")
            if match_id:
                _APIFY_LIVE_DETAILS[match_id] = item

    model_state = model_state_snapshot(connection)
    model_state["map_pool"] = active_map_pool(connection)
    model_state["map_profiles"] = {
        normalize_team_name(team_name): team_map_profile(connection, team_name)
        for _, team_name in COLOGNE_STAGE3_SEEDS
    }
    major_projection = simulate_stage3_swiss(model_state, connection)
    current_board, current_upcoming = current_stage3_snapshot(connection, model_state)
    major_projection["current_stage_board"] = current_board
    payload = {
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
        "upcoming_predictions": current_upcoming,
        "model_state": model_state,
        "notices": [
            "Post-veto accuracy uses known maps and should not be treated as a pre-veto number.",
            "Stage 3 projections lock completed results before simulating unresolved matches.",
            "GitHub Pages serves generated JSON; API secrets stay in scheduled update jobs.",
        ],
        "updater": {
            "status": "warehouse_refresh",
            "detail": "Generated from the local SQLite warehouse and benchmark CSV.",
        },
    }

    # Apply major projection updates from the feed
    if apify_feed_path and apify_feed_path.exists():
        update_major_projection_from_apify(payload, apify_feed_path)

    return payload



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
        payload = build_payload(db_path, Path(args.apify_feed) if args.apify_feed else None)
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
