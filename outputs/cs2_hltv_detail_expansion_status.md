# CS2 HLTV Detail Expansion Status

Date: 2026-06-09

## Result Coverage

- HLTV result matches: 12,198
- Match-date range: 2025-05-30 to 2026-06-08
- One-year FlareSolverr results crawl: 11,999 compact result rows
- Teams known after crawl: 1,196

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
