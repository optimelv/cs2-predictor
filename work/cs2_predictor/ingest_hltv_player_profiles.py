from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Optional

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, parse_float, parse_int, summarize, upsert_player, utc_now


def _score_100(value: object) -> Optional[int]:
    if value is None:
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


def ingest_profiles(raw_path: Path, snapshot_date: str, db_path: Path = WAREHOUSE_PATH) -> dict[str, object]:
    rows = json.loads(raw_path.read_text(encoding="utf-8"))
    connection = connect(db_path)
    loaded = 0
    failed = 0
    for row in rows:
        player_id = parse_int(row.get("hltv_player_id"))
        if player_id is None or not row.get("ok"):
            failed += 1
            continue
        player_name = row.get("nickname") or row.get("player_name") or "unknown"
        player_href = row.get("player_href") or f"/player/{player_id}"
        upsert_player(
            connection,
            player_name,
            source="hltv",
            real_name=row.get("real_name"),
            hltv_player_id=player_id,
        )
        connection.execute(
            """
            INSERT OR REPLACE INTO hltv_player_snapshots(
                hltv_player_id, snapshot_date, player_name, player_href,
                rating_3_0, maps_3m, firepower, entrying, trading,
                opening, clutching, sniping, utility, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                player_id,
                snapshot_date,
                player_name,
                player_href,
                parse_float(row.get("rating_3_0")),
                parse_int(row.get("maps_3m")),
                _score_100(row.get("firepower")),
                _score_100(row.get("entrying")),
                _score_100(row.get("trading")),
                _score_100(row.get("opening")),
                _score_100(row.get("clutching")),
                _score_100(row.get("sniping")),
                _score_100(row.get("utility")),
                json.dumps(row, sort_keys=True),
            ),
        )
        connection.execute(
            """
            UPDATE hltv_player_queue
            SET status = 'fetched', attempts = attempts + 1, last_error = NULL, updated_at_utc = ?
            WHERE hltv_player_id = ?
            """,
            (utc_now(), player_id),
        )
        loaded += 1
    connection.commit()
    payload = {
        "loaded": loaded,
        "failed": failed,
        "summary": summarize(connection),
    }
    connection.close()
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Load browser-extracted HLTV player profiles into SQLite.")
    parser.add_argument(
        "--raw-path",
        default=str(RAW_ROOT / "hltv" / "player_profiles_2026_06_07_top50.json"),
    )
    parser.add_argument("--snapshot-date", default="2026-06-07")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    args = parser.parse_args()
    print(
        json.dumps(
            ingest_profiles(Path(args.raw_path), args.snapshot_date, Path(args.db_path)),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
