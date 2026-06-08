# CS2 Prediction Model Blueprint

Date: 2026-06-07
Scope: Tier 1 through Tier 2 Counter-Strike 2 matches, with immediate focus on the ongoing Major.

## Current snapshot

- The live Major is `IEM Cologne Major 2026`, running from June 2, 2026 through June 21, 2026. HLTV's Major page shows the event and its playoff schedule, and Liquipedia lists it as `S-Tier`.
- HLTV's world ranking on June 1, 2026 had `Vitality #1`, `Natus Vincere #2`, `Spirit #3`, `Falcons #4`, and `FURIA #5`.
- HLTV's Valve ranking on June 7, 2026 had `Vitality #1`, `Spirit #2`, `Falcons #3`, `Natus Vincere #4`, and `MOUZ #5`.
- Valve's published VRS repository says its official model is trying to predict future match results, and its current ranking uses a team's prize money, beaten opponents' prize money, number of teams beaten, and head-to-head results.
- Valve's released model code seeds teams with `bounty collected`, `bounty offered`, `opponent network`, and `LAN factor`, then converts that into a Glicko-style win probability bridge.
- Valve's repository also reports a `Spearman rho of 0.98` between expected and observed win-rate bins for its current ranking fit, which makes it a strong public baseline even if it is not the final answer for match prediction.

## Best model to build

If I had to pick one model family for this problem today, I would build a `tier-aware, map-level calibrated ensemble`:

1. `Skill prior`
   - A roster-aware strength prior built from Valve-style VRS features plus HLTV rank and roster continuity.
   - Internally this can be maintained as a `Glicko` or `TrueSkill2-like` rating layer.

2. `Map model`
   - Predict each map separately instead of predicting the whole Bo3 or Bo5 directly.
   - Use a calibrated gradient-boosted classifier such as `LightGBM` or `XGBoost`.
   - If sample size is still small, use a regularized logistic model first and keep the feature set identical.

3. `Series simulator`
   - Convert per-map win probabilities into pre-veto and post-veto Bo1, Bo3, and Bo5 probabilities.
   - Before veto: simulate expected bans and picks from historical map tendencies.
   - After veto: lock the actual map order and resimulate.

4. `Probability calibration`
   - Calibrate the final probabilities with `isotonic regression` or `beta calibration`.
   - In esports, raw classification accuracy is not enough; bad calibration is costly.

### Why this is the best fit for CS2

- Counter-Strike is map-pool driven, so match-level models throw away too much signal.
- Roster churn is constant, so fixed team labels age badly.
- Tier quality varies a lot, especially once you move below top LANs.
- Valve's own public model is already a strong team-strength prior.
- Academic work on map selection in Counter-Strike found that better pick-ban decisions can move match win probability materially, which is a strong argument for map-level modeling.
- Microsoft Research's `TrueSkill` and `TrueSkill 2` work supports using uncertainty-aware skill ratings, and `TrueSkill 2` specifically improves when additional shooter-specific information is included.

## What I would not use as the main model

- `Pure Elo only`: too blunt for CS2 roster volatility and map dependence.
- `Pure HLTV rank only`: useful as a feature, not enough as a model.
- `Direct match-level neural net`: too easy to overfit unless you have much richer data than HLTV and Liquipedia alone.
- `Tier 2 and Tier 3 all-in training`: this pollutes the signal with online variance and integrity noise.

## Tier system to use

Valve only defines `Tier 1`, `Tier 2`, and `Wildcard` tournaments in its rules. `Tier 1.5` and `Tier 3` should be internal modeling buckets.

### Team tiers

Use `consensus_rank = mean(Valve global rank, HLTV world rank)` when both exist. If one is missing, use the other and add uncertainty.

| Team tier | Practical rule |
| --- | --- |
| Tier 1 | `consensus_rank <= 12`, stable core, at least two players with strong recent HLTV form |
| Tier 1.5 | `13 <= consensus_rank <= 20`, or split signal such as top-12 in one ranking and top-20 in the other |
| Tier 2 | `21 <= consensus_rank <= 40` |
| Tier 3 | `consensus_rank > 40`, missing rank, unstable roster, or mostly regional online results |

### Event tiers

| Event tier | Practical rule |
| --- | --- |
| Tier 1 | Valve Major or strong `S-Tier` LAN with many top-12 teams |
| Tier 1.5 | Strong `S-Tier` or `A-Tier` LAN/studio event with mostly top-20 teams |
| Tier 2 | `A-Tier` or `B-Tier` event, often mixed LAN/online, usually outside the global top-12 core |
| Tier 3 | `B-Tier` or `C-Tier` online events, open qualifiers, small regional cups, high volatility |

### Valve rules that matter

- Valve's tournament rules say a `Tier 1` event must invite from official VRS lists and must invite at least `20` rosters by direct VRS invite.
- Valve's rules say a `Tier 2` event can qualify teams openly, but if it uses direct VRS invites it must invite at least `4` rosters and those invitees must be lower than `#12` on the global VRS.
- Liquipedia labels `S-Tier` events as the top end of the scene and labels `C-Tier` events as the lowest ranked events, usually online with no top teams participating.

## Integrity and match-fixing filters

This part matters a lot more in CS2 than people admit.

### Hard rules

- Train the main model only on `Tier 1`, `Tier 1.5`, and selected `Tier 2`.
- Exclude `Tier 3` by default.
- Exclude any match with an active official investigation, suspension, or organizer integrity action tied to one of the teams.
- Exclude online matches where both teams are outside the top `40` by consensus rank.
- Exclude matches where a roster is effectively new and the current five have too little shared sample.

### Soft downweights

Use weights instead of hard deletion when the data is still useful but noisy:

| Match bucket | Suggested weight |
| --- | --- |
| Tier 1 LAN | `1.00` |
| Tier 1.5 LAN or studio | `0.90` |
| Tier 2 LAN | `0.75` |
| Tier 2 online | `0.45` |
| Tier 3 online | `0.00` to `0.15` |

### Rumors and X posts

- Do not let social media rumors directly change a win probability.
- Use them only as a `risk flag` until corroborated by an organizer, ESIC, or a credible report.
- A current example is the early-June 2026 reporting around `DragonClaw` and `AntyVirus`: useful as a warning signal, but not a feature that should be treated as ground truth until tied to an official investigation outcome.

## Feature set

### Core pre-match features

- Valve rank and points
- HLTV rank and points
- Recent win rate split by LAN and online
- Opponent-strength-adjusted recent form
- Roster continuity
- Days since last roster move
- Average player HLTV rating over last 3 months
- Star player spread: top 1 player rating minus team median
- Team map pool depth
- Map-specific win rates with opponent-strength adjustment
- Head-to-head only when the same cores are still intact
- Event tier
- LAN vs online
- Bo1, Bo3, or Bo5

### Features I would add later

- Veto-order tendencies
- Starting-side effects on specific maps
- Travel and region shift
- Rest days
- Patch-window dummy variables
- Bookmaker closing odds as an optional calibration feature, never as the primary signal

## First pass for the current Major

For `IEM Cologne Major 2026`, I would keep the first prediction set simple:

- Train on `Tier 1` and `Tier 1.5` matches from the last `12` months.
- Allow only selected `Tier 2` LANs, with lower weights.
- Ignore unresolved Tier 3 noise entirely.
- Before veto, rank contenders mainly by the combined Valve and HLTV prior.
- After veto, move to the map-level model for the real probability.

### Current title priors

Using the latest June 2026 HLTV and Valve snapshots as the cleanest public priors, the first short list is:

1. `Vitality`
2. `Spirit`
3. `Natus Vincere`
4. `Falcons`
5. `MOUZ`
6. `FURIA` and `Aurora` as the next group

That is not the final betting-style output. It is the clean prior before veto, side context, and updated stage form.

## Build order

1. Pull historical match, roster, ranking, player, and event data from HLTV and Liquipedia.
2. Create team and event tier labels before any model training.
3. Train the roster-strength prior.
4. Train a map-level classifier.
5. Calibrate probabilities.
6. Wrap everything in a Bo1 and Bo3 simulator.
7. Backtest by event tier, LAN/online split, and by month to detect drift.

## Sources

- Valve VRS repository: https://github.com/ValveSoftware/counter-strike_regional_standings
- Valve tournament rules: https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/tournament-operation-requirements.md
- HLTV world ranking, June 1, 2026: https://www.hltv.org/ranking/teams/2026/june/1
- HLTV Valve ranking, June 7, 2026: https://www.hltv.org/valve-ranking/teams/2026/june/7
- HLTV Major matches page: https://www.hltv.org/major/matches
- Liquipedia main CS page: https://liquipedia.net/counterstrike/Main_Page
- Liquipedia S-Tier tournaments: https://liquipedia.net/counterstrike/S-Tier_Tournaments
- Liquipedia A-Tier tournaments: https://liquipedia.net/counterstrike/A-Tier_Tournaments
- Liquipedia C-Tier tournaments: https://liquipedia.net/counterstrike/C-Tier_Tournaments
- Microsoft Research, TrueSkill: https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system/
- Microsoft Research, TrueSkill 2: https://www.microsoft.com/en-us/research/publication/trueskill-2-improved-bayesian-skill-rating-system/
- Map-selection paper: https://arxiv.org/abs/2106.08888
- Reporting on the early-June 2026 DragonClaw and AntyVirus investigation: https://bo3.gg/news/cct-open-investigation-into-dragonclaw-after-match-fixing-and-cheat-allegations
