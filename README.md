# StrikeSignal

StrikeSignal is a CS2 match and tournament intelligence product. It combines pre-veto probabilities, map-aware reads, live series state, event-format simulations, and Valve Regional Standings in one responsive desk.

## Product surfaces

- Match desk with live, upcoming, and completed series filters
- Stable shareable match rooms that restore the selected date, series, forecast, and veto context
- Browser-local saved picks with frozen probabilities and automatic result scoring
- Personal Signal Center for probability movement, closing lines, vetoes, lineups, match starts, and results
- Veto-aware map outlooks with low-data safeguards
- Format-native event rooms for Swiss, GSL, knockout, double elimination, round robin, and custom stage graphs
- Shareable event rooms that preserve the active overview, schedule, bracket, format, or field view
- Shareable Pick'Em routes that preserve custom Swiss results and recalculate the success probability against current model state
- Universal tournament trees that merge official scores with projected future rounds
- Complete tournament fields, official team crests, title shares, and projected opening paths
- Player explorer with team rosters, HLTV Rating 3.0, map sample, and seven skill dimensions
- Shareable two-player comparisons with synchronized form charts, production metrics, trait leads, and map-by-map samples
- Clickable team intelligence profiles and universal team/player/event search
- Historical matchup explorer with lineup-era splits, recent meetings, and map-by-map comparisons
- Official VRS table with a separate movement forecast

The implemented release scope and next product bets are tracked in [`ROADMAP.md`](ROADMAP.md).

## Architecture

The frontend consumes a normalized, versioned snapshot and does not depend on any collector implementation. Stable event and match IDs, source normalization, format settings, live upserts, and build-time validation are documented in [`contracts/README.md`](contracts/README.md).

The hosted collector implements `GET /api/live-snapshot`. Snapshot contract `1.1` carries event stages, schedule and result rows, series scores, map order, map results, veto text, players, and match lineups. The browser merges those updates without replacing richer tournament fields, player profiles, or format definitions.

When Oracle Always Free capacity is unavailable, the same endpoint serves `docs/data/live-snapshot.json`, the last verified Tier 1/2 snapshot promoted by the scheduled GitHub Actions collector. It never exposes an unfiltered lower-tier feed and keeps the product operational without pretending the persistent worker is healthy.

Eligible match lineups are promoted into lightweight live player records even when a collector does not publish a separate player array. Only players attached to already accepted Tier 1/2 matches cross this boundary; the browser merges their current team and nickname without replacing richer ratings, traits, map profiles, or career timelines.

The historical explorer lazy-loads `docs/data/history.json`, a compact contract generated from the normalized warehouse with `npm run build:history`. It contains only Tier 1/2 product rows; verified completed live matches are appended during the same refresh that updates predictions, players, and event state. The same contract powers searchable event archives, historical result ledgers, participant records, and reconstructed playoff brackets.

Player contract `1.3` adds verified Tier 1/2 series timelines, map-by-map rating/ADR/K-D splits, event form, and roster-era summaries. The browser exposes these as Overview, Maps, and Career views while the live promotion path preserves and incrementally extends the same history.

Swiss projection contracts declare their owning `event_id`. This keeps the tournament renderer independent from a hard-coded Major name: a future event activates the same interactive bracket and Pick'Em route when its promoted projection supplies stable seeds, rounds, and official result overlays.

Personal signals use a versioned browser-local contract keyed by stable match ID. It stores a bounded probability timeline, the final pre-match closing line, and relevant changes for followed teams, events, or saved picks. The same shape is intentionally portable to future account sync; the current release does not pretend anonymous local data is cloud-backed.

The portable model registry evaluates challengers on purged chronological folds. A challenger is promoted only when log loss improves without material Brier, accuracy, or calibration regression globally and across eligible Tier 1, Tier 2, BO1, BO3, and BO5 slices. Online rows are chronology-checked and repaired from the verified match archive before every run; otherwise the last verified champion remains active in both Python exports and the browser runtime.

Segment calibration is promoted independently from model weights. The active `tier2-shrink-v1` layer reduces overconfident Tier 2 probabilities only after improving Tier 2 log loss, Brier, and ECE without harming aggregate accuracy or loss gates. Prediction rows carry the calibration version and shrink factor so refreshes and registry syncs remain idempotent.

The refresh pipeline runs hourly at minute 17. It prefers the persistent Oracle Always Free worker, but automatically starts a pinned, short-lived FlareSolverr `v3.5.0` service inside the GitHub Actions runner when Oracle is unavailable. Both paths produce the same provider-neutral snapshot, enforce the Tier 1/2 boundary before training, reject future or stale source timestamps, and preserve the last verified release whenever acquisition, freshness, model, or validation gates fail. The optional Oracle deployment under `infra/oracle/` is still constrained to the Frankfurt Always Free A1 shape with 1 OCPU, 6 GB memory, and a 50 GB boot volume.

## Development

```bash
npm install
npm run check
npm run dev
```

Vercel builds the static product from `docs/` and serves API routes from `api/`.

## Public catalog

`GET /api/catalog` exposes the current Tier-1/2 product catalog. Add `resource=matches`, `events`, `players`, `rankings`, or `brackets`; optional filters include `team`, `event`, `status`, `region`, `q`, date bounds, `limit`, and `cursor`. Historical matches require `history=true`. Full match/player detail and bracket state require an exact ID, keeping default responses compact.

Match forecasts can be embedded with `/embed/?match=<stable-match-id>`. The responsive card reads the public catalog, includes current model probability, predicted winner, maps, event context, and a link back to the complete Match Room. When a verified prediction is unavailable it shows a pending state rather than inventing a probability.

Event paths can be embedded with `/embed/bracket/?event=<stable-event-id>`. The responsive bracket compiles organizer-published lanes, Major Swiss projections, playoff rounds, or the verified match schedule into one versioned view and links every known series back to its Match Room.
