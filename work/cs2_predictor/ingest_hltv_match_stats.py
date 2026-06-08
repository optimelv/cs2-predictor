from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .ingest_hltv_match_details import normalize_map_name
from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, parse_float, parse_int, summarize, upsert_player, upsert_team


def date_from_ms(value: Any) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(int(value) / 1000, tz=UTC).date().isoformat()


def ingest_player_rows(connection, *, data: dict[str, Any], stats_id: int, team_side: int, team: dict[str, Any]) -> int:
    team_key = upsert_team(connection, team["name"], "hltv_match_stats") if team.get("name") else None
    rows = ((data.get("playerStats") or {}).get(f"team{team_side}") or [])
    loaded = 0
    match_id = parse_int(data.get("matchId"))
    map_name = normalize_map_name(data.get("map"))
    match_date = date_from_ms(data.get("date"))
    map_index_row = connection.execute(
        "SELECT map_index FROM hltv_match_maps WHERE stats_id = ? LIMIT 1",
        (stats_id,),
    ).fetchone()
    map_index = map_index_row["map_index"] if map_index_row else None
    for row in rows:
        player = row.get("player") or {}
        player_name = player.get("name")
        player_id = parse_int(player.get("id"))
        if not player_name:
            continue
        player_key = upsert_player(
            connection,
            player_name,
            source="hltv_match_stats",
            hltv_player_id=player_id,
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_player_stats(
                stats_id, match_id, map_name, map_index, match_date,
                team_side, team_key, team_name, hltv_team_id,
                player_key, player_name, hltv_player_id,
                kills, hs_kills, assists, flash_assists, deaths,
                kast, adr, impact, kills_per_round, deaths_per_round,
                kill_deaths_difference, first_kills_difference,
                rating_1_0, rating_2_0, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                stats_id,
                match_id,
                map_name,
                map_index,
                match_date,
                team_side,
                team_key,
                team.get("name"),
                parse_int(team.get("id")),
                player_key,
                player_name,
                player_id,
                parse_int(row.get("kills")),
                parse_int(row.get("hsKills")),
                parse_int(row.get("assists")),
                parse_int(row.get("flashAssists")),
                parse_int(row.get("deaths")),
                parse_float(row.get("KAST")),
                parse_float(row.get("ADR")),
                parse_float(row.get("impact")),
                parse_float(row.get("killsPerRound")),
                parse_float(row.get("deathsPerRound")),
                parse_int(row.get("killDeathsDifference")),
                parse_int(row.get("firstKillsDifference")),
                parse_float(row.get("rating1")),
                parse_float(row.get("rating2")),
                json.dumps(row, ensure_ascii=False, sort_keys=True),
            ),
        )
        loaded += 1
    return loaded


def ingest_round_rows(connection, *, data: dict[str, Any], stats_id: int) -> int:
    connection.execute("DELETE FROM hltv_match_map_rounds WHERE stats_id = ?", (stats_id,))
    match_id = parse_int(data.get("matchId"))
    map_name = normalize_map_name(data.get("map"))
    rows = data.get("roundHistory") or []
    for index, row in enumerate(rows, start=1):
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_map_rounds(
                stats_id, round_index, match_id, map_name,
                outcome, score_text, t_team_id, ct_team_id, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                stats_id,
                index,
                match_id,
                map_name,
                row.get("outcome"),
                row.get("score"),
                parse_int(row.get("tTeam")),
                parse_int(row.get("ctTeam")),
                json.dumps(row, ensure_ascii=False, sort_keys=True),
            ),
        )
    return len(rows)


def ingest_stats(raw_path: Path, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    rows = json.loads(raw_path.read_text(encoding="utf-8"))
    connection = connect(db_path)
    loaded_player_rows = 0
    loaded_round_rows = 0
    errors = 0
    ok_rows = 0
    for row in rows:
        if row.get("status") != "ok":
            errors += 1
            continue
        data = row["data"]
        stats_id = parse_int(row.get("stats_id") or data.get("id"))
        if stats_id is None:
            errors += 1
            continue
        ok_rows += 1
        loaded_player_rows += ingest_player_rows(connection, data=data, stats_id=stats_id, team_side=1, team=data.get("team1") or {})
        loaded_player_rows += ingest_player_rows(connection, data=data, stats_id=stats_id, team_side=2, team=data.get("team2") or {})
        loaded_round_rows += ingest_round_rows(connection, data=data, stats_id=stats_id)
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "rows_seen": len(rows),
        "ok_rows": ok_rows,
        "errors_seen": errors,
        "player_stat_rows_loaded": loaded_player_rows,
        "round_rows_loaded": loaded_round_rows,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest HLTV map-stat JSON into SQLite player/round stat tables.")
    parser.add_argument(
        "--raw-path",
        default=str(RAW_ROOT / "hltv" / "match_map_stats_2026_06_08.json"),
    )
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(json.dumps(ingest_stats(Path(args.raw_path), Path(args.db_path)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
