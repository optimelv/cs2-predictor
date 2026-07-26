from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ELIGIBLE_TIERS = ("T1", "T1_5", "T2")


def tier_label(value: str) -> str:
    return "tier_1" if value == "T1" else "tier_2"


def export_history(database: Path) -> dict[str, Any]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    placeholders = ",".join("?" for _ in ELIGIBLE_TIERS)
    matches = connection.execute(
        f"""
        SELECT match_id, match_date, event_name, team1_name, team2_name,
               target_team1_win, team1_score, team2_score, model_tier,
               best_of, match_phase, stage_name, round_name, is_playoff,
               is_elimination_match
        FROM model_training_matches
        WHERE model_tier IN ({placeholders})
        ORDER BY match_date DESC, match_id DESC
        """,
        ELIGIBLE_TIERS,
    ).fetchall()
    eligible_ids = {int(row["match_id"]) for row in matches}

    maps_by_match: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in connection.execute(
        f"""
        SELECT mm.match_id, mm.map_index, mm.map_name, mm.team1_score,
               mm.team2_score, mm.winner_team_name, mm.picked_by_team_name
        FROM hltv_match_maps mm
        JOIN model_training_matches mt USING(match_id)
        WHERE mt.model_tier IN ({placeholders})
        ORDER BY mm.match_id, mm.map_index
        """,
        ELIGIBLE_TIERS,
    ):
        maps_by_match[int(row["match_id"])].append({
            "map_name": row["map_name"],
            "score1": row["team1_score"],
            "score2": row["team2_score"],
            "winner_name": row["winner_team_name"],
            "picked_by": row["picked_by_team_name"],
        })

    lineups_by_match: dict[int, dict[str, list[str]]] = defaultdict(lambda: {"team1": [], "team2": []})
    for row in connection.execute(
        f"""
        SELECT mp.match_id, mp.team_side, mp.player_name
        FROM hltv_match_players mp
        JOIN model_training_matches mt USING(match_id)
        WHERE mt.model_tier IN ({placeholders})
        ORDER BY mp.match_id, mp.team_side, mp.player_name
        """,
        ELIGIBLE_TIERS,
    ):
        side = "team1" if int(row["team_side"]) == 1 else "team2"
        lineups_by_match[int(row["match_id"])][side].append(row["player_name"])

    rows = []
    for row in matches:
        match_id = int(row["match_id"])
        winner_name = row["team1_name"] if int(row["target_team1_win"]) == 1 else row["team2_name"]
        rows.append({
            "match_id": f"hltv:{match_id}",
            "match_date": row["match_date"],
            "event_name": row["event_name"],
            "team1_name": row["team1_name"],
            "team2_name": row["team2_name"],
            "score1": row["team1_score"],
            "score2": row["team2_score"],
            "winner_name": winner_name,
            "tier": tier_label(row["model_tier"]),
            "best_of": int(row["best_of"] or 3),
            "phase": row["match_phase"] or row["stage_name"] or "Series",
            "stage_name": row["stage_name"] or "",
            "round_name": row["round_name"] or "",
            "is_playoff": bool(row["is_playoff"]),
            "is_elimination": bool(row["is_elimination_match"]),
            "maps": maps_by_match.get(match_id, []),
            "lineups": lineups_by_match.get(match_id, {"team1": [], "team2": []}),
        })

    connection.close()
    dates = [row["match_date"] for row in rows if row.get("match_date")]
    return {
        "contract_version": "1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "through_date": max(dates) if dates else None,
        "scope": {
            "tiers": ["tier_1", "tier_2"],
            "matches": len(rows),
            "maps": sum(len(row["maps"]) for row in rows),
            "lineup_rows": sum(len(side) for row in rows for side in row["lineups"].values()),
            "source_match_ids": len(eligible_ids),
        },
        "matches": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the compact Tier 1/2 history snapshot used by the product.")
    parser.add_argument("--database", type=Path, default=Path("work/data/cs2_predictor.sqlite3"))
    parser.add_argument("--output", type=Path, default=Path("docs/data/history.json"))
    args = parser.parse_args()
    payload = export_history(args.database)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(json.dumps(payload["scope"], indent=2))


if __name__ == "__main__":
    main()
