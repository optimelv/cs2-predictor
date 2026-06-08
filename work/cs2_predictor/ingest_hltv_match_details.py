from __future__ import annotations

import argparse
import csv
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .paths import BRONZE_ROOT, RAW_ROOT
from .warehouse import (
    WAREHOUSE_PATH,
    connect,
    rebuild_team_event_stage_results,
    rebuild_team_map_win_rates,
    rebuild_team_phase_performance,
    slugify,
    summarize,
    upsert_player,
    upsert_team,
)


MAP_NAMES = {
    "de_ancient": "Ancient",
    "de_anubis": "Anubis",
    "de_cache": "Cache",
    "de_cbble": "Cobblestone",
    "de_dust2": "Dust2",
    "de_inferno": "Inferno",
    "de_mirage": "Mirage",
    "de_nuke": "Nuke",
    "de_overpass": "Overpass",
    "de_train": "Train",
    "de_tuscan": "Tuscan",
    "de_vertigo": "Vertigo",
    "default": "Default",
    "tba": "TBA",
}


def normalize_map_name(value: str | None) -> str:
    if not value:
        return "TBA"
    text = str(value).strip()
    return MAP_NAMES.get(text.casefold(), text)


def timestamp_parts(value: Any) -> tuple[str | None, int | None]:
    if value is None:
        return None, None
    timestamp_ms = int(value)
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=UTC)
    return dt.date().isoformat(), int(timestamp_ms / 1000)


def team_fields(connection, team: dict[str, Any] | None) -> tuple[str | None, str | None, int | None, int | None]:
    if not team:
        return None, None, None, None
    name = team.get("name")
    team_key = upsert_team(connection, name, "hltv") if name else None
    return team_key, name, team.get("id"), team.get("rank")


def score_from_maps(match: dict[str, Any]) -> tuple[int | None, int | None]:
    team1_wins = 0
    team2_wins = 0
    scored = False
    for map_row in match.get("maps") or []:
        result = map_row.get("result") or {}
        team1_score = result.get("team1TotalRounds")
        team2_score = result.get("team2TotalRounds")
        if team1_score is None or team2_score is None:
            continue
        scored = True
        if team1_score > team2_score:
            team1_wins += 1
        elif team2_score > team1_score:
            team2_wins += 1
    if not scored:
        return None, None
    return team1_wins, team2_wins


def ingest_match_detail(connection, row: dict[str, Any]) -> bool:
    if row.get("status") != "ok":
        return False
    match = row["data"]
    match_id = int(match["id"])
    team1_key, team1_name, team1_id, team1_rank = team_fields(connection, match.get("team1"))
    team2_key, team2_name, team2_id, team2_rank = team_fields(connection, match.get("team2"))
    winner_key, winner_name, winner_id, _winner_rank = team_fields(connection, match.get("winnerTeam"))
    match_date, match_timestamp = timestamp_parts(match.get("date"))
    team1_score, team2_score = score_from_maps(match)
    event = match.get("event") or {}
    format_row = match.get("format") or {}
    raw_json = json.dumps(match, ensure_ascii=False)

    existing = connection.execute(
        "SELECT match_id FROM hltv_result_matches WHERE match_id = ?",
        (match_id,),
    ).fetchone()
    if existing:
        connection.execute(
            """
            UPDATE hltv_result_matches
            SET
                match_date = COALESCE(?, match_date),
                match_timestamp = COALESCE(?, match_timestamp),
                event_name = COALESCE(?, event_name),
                event_id = COALESCE(?, event_id),
                team1_key = COALESCE(?, team1_key),
                team1_name = COALESCE(?, team1_name),
                team1_id = COALESCE(?, team1_id),
                team1_rank = COALESCE(?, team1_rank),
                team2_key = COALESCE(?, team2_key),
                team2_name = COALESCE(?, team2_name),
                team2_id = COALESCE(?, team2_id),
                team2_rank = COALESCE(?, team2_rank),
                team1_score = COALESCE(?, team1_score),
                team2_score = COALESCE(?, team2_score),
                winner_team_key = COALESCE(?, winner_team_key),
                winner_team_id = COALESCE(?, winner_team_id),
                status = COALESCE(?, status),
                format = COALESCE(?, format),
                format_location = COALESCE(?, format_location),
                has_scorebot = COALESCE(?, has_scorebot),
                hltv_fetched_at_utc = COALESCE(?, hltv_fetched_at_utc),
                raw_json = ?
            WHERE match_id = ?
            """,
            (
                match_date,
                match_timestamp,
                event.get("name"),
                event.get("id"),
                team1_key,
                team1_name,
                team1_id,
                team1_rank,
                team2_key,
                team2_name,
                team2_id,
                team2_rank,
                team1_score,
                team2_score,
                winner_key,
                winner_id,
                match.get("status"),
                format_row.get("type"),
                format_row.get("location"),
                1 if match.get("hasScorebot") else 0,
                row.get("fetched_at_utc"),
                raw_json,
                match_id,
            ),
        )
    else:
        connection.execute(
            """
            INSERT INTO hltv_result_matches(
                match_id, match_url, match_date, match_timestamp, event_name, event_id,
                team1_key, team1_name, team1_id, team1_rank,
                team2_key, team2_name, team2_id, team2_rank,
                team1_score, team2_score, winner_team_key, winner_team_id,
                status, format, format_location, has_scorebot, hltv_fetched_at_utc,
                source, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                f"https://www.hltv.org/matches/{match_id}/details",
                match_date,
                match_timestamp,
                event.get("name"),
                event.get("id"),
                team1_key,
                team1_name,
                team1_id,
                team1_rank,
                team2_key,
                team2_name,
                team2_id,
                team2_rank,
                team1_score,
                team2_score,
                winner_key,
                winner_id,
                match.get("status"),
                format_row.get("type"),
                format_row.get("location"),
                1 if match.get("hasScorebot") else 0,
                row.get("fetched_at_utc"),
                "hltv_getMatch",
                raw_json,
            ),
        )

    picked_by_map = {}
    for veto in match.get("vetoes") or []:
        if veto.get("type") == "picked" and veto.get("team"):
            picked_by_map[normalize_map_name(veto.get("map"))] = veto["team"]

    connection.execute("DELETE FROM hltv_match_maps WHERE match_id = ?", (match_id,))
    for map_index, map_row in enumerate(match.get("maps") or [], start=1):
        map_name = normalize_map_name(map_row.get("name"))
        result = map_row.get("result") or {}
        team1_map_score = result.get("team1TotalRounds")
        team2_map_score = result.get("team2TotalRounds")
        winner_team_key = None
        winner_team_name = None
        if team1_map_score is not None and team2_map_score is not None:
            if team1_map_score > team2_map_score:
                winner_team_key = team1_key
                winner_team_name = team1_name
            elif team2_map_score > team1_map_score:
                winner_team_key = team2_key
                winner_team_name = team2_name
        picked_team = picked_by_map.get(map_name)
        picked_team_key = None
        picked_team_name = None
        if picked_team:
            picked_team_key, picked_team_name, _picked_id, _picked_rank = team_fields(connection, picked_team)
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_maps(
                match_id, map_index, map_name, team1_name, team2_name, team1_score,
                team2_score, winner_team_key, winner_team_name, stats_id,
                picked_by_team_key, picked_by_team_name, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                map_index,
                map_name,
                team1_name,
                team2_name,
                team1_map_score,
                team2_map_score,
                winner_team_key,
                winner_team_name,
                map_row.get("statsId"),
                picked_team_key,
                picked_team_name,
                json.dumps(map_row, ensure_ascii=False),
            ),
        )

    connection.execute("DELETE FROM hltv_match_vetoes WHERE match_id = ?", (match_id,))
    for veto_index, veto in enumerate(match.get("vetoes") or [], start=1):
        team = veto.get("team") or {}
        team_key = upsert_team(connection, team["name"], "hltv") if team.get("name") else None
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_match_vetoes(
                match_id, veto_index, team_key, team_name, hltv_team_id, map_name, action, raw_text
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                veto_index,
                team_key,
                team.get("name"),
                team.get("id"),
                normalize_map_name(veto.get("map")),
                veto.get("type") or "",
                json.dumps(veto, ensure_ascii=False),
            ),
        )

    connection.execute("DELETE FROM hltv_match_players WHERE match_id = ?", (match_id,))
    for team_side, team_name, team_id, players in (
        (1, team1_name, team1_id, (match.get("players") or {}).get("team1") or []),
        (2, team2_name, team2_id, (match.get("players") or {}).get("team2") or []),
    ):
        team_key = upsert_team(connection, team_name, "hltv") if team_name else None
        for player in players:
            player_name = player.get("name")
            player_id = player.get("id")
            if not player_name:
                continue
            player_key = upsert_player(
                connection,
                player_name,
                source="hltv_match_detail",
                hltv_player_id=player_id,
            )
            connection.execute(
                """
                INSERT OR REPLACE INTO hltv_match_players(
                    match_id, team_side, team_key, team_name, hltv_team_id,
                    player_key, player_name, hltv_player_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (match_id, team_side, team_key, team_name, team_id, player_key, player_name, player_id),
            )

    return True


def learn_team_aliases_from_details(
    connection,
    detail_rows: list[dict[str, Any]],
    bronze_match_path: Path = BRONZE_ROOT / "hltv_result_matches.csv",
) -> int:
    if not bronze_match_path.exists():
        return 0
    connection.execute("DELETE FROM team_aliases WHERE source = 'hltv_match_detail_alias'")
    with bronze_match_path.open(encoding="utf-8", newline="") as handle:
        bronze_by_id = {
            int(row["match_id"]): row
            for row in csv.DictReader(handle)
            if row.get("match_id") and str(row["match_id"]).lstrip("-").isdigit()
        }
    learned = 0
    for detail_row in detail_rows:
        if detail_row.get("status") != "ok":
            continue
        match_id = int(detail_row["match_id"])
        bronze_row = bronze_by_id.get(match_id)
        if not bronze_row:
            continue
        match = detail_row["data"]
        canonical_teams = [
            team
            for team in (match.get("team1"), match.get("team2"))
            if team and team.get("name")
        ]
        for side in ("1", "2"):
            alias = (bronze_row.get(f"team{side}_name") or "").strip()
            if not alias:
                continue
            candidates = [
                team
                for team in canonical_teams
                if alias_matches_canonical(alias, team["name"])
            ]
            if len(candidates) != 1:
                continue
            canonical_name = candidates[0]["name"]
            canonical_key = upsert_team(connection, canonical_name, "hltv")
            connection.execute(
                """
                INSERT INTO team_aliases(alias, team_key, source)
                VALUES (?, ?, ?)
                ON CONFLICT(alias) DO UPDATE SET
                    team_key = excluded.team_key,
                    source = excluded.source
                """,
                (alias.casefold(), canonical_key, "hltv_match_detail_alias"),
            )
            learned += 1
    return learned


def alias_matches_canonical(alias: str, canonical_name: str) -> bool:
    alias_key = slugify(alias)
    canonical_key = slugify(canonical_name)
    trusted_aliases = {
        "fq": "flyquest",
        "gl": "gamerlegion",
        "mongolz": "the_mongolz",
        "navi": "natus_vincere",
        "tl": "liquid",
        "vit": "vitality",
        "vp": "virtus_pro",
    }
    if alias_key == canonical_key:
        return True
    if trusted_aliases.get(alias_key) == canonical_key:
        return True
    if len(alias_key) >= 4 and (alias_key in canonical_key or canonical_key in alias_key):
        return True
    initials = "".join(part[0] for part in canonical_key.split("_") if part and part != "the")
    return len(alias_key) >= 2 and alias_key == initials


def apply_learned_team_aliases(connection) -> int:
    aliases = connection.execute(
        """
        SELECT a.alias, a.team_key, t.display_name
        FROM team_aliases a
        JOIN teams t ON t.team_key = a.team_key
        WHERE a.source = 'hltv_match_detail_alias'
        """
    ).fetchall()
    updates = 0
    for row in aliases:
        alias = row["alias"]
        canonical_key = row["team_key"]
        canonical_name = row["display_name"]
        alias_key = slugify(alias)
        for side in ("1", "2"):
            updates += connection.execute(
                f"""
                UPDATE hltv_result_matches
                SET team{side}_key = ?, team{side}_name = ?
                WHERE lower(team{side}_name) = ?
                  AND (hltv_fetched_at_utc IS NULL OR team{side}_id IS NULL)
                """,
                (canonical_key, canonical_name, alias),
            ).rowcount
            updates += connection.execute(
                f"""
                UPDATE hltv_match_maps
                SET team{side}_name = ?
                WHERE lower(team{side}_name) = ?
                """,
                (canonical_name, alias),
            ).rowcount
        updates += connection.execute(
            """
            UPDATE hltv_result_matches
            SET winner_team_key = ?
            WHERE winner_team_key = ?
              AND hltv_fetched_at_utc IS NULL
            """,
            (canonical_key, alias_key),
        ).rowcount
        updates += connection.execute(
            """
            UPDATE hltv_match_maps
            SET winner_team_key = ?, winner_team_name = ?
            WHERE lower(winner_team_name) = ? OR winner_team_key = ?
            """,
            (canonical_key, canonical_name, alias, alias_key),
        ).rowcount
        updates += connection.execute(
            """
            UPDATE hltv_match_maps
            SET picked_by_team_key = ?, picked_by_team_name = ?
            WHERE lower(picked_by_team_name) = ? OR picked_by_team_key = ?
            """,
            (canonical_key, canonical_name, alias, alias_key),
        ).rowcount
    return updates


def ingest_details(raw_path: Path, as_of_date: str, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    connection = connect(db_path)
    rows = json.loads(raw_path.read_text(encoding="utf-8"))
    loaded = 0
    errors = 0
    for row in rows:
        if row.get("status") == "ok":
            loaded += int(ingest_match_detail(connection, row))
        else:
            errors += 1
    aliases_learned = learn_team_aliases_from_details(connection, rows)
    alias_updates = apply_learned_team_aliases(connection)
    team_map_rows = rebuild_team_map_win_rates(connection, as_of_date=as_of_date)
    event_stage_rows = rebuild_team_event_stage_results(connection, as_of_date=as_of_date)
    phase_rows = rebuild_team_phase_performance(connection, as_of_date=as_of_date)
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "rows_seen": len(rows),
        "details_loaded": loaded,
        "errors_seen": errors,
        "team_aliases_learned": aliases_learned,
        "team_alias_updates": alias_updates,
        "team_map_win_rates": team_map_rows,
        "team_event_stage_results": event_stage_rows,
        "team_phase_performance": phase_rows,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest HLTV getMatch detail JSON into SQLite.")
    parser.add_argument(
        "--raw-path",
        default=str(RAW_ROOT / "hltv" / "match_details_2026_06_08.json"),
    )
    parser.add_argument("--as-of-date", default="2026-06-08")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(
        json.dumps(
            ingest_details(Path(args.raw_path), args.as_of_date, Path(args.db_path)),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
