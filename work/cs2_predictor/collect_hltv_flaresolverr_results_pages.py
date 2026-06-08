from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, datetime, timezone
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


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def build_payload(
    flaresolverr_url: str,
    start_offset: int,
    pages: int,
    step: int,
    page_results: list[dict[str, Any]],
    rows_by_match_id: dict[int, dict[str, Any]],
    status: str,
    stopped_reason: str | None,
) -> dict[str, Any]:
    return {
        "source": "FlareSolverr:hltv-results-pages",
        "status": status,
        "fetched_at_utc": utc_now(),
        "flaresolverr_url": flaresolverr_url,
        "start_offset": start_offset,
        "pages": pages,
        "step": step,
        "page_results": page_results,
        "rows": sorted(
            rows_by_match_id.values(),
            key=lambda row: (row.get("match_timestamp") or 0, row.get("match_id") or 0),
            reverse=True,
        ),
        "row_count": len(rows_by_match_id),
        "stopped_reason": stopped_reason,
    }


def collect_pages(
    flaresolverr_url: str,
    start_offset: int,
    pages: int,
    step: int,
    delay_seconds: float,
    timeout_seconds: int,
    max_timeout_ms: int,
    until_date: str | None = None,
    progress_path: Path | None = None,
) -> dict[str, Any]:
    page_results: list[dict[str, Any]] = []
    rows_by_match_id: dict[int, dict[str, Any]] = {}
    cutoff_date = parse_iso_date(until_date)
    stopped_reason = None
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
        parsed_dates = [parse_iso_date(row.get("match_date")) for row in parsed_rows]
        parsed_dates = [value for value in parsed_dates if value is not None]
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
                "min_match_date": min(parsed_dates).isoformat() if parsed_dates else None,
                "max_match_date": max(parsed_dates).isoformat() if parsed_dates else None,
            }
        )
        if progress_path:
            progress_payload = build_payload(
                flaresolverr_url=flaresolverr_url,
                start_offset=start_offset,
                pages=pages,
                step=step,
                page_results=page_results,
                rows_by_match_id=rows_by_match_id,
                status="partial",
                stopped_reason=stopped_reason,
            )
            progress_path.parent.mkdir(parents=True, exist_ok=True)
            progress_path.write_text(json.dumps(progress_payload, indent=2, sort_keys=True), encoding="utf-8")
        if cutoff_date and parsed_dates and min(parsed_dates) <= cutoff_date:
            stopped_reason = f"Reached until_date {cutoff_date.isoformat()} at offset {offset}"
            break
        if page_index < pages - 1 and delay_seconds > 0:
            time.sleep(delay_seconds)
    status_value = "ok" if page_results and all(page.get("status") == "ok" for page in page_results) else "partial"
    return build_payload(
        flaresolverr_url=flaresolverr_url,
        start_offset=start_offset,
        pages=pages,
        step=step,
        page_results=page_results,
        rows_by_match_id=rows_by_match_id,
        status=status_value,
        stopped_reason=stopped_reason,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect paginated HLTV result rows through FlareSolverr.")
    parser.add_argument("--flaresolverr-url", default=os.environ.get("FLARESOLVERR_URL", DEFAULT_FLARESOLVERR_URL))
    parser.add_argument("--start-offset", type=int, default=0)
    parser.add_argument("--pages", type=int, default=1)
    parser.add_argument("--step", type=int, default=100)
    parser.add_argument("--delay-seconds", type=float, default=8.0)
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--max-timeout-ms", type=int, default=90000)
    parser.add_argument("--until-date", help="Stop after collecting a page whose oldest parsed match date is on/before YYYY-MM-DD.")
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
        until_date=args.until_date,
        progress_path=output_path,
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
