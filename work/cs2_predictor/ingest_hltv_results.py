from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, summarize, upsert_team


def timestamp_parts(value: Any) -> tuple[str | None, int | None]:
    if value is None:
        return None, None
    timestamp_ms = int(value)
    dt = datetime.fromtimestamp(timestamp_ms / 1000, tz=UTC)
    return dt.date().isoformat(), int(timestamp_ms / 1000)


def flatten_results(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for chunk in rows:
        if chunk.get("status") != "ok":
            continue
        for result in chunk.get("data") or []:
            item = dict(result)
            item["range_start"] = chunk.get("range_start")
            item["range_end"] = chunk.get("range_end")
            item["fetched_at_utc"] = chunk.get("fetched_at_utc")
            output.append(item)
    return output


def ingest_result(connection, row: dict[str, Any]) -> bool:
    match_id = int(row["id"])
    team1 = row.get("team1") or {}
    team2 = row.get("team2") or {}
    result = row.get("result") or {}
    team1_name = team1.get("name")
    team2_name = team2.get("name")
    if not team1_name or not team2_name:
        return False
    team1_key = upsert_team(connection, team1_name, "hltv_getResults")
    team2_key = upsert_team(connection, team2_name, "hltv_getResults")
    team1_score = result.get("team1")
    team2_score = result.get("team2")
    winner_team_key = None
    if team1_score is not None and team2_score is not None:
        winner_team_key = team1_key if int(team1_score) > int(team2_score) else team2_key
    match_date, match_timestamp = timestamp_parts(row.get("date"))
    raw_json = json.dumps(row, ensure_ascii=False, sort_keys=True)
    existing = connection.execute(
        "SELECT match_id FROM hltv_result_matches WHERE match_id = ?",
        (match_id,),
    ).fetchone()
    if existing:
        connection.execute(
            """
            UPDATE hltv_result_matches
            SET
                match_url = COALESCE(match_url, ?),
                match_date = COALESCE(match_date, ?),
                match_timestamp = COALESCE(match_timestamp, ?),
                team1_key = COALESCE(team1_key, ?),
                team1_name = COALESCE(team1_name, ?),
                team2_key = COALESCE(team2_key, ?),
                team2_name = COALESCE(team2_name, ?),
                team1_score = COALESCE(team1_score, ?),
                team2_score = COALESCE(team2_score, ?),
                winner_team_key = COALESCE(winner_team_key, ?),
                format = COALESCE(format, ?),
                stars = COALESCE(stars, ?),
                raw_json = COALESCE(raw_json, ?)
            WHERE match_id = ?
            """,
            (
                f"https://www.hltv.org/matches/{match_id}/details",
                match_date,
                match_timestamp,
                team1_key,
                team1_name,
                team2_key,
                team2_name,
                team1_score,
                team2_score,
                winner_team_key,
                row.get("format"),
                row.get("stars"),
                raw_json,
                match_id,
            ),
        )
    else:
        connection.execute(
            """
            INSERT INTO hltv_result_matches(
                match_id, match_url, match_date, match_timestamp,
                team1_key, team1_name, team2_key, team2_name,
                team1_score, team2_score, winner_team_key,
                format, stars, source, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                f"https://www.hltv.org/matches/{match_id}/details",
                match_date,
                match_timestamp,
                team1_key,
                team1_name,
                team2_key,
                team2_name,
                team1_score,
                team2_score,
                winner_team_key,
                row.get("format"),
                row.get("stars"),
                "hltv_getResults",
                raw_json,
            ),
        )
    return True


def ingest_results(raw_path: Path, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    rows = json.loads(raw_path.read_text(encoding="utf-8"))
    flat_rows = flatten_results(rows)
    connection = connect(db_path)
    loaded = 0
    for row in flat_rows:
        loaded += int(ingest_result(connection, row))
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "chunks_seen": len(rows),
        "result_rows_seen": len(flat_rows),
        "loaded": loaded,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest HLTV getResults raw chunks into SQLite.")
    parser.add_argument(
        "--raw-path",
        default=str(RAW_ROOT / "hltv" / "results_2025_06_08_to_2026_06_08.json"),
    )
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(json.dumps(ingest_results(Path(args.raw_path), Path(args.db_path)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
