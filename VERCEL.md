# Vercel Deployment

Vercel serves the static product from `docs/` and the lightweight API routes in `api/`.

## Live behavior

- `docs/data/predictions.json` is the committed model snapshot served with the static product.
- `/api/live-major` proxies the public Major score feed with a short CDN cache.
- The browser checks that feed once a minute while the page is visible, overlays current results onto the committed model snapshot, and reruns the Swiss and playoff simulations.
- The Apify refresh is manual-only, so the free-plan credits cannot be consumed by an unattended schedule.

## Required setup

1. Import `optimelv/cs2-predictor` into Vercel.
2. Keep the framework preset as `Other`.
3. Vercel reads `vercel.json`, runs `npm run build`, and publishes `docs/`.
4. Add `APIFY_API_TOKEN` as a GitHub Actions repository secret, not as a public browser variable.

## FlareSolverr

FlareSolverr is a persistent Chromium service and cannot run inside Vercel Functions. Use one of these two deployment modes instead:

1. Run a short-lived FlareSolverr Docker container in GitHub Actions for periodic HLTV refreshes. This is the default no-cost option for the public repository, but scheduled jobs are not guaranteed to start at the exact requested minute.
2. Run FlareSolverr on a small always-on VM, then expose only a protected collector endpoint that returns sanitized match JSON. Do not publish the raw FlareSolverr port as an open browser proxy.

The current Major score overlay uses the public event feed through `/api/live-major`, so it does not require FlareSolverr or a personal computer to remain online.

The manual refresh workflow refuses to change the snapshot timestamp when the live feed is missing or invalid. This prevents stale data from being presented as fresh.
