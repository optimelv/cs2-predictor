# CS2 Database Expansion Status

As of June 7, 2026, the project now has a local SQLite warehouse instead of only loose CSVs.

## Database Choice

Use SQLite for phase 1.

Why:

- It is free, local, reproducible, and available through Python without extra services.
- It is good enough for millions of rows at this stage.
- It lets us keep source auditability through raw files while giving the model clean tables.
- It supports resumable queues for slow sources like HLTV and Liquipedia.

Later, use DuckDB/Parquet for heavier model experiments and analytics. Postgres is only needed once this becomes a shared app or live service with multiple users/jobs.

## Current Warehouse

Database:

- `work/data/cs2_predictor.sqlite3`

Current table counts:

- `teams`: `697`
- `players`: `973`
- `valve_rankings`: `13,135`
- `valve_roster_match_factors`: `9,339`
- `hltv_team_rankings`: `200`
- `hltv_player_queue`: `953`
- `hltv_player_snapshots`: `50`
- `liquipedia_matches`: `956`
- `liquipedia_rosters`: `20`
- `collection_queue`: `584`

## What Changed

- Expanded Valve VRS detail collection from top 8 to current global top 200.
- Extracted HLTV world ranking top 200 from the live browser page.
- Seeded `953` unique HLTV player profile URLs from those top-200 teams.
- Collected and loaded the first `50` HLTV player profiles.
- Added player attributes from HLTV profiles:
  - `rating_3_0`
  - `maps_3m`
  - `firepower`
  - `entrying`
  - `trading`
  - `opening`
  - `clutching`
  - `sniping`
  - `utility`

## Important Source Notes

- Valve VRS is the cleanest scalable source for current team strength, roster identity, and recent roster-level match factors.
- HLTV team ranking pages are available through the browser path and now cover top 200 locally.
- HLTV player profile pages are also available through the browser path and can be collected through the queue.
- HLTV bulk stats pages currently hit a Cloudflare security check, so profile-page collection is the reliable free route for now.
- Liquipedia is useful for events, tiers, rosters, and match histories, but page parse requests are slow if we follow their API rules. We should expand Liquipedia through a queue, not a one-shot scrape.

## Update Strategy

Daily or pre-event:

- Pull latest Valve VRS standings.
- Refresh current HLTV top 200 ranking snapshot.
- Add new HLTV player profile URLs to the queue.
- Fetch a capped batch of pending HLTV player profiles.
- Refresh Liquipedia only for teams/events that changed or are in the current prediction slate.

Weekly:

- Rebuild feature tables from SQLite.
- Re-run model validation on chronological folds.
- Check calibration drift.

Before a major event stage:

- Force refresh all remaining player profiles for involved teams.
- Refresh event pages and match schedule.
- Refresh active rosters and stand-ins.

## Model Implication

The first serious training dataset should now be built from:

- VRS rank/points and roster-level match factors
- HLTV rank/points and top-200 roster links
- HLTV player profile attributes
- Liquipedia event tier, match score, opponent, and online/offline fields

The current database is enough to start a first team-strength baseline and a player-enriched Tier 1/Tier 1.5 prototype. It is not yet enough for a full top-200 historical Liquipedia match model because the slow Liquipedia queue still needs to be run over time.
