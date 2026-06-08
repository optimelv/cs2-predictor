from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, parse_int, summarize, upsert_team


def parse_sockspls_date(value: str | None) -> tuple[str | None, int | None]:
    if not value:
        return None, None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            return dt.date().isoformat(), int(dt.timestamp())
        except ValueError:
            continue
    return value, None


def ingest_row(connection, row: dict[str, Any]) -> bool:
    match_id = parse_int(row.get("match-id"))
    if match_id is None:
        return False
    team1_name = row.get("team1")
    team2_name = row.get("team2")
    if not team1_name or not team2_name:
        return False
    team1_key = upsert_team(connection, team1_name, "hltv_sockspls")
    team2_key = upsert_team(connection, team2_name, "hltv_sockspls")
    team1_score = parse_int(row.get("team1score"))
    team2_score = parse_int(row.get("team2score"))
    winner_team_key = None
    if team1_score is not None and team2_score is not None and team1_score != team2_score:
        winner_team_key = team1_key if team1_score > team2_score else team2_key
    match_date, match_timestamp = parse_sockspls_date(str(row.get("date") or ""))
    match_url = row.get("url") or f"https://hltv.org/matches/{match_id}/details"
    if match_url.startswith("https://hltv.org"):
        match_url = match_url.replace("https://hltv.org", "https://www.hltv.org", 1)
    raw_json = json.dumps(row, ensure_ascii=False, sort_keys=True)
    existing = connection.execute("SELECT match_id FROM hltv_result_matches WHERE match_id = ?", (match_id,)).fetchone()
    if existing:
        connection.execute(
            """
            UPDATE hltv_result_matches
            SET
                match_url = COALESCE(match_url, ?),
                match_date = COALESCE(match_date, ?),
                match_timestamp = COALESCE(match_timestamp, ?),
                event_name = COALESCE(event_name, ?),
                team1_key = COALESCE(team1_key, ?),
                team1_name = COALESCE(team1_name, ?),
                team1_id = COALESCE(team1_id, ?),
                team2_key = COALESCE(team2_key, ?),
                team2_name = COALESCE(team2_name, ?),
                team2_id = COALESCE(team2_id, ?),
                team1_score = COALESCE(team1_score, ?),
                team2_score = COALESCE(team2_score, ?),
                winner_team_key = COALESCE(winner_team_key, ?),
                source = CASE
                    WHEN source IS NULL OR source = '' THEN 'hltv_sockspls_get_results'
                    ELSE source
                END,
                raw_json = COALESCE(raw_json, ?)
            WHERE match_id = ?
            """,
            (
                match_url,
                match_date,
                match_timestamp,
                row.get("event"),
                team1_key,
                team1_name,
                parse_int(row.get("team1-id")),
                team2_key,
                team2_name,
                parse_int(row.get("team2-id")),
                team1_score,
                team2_score,
                winner_team_key,
                raw_json,
                match_id,
            ),
        )
    else:
        connection.execute(
            """
            INSERT INTO hltv_result_matches(
                match_id, match_url, match_date, match_timestamp, event_name,
                team1_key, team1_name, team1_id,
                team2_key, team2_name, team2_id,
                team1_score, team2_score, winner_team_key,
                source, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                match_id,
                match_url,
                match_date,
                match_timestamp,
                row.get("event"),
                team1_key,
                team1_name,
                parse_int(row.get("team1-id")),
                team2_key,
                team2_name,
                parse_int(row.get("team2-id")),
                team1_score,
                team2_score,
                winner_team_key,
                "hltv_sockspls_get_results",
                raw_json,
            ),
        )
    return True


def ingest_results(raw_path: Path, db_path: Path = WAREHOUSE_PATH) -> dict[str, Any]:
    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    rows = payload.get("rows") or []
    connection = connect(db_path)
    loaded = sum(int(ingest_row(connection, row)) for row in rows)
    connection.commit()
    return {
        "raw_path": str(raw_path),
        "source_status": payload.get("status"),
        "rows_seen": len(rows),
        "loaded": loaded,
        "summary": summarize(connection),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest SocksPls latest HLTV results into SQLite.")
    parser.add_argument("--raw-path", default=str(RAW_ROOT / "hltv" / "sockspls_results_latest.json"))
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(json.dumps(ingest_results(Path(args.raw_path), Path(args.db_path)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
