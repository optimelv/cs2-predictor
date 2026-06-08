# CS2 HLTV Detail Expansion Status

Date: 2026-06-09

## Result Coverage

- HLTV result matches: 16,495
- Match-date range: 2024-12-28 to 2026-06-08
- Target 2025-01-01 onward window is covered; the final HLTV page also included 14 rows from December 2024.
- One-year FlareSolverr results crawl: 11,999 compact result rows
- Additional January 2025 backfill crawl: 4,300 compact result rows
- Teams known after crawl: 1,292

## Detail Coverage

- Matches with map rows: 990
- Map rows: 2,670
- Veto rows: 5,943
- Lineup-player rows: 8,590
- Match-player stat rows: 5,475
- Matches with player-stat rows: 155

## New Detail Pipeline

- `build_hltv_detail_queue.py` prioritizes starred and high-profile event matches.
- `collect_hltv_flaresolverr_match_details.py` fetches protected HLTV match pages through FlareSolverr.
- `ingest_hltv_flaresolverr_match_details.py` normalizes match pages into maps, vetoes, lineups, and visible player stats.

## Latest Benchmark

- Pure pre-event best readout: 89 / 133 = 66.9%.
- Post-veto/map-known best readout: 97 / 133 = 72.9%.
- Validation dataset rows: 756 low/medium-integrity T1/T1.5/T2 rows.

## Notes

- The broad 12k match-result table is intentionally not treated as fully trustworthy training data.
- Most newly added rows are T3/high-integrity-risk until ranked/team/event context improves.
- Detail crawling should continue in prioritized batches before any all-match crawl.
- The post-veto selector should be re-tuned now that map-detail coverage changed materially.
