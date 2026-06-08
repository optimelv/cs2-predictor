# CS2 HLTV API Access Report

Date: 2026-06-08

## What Worked

- FlareSolverr is now reachable through Docker's mapped host port `http://localhost:55000/v1`.
- A FlareSolverr fetch of `https://www.hltv.org/results` returned a full HLTV page with about 6.2 MB of HTML.
- The new paginated FlareSolverr results collector fetched offsets `0` and `100`, parsed 200 compact HLTV result rows, and loaded them into the warehouse.
- `SocksPls/hltv-api` is the first third-party HLTV wrapper that returned real data from this environment.
- The working function was `get_results()`.
- Latest run returned 112 HLTV result rows.
- Current warehouse result coverage is 973 HLTV result matches.
- The refreshed model dataset now has 970 match rows.
- The benchmark now covers 133 holdout matches across IEM Cologne Major 2026, PGL Astana 2026, and IEM Atlanta 2026.

## Current Benchmark After Ingest

- Best pure pre-event prediction: 88 / 133 = 66.2%.
- Best post-veto/map-known prediction: 99 / 133 = 74.4%.
- High-confidence post-veto/map-known predictions remain the stronger product path.
- Cologne Stage 2 is still partially live/current in the warehouse: 29 of 30 local Stage 2 rows are scored.

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

I added `work/cs2_predictor/collect_hltv_flaresolverr.py`, `work/cs2_predictor/collect_hltv_flaresolverr_results_pages.py`, and `work/cs2_predictor/ingest_hltv_flaresolverr_results.py`.

They post to a running FlareSolverr service, parse HLTV result cards, and save compact match rows for ingestion.

Current probe result: working through `http://localhost:55000/v1`.

Current working command:

```bash
python3 -m work.cs2_predictor.collect_hltv_flaresolverr_results_pages \
  --flaresolverr-url http://localhost:55000/v1 \
  --start-offset 0 \
  --pages 2 \
  --delay-seconds 5 \
  --out work/data/raw/hltv/flaresolverr_results_pages_0_100.json
```

If you want a fixed host port instead of Docker's random `55000` mapping, recreate the container with:

```bash
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
```

Then the collector can use:

```bash
--flaresolverr-url http://localhost:8191/v1
```

## Apify Plan

The provided Apify actor is `paco_nassa/hltv-org-live-and-upcoming-matches`.

Test result:

- Authentication worked with the provided token.
- The actor ID `J40GPeE23znOF83ep` resolves to `paco_nassa/hltv-org-live-and-upcoming-matches`.
- A small synchronous run with `maxMatches = 5` completed successfully.
- The returned dataset shape was one item containing `matches`.
- The returned `matches` array was empty, so this actor is not yet proven useful for live match coverage.
- I added `work/cs2_predictor/collect_hltv_apify.py` for future runs without hardcoding the token.

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
