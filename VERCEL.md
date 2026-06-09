# Vercel Fallback Deployment

Vercel can host the static predictor and API fallback if Netlify deployment is blocked.

## What Works Immediately

- Publishes the static app from `docs/`.
- Serves `/api/predictions`.
- Falls back to `docs/data/predictions.json`.
- Schedules `/api/refresh` every 15 minutes.

## What Needs Storage

Vercel Functions cannot persist refreshed prediction data on the local filesystem. To make live updater results durable, add one of:

- Vercel Blob, using `BLOB_READ_WRITE_TOKEN`.
- An external snapshot URL, exposed as `PREDICTIONS_SNAPSHOT_URL`.
- A small backend worker/VPS that writes the latest `predictions.json`.

## Docker / FlareSolverr

You still do not need Docker on your laptop if FlareSolverr is hosted remotely.

Vercel should call a remote FlareSolverr service or a backend worker. Like Netlify, Vercel serverless functions are not the right place to run FlareSolverr itself.
