# StrikeSignal

StrikeSignal is a CS2 match and tournament intelligence product. It combines pre-veto probabilities, map-aware reads, live series state, event-format simulations, and Valve Regional Standings in one responsive desk.

## Product surfaces

- Match desk with live, upcoming, and completed series filters
- Browser-local saved picks with frozen probabilities and automatic result scoring
- Veto-aware map outlooks with low-data safeguards
- Format-native event rooms for Swiss, GSL, knockout, double elimination, round robin, and custom stage graphs
- Universal tournament trees that merge official scores with projected future rounds
- Complete tournament fields, official team crests, title shares, and projected opening paths
- Player explorer with team rosters, HLTV Rating 3.0, map sample, and seven skill dimensions
- Clickable team intelligence profiles and universal team/player/event search
- Official VRS table with a separate movement forecast

The implemented release scope and next product bets are tracked in [`ROADMAP.md`](ROADMAP.md).

## Architecture

The frontend consumes a normalized, versioned snapshot and does not depend on any collector implementation. Stable event and match IDs, source normalization, format settings, live upserts, and build-time validation are documented in [`contracts/README.md`](contracts/README.md).

The hosted collector implements `GET /api/live-snapshot`. Snapshot contract `1.1` carries event stages, schedule and result rows, series scores, map order, map results, veto text, players, and match lineups. The browser merges those updates without replacing richer tournament fields, player profiles, or format definitions.

The portable model registry evaluates challengers on purged chronological folds. A challenger is promoted only when log loss improves without material Brier, accuracy, or calibration regression; otherwise the last verified champion remains active in both Python exports and the browser runtime.

The Oracle deployment under `infra/oracle/` provisions only the Frankfurt Always Free A1 shape with a hard limit of 1 OCPU, 6 GB memory, and a 50 GB boot volume. A scheduled GitHub Action retries capacity safely, keeps FlareSolverr private, and publishes the worker endpoint only after the VM is running. The worker keeps a last-good snapshot and limits detail-page requests to live or near-start series.

## Development

```bash
npm install
npm run check
npm run dev
```

Vercel builds the static product from `docs/` and serves API routes from `api/`.
