# CS2 HLTV API Access Report

Date: 2026-06-08

## What Worked

- `SocksPls/hltv-api` is the first third-party HLTV wrapper that returned real data from this environment.
- The working function was `get_results()`.
- Latest run returned 112 HLTV result rows.
- Ingestion loaded those rows into the SQLite warehouse and increased `hltv_result_matches` from 835 to 903.
- The refreshed model dataset now has 899 match rows.
- The benchmark now covers 132 holdout matches across IEM Cologne Major 2026, PGL Astana 2026, and IEM Atlanta 2026.

## Current Benchmark After Ingest

- Best pure pre-event prediction: 87 / 132 = 65.9%.
- Best post-veto/map-known prediction: 98 / 132 = 74.2%.
- High-confidence post-veto/map-known predictions remain the stronger product path.
- Cologne Stage 2 is still partially live/current in the warehouse: 28 of 30 local Stage 2 rows are scored.

## Wrapper Review

| Source | Status | Usefulness |
|---|---|---|
| `SocksPls/hltv-api` | Worked for latest results | Keep as a slow latest-result backfill lane |
| `hltv-async-api` | Installed, but returned connection failures | Not reliable here |
| `gigobyte/HLTV` | Useful Node API shape, but direct access is Cloudflare-prone | Keep for resumable queues if protected access improves |
| `M3MONs/hltv-scraper-api` | Good endpoint coverage for rankings/results/matches/players | Promising, but still direct scraping unless paired with browser/proxy |
| `Gabrielcnetto/HLTV-api` | Good endpoint design for match stats and map stats | Needs Go plus ROD/browser runtime, unavailable here |
| `SilvanoGPM/hltv-api` | Puppeteer/Redis/browser-oriented | Needs Node/Docker-style runtime, unavailable here |
| `fanden/hltv-match-api` | Playwright/Browserless live/upcoming design | Needs Java 17 plus Browserless/Docker, unavailable here |
| `Zsunamy/HLTVDiscordBridge` | Discord bot/client project | Less useful for historical model data |

## Why Direct Access Failed Even With “APIs”

Most public “HLTV APIs” are wrappers, not official stable feeds. They still scrape HLTV pages underneath, so they inherit the same Cloudflare, TLS fingerprint, JavaScript challenge, and markup-change problems. The API wrapper can make parsing easier, but it does not automatically bypass HLTV access protection.

## FlareSolverr Plan

I added `work/cs2_predictor/collect_hltv_flaresolverr.py`.

It posts to a running FlareSolverr service and saves the returned HLTV HTML/cookies into `work/data/raw/hltv/flaresolverr_probe.json`.

Current probe result: connection refused, because no FlareSolverr service is running at `http://localhost:8191/v1`.

What I need from you:

- Best option: run FlareSolverr locally with Docker Desktop.
- Command if Docker is available on your machine:

```bash
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
```

- Alternative: give me a reachable FlareSolverr URL, for example `http://localhost:8191/v1` or a private remote endpoint.

After that, I can run:

```bash
python3 -m work.cs2_predictor.collect_hltv_flaresolverr --hltv-url https://www.hltv.org/results
```

## Apify Plan

The provided Apify actor is `paco_nassa/hltv-org-live-and-upcoming-matches`.

What I need from you:

- `APIFY_API_TOKEN`.
- Approval for expected spend/usage, because the actor page shows pricing per result.
- Optional: tell me whether you want to use only the provided actor or also test related Apify actors for HLTV ranking/team info.

Expected endpoint:

```text
https://api.apify.com/v2/acts/paco_nassa~hltv-org-live-and-upcoming-matches/run-sync-get-dataset-items?token=<YOUR_API_TOKEN>
```

Important caveat: this actor is useful for live/upcoming/completed match feed freshness. It is probably not enough for our full historical model alone, especially player-level stat windows and map-level historical detail.

## Recommended Data Strategy

- Keep SocksPls as a current-results fallback lane.
- Use FlareSolverr or Apify for protected/live HLTV pages.
- Continue using Liquipedia for broad match/event/stage structure.
- Use HLTV as source of truth for ranking snapshots, match IDs, map vetoes, maps, and player stats whenever access succeeds.
- Treat all wrappers as replaceable ingestion lanes feeding the same SQLite schema, not as the core system.
