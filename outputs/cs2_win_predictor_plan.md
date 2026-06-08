# CS2 Win Predictor Plan

Date: 2026-06-07
Goal: Build a CS2 pre-match win predictor for pro matches, using historical data from roughly the last 1 to 2 years, with player stats, team skill, map context, tier filtering, and proper cross-validated testing.

## Bottom line

The best setup for this project is:

1. Use `HLTV` as the primary source for historical matches, map results, team stats, player stats, rankings, and player-style features.
2. Use `Liquipedia` via its `MediaWiki API` for event structure, tournament tiers, roster history, and metadata that should not be scraped from HTML.
3. Use `Valve VRS` snapshots as an official strength prior.
4. Optionally use `FACEIT` as a supplementary player-skill source, not the main pro-match source.
5. Build the model at the `map level`, then simulate `Bo1`, `Bo3`, and `Bo5` series from map probabilities.
6. Use a `strong tabular model` as the main engine, with `CatBoost` first, `LightGBM` second, and a rating-based logistic baseline for sanity.
7. Validate with `time-aware blocked folds`, not naive random k-fold, to avoid leakage.

This gets us much closer to an Oddify-style product than a simple Elo spreadsheet ever will.

## What Oddify gets right that we should copy

Oddify’s public site is built around:

- pre-match probabilities
- confidence display
- matchup analysis pages
- education / bankroll concepts
- premium access to deeper model output

For CS2, the equivalent should be:

- `match win probability`
- `map win probability`
- `confidence / model stability`
- `tier + integrity risk flag`
- `lineup continuity flag`
- `map-pool edge summary`
- `market edge vs implied odds`

Source: [Oddify home page](https://oddify.ai/)

## Best public or low-cost data sources

### 1. HLTV

Best use:

- historical match results
- match pages
- team pages
- player pages
- stats pages
- rankings
- event pages
- map-level results

Why it matters:

- HLTV is still the richest public source for pro CS2 results and stats.
- HLTV stats pages expose player performance data and ranking filters.
- HLTV also now exposes player-style features through its `HLTV Attributes`, which are useful as model features.

Useful examples from current sources:

- HLTV stats overview exists and supports players, teams, matches, events, and maps.
- HLTV attributes article explains seven player-style categories such as `Firepower`, `Entrying`, `Trading`, `Opening`, `Clutching`, `Sniping`, and `Utility`.
- HLTV’s world ranking and Valve ranking are both available historically.

Important caveat:

- I did not find official public API documentation from HLTV.
- In practice, HLTV is best treated as an HTML-first source, optionally accessed through an unofficial wrapper with heavy caching and careful rate control.
- One widely used unofficial wrapper warns that abuse can trigger an IP ban due to Cloudflare protection.

Sources:

- [HLTV stats](https://www.hltv.org/stats)
- [HLTV attributes](https://www.hltv.org/news/39672/introducing-hltv-attributes)
- [HLTV terms](https://www.hltv.org/terms)
- [Unofficial Node wrapper](https://github.com/gigobyte/HLTV)

### 2. Liquipedia

Best use:

- tournament tiering
- tournament structure
- start and end dates
- region tags
- roster changes
- bracket context
- event metadata

Why it matters:

- Liquipedia is the cleanest source for event taxonomy and roster movement context.
- For this project, Liquipedia should be the source of truth for `event tier labels` and much of the roster/event metadata.

Important caveat:

- Do not scrape Liquipedia HTML pages automatically.
- Liquipedia explicitly says automated access to non-API endpoints is not permitted.
- Use the free `MediaWiki API` or the paid `LiquipediaDB API`.

Important usage rules:

- MediaWiki API: max `1 request per 2 seconds`
- `action=parse`: max `1 request per 30 seconds`
- Use a custom `User-Agent`
- Cache aggressively

Sources:

- [Liquipedia API terms](https://liquipedia.net/api-terms-of-use)
- [Liquipedia API landing page](https://liquipedia.net/api)
- [Liquipedia Counter-Strike main page](https://liquipedia.net/counterstrike/Main_Page)

### 3. Valve VRS

Best use:

- official team-strength prior
- roster-strength baseline
- invite-quality context

Why it matters:

- Valve’s public VRS repository explicitly says the ranking is designed to predict future match results.
- Their model code and write-up provide a strong baseline feature family.
- This should absolutely be part of our pre-match prior.

What it uses:

- prize money
- beaten opponents’ prize money
- number of teams beaten
- head-to-head results
- seeding modifiers such as bounty collection, network, and LAN factor

Source:

- [Valve VRS repo](https://github.com/ValveSoftware/counter-strike_regional_standings)

### 4. FACEIT

Best use:

- supplementary player skill level
- public ladder strength
- optional extra player priors

Why it matters:

- FACEIT exposes official REST endpoints for player details, lifetime stats, and match stats.
- FACEIT also publishes official Elo-to-skill-level ranges.
- This is useful if we want an external player-skill signal, though it should stay secondary for pro-match prediction.

Why it is not the main source:

- Pro matches are not played on FACEIT matchmaking.
- FACEIT Elo is not a clean proxy for current pro team strength.
- Use it only as optional enrichment.

Sources:

- [FACEIT Data API guide](https://docs.faceit.com/getting-started/Guides/retreiving-faceit-data/)
- [FACEIT player endpoints](https://docs.faceit.com/docs/data-api/data)
- [FACEIT CS2 Elo and skill levels](https://support.faceit.com/hc/en-us/articles/10525200579740-FACEIT-CS2-Elo-and-skill-levels)

### 5. Demo parsing

Best use:

- deep round-level and event-level features
- utility usage
- opening duel locations
- economy patterns
- pathing and tempo proxies

Why it matters:

- If we want real edge beyond public bookmaker-style modeling, demo-derived features are the most interesting long-term differentiator.
- But demo parsing should be phase 2, not day 1.

Practical tools:

- `demoparser2`
- `awpy`

Sources:

- [demoparser](https://github.com/LaihoE/demoparser)
- [awpy docs](https://awpy.readthedocs.io/en/stable/)

### 6. Odds history

Best use:

- edge calculation
- market comparison
- backtesting against implied probability
- opening / closing line studies

Low-cost options:

- `The Odds API` for historical bookmaker snapshots

Higher-cost esports-native options:

- PandaScore Odds
- Abios Odds

Important caveat:

- PandaScore’s public statistics API does not include third-party bookmaker odds; their odds are a separate product.
- Odds history is valuable, but the first predictor can be built before we buy deep odds feeds.

Sources:

- [The Odds API](https://the-odds-api.com/)
- [Historical Odds Data](https://the-odds-api.com/historical-odds-data/)
- [PandaScore getting started](https://developers.pandascore.co/docs/getting-started)
- [PandaScore FAQ](https://developers.pandascore.co/docs/frequently-asked-questions)
- [Abios Odds overview](https://abiosgaming.com/docs/en/content/odds/overview/intro)

## Recommended data acquisition strategy

### HLTV strategy

Use HLTV for:

- match list by date range
- match page metadata
- map results
- team pages
- player pages
- rankings snapshots
- stats pages with filters

Implementation approach:

- use a dedicated scraper layer
- cache every raw response
- dedupe by URL and last fetch time
- parse into normalized tables
- back off aggressively on failures

Do not:

- blast requests in parallel
- depend on one unofficial wrapper only
- trust current rosters without checking match-level lineups

### Liquipedia strategy

Use Liquipedia `MediaWiki API` for:

- event and tournament metadata
- roster changes
- tier labels
- stage structure
- location, region, LAN/online tags

Implementation approach:

- API only
- strict rate limiting
- custom `User-Agent`
- attribute Liquipedia in outputs where required

### Valve strategy

Use Valve VRS snapshots for:

- team prior strength
- official global and regional rank features

Implementation approach:

- ingest historical snapshots from the repository
- build a weekly table keyed by date and roster

### Odds strategy

Phase 1:

- skip or store only a small sample if budget is tight

Phase 2:

- store opening snapshot
- 24h snapshot
- 6h snapshot
- 1h snapshot
- closing snapshot

## Data model we should build

Minimum normalized tables:

- `teams`
- `players`
- `rosters`
- `roster_membership`
- `events`
- `event_stages`
- `matches`
- `maps`
- `match_lineups`
- `player_map_stats`
- `team_rankings_hltv`
- `team_rankings_valve`
- `player_attributes_hltv`
- `odds_snapshots`
- `integrity_flags`

Key join rule:

- the core entity is not just `team name`
- it is `roster at match date`

This is essential for CS2 because lineups change constantly.

## Features the model should use

### Team-level features

- HLTV rank
- HLTV points
- Valve global rank
- Valve points
- recent win rate
- recent LAN win rate
- recent online win rate
- opponent-strength-adjusted win rate
- roster continuity
- days since lineup change
- event tier
- LAN/online
- region travel
- days of rest

### Player-level features

- average HLTV rating
- median HLTV rating
- top-player rating
- rating spread within roster
- role balance from HLTV attributes
- star concentration
- entrying score mix
- clutching score mix
- sniping dependence
- utility contribution profile

### Map-level features

- map win rate over multiple windows
- map win rate vs top-20 teams
- map ban frequency
- map pick frequency
- side-adjusted map performance if available
- head-to-head on same map with same cores

### Integrity and data-quality features

- event tier bucket
- official investigation flag
- unresolved rumor flag
- roster freshness
- suspiciously low sample flag
- online-only warning

These should not only feed the model. They should also feed `training weights` and `exclusion rules`.

## Best model family for this problem

### Baseline

`Logistic regression` on rating and map features.

Why:

- interpretable
- sanity check
- easy to diagnose leakage

### Primary model

`CatBoostClassifier` at the map level.

Why:

- very strong on tabular data
- handles categorical features well
- convenient for missing values
- good first choice when the dataset mixes rankings, names, tiers, regions, map labels, and sparse categorical signals

Source:

- [CatBoost docs](https://catboost.ai/en/docs/)

### Challenger models

- `LightGBM`
- `XGBoost`

Why:

- both are strong tabular challengers
- LightGBM is especially fast
- compare them directly, but do not assume they beat CatBoost on mixed categorical esports data

Source:

- [LightGBM features](https://lightgbm.readthedocs.io/en/stable/Features.html)

### Final prediction layer

Build probabilities at the `map level`, then simulate series:

- Bo1: direct
- Bo3: simulate veto + map order
- Bo5: simulate full order

This is better than training one direct match classifier because CS2 outcomes are strongly shaped by veto and map pool.

## Validation: do not use naive random k-fold

This is the most important modeling warning.

The user asked for k-fold cross validation, which is correct in spirit, but for CS2 it must be adapted to time.

Why naive random k-fold is bad:

- future matches leak into training
- same roster state can appear in both train and test
- same event can be split across folds
- line movement or ranking updates can leak future information backward

What to use instead:

### Outer validation

`Blocked time-based k-fold` or `TimeSeriesSplit` with a purge gap.

Example:

- 5 folds
- test window = 6 to 8 weeks
- purge gap = 7 days
- all rows sorted by match start time

scikit-learn explicitly states that `TimeSeriesSplit` is for time-ordered data where other CV methods would train on future data and evaluate on past data.

Source:

- [TimeSeriesSplit docs](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)

### Grouping rule

Never split maps from the same `series` across train and test.

For map-level training:

- group by `match_id`
- split by `match start date`

### Inner tuning

Inside each outer fold:

- use a smaller blocked CV for hyperparameter tuning
- never touch the outer test fold during tuning

### Metrics to track

- `log loss`
- `Brier score`
- `accuracy`
- `ROC AUC`
- `calibration error`
- `reliability bins`
- `ROI vs closing odds`
- `CLV proxy` if odds data is available

For betting-style deployment, `log loss`, `Brier`, and calibration matter more than headline accuracy.

## Recommended build phases

### Phase 1: clean public predictor

Build with:

- HLTV
- Liquipedia API
- Valve VRS

Output:

- match winner probabilities
- map-level probabilities
- model confidence
- tier and integrity flag

### Phase 2: market comparison

Add:

- odds snapshots
- opening vs closing line tracking
- edge calculations

Output:

- value flag
- model implied probability
- market implied probability
- edge percent

### Phase 3: hard-to-copy edge

Add:

- demo-derived features
- tempo and utility patterns
- opening duel geography
- economy mismanagement features

This is where real moat can emerge.

## Recommendation on what we should build first

If the goal is to actually get moving fast, build this in order:

1. historical match and player-stat collector from HLTV
2. Liquipedia event-tier and roster metadata collector via API
3. normalized warehouse tables
4. baseline logistic model
5. CatBoost map model
6. blocked time-based cross-validation
7. Bo3 simulator
8. optional odds integration

That is the fastest route to a real CS2 predictor that is still methodologically sound.

## Sources

- [Oddify home page](https://oddify.ai/)
- [HLTV stats](https://www.hltv.org/stats)
- [HLTV attributes](https://www.hltv.org/news/39672/introducing-hltv-attributes)
- [HLTV terms](https://www.hltv.org/terms)
- [Unofficial HLTV wrapper](https://github.com/gigobyte/HLTV)
- [Liquipedia API terms](https://liquipedia.net/api-terms-of-use)
- [Liquipedia API](https://liquipedia.net/api)
- [Liquipedia Counter-Strike main page](https://liquipedia.net/counterstrike/Main_Page)
- [Valve VRS repo](https://github.com/ValveSoftware/counter-strike_regional_standings)
- [FACEIT Data API guide](https://docs.faceit.com/getting-started/Guides/retreiving-faceit-data/)
- [FACEIT Data API docs](https://docs.faceit.com/docs/data-api/data)
- [FACEIT CS2 Elo and skill levels](https://support.faceit.com/hc/en-us/articles/10525200579740-FACEIT-CS2-Elo-and-skill-levels)
- [demoparser2](https://github.com/LaihoE/demoparser)
- [awpy docs](https://awpy.readthedocs.io/en/stable/)
- [CatBoost docs](https://catboost.ai/en/docs/)
- [LightGBM docs](https://lightgbm.readthedocs.io/en/stable/Features.html)
- [TimeSeriesSplit docs](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
- [The Odds API](https://the-odds-api.com/)
- [Historical Odds Data](https://the-odds-api.com/historical-odds-data/)
- [PandaScore getting started](https://developers.pandascore.co/docs/getting-started)
- [PandaScore FAQ](https://developers.pandascore.co/docs/frequently-asked-questions)
- [Abios Odds overview](https://abiosgaming.com/docs/en/content/odds/overview/intro)
