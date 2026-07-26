from __future__ import annotations

import argparse
from collections import defaultdict
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
        JOIN product_match_scope scope ON scope.match_id = s.match_id
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
                "team_name": team_name or "Team pending",
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


def map_profile_rows(connection: sqlite3.Connection, player_id: int) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT
            s.match_id,
            s.match_date,
            s.map_name,
            s.team_name,
            s.hltv_team_id,
            s.kills,
            s.deaths,
            s.adr,
            s.kast,
            s.rating_2_0,
            m.team1_name,
            m.team2_name,
            m.team1_score,
            m.team2_score,
            m.winner_team_id
        FROM hltv_match_player_stats s
        JOIN hltv_result_matches m ON m.match_id = s.match_id
        JOIN product_match_scope scope ON scope.match_id = s.match_id
        WHERE s.hltv_player_id = ?
          AND LOWER(COALESCE(s.map_name, '')) != 'all'
          AND s.match_date IS NOT NULL
        ORDER BY s.match_date, s.match_id, s.map_index
        """,
        (player_id,),
    ).fetchall()
    grouped: dict[str, list[sqlite3.Row | tuple[Any, ...]]] = defaultdict(list)
    for row in rows:
        grouped[str(row[2] or "Unknown")].append(row)
    result: list[dict[str, Any]] = []
    for map_name, map_rows in grouped.items():
        kills = sum(int(row[5] or 0) for row in map_rows)
        deaths = sum(int(row[6] or 0) for row in map_rows)
        wins = 0
        rated = [float(row[9]) for row in map_rows if row[9] is not None]
        adr = [float(row[7]) for row in map_rows if row[7] is not None]
        kast = [float(row[8]) for row in map_rows if row[8] is not None]
        for row in map_rows:
            won = row[14] is not None and row[4] is not None and int(row[14]) == int(row[4])
            if row[14] is None and row[12] is not None and row[13] is not None and row[12] != row[13]:
                won = (row[10] == row[3] and row[12] > row[13]) or (row[11] == row[3] and row[13] > row[12])
            wins += int(won)
        result.append(
            {
                "map_name": map_name,
                "maps": len(map_rows),
                "wins": wins,
                "losses": len(map_rows) - wins,
                "win_rate": round(wins / len(map_rows), 3),
                "kills": kills,
                "deaths": deaths,
                "kd_ratio": round(kills / max(1, deaths), 2),
                "average_rating": round(sum(rated) / len(rated), 2) if rated else None,
                "average_adr": round(sum(adr) / len(adr), 1) if adr else None,
                "average_kast": round(sum(kast) / len(kast), 1) if kast else None,
                "last_date": max(str(row[1]) for row in map_rows),
            }
        )
    return sorted(result, key=lambda row: (-row["maps"], -(row["average_rating"] or 0), row["map_name"]))


def roster_eras(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in timeline:
        grouped[str(row.get("team_name") or "Team pending")].append(row)
    eras = []
    for team_name, rows in grouped.items():
        rated = [row for row in rows if row.get("rating") is not None]
        adr = [row for row in rows if row.get("adr") is not None]
        known_results = [row for row in rows if row.get("won") is not None]
        eras.append(
            {
                "team_name": team_name,
                "from_date": min(row["date"] for row in rows),
                "through_date": max(row["date"] for row in rows),
                "series": len(rows),
                "wins": sum(row.get("won") is True for row in rows),
                "losses": sum(row.get("won") is False for row in rows),
                "win_rate": round(sum(row.get("won") is True for row in rows) / len(known_results), 3) if known_results else None,
                "average_rating": round(sum(row["rating"] for row in rated) / len(rated), 2) if rated else None,
                "average_adr": round(sum(row["adr"] for row in adr) / len(adr), 1) if adr else None,
            }
        )
    return sorted(eras, key=lambda row: (row["through_date"], row["series"]), reverse=True)


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
    parser.add_argument("--history", default="docs/data/history.json")
    parser.add_argument("--browser-output", default="docs/data/players.js")
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()

    players_path = Path(args.players)
    payload = json.loads(players_path.read_text(encoding="utf-8"))
    history = json.loads(Path(args.history).read_text(encoding="utf-8"))
    eligible_match_ids = {
        int(str(row.get("match_id", "")).split(":")[-1])
        for row in history.get("matches", [])
        if row.get("tier") in {"tier_1", "tier_2"} and str(row.get("match_id", "")).split(":")[-1].isdigit()
    }
    connection = sqlite3.connect(args.db, timeout=10)
    covered = 0
    map_covered = 0
    latest_date = ""
    latest_map_date = ""
    try:
        connection.execute("CREATE TEMP TABLE product_match_scope (match_id INTEGER PRIMARY KEY)")
        connection.executemany("INSERT INTO product_match_scope(match_id) VALUES (?)", ((match_id,) for match_id in eligible_match_ids))
        for player in payload.get("players", []):
            player_id = player.get("hltv_player_id")
            if not player_id:
                continue
            timeline = timeline_rows(connection, int(player_id), args.limit)
            player["form_timeline"] = timeline
            player["form_summary"] = form_summary(timeline)
            player["map_profile"] = map_profile_rows(connection, int(player_id))
            player["roster_eras"] = roster_eras(timeline)
            if timeline:
                covered += 1
                latest_date = max(latest_date, timeline[-1]["date"])
            if player["map_profile"]:
                map_covered += 1
                latest_map_date = max(latest_map_date, max(row["last_date"] for row in player["map_profile"]))
    finally:
        connection.close()

    payload["history_source"] = "HLTV official series statistics"
    payload["history_through_date"] = latest_date or None
    payload["history_profile_count"] = covered
    payload["map_history_source"] = "HLTV official map statistics"
    payload["map_history_through_date"] = latest_map_date or None
    payload["map_profile_count"] = map_covered
    payload["contract_version"] = "1.3"
    rendered = json.dumps(payload, indent=2, ensure_ascii=True)
    players_path.write_text(f"{rendered}\n", encoding="utf-8")
    Path(args.browser_output).write_text(f"window.__STRIKESIGNAL_PLAYERS__ = {rendered};\n", encoding="utf-8")
    print(json.dumps({"players": len(payload.get("players", [])), "timelines": covered, "maps": map_covered, "through": latest_date, "maps_through": latest_map_date}))


if __name__ == "__main__":
    main()
