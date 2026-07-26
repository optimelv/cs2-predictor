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

## Product tiers

Every normalized event receives `product_tier`: `tier_1`, `tier_2`, `excluded`, or `pending`. Only Tier 1/2 events enter the public calendar and match desk. Explicit organizer/source tiers win over name inference; CCT and Roman Imperium are accepted Tier 2 series, while C-Tier and unverified events remain available to the warehouse but not to the product.

## Players and lineups

Player records use a stable `player_id`, preferably namespaced from the source. Match records may include `lineups.team1` and `lineups.team2`; these lightweight updates refresh team membership without replacing slower-moving rating and trait profiles. The frontend preserves the richer existing profile when a live lineup only contains an ID, nickname, and team.

## Source adapter responsibilities

1. Fetch HLTV, Liquipedia, Valve, or another source outside the request path.
2. Resolve source names to stable team and event IDs.
3. Normalize timestamps to ISO 8601 UTC.
4. Publish only changed records and an honest `fetched_at_utc`.
5. Keep the last good snapshot when a source is blocked or incomplete.
