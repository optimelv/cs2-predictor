# StrikeSignal Data Boundary

The product consumes one normalized snapshot. Collectors can change without changing the frontend as long as they publish this contract.

The machine-readable endpoint contract is [`live-snapshot.schema.json`](./live-snapshot.schema.json).

## Stable identities

- `event.id`, `match.match_id`, and future `team.team_id` values must remain stable across refreshes.
- Display names may change without creating duplicate records.
- Source-specific IDs should be namespaced when collisions are possible, for example `hltv:2389912`.

## Snapshot endpoint

`GET /api/live-snapshot` may return any combination of `events`, `matches`, and `rankings`. The browser upserts records by stable ID, falls back to event plus matchup plus start time, and recalculates visible forecasts after each merge.

```json
{
  "ok": true,
  "contract_version": "1.0",
  "fetched_at_utc": "2026-07-12T20:00:00Z",
  "poll_after_ms": 180000,
  "events": [],
  "matches": [],
  "rankings": null
}
```

## Extending formats

Events use `format.type` plus optional `format.stages` and `format.settings`. Built-in renderers cover `swiss`, `gsl`, `single_elimination`, `double_elimination`, `round_robin`, and `mixed`. Unknown structures fall back to the declared stage graph rather than breaking the event room.

## Source adapter responsibilities

1. Fetch HLTV, Liquipedia, Valve, or another source outside the request path.
2. Resolve source names to stable team and event IDs.
3. Normalize timestamps to ISO 8601 UTC.
4. Publish only changed records and an honest `fetched_at_utc`.
5. Keep the last good snapshot when a source is blocked or incomplete.
