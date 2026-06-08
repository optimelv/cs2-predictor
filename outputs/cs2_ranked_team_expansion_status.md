# CS2 Ranked-Team Coverage Expansion Status

Date: 2026-06-08

## What Changed

I added a ranked-team Liquipedia match-history batch collector.

It uses the Liquipedia MediaWiki parse API to render the same `Team matches table` data Liquipedia uses internally, but in small batches of ranked teams instead of one team page at a time.

Current expansion run:

| Metric | Count |
|---|---:|
| Ranking scope | Combined Valve VRS top 50 + HLTV top 50 |
| Unique teams queued | 55 |
| Liquipedia batches attempted | 11 |
| Batch errors | 0 |
| New team-history rows collected | 5,389 |
| Total `liquipedia_matches` rows | 6,215 |
| Distinct tournament/stage pages discovered | 518 |
| Tournament/stage pages already map-parsed | 25 |
| Tournament/stage pages still queued | 493 |

Tier distribution from the newly collected team-history rows:

| Tier | Rows |
|---|---:|
| S-Tier | 1,445 |
| A-Tier | 437 |
| B-Tier | 1,862 |
| C-Tier | 1,027 |
| Qualifier | 614 |
| Showmatch | 4 |

## Current Warehouse State

After restoring cached HLTV match-detail enrichment:

| Table / Feature | Rows |
|---|---:|
| `liquipedia_matches` | 6,215 |
| `hltv_result_matches` | 713 |
| HLTV-enriched matches | 704 |
| `hltv_match_maps` | 1,837 |
| `hltv_match_vetoes` | 4,858 |
| `hltv_match_players` | 7,040 |
| `liquipedia_events` | 17 |
| `team_event_stage_results` | 1,075 |
| `team_phase_performance` | 377 |
| `team_map_win_rates` | 399 |

All 713 map/stage-parsed matches still join to event metadata.

## Important Caveat

The expansion added broad team-history coverage, but not broad map/stage coverage yet.

I attempted to parse the first 50 newly discovered event/stage pages, but Liquipedia returned HTTP 429 rate limits. I stopped rather than hammering the API. The event parser now has slower defaults plus retry/backoff handling, so the next event-page pass should be run in smaller, slower chunks.

Follow-up on 2026-06-08: a one-page tournament probe and a top-100 missing-team batch probe also returned HTTP 429, so network collection is paused. The collector now has `--only-missing-teams`, `--max-batches`, and `--stop-after-errors` so resuming can be done safely without repeating the whole queue.

Current missing-team resume targets:

| Scope | Ranked unique teams | Still missing match-history batch |
|---|---:|---:|
| Combined VRS/HLTV top 100 | 115 | 57 |
| Combined VRS/HLTV top 150 | 166 | 105 |
| Combined VRS/HLTV top 200 | 222 | 161 |

## Next Safe Step

Run the event queue in small chunks after a cooldown:

1. Parse 5-10 queued event/stage pages at a time.
2. Reapply cached HLTV match-detail enrichment after each chunk.
3. Rebuild the event queue so already parsed stage pages are not retried.
4. Only then enqueue new positive HLTV match IDs for paced `getMatch(id)` enrichment.

This keeps data quality high and avoids poisoning the model with partial joins or rate-limit failures.

## Model Dataset Added

While Liquipedia is rate-limited, I added the first model-ready dataset builder.

Current output:

| Model artifact | Rows / Metric |
|---|---:|
| `model_training_matches` rows | 707 |
| Clean validation rows | 629 |
| Purged forward folds | 4 |
| Logistic baseline accuracy | 0.608 |
| Elo-only baseline accuracy | 0.609 |

This is a sanity check only, not a production accuracy claim.
