from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect


HIGH_PROFILE_EVENT_PATTERNS = (
    "Major",
    "IEM",
    "BLAST",
    "PGL",
    "ESL Pro League",
    "Esports World Cup",
    "StarLadder",
    "FISSURE",
    "CS Asia Championships",
)


def event_priority_expression() -> str:
    clauses = " OR ".join([f"event_name LIKE '%{pattern}%'" for pattern in HIGH_PROFILE_EVENT_PATTERNS])
    return f"CASE WHEN ({clauses}) THEN 1 ELSE 0 END"


def build_queue(
    db_path: Path,
    out_path: Path,
    start_date: str,
    limit: int,
    high_profile_only: bool,
) -> dict[str, Any]:
    connection = connect(db_path)
    priority_expr = event_priority_expression()
    high_profile_filter = f"AND {priority_expr} = 1" if high_profile_only else ""
    rows = connection.execute(
        f"""
        SELECT
            m.match_id,
            m.match_url,
            m.match_date,
            m.event_name,
            m.team1_name,
            m.team2_name,
            COALESCE(m.stars, 0) AS stars,
            {priority_expr} AS high_profile_event
        FROM hltv_result_matches m
        WHERE m.match_date >= ?
          AND NOT EXISTS (
              SELECT 1 FROM hltv_match_maps mm WHERE mm.match_id = m.match_id
          )
          {high_profile_filter}
        ORDER BY
            high_profile_event DESC,
            COALESCE(m.stars, 0) DESC,
            m.match_date DESC,
            m.match_id DESC
        LIMIT ?
        """,
        (start_date, limit),
    ).fetchall()
    payload = {
        "source": "hltv_detail_queue",
        "start_date": start_date,
        "limit": limit,
        "high_profile_only": high_profile_only,
        "rows": [dict(row) for row in rows],
        "count": len(rows),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return {"out": str(out_path), "count": len(rows), "sample": payload["rows"][:10]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a prioritized queue for HLTV match-detail crawling.")
    parser.add_argument("--db-path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--out", default=str(RAW_ROOT / "hltv" / "flaresolverr_match_detail_queue.json"))
    parser.add_argument("--start-date", default="2025-06-01")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--all-events", action="store_true", help="Include non-high-profile events too.")
    args = parser.parse_args()
    result = build_queue(
        db_path=Path(args.db_path),
        out_path=Path(args.out),
        start_date=args.start_date,
        limit=args.limit,
        high_profile_only=not args.all_events,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
