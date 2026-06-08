from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from .collectors import ValveCollector, ValveStandingFile
from .http import RateLimitedHttpClient
from .paths import BRONZE_ROOT, source_raw_root
from .storage import write_csv
from .warehouse import connect, load_valve_match_factors, summarize


USER_AGENT = "CodexCS2Predictor/0.1 (valve detail collection)"


def _read_rankings(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def collect_current_global_details(top_n: int = 200) -> dict[str, object]:
    ranking_rows = _read_rankings(BRONZE_ROOT / "valve_rankings.csv")
    latest_date = max(row["ranking_date"] for row in ranking_rows if row["region"] == "global")
    latest_rows = [
        row
        for row in ranking_rows
        if row["region"] == "global"
        and row["ranking_date"] == latest_date
        and int(row["rank"]) <= top_n
    ]
    latest_rows.sort(key=lambda row: int(row["rank"]))

    ranking_date = datetime.strptime(latest_date, "%Y-%m-%d").date()
    standing_file = ValveStandingFile(
        path=f"live/{ranking_date.year}/standings_global_{latest_date.replace('-', '_')}.md",
        download_url="",
        region="global",
        ranking_date=ranking_date,
    )

    client = RateLimitedHttpClient(USER_AGENT)
    valve = ValveCollector(client)
    raw_root = source_raw_root("valve")
    detail_rows: List[Dict[str, object]] = []
    fetched = 0

    for ranking_row in latest_rows:
        details_relative_path = ranking_row.get("details_relative_path", "")
        if not details_relative_path:
            continue
        markdown_text = valve.fetch_detail_markdown(standing_file, details_relative_path, raw_root)
        fetched += 1
        detail_rows.extend(
            valve.parse_detail_markdown(
                markdown_text,
                ranking_date=ranking_date,
                team_name=ranking_row["team_name"],
            )
        )

    write_csv(BRONZE_ROOT / "valve_roster_match_factors.csv", detail_rows)

    connection = connect()
    loaded_rows = load_valve_match_factors(connection)
    connection.commit()
    summary = summarize(connection)
    connection.close()

    return {
        "latest_global_ranking_date": latest_date,
        "top_n_requested": top_n,
        "detail_pages_fetched": fetched,
        "detail_rows_written": len(detail_rows),
        "detail_rows_loaded": loaded_rows,
        "warehouse": summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Valve roster detail pages for the current global top N.")
    parser.add_argument("--top-n", type=int, default=200)
    args = parser.parse_args()
    print(json.dumps(collect_current_global_details(top_n=args.top_n), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
