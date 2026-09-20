# StrikeSignal Product Roadmap

## Release 1: Circuit Intelligence

Status: implemented in the current product branch.

- Universal search across teams, players, and Tier 1/2 events
- Clickable team profiles with VRS, form, roster, map pool, series, and event context
- In-context player drilldowns inside every team profile, with lineup comparison and a direct path into the full player index
- Player profiles with current team, role inference, Rating 3.0, sample size, and skill traits
- Shareable Player Compare workspace available from team drilldowns and the Player Index, with common-scale form, traits, and map matrices
- Event rooms with overview, schedule, bracket, format, and complete field views
- Native visualizations for Swiss, GSL, single elimination, double elimination, round robin, and mixed events
- Versioned bracket rounds and stable match slots for published tournament trees
- Provider-neutral live snapshot with scores, maps, vetoes, lineups, stages, and result state
- Tier trust gate: Tier 1 and Tier 2 are public; lower and unverified events remain outside the product
- Scheduled release promotion with freshness checks, incremental Elo/form updates, and last-good fallback
- Independent Tier 1/2 promotion filter before model training, roster merging, and publication

## Release 1.1: Personal Match Desk

Status: personal desk, signal alerts, closing-line history, and portable Desk Links implemented; authenticated account sync remains next.

- Saved match picks with frozen probability, automatic win/loss resolution, and a personal ledger
- Team, player, and event watchlists stored on the current device
- Personal match feed assembled from followed teams and tournaments
- Direct navigation from the personal desk into series, team, player, and event intelligence
- Stable match-room URLs with one-click sharing and automatic restoration of the selected date, series, forecast, and veto context
- Notifications for published vetoes, changed probabilities, roster substitutions, match starts, and results are implemented locally
- Opening-to-current and closing probability history is implemented locally; cross-device account sync remains next
- Shareable event rooms, bracket views, and tamper-safe Pick'Em routes with custom Swiss overrides are implemented
- Versioned Desk Links move follows and saved picks between devices through an explicit, non-destructive import; private signal history stays on the originating device

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

Current monitoring covers Tier 1, Tier 2, BO1, and BO3 with a 40-series minimum gate. BO5 remains visibly sample-pending until its chronological test window reaches the same threshold. Online result rows are backfilled from the verified archive whenever a source omits match time, so new evidence cannot silently enter the beginning of a time fold.

Tier 2 now has a separately gated confidence calibration layer. It keeps the same match winner while shrinking unreliable margins toward 50%; the active holdout moved Tier 2 log loss from 0.700 to 0.691 and ECE from 13.3 to 5.7 points without reducing accuracy.

## Release 1.4: Tournament Compiler

Status: format compiler and reusable bracket engines implemented.

- One normalized stage blueprint for Swiss, GSL, round robin, single elimination, double elimination, and mixed events
- Self-building playoff fields from declared qualifier counts or conservative format defaults
- Published match and round overlays that replace projections without rebuilding the page
- Shared structure for event timeline, format explanation, projected matches, and bracket rendering

Next: ingest organizer-native seeds, bracket slot dependencies, and best-of rules when the live worker is available.

The Swiss projection now declares its owning event rather than relying on a tournament-specific frontend switch. Future promoted Major snapshots can therefore activate the same bracket and Pick'Em UI without a site release.

## Release 1.5: Reliable Live Circuit

Status: scheduled dual-path refresh implemented; production source success is monitored by GitHub Actions.

Implemented:

- Prefer the Oracle Always Free worker when capacity is available
- Fall back to a pinned ephemeral FlareSolverr worker on the free GitHub Actions runner
- Refresh hourly and preserve the last verified release on any source or validation failure
- Serve the last verified Tier 1/2 live contract from `/api/live-snapshot` while Oracle capacity is unavailable
- Back off Oracle provisioning attempts on API rate limits instead of reporting expected capacity pressure as a broken release

Next reliability depth:

- Cache HLTV responses, use incremental cursors, and back off automatically on source pressure
- Refresh active matches frequently and future event fields less often
- Update lineups on every eligible Tier 1/2 match detail and refresh full player profiles on a slower rotation
- Keep Vercel stateless and preserve the last verified release whenever the worker or a source is unhealthy

Current progress: eligible HLTV lineup records now flow through the Tier gate into the live player registry and browser merge path, even when the collector omits a separate player payload. Broader match-detail coverage remains the limiting factor.

## Release 2: CS2 Data Platform

Priority: after the consumer desk proves repeat use.

- Durable historical warehouse on the Always Free worker with raw-response caching and replayable ingestion
- Team and player timelines, head-to-head explorer, map matchup matrices, and event archive
- Read-only API for current/historical matches, probabilities, events, player profiles, rankings, and event-bound bracket state is implemented
- Embeddable responsive match-prediction cards for tournament sites and creators are implemented

Implemented foundation:

- Compact public history contract generated from 1,031 verified Tier 1/2 warehouse matches
- Team head-to-head explorer with opponent switching, current-lineup-era splits, recent meetings, and comparative map matrices
- Searchable archive with 48 historical event rooms, result ledgers, event-only team records, map footprints, and inferred playoff brackets
- Player Intelligence profiles with Overview, map-by-map performance, event form, recent-series ledger, and roster-era views across 53 covered players
- Lazy browser loading so the historical dataset does not slow the initial match desk
- Automatic append path for newly completed eligible matches in every verified live refresh
- Public `/api/catalog` with Tier-1/2 validation, bounded pagination, CORS, and summary-by-default responses
- `/embed/?match=<id>` forecast cards backed by the merged live-plus-model catalog contract
- `/embed/bracket/?event=<id>` event paths backed by one normalized Swiss, playoff, published-lane, or schedule-derived bracket contract

Next platform depth: move the same contracts to the durable Always Free worker and keep the Vercel catalog as the last-good read replica.

## Product Order After Live Ingest

1. Player timelines and comparisons: series form, ADR, K/D, opponent history, map performance, event splits, roster-era views, and shareable two-player comparisons are implemented; role movement and larger historical coverage remain next.
2. Accounts and alerts: browser-local picks, watchlists, signal alerts, closing probability history, and portable Desk Links are live; authenticated cross-device sync remains next.
3. Match explanation engine: implemented with ranked positive signals, the strongest counter-signal, and one prioritized uncertainty flag for every call.
4. Historical explorer: head-to-head, lineup-era splits, map matchup matrices, and standalone event archives are implemented.
5. Public catalog API, match embeds, and event-bracket embeds are implemented; partner theming remains after repeat usage is proven.

## Promotion Rules

No release may claim live data when the source is stale, show an unverified low-tier event as Tier 1/2, or promote a model because accuracy alone increased. Model promotion requires a chronological holdout improvement in log loss and Brier score, no material calibration regression, and a minimum event sample.
