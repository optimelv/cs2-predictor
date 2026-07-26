# StrikeSignal Product Roadmap

## Release 1: Circuit Intelligence

Status: implemented in the current product branch.

- Universal search across teams, players, and Tier 1/2 events
- Clickable team profiles with VRS, form, roster, map pool, series, and event context
- Player profiles with current team, role inference, Rating 3.0, sample size, and skill traits
- Event rooms with overview, schedule, bracket, format, and complete field views
- Native visualizations for Swiss, GSL, single elimination, double elimination, round robin, and mixed events
- Versioned bracket rounds and stable match slots for published tournament trees
- Provider-neutral live snapshot with scores, maps, vetoes, lineups, stages, and result state
- Tier trust gate: Tier 1 and Tier 2 are public; lower and unverified events remain outside the product
- Scheduled release promotion with freshness checks, incremental Elo/form updates, and last-good fallback

## Release 1.1: Personal Match Desk

Status: browser-local foundation implemented; account sync and alerts remain next.

- Saved match picks with frozen probability, automatic win/loss resolution, and a personal ledger
- Team, player, and event watchlists stored per account
- Notifications for published vetoes, changed probabilities, roster substitutions, and match starts
- Account-synced closing probability and calibration history
- Shareable event brackets and Pick'Em routes

## Release 1.2: Veto Lab

Priority: high.

- Interactive ban/pick simulator that enforces each event's veto rules
- Permaban detection from recent official veto history rather than manual exceptions
- Map-order probability and likely decider projections
- Side-start and LAN/online adjustments where samples are sufficient

## Release 1.3: Transparent Model

Status: champion/challenger registry and promotion gates implemented; public diagnostics remain next.

- Public rolling accuracy, log loss, Brier score, and calibration charts by event tier and series format
- Champion/challenger registry with automatic promotion only after a purged chronological holdout win
- Roster-at-match-date player strength, transfer shock, role balance, and substitute penalties
- Prediction explanations expressed as the strongest positive, negative, and uncertainty signals

## Release 2: CS2 Data Platform

Priority: after the consumer desk proves repeat use.

- Durable historical warehouse on the Always Free worker with raw-response caching and replayable ingestion
- Team and player timelines, head-to-head explorer, map matchup matrices, and event archive
- Read-only API for matches, probabilities, rankings, rosters, maps, and bracket state
- Embeddable prediction cards for tournament sites and creators

## Promotion Rules

No release may claim live data when the source is stale, show an unverified low-tier event as Tier 1/2, or promote a model because accuracy alone increased. Model promotion requires a chronological holdout improvement in log loss and Brier score, no material calibration regression, and a minimum event sample.
