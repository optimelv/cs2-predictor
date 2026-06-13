# Vercel Deployment

Vercel serves the static product from `docs/` and the lightweight API routes in `api/`.

## Live behavior

- `docs/data/predictions.json` is the committed model snapshot served with the static product.
- `/api/live-major` proxies the public Major score feed with a short CDN cache.
- The browser checks that feed once a minute while the page is visible, overlays current results onto the committed model snapshot, and reruns the Swiss and playoff simulations.
- GitHub Actions refreshes deeper HLTV schedule and veto details every six hours when `APIFY_API_TOKEN` is configured.

## Required setup

1. Import `optimelv/cs2-predictor` into Vercel.
2. Keep the framework preset as `Other`.
3. Vercel reads `vercel.json`, runs `npm run build`, and publishes `docs/`.
4. Add `APIFY_API_TOKEN` as a GitHub Actions repository secret, not as a public browser variable.

## FlareSolverr

FlareSolverr is a persistent Chromium service and should not run inside Vercel Functions. It can run as an ephemeral Docker container in a GitHub Actions deep-refresh job or on a separate container host. The website and live score updates do not require Docker on a personal computer.

The scheduled workflow refuses to change the snapshot timestamp when the live feed is missing or invalid. This prevents stale data from being presented as fresh.
