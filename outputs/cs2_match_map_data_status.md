# CS2 Match And Map Data Status

Date: 2026-06-08

## Short Answer

Before this pass, we did **not** have full map-level data. The warehouse had rankings, rosters, player queues/snapshots, VRS match factors, and Liquipedia series-level match history, but it did not know which maps were played or map-level scores.

After this pass, the warehouse has a first reproducible map-level dataset:

| Table | Rows | Meaning |
|---|---:|---|
| `hltv_result_matches` | 713 | Series-level match rows parsed from Liquipedia `Match` templates, with HLTV IDs when present |
| `hltv_match_maps` | 1,837 | Per-map rows with map name, map score, winner, and stats ID when present |
| `team_map_win_rates` | 399 | Derived team/map win-rate rows as of 2026-06-08, after canonical alias matching |
| `map_pool_snapshots` | 9 | Active/removed map pool snapshot rows |
| `hltv_match_vetoes` | 4,858 | Pick/ban/decider actions from enriched HLTV match details |

## Current Active Map Pool Snapshot

Active Duty as stored for 2026-06-08:

Ancient, Anubis, Dust2, Inferno, Mirage, Nuke, Overpass

Removed from Active Duty but still relevant historically:

Train, Vertigo

Notes:

- Valve’s January 2026 update added Anubis and removed Train from Active Duty.
- Current third-party map-pool references checked on 2026-06-08 list Ancient, Anubis, Dust2, Inferno, Mirage, Nuke, and Overpass as Active Duty.
- Train still appears in 2025 historical matches and should remain valid for historical model training.
- Training features should filter by the active pool that applied at match time, not only the current pool.

## Data Collected In This Pass

The collector now reads Liquipedia tournament wikitext and parses `Match` and `Map` templates. This is better than only scraping team match pages because tournament pages contain the actual map-level score data.

Events currently included include:

- IEM Cologne Major 2026 Stage 1 and Stage 2 current data through 2026-06-08
- IEM Atlanta 2026
- IEM Rio 2026
- PGL Astana 2026
- IEM Krakow 2026
- BLAST Open Spring 2026
- BLAST Bounty Winter/Fall events
- ESL Pro League Season 22
- StarLadder Budapest Major 2025 stages
- BLAST Austin Major 2025 stages
- Esports World Cup 2025

Map row distribution:

| Map | Rows | Scored Rows |
|---|---:|---:|
| Mirage | 346 | 280 |
| Dust2 | 317 | 262 |
| Inferno | 297 | 243 |
| Nuke | 279 | 214 |
| Ancient | 246 | 207 |
| Overpass | 157 | 125 |
| Train | 105 | 87 |
| Anubis | 67 | 52 |
| TBA | 21 | 0 |
| Cache | 1 | 1 |
| Contact | 1 | 1 |

`TBA` rows are upcoming/unplayed map placeholders and should be excluded from training but retained for live prediction workflows. `Contact` is a non-standard/showmatch-style map row and should be filtered out of serious training.

## Important Caveats

This is **not yet the full top-200 last-year map database**. It is the first working map-level backfill across current/recent Tier-1 events.

Known issues to fix before serious modeling:

- Liquipedia match templates often store team shorthand such as `vit`, `navi`, `gl`, or `fq`. These must be resolved to canonical HLTV/VRS teams before training, otherwise the model will treat aliases as separate teams.
- Veto/pick-ban data is collected for the 704 HLTV-enriched matches, but not for the 9 still-blocked match pages.
- Player profile collection is still partial: 50 fetched, 903 queued from the HLTV top-200 ranking snapshot.
- Liquipedia team match-history coverage has expanded to 6,215 rows across 55 teams from the combined top-50 VRS/HLTV queue, but most newly discovered events still need slow map/stage parsing.
- Match-fixing/integrity handling still needs tier filters, VRS/HLTV rank thresholds, suspicious event exclusions, and time-aware validation.

## Source Connector Decision

I checked the user-suggested HLTV options:

- `gigobyte/HLTV` is the best schema/reference for what we want because it exposes result, match, match-map-stats, team-stats, and player-stats concepts. It is marked as no longer actively maintained and warns that abusive use can trigger HLTV/Cloudflare blocking.
- `hltvorg-api` is older Selenium-based tooling and is too shallow for our historical map-backfill need.
- `Gabrielcnetto/HLTV-api` has useful endpoints including match and match-stats, but it is another scraper service and would still need Cloudflare-safe operation.
- Apify’s linked actor is mainly live/upcoming and requires an API token, so it is better for future live monitoring than for free historical backfill.
- Liquipedia tournament wikitext is currently the most reliable free/cheap historical map-score path.

## Next Logical Data Step

The next pass should be a data-quality expansion, not model training yet:

1. Fetch Liquipedia match pages for VRS/HLTV top 150-200 teams, not only Vitality, Spirit, Falcons, and NAVI.
2. Extract distinct tournament pages from those team histories for 2025-06-08 to 2026-06-08.
3. Run the tournament map collector across those pages with section-page following enabled.
4. Add canonical alias resolution between Liquipedia team codes, Liquipedia display names, HLTV ranking names, and Valve VRS names.
5. Finish player profile snapshots for the queued 903 HLTV players.
6. Only then build the first time-split baseline model.

Recommended first model target after data-quality pass:

- Predict series winner for Tier 1 and Tier 1.5 only.
- Use walk-forward validation, not random k-fold.
- Start with logistic regression / calibrated gradient boosting as baselines.
- Add map-pool and roster-aware features before trusting accuracy claims.
