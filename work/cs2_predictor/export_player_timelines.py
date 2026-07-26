from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


def timeline_rows(connection: sqlite3.Connection, player_id: int, limit: int) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT
            s.match_id,
            s.match_date,
            s.team_name,
            s.hltv_team_id,
            s.kills,
            s.deaths,
            s.adr,
            s.kast,
            s.rating_2_0,
            m.event_name,
            m.team1_name,
            m.team2_name,
            m.winner_team_id,
            m.team1_score,
            m.team2_score
        FROM hltv_match_player_stats s
        JOIN hltv_result_matches m ON m.match_id = s.match_id
        WHERE s.hltv_player_id = ?
          AND LOWER(COALESCE(s.map_name, '')) = 'all'
          AND s.match_date IS NOT NULL
        ORDER BY s.match_date DESC, s.match_id DESC
        LIMIT ?
        """,
        (player_id, limit),
    ).fetchall()
    timeline: list[dict[str, Any]] = []
    for row in reversed(rows):
        team_name = row[2] or ""
        opponent = row[11] if row[10] == team_name else row[10]
        kills = int(row[4] or 0)
        deaths = int(row[5] or 0)
        winner_team_id = row[12]
        won = None if winner_team_id is None or row[3] is None else int(winner_team_id) == int(row[3])
        if won is None and row[13] is not None and row[14] is not None and row[13] != row[14]:
            won = (row[10] == team_name and row[13] > row[14]) or (row[11] == team_name and row[14] > row[13])
        timeline.append(
            {
                "match_id": f"hltv:{row[0]}",
                "date": row[1],
                "event_name": row[9] or "HLTV event",
                "opponent_name": opponent or "Opponent",
                "won": won,
                "kills": kills,
                "deaths": deaths,
                "kd_ratio": round(kills / max(1, deaths), 2),
                "adr": round(float(row[6]), 1) if row[6] is not None else None,
                "kast": round(float(row[7]), 1) if row[7] is not None else None,
                "rating": round(float(row[8]), 2) if row[8] is not None else None,
            }
        )
    return timeline


def form_summary(timeline: list[dict[str, Any]]) -> dict[str, Any]:
    rated = [row for row in timeline if row.get("rating") is not None]
    recent = rated[-3:]
    previous = rated[-6:-3]
    recent_average = sum(row["rating"] for row in recent) / len(recent) if recent else None
    previous_average = sum(row["rating"] for row in previous) / len(previous) if previous else None
    return {
        "series": len(timeline),
        "average_rating": round(sum(row["rating"] for row in rated) / len(rated), 2) if rated else None,
        "average_adr": round(sum(row["adr"] for row in timeline if row.get("adr") is not None) / max(1, sum(row.get("adr") is not None for row in timeline)), 1) if timeline else None,
        "recent_rating": round(recent_average, 2) if recent_average is not None else None,
        "rating_delta": round(recent_average - previous_average, 2) if recent_average is not None and previous_average is not None else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Attach historical HLTV series timelines to the public player snapshot.")
    parser.add_argument("--db", default="work/data/cs2_predictor.sqlite3")
    parser.add_argument("--players", default="docs/data/players.json")
    parser.add_argument("--browser-output", default="docs/data/players.js")
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()

    players_path = Path(args.players)
    payload = json.loads(players_path.read_text(encoding="utf-8"))
    connection = sqlite3.connect(args.db, timeout=10)
    covered = 0
    latest_date = ""
    try:
        for player in payload.get("players", []):
            player_id = player.get("hltv_player_id")
            if not player_id:
                continue
            timeline = timeline_rows(connection, int(player_id), args.limit)
            player["form_timeline"] = timeline
            player["form_summary"] = form_summary(timeline)
            if timeline:
                covered += 1
                latest_date = max(latest_date, timeline[-1]["date"])
    finally:
        connection.close()

    payload["history_source"] = "HLTV official series statistics"
    payload["history_through_date"] = latest_date or None
    payload["history_profile_count"] = covered
    payload["contract_version"] = "1.2"
    rendered = json.dumps(payload, indent=2, ensure_ascii=True)
    players_path.write_text(f"{rendered}\n", encoding="utf-8")
    Path(args.browser_output).write_text(f"window.__STRIKESIGNAL_PLAYERS__ = {rendered};\n", encoding="utf-8")
    print(json.dumps({"players": len(payload.get("players", [])), "timelines": covered, "through": latest_date}))


if __name__ == "__main__":
    main()
