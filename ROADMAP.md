# StrikeSignal Product Roadmap

## Release 1: Circuit Intelligence

Status: implemented in the current product branch.

- Universal search across teams, players, and Tier 1/2 events
- Clickable team profiles with VRS, form, roster, map pool, series, and event context
- In-context player drilldowns inside every team profile, with lineup comparison and a direct path into the full player index
- Player profiles with current team, role inference, Rating 3.0, sample size, and skill traits
- Event rooms with overview, schedule, bracket, format, and complete field views
- Native visualizations for Swiss, GSL, single elimination, double elimination, round robin, and mixed events
- Versioned bracket rounds and stable match slots for published tournament trees
- Provider-neutral live snapshot with scores, maps, vetoes, lineups, stages, and result state
- Tier trust gate: Tier 1 and Tier 2 are public; lower and unverified events remain outside the product
- Scheduled release promotion with freshness checks, incremental Elo/form updates, and last-good fallback
- Independent Tier 1/2 promotion filter before model training, roster merging, and publication

## Release 1.1: Personal Match Desk

Status: browser-local personal desk implemented; account sync and alerts remain next.

- Saved match picks with frozen probability, automatic win/loss resolution, and a personal ledger
- Team, player, and event watchlists stored on the current device
- Personal match feed assembled from followed teams and tournaments
- Direct navigation from the personal desk into series, team, player, and event intelligence
- Notifications for published vetoes, changed probabilities, roster substitutions, and match starts
- Account-synced closing probability and calibration history
- Shareable event brackets and Pick'Em routes

## Release 1.2: Veto Lab

Status: implemented and released.

- Interactive ban/pick simulator that enforces each event's veto rules
- Permaban detection from recent official veto history rather than manual exceptions
- Map-order probability and likely decider projections
- Side-start and LAN/online adjustments where samples are sufficient

Remaining depth: side-start and LAN/online adjustments require a larger structured sample before they can safely influence production probabilities.

## Release 1.3: Transparent Model

Status: champion/challenger registry, promotion gates, and the public scorecard are implemented.

- Public rolling accuracy, log loss, Brier score, and calibration charts by event tier and series format
- Champion/challenger registry with automatic promotion only after a purged chronological holdout win
- Roster-at-match-date player strength, transfer shock, role balance, and substitute penalties
- Prediction explanations expressed as the strongest positive, negative, and uncertainty signals

Next: add rolling calibration slices by event tier and BO1/BO3/BO5 once each slice meets the minimum sample gate.

## Release 1.4: Tournament Compiler

Status: format compiler and reusable bracket engines implemented.

- One normalized stage blueprint for Swiss, GSL, round robin, single elimination, double elimination, and mixed events
- Self-building playoff fields from declared qualifier counts or conservative format defaults
- Published match and round overlays that replace projections without rebuilding the page
- Shared structure for event timeline, format explanation, projected matches, and bracket rendering

Next: ingest organizer-native seeds, bracket slot dependencies, and best-of rules when the live worker is available.

## Release 1.5: Reliable Live Circuit

Status: scheduled dual-path refresh implemented; production source success is monitored by GitHub Actions.

Implemented:

- Prefer the Oracle Always Free worker when capacity is available
- Fall back to a pinned ephemeral FlareSolverr worker on the free GitHub Actions runner
- Refresh every three hours and preserve the last verified release on any source or validation failure

Next reliability depth:

- Cache HLTV responses, use incremental cursors, and back off automatically on source pressure
- Refresh active matches frequently and future event fields less often
- Update lineups on every eligible Tier 1/2 match detail and refresh full player profiles on a slower rotation
- Keep Vercel stateless and preserve the last verified release whenever the worker or a source is unhealthy

## Release 2: CS2 Data Platform

Priority: after the consumer desk proves repeat use.

- Durable historical warehouse on the Always Free worker with raw-response caching and replayable ingestion
- Team and player timelines, head-to-head explorer, map matchup matrices, and event archive
- Read-only API for matches, probabilities, rankings, rosters, maps, and bracket state
- Embeddable prediction cards for tournament sites and creators

## Product Order After Live Ingest

1. Player timelines: initial series-rating, ADR, K/D, opponent, and event history is implemented; role, roster, and map-performance movement remain next.
2. Accounts and alerts: browser-local picks and watchlists are live; cross-device sync, veto notifications, and closing probability history remain next.
3. Match explanation engine: implemented with ranked positive signals, the strongest counter-signal, and one prioritized uncertainty flag for every call.
4. Historical explorer: head-to-head, lineup-era splits, map matchup matrices, and event archive.
5. Public API and embeds after data freshness and repeat usage are proven.

## Promotion Rules

No release may claim live data when the source is stale, show an unverified low-tier event as Tier 1/2, or promote a model because accuracy alone increased. Model promotion requires a chronological holdout improvement in log loss and Brier score, no material calibration regression, and a minimum event sample.
