from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Dict, List

from .collectors import LiquipediaCollector, ValveCollector
from .http import RateLimitedHttpClient
from .paths import BRONZE_ROOT, MANIFEST_PATH, RAW_ROOT, source_raw_root
from .storage import ensure_data_layout, merge_manifest, write_csv, write_json


USER_AGENT = "CodexCS2Predictor/0.1 (research workflow; local collection)"


@dataclass(frozen=True)
class CollectionSummary:
    valve_rankings_rows: int
    valve_detail_rows: int
    liquipedia_match_rows: int
    liquipedia_roster_rows: int
    latest_global_ranking_date: str
    liquipedia_teams_attempted: int
    liquipedia_teams_resolved: int


def run_collection(start_year: int, end_year: int, valve_top_n: int, liquipedia_team_limit: int) -> CollectionSummary:
    ensure_data_layout()

    client = RateLimitedHttpClient(USER_AGENT)
    valve = ValveCollector(client)
    liquipedia = LiquipediaCollector(client)

    valve_raw_root = source_raw_root("valve")
    liquipedia_raw_root = source_raw_root("liquipedia")

    standing_files = valve.list_standing_files(range(start_year, end_year + 1))
    valve_ranking_rows: List[Dict[str, object]] = []
    for standing_file in standing_files:
        markdown_text = valve.fetch_standing_markdown(standing_file, valve_raw_root)
        valve_ranking_rows.extend(valve.parse_standing_markdown(markdown_text, standing_file))

    write_csv(BRONZE_ROOT / "valve_rankings.csv", valve_ranking_rows)

    latest_global_rows = [
        row for row in valve_ranking_rows if row["region"] == "global"
    ]
    latest_global_rows.sort(key=lambda row: (row["ranking_date"], -int(row["points"])))
    latest_global_date = latest_global_rows[-1]["ranking_date"] if latest_global_rows else ""
    latest_global_top = [
        row
        for row in latest_global_rows
        if row["ranking_date"] == latest_global_date and int(row["rank"]) <= valve_top_n
    ]
    latest_global_top.sort(key=lambda row: int(row["rank"]))

    valve_detail_rows: List[Dict[str, object]] = []
    for ranking_row in latest_global_top:
        details_relative_path = str(ranking_row.get("details_relative_path", ""))
        if not details_relative_path:
            continue

        detail_markdown = valve.fetch_detail_markdown(
            next(item for item in standing_files if item.ranking_date.isoformat() == ranking_row["ranking_date"] and item.region == "global"),
            details_relative_path,
            valve_raw_root,
        )
        valve_detail_rows.extend(
            valve.parse_detail_markdown(
                detail_markdown,
                ranking_date=datetime.strptime(str(ranking_row["ranking_date"]), "%Y-%m-%d").date(),
                team_name=str(ranking_row["team_name"]),
            )
        )
    write_csv(BRONZE_ROOT / "valve_roster_match_factors.csv", valve_detail_rows)

    liquipedia_match_rows: List[Dict[str, object]] = []
    liquipedia_roster_rows: List[Dict[str, object]] = []
    teams_attempted = 0
    teams_resolved = 0

    for ranking_row in latest_global_top[:liquipedia_team_limit]:
        team_name = str(ranking_row["team_name"])
        teams_attempted += 1
        page_title = liquipedia.find_team_title(team_name)
        if not page_title:
            continue
        teams_resolved += 1

        match_page = liquipedia.fetch_parsed_page(f"{page_title}/Matches", liquipedia_raw_root)
        liquipedia_match_rows.extend(liquipedia.parse_team_matches(match_page, team_name))

        overview_page = liquipedia.fetch_parsed_page(page_title, liquipedia_raw_root)
        liquipedia_roster_rows.extend(liquipedia.parse_team_roster(overview_page, team_name))

    write_csv(BRONZE_ROOT / "liquipedia_team_matches.csv", liquipedia_match_rows)
    write_csv(BRONZE_ROOT / "liquipedia_team_rosters.csv", liquipedia_roster_rows)

    summary = CollectionSummary(
        valve_rankings_rows=len(valve_ranking_rows),
        valve_detail_rows=len(valve_detail_rows),
        liquipedia_match_rows=len(liquipedia_match_rows),
        liquipedia_roster_rows=len(liquipedia_roster_rows),
        latest_global_ranking_date=str(latest_global_date),
        liquipedia_teams_attempted=teams_attempted,
        liquipedia_teams_resolved=teams_resolved,
    )

    write_json(BRONZE_ROOT / "collection_summary.json", asdict(summary))
    merge_manifest(
        MANIFEST_PATH,
        {
            "last_run_utc": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "latest_global_ranking_date": latest_global_date,
            "liquipedia_team_limit": liquipedia_team_limit,
            "valve_top_n": valve_top_n,
        },
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect the first live CS2 predictor backbone dataset.")
    parser.add_argument("--start-year", type=int, default=2025)
    parser.add_argument("--end-year", type=int, default=2026)
    parser.add_argument("--valve-top-n", type=int, default=8)
    parser.add_argument("--liquipedia-team-limit", type=int, default=2)
    args = parser.parse_args()

    summary = run_collection(
        start_year=args.start_year,
        end_year=args.end_year,
        valve_top_n=args.valve_top_n,
        liquipedia_team_limit=args.liquipedia_team_limit,
    )
    print(asdict(summary))


if __name__ == "__main__":
    main()
