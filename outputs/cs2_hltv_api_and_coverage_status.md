# CS2 HLTV API And Coverage Status

Date: 2026-06-08

## What Changed

I tested the linked HLTV API options as actual connectors instead of only reading docs, then added a hybrid enrichment path:

1. Liquipedia tournament pages discover match IDs and map-score rows.
2. `gigobyte/HLTV.getMatch(id)` enriches those known IDs with canonical HLTV team IDs, ranks, player IDs, map results, and vetoes.
3. SQLite stores the enriched detail in `hltv_result_matches`, `hltv_match_maps`, `hltv_match_vetoes`, and `hltv_match_players`.

## API Test Results

| API / Tool | Function | Result | Usefulness |
|---|---|---|---|
| `gigobyte/HLTV` | `getMatch(id)` | Works when paced | Best free HLTV detail enricher |
| `gigobyte/HLTV` | `getResults()` | Blocked by Cloudflare | Not usable as primary historical discovery here |
| `gigobyte/HLTV` | `getMatchMapStats(id)` | Blocked by Cloudflare | Not usable for per-map player stat pages here |
| `gigobyte/HLTV` | `getTeamRanking()` | Blocked by Cloudflare | Browser extraction/our existing snapshot remains better |
| `gigobyte/HLTV` | `getMatchesStats()` | Blocked by Cloudflare | Not usable here |
| Old Python `HLTV` package | `get_match_results()` | Returned 0 rows | Too old/shallow |
| Old Python `HLTV` package | `get_top_teams()` | Returned 0 rows | Too old/shallow |
| Old Python `HLTV` package | `get_best_players()` | 403 | Not usable |
| `Gabrielcnetto/HLTV-api` | `/api/match` | Not runnable here; Go unavailable | Same HLTV-page wrapper pattern |
| `Gabrielcnetto/HLTV-api` | `/api/last-results` | Not runnable here; reads `/results` | Would likely hit same blocked surface |
| Apify actor | Actor run | Requires token and pay-per-event | Useful future live/paid option |

Important: these are not official HLTV APIs. They are wrappers/scrapers around HLTV pages. That is why “just use the API” still hit access limits on `/results` and `/stats`; the working part is the individual match page by known ID.

## Current Coverage

Current seed dataset:

| Metric | Count |
|---|---:|
| Liquipedia-discovered match IDs | 713 |
| HLTV `getMatch(id)` enriched | 704 |
| Still missing after paced retry | 9 |
| Per-map rows | 1,837 |
| Match-player rows from HLTV details | 7,040 |
| Veto rows from HLTV details | 4,858 |
| Team-map win-rate rows | 399 |
| API function test rows stored | 11 |
| Liquipedia ranked-team match-history rows | 6,215 |
| Discovered tournament/stage pages in queue | 518 |

Remaining unenriched HLTV match IDs:

`2382425`, `2385897`, `2385952`, `2387399`, `2389643`, `2389646`, `2391765`, `2394146`, `2394154`

Current Cologne Major coverage:

| Event | Matches | HLTV Enriched |
|---|---:|---:|
| IEM Cologne Major 2026 Stage 1 | 33 | 33 |
| IEM Cologne Major 2026 Stage 2 | 30 | 30 |

## Honest Answer On “All Matches”

No: we do **not** yet have all matches for every current VRS/HLTV top-150 or top-200 team over the last year.

We now have strong coverage for the current/recent Tier-1 seed event set, the current-major rows are fully enriched, and a larger ranked-team match-history queue has been collected. But full top-200 map/stage coverage requires expanding and parsing the discovered tournament pages slowly:

- Continue Liquipedia match-history batches beyond the current top-50 combined VRS/HLTV run.
- Parse every tournament page referenced between 2025-06-08 and 2026-06-08.
- Parse those tournament pages and section subpages.
- Enrich all discovered HLTV IDs through paced `getMatch(id)`.
- Use Valve VRS roster match factors as a separate cross-check for teams/events the Liquipedia seed expansion missed.
- If we want HLTV `/results` completeness without Cloudflare pain, use a paid/proxied provider such as Apify with a token, or another hosted API with a reliable compliance story.

Note: the first 50-page event-queue parse attempt hit Liquipedia HTTP 429 rate limiting, so I paused instead of forcing it. The parser now has slower defaults and retry/backoff handling for the next run.

## Recommended Source Stack

Best free stack right now:

1. Valve VRS for ranking, roster, and tier context.
2. Liquipedia team/event pages for broad historical discovery and event metadata.
3. HLTV `getMatch(id)` for canonical match detail, teams, ranks, maps, vetoes, and players.
4. HLTV player profile browser extraction for player skill snapshots.

Paid/live option:

Apify’s actor is worth testing only if we add an Apify token and accept pay-per-event costs. It appears useful for live/upcoming/completed match monitoring, not free full historical backfill.

## Next Data Step

The next pass should be coverage expansion:

1. Build a top-200 team queue from latest VRS plus HLTV ranking.
2. Fetch each team’s Liquipedia match history for the last year.
3. Build a distinct tournament-page queue from those histories.
4. Parse all tournament match/map templates.
5. Enrich all positive HLTV match IDs through `getMatch(id)` with a safe delay and retry queue.
6. Generate a coverage report comparing: Liquipedia discovered events, HLTV-enriched IDs, Valve VRS match IDs, and missing/blocked rows.

Only after that should we claim “last-year top-200 coverage” or start model accuracy claims.
