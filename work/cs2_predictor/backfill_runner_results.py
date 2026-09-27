"""Advance one overlap-checked HLTV result page while the runner fallback is live.

The Oracle archive remains the primary backfill. This only uses the already
running GitHub Actions FlareSolverr when Oracle is unhealthy. Raw observations
stay in the private data repository and unclassified tiers never enter training.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .collect_hltv_flaresolverr_results_pages import collect_pages


DEFAULT_ARCHIVE = Path("models/observed-hltv-results.jsonl")
DEFAULT_STATE = Path("models/hltv-runner-backfill-state.json")
FLOOR = "2024-12-28"


def observed_result(row: dict[str, Any]) -> dict[str, Any]:
    match_id = int(row["match_id"])
    timestamp = int(row["match_timestamp"])
    score1, score2 = int(row["team1_score"]), int(row["team2_score"])
    team1, team2 = str(row["team1_name"]).strip(), str(row["team2_name"]).strip()
    event = str(row["event_name"]).strip()
    source_url = str(row["match_url"])
    if match_id <= 0 or timestamp <= 0 or min(score1, score2) < 0 or score1 == score2 or not all((team1, team2, event)) or not source_url.startswith(f"https://www.hltv.org/matches/{match_id}/"):
        raise ValueError(f"Unusable HLTV result card: {match_id} timestamp={timestamp} score={score1}:{score2} teams_present={bool(team1 and team2)} event_present={bool(event)} source_url_valid={source_url.startswith(f'https://www.hltv.org/matches/{match_id}/')}")
    starts_at = datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    event_slug = re.sub(r"[^a-z0-9]+", "-", event.casefold()).strip("-")
    series_format = str(row.get("format") or "").casefold()
    return {
        "match_id": f"hltv:{match_id}",
        "hltv_match_id": str(match_id),
        "source_url": source_url,
        "event_id": f"hltv:{event_slug}",
        "event_name": event,
        "product_tier": "pending",
        "team1_name": team1,
        "team2_name": team2,
        "starts_at": starts_at,
        "status": "finished",
        "score1": score1,
        "score2": score2,
        "winner_name": team1 if score1 > score2 else team2,
        "series_format": series_format if series_format in {"bo1", "bo3", "bo5"} else "unknown",
    }


def import_page(payload: dict[str, Any], archive_path: Path, state_path: Path, offset: int) -> dict[str, Any]:
    pages = payload.get("page_results") or []
    rows = payload.get("rows") or []
    if payload.get("status") != "ok" or len(pages) != 1 or pages[0].get("offset") != offset or pages[0].get("rows_parsed") != 100 or len(rows) != 100:
        raise ValueError(f"Incomplete HLTV results page at offset {offset}; cursor unchanged")
    incoming = [observed_result(row) for row in rows]
    if len({row["match_id"] for row in incoming}) != 100:
        raise ValueError(f"Duplicate HLTV result card at offset {offset}; cursor unchanged")
    existing: dict[str, dict[str, Any]] = {}
    if archive_path.exists():
        for line in archive_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                existing[row["match_id"]] = row
    overlap = len(set(existing).intersection(row["match_id"] for row in incoming))
    if existing and overlap == 0:
        raise ValueError(f"No overlap with the verified archive at offset {offset}; cursor unchanged")
    added = 0
    for row in incoming:
        if row["match_id"] not in existing:
            existing[row["match_id"]] = row
            added += 1
    oldest = min(row["starts_at"] for row in incoming)
    complete = oldest[:10] <= FLOOR
    state = {"next_offset": offset + 50, "pages_collected": 1, "last_page_offset": offset, "last_page_oldest_utc": oldest, "last_page_overlap": overlap, "complete": complete}
    if state_path.exists():
        previous = json.loads(state_path.read_text(encoding="utf-8"))
        state["pages_collected"] = int(previous.get("pages_collected", 0)) + 1
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    archive_temp = archive_path.with_name(archive_path.name + ".tmp")
    archive_temp.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in sorted(existing.values(), key=lambda row: (row["starts_at"], row["match_id"]))), encoding="utf-8")
    archive_temp.replace(archive_path)
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return {"offset": offset, "added": added, "total": len(existing), "overlap": overlap, "oldest": oldest, "complete": complete}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flaresolverr-url", default="http://127.0.0.1:8191/v1")
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    args = parser.parse_args()
    state = json.loads(args.state.read_text(encoding="utf-8")) if args.state.exists() else {}
    if state.get("complete"):
        print(json.dumps({"complete": True, "total": sum(1 for line in args.archive.read_text(encoding="utf-8").splitlines() if line.strip())}))
        return
    offset = int(state.get("next_offset", 2700))
    if offset < 0 or offset % 50:
        raise ValueError("Invalid HLTV runner backfill offset")
    payload = collect_pages(args.flaresolverr_url, offset, 1, 50, 0, 120, 90000)
    print(json.dumps(import_page(payload, args.archive, args.state, offset), sort_keys=True))


if __name__ == "__main__":
    main()
