# CS2 Predictor Starter

This package is a local scaffold for a real CS2 pre-match prediction pipeline.

Included:

- `schemas.py`: canonical row and entity shapes
- `source_specs.py`: which sources to use and how
- `features.py`: first-pass feature registry
- `modeling.py`: recommended model candidates
- `validation.py`: purged time-based fold generation and core metrics
- `http.py`: polite gzip-aware HTTP client with source-specific pacing
- `collectors.py`: first live collectors for Valve VRS and Liquipedia
- `cli.py`: end-to-end data collection entrypoint
- `storage.py`: raw and bronze-layer persistence helpers
- `paths.py`: shared filesystem layout
- `warehouse.py`: SQLite schema and bronze-to-database loader
- `build_warehouse.py`: command for rebuilding the local database from saved bronze files
- `ingest_hltv_snapshot.py`: converts browser-extracted HLTV ranking snapshots into database rows and player queues
- `ingest_hltv_player_profiles.py`: loads browser-extracted player profile attributes into SQLite
- `collect_hltv_results.js`: slow/resumable HLTV result collector using `gigobyte/HLTV`
- `collect_hltv_match_stats.js`: slow/resumable HLTV map-stat collector using map `stats_id` queues
- `collect_hltv_player_stats.js`: slow/resumable HLTV player-stat-window collector
- `collect_hltv_apify.py`: Apify actor collector for HLTV live/upcoming/completed feed probes
- `collect_hltv_sockspls_results.py`: slow but working latest-results collector through `SocksPls/hltv-api`
- `collect_hltv_flaresolverr.py`: probe/fetch bridge for a running FlareSolverr service
- `build_hltv_collection_queues.py`: exports missing match-detail, map-stat, and player-stat queues
- `ingest_hltv_results.py`: merges HLTV result chunks into the warehouse without overwriting richer context
- `ingest_hltv_sockspls_results.py`: merges SocksPls latest-results rows into the warehouse
- `ingest_hltv_match_stats.py`: loads per-map player stat lines and round histories
- `ingest_hltv_player_stats.py`: loads rolling player-stat windows
- `build_model_dataset.py`: creates leakage-aware series-level training rows, tier/integrity labels, and baseline validation metrics
- `benchmark_event_holdouts.py`: excludes named benchmark events from training and reports event/stage/playoff accuracy

Intended build order:

1. collect Valve rankings plus roster detail snapshots
2. collect Liquipedia team match histories and rosters for top teams
3. add HLTV browser-assisted snapshots for rankings and player stats
4. build feature rows at map level
5. train baselines
6. run blocked time-validation
7. add veto simulation

This starter intentionally avoids assuming any single scraping library or paid provider.

Current collection outputs land under:

- `work/data/raw/`
- `work/data/bronze/`
- `work/data/cs2_predictor.sqlite3`
