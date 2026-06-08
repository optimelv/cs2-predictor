from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from .paths import BRONZE_ROOT, RAW_ROOT
from .warehouse import connect, load_hltv_team_rankings, summarize


def write_hltv_ranking_csv(raw_path: Path, bronze_path: Path) -> int:
    rows = json.loads(raw_path.read_text(encoding="utf-8"))
    bronze_path.parent.mkdir(parents=True, exist_ok=True)
    csv_rows = []
    for row in rows:
        csv_rows.append(
            {
                "page_date_text": row["page_date_text"],
                "rank": row["rank"],
                "team_name": row["team_name"],
                "points_text": row["points_text"],
                "rank_change_text": row["rank_change_text"],
                "team_href": row["team_href"],
                "details_href": row["details_href"],
                "player_names": ", ".join(player["name"] for player in row["players"]),
                "player_hrefs": ", ".join(player["href"] for player in row["players"]),
            }
        )
    with bronze_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(csv_rows[0].keys()))
        writer.writeheader()
        writer.writerows(csv_rows)
    return len(csv_rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest an HLTV ranking snapshot JSON into bronze CSV and SQLite.")
    parser.add_argument(
        "--raw-path",
        default=str(RAW_ROOT / "hltv" / "ranking_2026_06_01_top200.json"),
    )
    parser.add_argument(
        "--bronze-path",
        default=str(BRONZE_ROOT / "hltv_team_rankings_2026_06_01_top200.csv"),
    )
    parser.add_argument("--snapshot-date", default="2026-06-01")
    args = parser.parse_args()

    raw_path = Path(args.raw_path)
    bronze_path = Path(args.bronze_path)
    rows_written = write_hltv_ranking_csv(raw_path, bronze_path)
    connection = connect()
    rows_loaded = load_hltv_team_rankings(connection, bronze_path, args.snapshot_date)
    connection.commit()
    payload = {
        "rows_written": rows_written,
        "rows_loaded": rows_loaded,
        "summary": summarize(connection),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
