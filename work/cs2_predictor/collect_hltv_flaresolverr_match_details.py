from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .collect_hltv_flaresolverr import DEFAULT_FLARESOLVERR_URL, collect
from .ingest_hltv_flaresolverr_match_details import parse_match_detail_html
from .paths import RAW_ROOT


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def normalize_match_url(match_id: int, match_url: str | None) -> str:
    if match_url:
        if match_url.startswith("https://www.hltv.org/"):
            return match_url
        if match_url.startswith("https://hltv.org/"):
            return match_url.replace("https://hltv.org/", "https://www.hltv.org/", 1)
    return f"https://www.hltv.org/matches/{match_id}/details"


def load_queue(path: Path) -> list[dict[str, Any]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(rows, dict):
        rows = rows.get("rows") or rows.get("matches") or []
    result = []
    for row in rows:
        if isinstance(row, int):
            result.append({"match_id": row})
        elif isinstance(row, dict) and row.get("match_id"):
            result.append(row)
    return result


def collect_match_details(
    queue_path: Path,
    flaresolverr_url: str,
    delay_seconds: float,
    timeout_seconds: int,
    max_timeout_ms: int,
    limit: int | None,
    out_path: Path | None,
) -> dict[str, Any]:
    queue = load_queue(queue_path)
    if limit:
        queue = queue[:limit]
    details: list[dict[str, Any]] = []
    for index, row in enumerate(queue, start=1):
        match_id = int(row["match_id"])
        match_url = normalize_match_url(match_id, row.get("match_url"))
        payload = collect(
            flaresolverr_url=flaresolverr_url,
            hltv_url=match_url,
            timeout_seconds=timeout_seconds,
            max_timeout_ms=max_timeout_ms,
        )
        if payload.get("status") == "ok":
            try:
                detail = parse_match_detail_html(match_id, match_url, payload.get("html") or "")
                detail["fetched_at_utc"] = utc_now()
                detail["html_length"] = payload.get("html_length")
                detail["message"] = payload.get("message")
            except Exception as exc:
                detail = {
                    "match_id": match_id,
                    "match_url": match_url,
                    "status": "error",
                    "fetched_at_utc": utc_now(),
                    "error": repr(exc),
                }
        else:
            detail = {
                "match_id": match_id,
                "match_url": match_url,
                "status": "error",
                "fetched_at_utc": utc_now(),
                "error": payload.get("error"),
                "message": payload.get("message"),
            }
        details.append(detail)
        if out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(
                json.dumps(
                    {
                        "source": "FlareSolverr:hltv-match-details",
                        "status": "partial",
                        "fetched_at_utc": utc_now(),
                        "flaresolverr_url": flaresolverr_url,
                        "queue_path": str(queue_path),
                        "details": details,
                    },
                    indent=2,
                    sort_keys=True,
                ),
                encoding="utf-8",
            )
        print(
            json.dumps(
                {
                    "done": index,
                    "total": len(queue),
                    "match_id": match_id,
                    "status": detail.get("status"),
                    "maps": len(detail.get("maps") or []),
                    "vetoes": len(detail.get("vetoes") or []),
                    "lineups": len(detail.get("lineups") or []),
                    "player_stats": len(detail.get("player_stats") or []),
                },
                sort_keys=True,
            )
        )
        if index < len(queue) and delay_seconds > 0:
            time.sleep(delay_seconds)
    return {
        "source": "FlareSolverr:hltv-match-details",
        "status": "ok" if all(row.get("status") == "ok" for row in details) else "partial",
        "fetched_at_utc": utc_now(),
        "flaresolverr_url": flaresolverr_url,
        "queue_path": str(queue_path),
        "details": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect parsed HLTV match details through FlareSolverr.")
    parser.add_argument("--queue", required=True)
    parser.add_argument("--flaresolverr-url", default=os.environ.get("FLARESOLVERR_URL", DEFAULT_FLARESOLVERR_URL))
    parser.add_argument("--delay-seconds", type=float, default=5.0)
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--max-timeout-ms", type=int, default=90000)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", default=str(RAW_ROOT / "hltv" / "flaresolverr_match_details.json"))
    args = parser.parse_args()

    output_path = Path(args.out)
    payload = collect_match_details(
        queue_path=Path(args.queue),
        flaresolverr_url=args.flaresolverr_url,
        delay_seconds=args.delay_seconds,
        timeout_seconds=args.timeout_seconds,
        max_timeout_ms=args.max_timeout_ms,
        limit=args.limit,
        out_path=output_path,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    main()
