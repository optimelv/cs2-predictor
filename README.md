# StrikeSignal

StrikeSignal is a CS2 match and tournament intelligence product. It combines pre-veto probabilities, map-aware reads, live series state, event-format simulations, and Valve Regional Standings in one responsive desk.

## Product surfaces

- Match desk with live, upcoming, and completed series filters
- Veto-aware map outlooks with low-data safeguards
- Format-native event rooms for Swiss, GSL, knockout, double elimination, round robin, and custom stage graphs
- Complete tournament fields, official team crests, title shares, and projected opening paths
- Official VRS table with a separate movement forecast

## Architecture

The frontend consumes a normalized, versioned snapshot and does not depend on any collector implementation. Stable event and match IDs, source normalization, format settings, live upserts, and build-time validation are documented in [`contracts/README.md`](contracts/README.md).

The future hosted collector only needs to implement `GET /api/live-snapshot`. The current product already handles event, match, veto, score, ranking, and field updates from that endpoint.

The Oracle deployment under `infra/oracle/` provisions only the Frankfurt Always Free A1 shape with a hard limit of 1 OCPU, 6 GB memory, and a 50 GB boot volume. A scheduled GitHub Action retries capacity safely, keeps FlareSolverr private, and publishes the worker endpoint only after the VM is running.

## Development

```bash
npm install
npm run check
npm run dev
```

Vercel builds the static product from `docs/` and serves API routes from `api/`.
