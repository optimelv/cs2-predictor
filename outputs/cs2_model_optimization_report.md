# CS2 Model Optimization Report

Date: 2026-06-08

## Recommended Setup

- Best pre-match event-holdout setup: `ranked_top120/clean_only` with `rolling_in_event` + `elo` at 0.707.
- Best post-veto event-holdout setup: `ranked_top120/clean_only` with `rolling_in_event` + `post_veto_map_tuned` at 0.759.
- The split recommendation is intentional: team-strength history and map-history have different noise profiles.

## Forward-Time Validation

Scope: clean T1/T1.5/T2 rows, excluding the three benchmark events, using purged forward time folds.

| State policy | Best model | Rows | Accuracy | Log loss | Brier |
|---|---|---:|---:|---:|---:|
| ranked_top200 | blend | 623 | 0.649 | 0.632 | 0.221 |
| ranked_top120 | elo | 623 | 0.647 | 0.620 | 0.215 |
| all | rank | 623 | 0.642 | 0.676 | 0.238 |
| no_t3 | rank | 623 | 0.642 | 0.676 | 0.238 |
| clean_only | rank | 623 | 0.642 | 0.676 | 0.238 |

## Event Holdout Comparison

| Team/map policy | Best pre-match | Pre accuracy | Best post-veto | Post accuracy |
|---|---|---:|---|---:|
| ranked_top120/clean_only | rolling_in_event + elo | 0.707 | rolling_in_event + post_veto_map_tuned | 0.759 |
| ranked_top120/ranked_top120 | rolling_in_event + elo | 0.707 | rolling_in_event + post_veto_map_tuned | 0.737 |
| clean_only/clean_only | rolling_in_event + logistic | 0.692 | rolling_in_event + post_veto_map_tuned | 0.759 |
| ranked_top200/ranked_top200 | rolling_in_event + accuracy_blend | 0.684 | rolling_in_event + post_veto_map_tuned | 0.737 |
| all/all | pre_event_frozen + elo_rank_vrs | 0.669 | rolling_in_event + post_veto_map_tuned | 0.737 |
| no_t3/no_t3 | rolling_in_event + elo_rank_vrs | 0.669 | rolling_in_event + post_veto_map_tuned | 0.737 |

## Best Split By Event

Pre-match setup: `ranked_top120/clean_only` / `elo`.

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 62 | 46 | 0.742 |
| iem_atlanta_2026 | 30 | 18 | 0.600 |
| pgl_astana_2026 | 41 | 30 | 0.732 |

Post-veto setup: `ranked_top120/clean_only` / `post_veto_map_tuned`.

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 62 | 48 | 0.774 |
| iem_atlanta_2026 | 30 | 21 | 0.700 |
| pgl_astana_2026 | 41 | 32 | 0.780 |

## Tested Families

- Elo/form models with multiple state-history trust policies.
- HLTV rank, VRS rank/points, combined rank, and Elo+rank/VRS power models.
- Standard logistic regression plus tuned feature-subset logistic regression.
- Accuracy-tuned and calibration-tuned probability ensembles.
- Post-veto map model using known maps and prior map history.

## Notes

- The event holdout is only 133 matches, so improvements of a few matches should be treated carefully.
- Current best post-veto accuracy crosses 75%, but this is map-known and should not be mixed with pre-veto claims.
- Current best pre-match benchmark crosses 70%, but confidence-thresholded subsets are safer for production use than every-match picks.
