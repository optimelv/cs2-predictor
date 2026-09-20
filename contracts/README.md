# StrikeSignal Data Boundary

The product consumes one normalized snapshot. Collectors can change without changing the frontend as long as they publish this contract.

The machine-readable endpoint contract is [`live-snapshot.schema.json`](./live-snapshot.schema.json).

## Stable identities

- `event.id`, `match.match_id`, and future `team.team_id` values must remain stable across refreshes.
- Display names may change without creating duplicate records.
- Source-specific IDs should be namespaced when collisions are possible, for example `hltv:2389912`.

## Snapshot endpoint

`GET /api/live-snapshot` may return any combination of `events`, `matches`, `players`, and `rankings`. The browser upserts records by stable ID, falls back to event plus matchup plus start time, and recalculates visible forecasts after each merge.

```json
{
  "ok": true,
  "contract_version": "1.1",
  "fetched_at_utc": "2026-07-12T20:00:00Z",
  "poll_after_ms": 180000,
  "events": [],
  "matches": [],
  "players": [],
  "rankings": null
}
```

## Extending formats

Events use `format.type` plus optional `format.stages` and `format.settings`. A stage may declare its own `type`, `status`, and `settings`, allowing multi-stage events to move from groups into Swiss or playoffs without a one-off frontend. Built-in renderers cover `swiss`, `gsl`, `single_elimination`, `double_elimination`, `round_robin`, and `mixed`. Unknown structures fall back to the declared stage graph rather than breaking the event room.

Published knockout structures use `event.bracket.rounds`. Every round has a stable `id`, `order`, lane (`main`, `upper`, or `lower`), and normalized matches. Match `slot_id` and `feeds_from` fields preserve bracket position across refreshes; unresolved rounds may be simulated without replacing official scores.

Interactive Swiss projections declare `major_projection.event_id`, `seed_rows`, `current_stage_board.rounds`, and optional `playoff_bracket`. The browser activates the projection only for the matching stable event ID. Pick'Em URLs carry a bounded list of match-key and winner overrides; every winner is revalidated against the paired teams before it can affect deterministic or Monte Carlo simulation.

## Product tiers

Every normalized event receives `product_tier`: `tier_1`, `tier_2`, `excluded`, or `pending`. Only Tier 1/2 events enter the public calendar and match desk. Explicit organizer/source tiers win over name inference; CCT and Roman Imperium are accepted Tier 2 series, while C-Tier and unverified events remain available to the warehouse but not to the product.

## Players and lineups

Player records use a stable `player_id`, preferably namespaced from the source. Match records may include `lineups.team1` and `lineups.team2`; these lightweight updates refresh team membership without replacing slower-moving rating and trait profiles. The frontend preserves the richer existing profile when a live lineup only contains an ID, nickname, and team.

If a source omits the top-level `players` array, the product filter derives lightweight player updates from eligible match lineups. It never derives players before the Tier 1/2 event filter, and it drops unscoped top-level player records that cannot be connected to an eligible match.

## Personal signal state

The browser-local signal contract is keyed by stable match ID and records at most 24 observations for each of 300 recent matches. A transition may produce probability-movement, veto, lineup, live, or final notifications only when the match belongs to a followed team/event or a saved pick. The last upcoming probability is frozen as `closing_prob_team1` when a match first becomes live or final. Older or repeated snapshots cannot move the timeline backward or duplicate alerts.

## Public catalog API

`GET /api/catalog` returns a resource manifest. `resource=matches`, `events`, `players`, `rankings`, or `brackets` returns a bounded response. Match queries use current data by default and verified history with `history=true`. Filters are server-side and responses default to compact summaries; `detail=full` and bracket state require an exact ID.

The API validates every current match and event against the published Tier-1/2 product filter and every historical match against its normalized tier before serving data. Responses allow read-only cross-origin access, cap page size at 100, and never expose collector credentials or raw source payloads.

Current match responses merge live score/veto/lineup state with the latest promoted model row by stable match ID. Missing source IDs use the same deterministic matchup-and-start-time key as the browser. This keeps prediction probabilities available without discarding newer live fields.

## Model monitoring

`docs/data/model-registry.json` publishes aggregate champion/challenger metrics plus identical purged-chronological slices for Tier 1, Tier 2, BO1, BO3, and BO5. A slice becomes promotion-eligible at 40 test series; smaller slices remain visible as sample-pending. Every online training row must carry a verified date and positive timestamp, with missing source times repaired from the Tier 1/2 history contract before evaluation.

`champion.segment_calibration` is a versioned probability layer evaluated separately from model promotion. Tier 2 prediction rows publish matching `calibration_version` and `calibration_shrink` fields; synchronization reverses any previous shrink before applying a new version, making repeated publication idempotent.

## Match embeds

`/embed/?match=<stable-match-id>` renders a read-only responsive forecast card from an exact full-detail catalog query. It reports its rendered height to a parent frame through `strikesignal:resize`, supports reduced-motion preferences, links back to the canonical Match Room, and renders an explicit pending state when no promoted probability exists.

## Bracket embeds

`/embed/bracket/?event=<stable-event-id>` consumes the exact event-bound `brackets` catalog resource. Its `lanes[].rounds[].matches[]` contract normalizes published upper/lower brackets, Swiss record groups, playoff stages, and schedule-only feeds without inventing official results. Empty future playoff slots remain `TBD`, known series link to canonical Match Rooms, and the frame reports its rendered height through `strikesignal:resize`.

## Source adapter responsibilities

1. Fetch HLTV, Liquipedia, Valve, or another source outside the request path.
2. Resolve source names to stable team and event IDs.
3. Normalize timestamps to ISO 8601 UTC.
4. Publish only changed records and an honest `fetched_at_utc`.
5. Keep the last good snapshot when a source is blocked or incomplete.
