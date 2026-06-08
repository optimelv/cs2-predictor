# CS2 Event, Stage, And Pressure Context Status

Date: 2026-06-08

## What Was Added

This pass added event/stage context so matches are no longer just “Team A beat Team B.”

New or expanded data now includes:

| Area | Rows / Status |
|---|---:|
| Matches with source page and parent event key | 713 / 713 |
| Matches joined to event metadata | 713 / 713 |
| Event metadata rows | 17 |
| Team-event-stage result rows | 1,075 |
| Team phase-performance rows | 377 |
| HLTV enriched match details | 704 / 713 |
| Match-player rows | 7,040 |
| Veto rows | 4,858 |

Each match now carries:

- Liquipedia source page
- Parent event source page
- Liquipedia event tier and publisher tier
- Stage name
- Round name
- Match section
- Bracket type, ID, and slot
- Bracket group, for example high/mid/low Swiss pools
- Inferred model phase, for example `grand_final`, `semifinal`, `quarterfinal`, `round_of_16`, `swiss_high`, `swiss_low`, `group_stage`, `playoffs`
- Playoff/elimination flags

## Event Metadata

The database now stores event-level metadata from Liquipedia infoboxes:

- Event name
- S-Tier/A-Tier style Liquipedia tier
- Publisher tier, for example Major, Tier 1, Tier 1 Qualifier, Wildcard
- Offline/Online type
- Organizer/series
- Start/end dates
- Team count
- Map pool
- Country/city/venue when available

All match rows now have a parent-event key, so stage pages like `Intel Extreme Masters/2026/Cologne/Stage 2` join back to `Intel Extreme Masters/2026/Cologne`.

## Phase Distribution

| Phase | Matches |
|---|---:|
| group_stage | 168 |
| swiss_round | 118 |
| swiss_high | 99 |
| swiss_low | 99 |
| playoffs | 64 |
| regular | 58 |
| swiss_mid | 44 |
| round_of_32 | 32 |
| round_of_16 | 17 |
| quarterfinal | 8 |
| semifinal | 4 |
| grand_final | 2 |

`swiss_low` and playoff bracket phases are marked as elimination contexts. This is useful for pressure-related features.

## Example Pressure Features

Current seed-set examples:

| Team | Phase | Matches | Series W-L | Win Rate |
|---|---|---:|---:|---:|
| MOUZ | playoffs | 18 | 8-10 | 0.444 |
| MOUZ | semifinal | 1 | 0-1 | 0.000 |
| Vitality | playoffs | 21 | 18-3 | 0.857 |
| Vitality | semifinal | 2 | 0-2 | 0.000 |
| Spirit | playoffs | 14 | 9-5 | 0.643 |
| Spirit | grand_final | 1 | 1-0 | 1.000 |
| Falcons | playoffs | 12 | 6-6 | 0.500 |
| Falcons | grand_final | 1 | 0-1 | 0.000 |

This is the right shape for modeling “deep run” behavior: finals, semis, playoffs, and elimination Swiss rounds can become separate features instead of being blended into ordinary win rate.

## Matching Quality Improvements

I added same-match alias learning from HLTV details.

Example learned aliases:

- `gl` -> GamerLegion
- `tl` -> Liquid
- `vit` -> Vitality
- `navi` -> Natus Vincere
- `mongolz` -> The MongolZ
- `fq` -> FlyQuest
- `falcons` -> Falcons

Important fix: the learner no longer assumes Liquipedia team1 equals HLTV team1, because source ordering can differ. It now matches aliases against both HLTV teams using trusted abbreviations and name similarity. This prevented bad joins like `navi -> GamerLegion`.

## Remaining Caveats

This is still the map/stage-parsed seed Tier-1/recent-event dataset, not full top-200 last-year map coverage.

Current limits:

- Only 17 event metadata rows are loaded so far.
- HLTV detail enrichment is 704/713; 9 match pages still blocked after retry.
- Ranked-team match-history coverage has expanded to 6,215 Liquipedia rows across the current top-50 combined VRS/HLTV queue, but 493 discovered tournament/stage pages still need slow map/stage parsing.
- Some legitimate lowercase team names remain, such as `9z` and `fnatic`; `magic` remains source-specific and should be reviewed during broader alias QA.

## Next Step

Next logical move:

1. Expand team match-history collection to the current VRS/HLTV top 150-200.
2. Extract every referenced tournament page from 2025-06-08 to 2026-06-08.
3. Parse all event/stage/match/map templates.
4. Enrich all discovered HLTV IDs with the paced `getMatch(id)` path.
5. Run alias QA and event-join QA after every batch.
6. Build model features from `team_phase_performance`, `team_map_win_rates`, VRS rank history, player snapshots, veto/pick info, and roster stability.
