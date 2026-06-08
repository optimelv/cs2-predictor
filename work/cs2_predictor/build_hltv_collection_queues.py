from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect


def write_json(path: Path, rows: list[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2, sort_keys=True), encoding="utf-8")
    return len(rows)


def build_detail_queue(connection, *, limit: int | None) -> list[dict[str, Any]]:
    query = """
        SELECT
            match_id,
            match_date,
            event_name,
            team1_name,
            team2_name,
            source,
            hltv_fetched_at_utc
        FROM hltv_result_matches
        WHERE match_id IS NOT NULL
          AND (hltv_fetched_at_utc IS NULL OR hltv_fetched_at_utc = '')
        ORDER BY match_timestamp DESC, match_id DESC
    """
    rows = [dict(row) for row in connection.execute(query).fetchall()]
    return rows[:limit] if limit else rows


def build_map_stats_queue(connection, *, limit: int | None) -> list[dict[str, Any]]:
    query = """
        SELECT
            mm.stats_id,
            mm.match_id,
            mm.map_index,
            mm.map_name,
            r.match_date,
            r.event_name,
            r.team1_name,
            r.team2_name
        FROM hltv_match_maps mm
        JOIN hltv_result_matches r ON r.match_id = mm.match_id
        LEFT JOIN hltv_match_player_stats ps ON ps.stats_id = mm.stats_id
        WHERE mm.stats_id IS NOT NULL
          AND ps.stats_id IS NULL
        GROUP BY mm.stats_id
        ORDER BY r.match_timestamp DESC, mm.match_id DESC, mm.map_index
    """
    rows = [dict(row) for row in connection.execute(query).fetchall()]
    return rows[:limit] if limit else rows


def build_player_stats_queue(connection, *, limit: int | None) -> list[dict[str, Any]]:
    query = """
        SELECT
            q.hltv_player_id,
            q.player_name,
            q.player_href,
            q.discovered_from,
            q.priority_rank,
            q.status
        FROM hltv_player_queue q
        LEFT JOIN hltv_player_stats_windows w
          ON w.hltv_player_id = q.hltv_player_id
        WHERE q.hltv_player_id IS NOT NULL
          AND w.hltv_player_id IS NULL
        GROUP BY q.hltv_player_id
        ORDER BY COALESCE(q.priority_rank, 9999), q.hltv_player_id
    """
    rows = [dict(row) for row in connection.execute(query).fetchall()]
    return rows[:limit] if limit else rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Build resumable queue files for HLTV collectors.")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--detail-queue-path", default=str(RAW_ROOT / "hltv" / "match_detail_queue_expanded.json"))
    parser.add_argument("--map-stats-queue-path", default=str(RAW_ROOT / "hltv" / "map_stats_queue.json"))
    parser.add_argument("--player-stats-queue-path", default=str(RAW_ROOT / "hltv" / "player_stats_queue.json"))
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    connection = connect(Path(args.db_path))
    detail_rows = build_detail_queue(connection, limit=args.limit)
    map_stats_rows = build_map_stats_queue(connection, limit=args.limit)
    player_stats_rows = build_player_stats_queue(connection, limit=args.limit)
    payload = {
        "detail_queue_rows": write_json(Path(args.detail_queue_path), detail_rows),
        "map_stats_queue_rows": write_json(Path(args.map_stats_queue_path), map_stats_rows),
        "player_stats_queue_rows": write_json(Path(args.player_stats_queue_path), player_stats_rows),
        "detail_queue_path": args.detail_queue_path,
        "map_stats_queue_path": args.map_stats_queue_path,
        "player_stats_queue_path": args.player_stats_queue_path,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
