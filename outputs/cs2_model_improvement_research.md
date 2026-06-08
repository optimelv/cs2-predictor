# CS2 Model Improvement Research

Date: 2026-06-08

## Current Model Setup

The current warehouse is good enough for a first benchmark, but still small for serious ML:

| Table | Rows |
|---|---:|
| `hltv_result_matches` | 835 |
| `hltv_match_maps` | 2,209 |
| `hltv_match_vetoes` | 4,858 |
| `hltv_match_players` | 7,040 |
| `liquipedia_matches` | 6,215 |
| `model_training_matches` | 827 |

Current leakage-aware features:

| Feature group | Current status |
|---|---|
| Team strength | Rolling Elo, HLTV rank advantage, rank-known flags |
| Form | Prior win rate, recent 10-match win rate |
| Stage pressure | Stage/phase order, playoff flag, elimination flag |
| Match context | BO format, LAN/offline flag, rest days |
| H2H | Prior head-to-head win rate and count |
| Tier/integrity | T1/T1.5/T2/T3 labels and low/medium/high integrity risk filter |
| Map signal | Newly added post-veto map-history model |
| Player signal | Roster identity exists, but detailed player stat lines are not yet integrated into training features |

Models already tested:

| Model | Notes |
|---|---|
| Elo baseline | Dynamic team rating baseline |
| Rank prior | Logistic transform of HLTV rank advantage |
| Form heuristic | Rolling form/rest/playoff/elimination heuristic |
| Logistic regression | Numeric feature model with L2 regularization |
| Blend | Tuned blend of logistic/Elo/rank/form |
| Phase selector | Uses validation to choose different simple models for playoff vs non-playoff |
| Post-veto map model | Uses known map rows plus prior team-map history, valid only after maps/veto are known |

## Current Benchmark Result

Holdout events: IEM Cologne Major 2026, PGL Astana 2026, IEM Atlanta 2026. Training excludes all three event source titles and only uses earlier non-holdout matches for each event.

| Product path | Best model | Rows | Correct | Accuracy |
|---|---|---:|---:|---:|
| Pure pre-match | `pre_event_frozen + blend` | 128 | 85 | 66.4% |
| Post-veto / map-known | `rolling_in_event + post_veto_map` | 128 | 95 | 74.2% |

Selective/high-confidence result:

| Product path | Confidence threshold | Coverage | Accuracy |
|---|---:|---:|---:|
| Pure pre-match | >= 65% | 39.1% | 72.0% |
| Pure pre-match | >= 75% | 16.4% | 81.0% |
| Post-veto / map-known | >= 55% | 86.7% | 76.6% |
| Post-veto / map-known | >= 75% | 47.7% | 82.0% |

Interpretation: 70-75% is realistic for post-veto predictions or selective high-confidence picks. It is probably unrealistic to demand 75% on every pre-veto T1/T1.5 match without live/in-game data.

## Research Findings

The strongest external signal is consistent: CS models improve when they use CS-specific structure instead of generic win/loss tables.

| Finding | Why it matters for us | Sources |
|---|---|---|
| Elo/ratings are hard to beat on sparse pre-match data | Our rank/Elo-style baselines are not embarrassing; they are strong baselines and should stay in the ensemble | Czech Technical University CS thesis: https://wiki.control.fel.cvut.cz/mediawiki/images/e/e9/P_2022_svec_ondrej.pdf |
| Map veto/map pool is a major CS-specific edge | Our new post-veto benchmark jump from 66.4% to 74.2% matches this direction | Bandit map-selection paper: https://www.catalyzex.com/paper/bandit-modeling-of-map-selection-in-counter |
| Player-level metrics matter, especially role-specific dimensions | We need detailed HLTV player stats, not just roster names | SHAP/player performance study: https://sage.cnpereading.com/doi/10.1177/17479541251388864 |
| In-game/live features can push accuracy much higher | 75%+ is more realistic for live/round-level prediction than pure pre-match | CS2 round prediction thesis: https://vskp.vse.cz/english/100656_predicting-round-outcomes-in-counter-strike-2-using-machine-learning?page=40 |
| Calibration matters more than raw accuracy for betting | Need log loss, Brier, reliability curves, calibration, and odds comparison | SSRN calibration paper: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4054211 |
| GNNs/graph models can help, but usually slightly unless we have rich roster/player graph data | Interesting future path, not the next best step while data is small | Linköping thesis: https://www.diva-portal.org/smash/get/diva2:1931818/FULLTEXT01.pdf and arXiv GCN-WP: https://arxiv.org/abs/2207.13191 |
| Public builder discussions converge on map-specific rates, player stats, stable logistic/gradient boosting, and post-veto outputs | Useful anecdotal confirmation, not hard evidence | Valorant example: https://www.reddit.com/r/ValorantCompetitive/comments/1ntdfo6/predicting_vct_champions_an_ongoing_machine/ and FACEIT CS2 predictor thread: https://www.reddit.com/r/GlobalOffensive/comments/1e2yav8 |
| X/Twitter public search was not useful enough as evidence | Without API-level access, public search did not produce reliable attributable model details | N/A |

## Best Next Improvements

1. Expand the historical dataset first.
   - Target: at least 10k-30k series rows and 25k+ map rows across top 150-200 VRS/HLTV teams.
   - Keep T1/T1.5/T2/T3 labels, but train/evaluate separately by tier and exclude high-risk rows by default.
   - Store immutable raw HTML/API JSON snapshots first, then parse into warehouse tables. This prevents re-scraping every time we add features.

2. Add real player-stat features.
   - Pull HLTV player match/map stats: rating, impact, ADR, KAST, K-D diff, opening kills/deaths, clutch, AWP/sniper indicators where available.
   - Build rolling player form windows: last 5 maps, last 10 maps, last 30 days, last 90 days.
   - Aggregate to team features: top-player delta, average rating delta, worst-player liability, role balance, roster age/stability.

3. Upgrade the map model.
   - Add map-specific Elo per team.
   - Add pick/ban rates, opponent-adjusted map win rate, decider map performance, side bias, and map pool overlap.
   - Build two products: pre-veto map-veto simulator and post-veto map-known predictor.

4. Add modern tabular models once data volume is larger.
   - Test CatBoost, LightGBM, XGBoost, calibrated logistic regression, and a stacked ensemble.
   - Use time-blocked validation and event holdouts, not random k-fold as the primary benchmark.
   - Keep simple baselines in every run. If a fancy model cannot beat rank/Elo/logistic out-of-time, it does not ship.

5. Add calibration and betting-market evaluation.
   - Track log loss, Brier, reliability curves, expected calibration error, and confidence-bucket hit rate.
   - If odds are added, compare predicted probability vs no-vig implied probability and closing-line value. Accuracy alone is not enough.

6. Treat match-fixing risk as a data-quality layer, not a rumor label.
   - Exclude high-risk Tier 3, obscure online qualifiers, very low-ranked teams, and suspicious rows from core training.
   - Use X/Reddit rumors only as a watchlist signal, never as ground truth.

## Accuracy Target View

| Goal | Realistic? | Conditions |
|---|---|---|
| 60%+ all pre-match T1/T1.5 | Yes | Already exceeded in current benchmark |
| 70% all pre-match T1/T1.5 | Maybe | Needs much larger data, player stats, better map-veto simulation, and strict data quality |
| 75% all pre-match T1/T1.5 | Unlikely | Would be exceptional and must be verified against odds/closing lines |
| 70-75% post-veto/map-known | Yes | Already reached 74.2% on current benchmark |
| 75%+ selective/high-confidence | Yes | Already reached on post-veto confidence-filtered slices, with reduced coverage |
| 80%+ all matches | Not credible pre-match | Possible only for live/in-game or heavily filtered obvious-favorite picks |
