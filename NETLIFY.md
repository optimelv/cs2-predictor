# Netlify Deployment

This project can run as a Netlify-hosted static site with a small live updater.

## What Netlify Does

- Publishes the static site from `docs/`.
- Serves `/api/predictions` from Netlify Blobs when a live snapshot exists.
- Falls back to `docs/data/predictions.json` when no live snapshot exists yet.
- Runs `refresh-scheduled` every 15 minutes.
- Queues `refresh-background`, which can refresh live map/veto data through a remote FlareSolverr service.

## Required Netlify Environment Variables

- `FLARESOLVERR_URL`: remote FlareSolverr endpoint, for example `https://your-flaresolverr-host.example.com/v1`.
- `REFRESH_SECRET`: shared secret for the scheduled-to-background refresh request. The refresh function fails closed when it is missing.

## Optional Netlify Environment Variables

- `SITE_URL`: canonical deployed site URL if Netlify `URL` is not enough.
- `FLARESOLVERR_TIMEOUT_MS`: defaults to `90000`.

Manual refresh requests must send `x-refresh-secret`; URL query secrets are not accepted. Without `REFRESH_SECRET`, the scheduled function returns `503` and preserves the last stored snapshot.

Live veto overlays only copy map names observed in the upstream page. They do not invent map win rates or replace validated model probabilities when the source does not publish map evidence.

## Do You Need Local Docker?

No, not once `FLARESOLVERR_URL` points to a remote Docker host.

Local Docker is only needed when you want to test or refresh from your own machine. For production, run FlareSolverr on a Docker-capable host such as Railway, Render, Fly.io, Hetzner, or a small VPS, then set that URL in Netlify.

Netlify itself should not run FlareSolverr. Netlify Functions are serverless jobs; FlareSolverr is a long-running Chromium service.

## Deployment Shape

```text
Netlify site
  -> /api/predictions
  -> Netlify Blobs latest snapshot
  -> scheduled/background refresh
  -> remote FlareSolverr Docker service
  -> HLTV match pages
```

The deeper Python/SQLite model rebuild can still run in GitHub Actions or on a small backend worker. Netlify handles the public site and lightweight live overlay.
