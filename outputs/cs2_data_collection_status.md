# CS2 Data Collection Status

As of June 7, 2026, the first live data backbone is in place.

## What is collected

- Valve VRS rankings from `2025-01-06` through `2026-06-01`
- Valve roster detail pages for the current global top 8 on `2026-06-01`
- Liquipedia match histories for the current top 4 Valve teams:
  - `Vitality`
  - `Spirit`
  - `Falcons`
  - `Natus Vincere`
- Liquipedia active rosters for those same 4 teams
- HLTV world ranking snapshot top 40 from `June 1, 2026`

## Current table sizes

- `valve_rankings.csv`: `13,135` rows across `24` ranking dates
- `valve_roster_match_factors.csv`: `328` rows
- `liquipedia_team_matches.csv`: `956` rows
- `liquipedia_team_rosters.csv`: `20` active-player rows
- `hltv_team_rankings_2026_06_01_top40.csv`: `40` rows

## Coverage notes

- Valve gives us the cleanest rolling strength prior and roster snapshot history.
- Liquipedia gives us event tiers, match scores, timestamps, event names, and opponent links through the official API.
- HLTV is currently best treated as a browser-assisted live source in this environment because direct scripted requests hit anti-bot protection.
- The first Liquipedia slice is intentionally focused on Tier 1/Tier 1.5 teams so we avoid low-quality Tier 3 noise while building the first model.

## Main files

- `work/data/bronze/valve_rankings.csv`
- `work/data/bronze/valve_roster_match_factors.csv`
- `work/data/bronze/liquipedia_team_matches.csv`
- `work/data/bronze/liquipedia_team_rosters.csv`
- `work/data/bronze/hltv_team_rankings_2026_06_01_top40.csv`
- `work/data/raw/hltv/ranking_2026_06_01_top40.json`

## Best next step

Build the first feature pipeline around:

- pre-match team strength from Valve rank and points
- roster continuity from Liquipedia join dates and Valve roster snapshots
- recent form from Liquipedia match history
- live roster and rank confirmation from HLTV

Then train:

- logistic regression baseline
- CatBoost primary model
- LightGBM challenger

Validation should use chronological purged folds, not random k-fold.
