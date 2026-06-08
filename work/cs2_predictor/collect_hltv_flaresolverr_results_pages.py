from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .collect_hltv_flaresolverr import DEFAULT_FLARESOLVERR_URL, collect
from .ingest_hltv_flaresolverr_results import parse_result_blocks
from .paths import RAW_ROOT


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def result_url(offset: int) -> str:
    if offset <= 0:
        return "https://www.hltv.org/results"
    return f"https://www.hltv.org/results?offset={offset}"


def compact_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key != "raw_html"}


def collect_pages(
    flaresolverr_url: str,
    start_offset: int,
    pages: int,
    step: int,
    delay_seconds: float,
    timeout_seconds: int,
    max_timeout_ms: int,
) -> dict[str, Any]:
    page_results: list[dict[str, Any]] = []
    rows_by_match_id: dict[int, dict[str, Any]] = {}
    for page_index in range(pages):
        offset = start_offset + page_index * step
        url = result_url(offset)
        payload = collect(
            flaresolverr_url=flaresolverr_url,
            hltv_url=url,
            timeout_seconds=timeout_seconds,
            max_timeout_ms=max_timeout_ms,
        )
        status = payload.get("status")
        parsed_rows = parse_result_blocks(payload.get("html") or "") if status == "ok" else []
        for row in parsed_rows:
            match_id = row.get("match_id")
            if match_id is not None:
                rows_by_match_id[int(match_id)] = compact_row(row)
        page_results.append(
            {
                "offset": offset,
                "url": url,
                "status": status,
                "html_length": payload.get("html_length"),
                "rows_parsed": len(parsed_rows),
                "error": payload.get("error"),
                "message": payload.get("message"),
            }
        )
        if page_index < pages - 1 and delay_seconds > 0:
            time.sleep(delay_seconds)
    return {
        "source": "FlareSolverr:hltv-results-pages",
        "status": "ok" if all(page.get("status") == "ok" for page in page_results) else "partial",
        "fetched_at_utc": utc_now(),
        "flaresolverr_url": flaresolverr_url,
        "start_offset": start_offset,
        "pages": pages,
        "step": step,
        "page_results": page_results,
        "rows": sorted(rows_by_match_id.values(), key=lambda row: (row.get("match_timestamp") or 0, row.get("match_id") or 0), reverse=True),
        "row_count": len(rows_by_match_id),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect paginated HLTV result rows through FlareSolverr.")
    parser.add_argument("--flaresolverr-url", default=os.environ.get("FLARESOLVERR_URL", DEFAULT_FLARESOLVERR_URL))
    parser.add_argument("--start-offset", type=int, default=0)
    parser.add_argument("--pages", type=int, default=1)
    parser.add_argument("--step", type=int, default=100)
    parser.add_argument("--delay-seconds", type=float, default=8.0)
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--max-timeout-ms", type=int, default=90000)
    parser.add_argument("--out", default=str(RAW_ROOT / "hltv" / "flaresolverr_results_pages.json"))
    args = parser.parse_args()

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = collect_pages(
        flaresolverr_url=args.flaresolverr_url,
        start_offset=args.start_offset,
        pages=args.pages,
        step=args.step,
        delay_seconds=args.delay_seconds,
        timeout_seconds=args.timeout_seconds,
        max_timeout_ms=args.max_timeout_ms,
    )
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(
        json.dumps(
            {
                "status": payload.get("status"),
                "row_count": payload.get("row_count"),
                "page_results": payload.get("page_results"),
                "out": str(output_path),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
