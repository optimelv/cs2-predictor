# CS2 Data Expansion Status

Date: 2026-06-08

## What Changed

Added slow/resumable HLTV collection scaffolding:

| File | Purpose |
|---|---|
| `work/cs2_predictor/collect_hltv_results.js` | Collect HLTV result pages by date chunks |
| `work/cs2_predictor/collect_hltv_match_stats.js` | Collect HLTV map-stat pages from `stats_id` queue |
| `work/cs2_predictor/collect_hltv_player_stats.js` | Collect rolling HLTV player-stat windows |
| `work/cs2_predictor/build_hltv_collection_queues.py` | Export match-detail, map-stat, and player-stat queues |
| `work/cs2_predictor/ingest_hltv_results.py` | Merge HLTV result chunks into SQLite |
| `work/cs2_predictor/ingest_hltv_match_stats.py` | Store map-level player stats and round histories |
| `work/cs2_predictor/ingest_hltv_player_stats.py` | Store rolling player stat windows |

Added new SQLite tables:

| Table | Purpose |
|---|---|
| `hltv_match_player_stats` | Per-map player stat lines: kills, deaths, ADR, KAST, ratings, impact, etc. |
| `hltv_match_map_rounds` | Round outcome history from map-stat pages |
| `hltv_player_stats_windows` | Rolling player stat windows from HLTV player stats pages |

Added leakage-safe VRS feature candidates:

| Feature | Meaning |
|---|---|
| `vrs_rank_advantage` | Opponent VRS rank minus team VRS rank |
| `vrs_points_diff` | Team VRS points minus opponent VRS points |
| `team1_vrs_rank_known` / `team2_vrs_rank_known` | Whether a pre-match VRS rank was available |

## Data Added This Pass

Slow Liquipedia event expansion succeeded for:

| Event |
|---|
| `PGL/2026/Cluj-Napoca` |
| `FISSURE/Playground/2` |
| `PGL/2026/Bucharest` |

Warehouse growth:

| Dataset | Before | After |
|---|---:|---:|
| `hltv_result_matches` | 713 | 835 |
| `hltv_match_maps` | 1,837 | 2,209 |
| `liquipedia_events` | 17 | 20 |
| `model_training_matches` | 707 | 827 |
| Clean validation rows | 629 | 749 |

Current queue backlog:

| Queue | Rows |
|---|---:|
| Missing match details | 131 |
| Missing map-stat pages | 1,767 |
| Missing player-stat windows | 953 |

## HLTV Access Status

Direct HLTV access from this environment is currently blocked by Cloudflare for:

| Function | Probe result |
|---|---|
| `HLTV.getResults` | Blocked |
| `HLTV.getMatchMapStats` | Blocked |
| `HLTV.getPlayerStats` | Blocked |

Probe files saved under `work/data/raw/hltv/`:

| File |
|---|
| `results_probe_2026_06_01_to_2026_06_03.json` |
| `match_map_stats_probe_2026_06_08.json` |
| `player_stats_probe_2026_06_08_3m.json` |

Tried paths:

| Path | Result |
|---|---|
| `gigobyte/HLTV` direct calls | Cloudflare access denied |
| `curl_cffi` browser impersonation | Cloudflare challenge / 403 |
| Deprecated `hltv-api.vercel.app` | Deployment not found |
| Apify HLTV actor | Requires Apify API token and paid/free account usage |
| Local Playwright with bundled browser | Browser binary unavailable |
| Local Chrome via Playwright | Launch blocked in this environment |

## Veto Predictor Design

Recommended product split:

| Product | Timing | Inputs |
|---|---|---|
| Pre-veto predictor | Before veto | Team strength, rank/VRS, form, stage, rest, H2H, roster/player form |
| Veto predictor | Before veto | Team pick/ban rates, map Elo, map win rates, opponent map strengths, event map pool |
| Pre-veto + predicted maps | Before veto | Pre-veto predictor plus likely map set from veto predictor |
| Post-veto predictor | After veto | Actual selected maps plus all pre-match features |

The current post-veto benchmark proves the map signal is valuable. The next model step is to train a veto simulator so the pre-veto product can estimate map uncertainty instead of ignoring it.

## Current Benchmark

Holdout events: IEM Cologne Major 2026, PGL Astana 2026, IEM Atlanta 2026.

| Product | Best readout | Accuracy |
|---|---|---:|
| Pure pre-veto / pre-match | `pre_event_frozen + blend` | 66.4% |
| Post-veto / map-known | `rolling_in_event + post_veto_map` | 74.2% |

High-confidence slices:

| Product | Confidence | Coverage | Accuracy |
|---|---:|---:|---:|
| Pure pre-veto | >= 0.70 | 28.1% | 77.8% |
| Post-veto | >= 0.70 | 55.5% | 78.9% |
| Post-veto | >= 0.75 | 47.7% | 82.0% |

## Next Data Step

Best next move is not more model tuning yet. It is access-enabled HLTV collection:

1. Use an Apify token, a stable browser-backed scraper, or a permitted proxy path.
2. Run `build_hltv_collection_queues.py`.
3. Fetch `map_stats_queue.json` slowly into `match_map_stats_*.json`.
4. Ingest with `ingest_hltv_match_stats.py`.
5. Fetch `player_stats_queue.json` for 3-month and 6-month windows.
6. Ingest with `ingest_hltv_player_stats.py`.
7. Add player-form and map-veto features to the model.

