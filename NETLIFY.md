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

## Optional Netlify Environment Variables

- `REFRESH_SECRET`: protects `/api/refresh` from public/manual refresh calls.
- `SITE_URL`: canonical deployed site URL if Netlify `URL` is not enough.
- `FLARESOLVERR_TIMEOUT_MS`: defaults to `90000`.

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
