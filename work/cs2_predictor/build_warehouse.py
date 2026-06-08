from __future__ import annotations

import argparse
import json
from pathlib import Path

from .ingest_hltv_player_profiles import ingest_profiles
from .ingest_hltv_match_details import ingest_details
from .paths import RAW_ROOT
from .warehouse import WAREHOUSE_PATH, connect, load_all_bronze, summarize


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the local CS2 predictor SQLite warehouse.")
    parser.add_argument("--path", default=str(WAREHOUSE_PATH))
    parser.add_argument("--as-of-date", default=None)
    args = parser.parse_args()

    connection = connect(Path(args.path))
    load_all_bronze(connection, as_of_date=args.as_of_date)
    player_profile_path = RAW_ROOT / "hltv" / "player_profiles_2026_06_07_top50.json"
    if player_profile_path.exists():
        ingest_profiles(player_profile_path, "2026-06-07", Path(args.path))
    match_detail_path = RAW_ROOT / "hltv" / "match_details_2026_06_08.json"
    if match_detail_path.exists():
        ingest_details(match_detail_path, args.as_of_date or "2026-06-08", Path(args.path))
    print(json.dumps(summarize(connection), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
