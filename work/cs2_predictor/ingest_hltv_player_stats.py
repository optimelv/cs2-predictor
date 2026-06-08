from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, parse_float, parse_int, summarize, upsert_player, utc_now


def date_from_fetch(row: dict[str, Any]) -> str:
    fetched = row.get("fetched_at_utc")
    if not fetched:
        return datetime.now(UTC).date().isoformat()
    return datetime.fromisoformat(str(fetched).replace("Z", "+00:00")).date().isoformat()


def ingest_player_stats(raw_path: Path, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    rows = json.loads(raw_path.read_text(encoding="utf-8"))
    connection = connect(db_path)
    loaded = 0
    errors = 0
    for row in rows:
        if row.get("status") != "ok":
            errors += 1
            continue
        data = row.get("data") or {}
        player_id = parse_int(row.get("hltv_player_id") or data.get("id"))
        if player_id is None:
            errors += 1
            continue
        overview = data.get("overviewStatistics") or {}
        individual = data.get("individualStatistics") or {}
        team = data.get("team") or {}
        player_name = data.get("name") or data.get("ign") or f"hltv_{player_id}"
        upsert_player(connection, player_name, source="hltv_player_stats", hltv_player_id=player_id)
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_player_stats_windows(
                hltv_player_id, snapshot_date, start_date, end_date,
                player_name, player_ign, current_team_name, current_team_id,
                maps_played, rounds_played, kills, deaths, headshots, kd_ratio,
                damage_per_round, grenade_damage_per_round, kills_per_round,
                assists_per_round, deaths_per_round, rating_1_0, rating_2_0,
                opening_kills, opening_deaths, opening_kill_ratio, opening_kill_rating,
                team_win_percent_after_first_kill, first_kill_in_won_rounds,
                rifle_kills, sniper_kills, smg_kills, pistol_kills,
                grenade_kills, other_kills, matches_count, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                player_id,
                date_from_fetch(row),
                row.get("start_date") or "",
                row.get("end_date") or "",
                data.get("name"),
                data.get("ign"),
                team.get("name"),
                parse_int(team.get("id")),
                parse_int(overview.get("mapsPlayed")),
                parse_int(overview.get("roundsPlayed")),
                parse_int(overview.get("kills")),
                parse_int(overview.get("deaths")),
                parse_int(overview.get("headshots")),
                parse_float(overview.get("kdRatio")),
                parse_float(overview.get("damagePerRound")),
                parse_float(overview.get("grenadeDamagePerRound")),
                parse_float(overview.get("killsPerRound")),
                parse_float(overview.get("assistsPerRound")),
                parse_float(overview.get("deathsPerRound")),
                parse_float(overview.get("rating1")),
                parse_float(overview.get("rating2")),
                parse_int(individual.get("openingKills")),
                parse_int(individual.get("openingDeaths")),
                parse_float(individual.get("openingKillRatio")),
                parse_float(individual.get("openingKillRating")),
                parse_float(individual.get("teamWinPercentAfterFirstKill")),
                parse_float(individual.get("firstKillInWonRounds")),
                parse_int(individual.get("rifleKills")),
                parse_int(individual.get("sniperKills")),
                parse_int(individual.get("smgKills")),
                parse_int(individual.get("pistolKills")),
                parse_int(individual.get("grenadeKills")),
                parse_int(individual.get("otherKills")),
                len(data.get("matches") or []),
                json.dumps(data, ensure_ascii=False, sort_keys=True),
            ),
        )
        connection.execute(
            """
            UPDATE hltv_player_queue
            SET status = 'fetched_stats', attempts = attempts + 1, last_error = NULL, updated_at_utc = ?
            WHERE hltv_player_id = ?
            """,
            (utc_now(), player_id),
        )
        loaded += 1
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "rows_seen": len(rows),
        "loaded": loaded,
        "errors_seen": errors,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest HLTV player-stat windows into SQLite.")
    parser.add_argument(
        "--raw-path",
        default=str(RAW_ROOT / "hltv" / "player_stats_2026_06_08_3m.json"),
    )
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(json.dumps(ingest_player_stats(Path(args.raw_path), Path(args.db_path)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
