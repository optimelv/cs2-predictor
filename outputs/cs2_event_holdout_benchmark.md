# CS2 Event Holdout Benchmark

Date: 2026-06-09

## Benchmark Setup

- Holdout events: IEM Cologne Major 2026, PGL Astana 2026, IEM Atlanta 2026.
- Training excludes all three holdout event source titles.
- For each event, model training uses only non-holdout matches before that event starts.
- `pre_event_frozen` keeps team state fixed at event start.
- `rolling_in_event` updates team state with earlier known results from the same event, but does not retrain model weights.
- State/history update policy: `all`.
- Map-history update policy: `all`.
- Showmatches and unscored/scheduled rows are excluded.

## Best Current Benchmarks

- Best pure pre-match readout: `pre_event_frozen` + `elo_rank_vrs`.
- Best post-veto/map-known readout: `rolling_in_event` + `post_veto_map_tuned`.
- The post-veto result is not a fair substitute for predictions made before map vetoes are known.

### Pure Pre-Match

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 63 | 40 | 0.635 |
| iem_atlanta_2026 | 30 | 20 | 0.667 |
| pgl_astana_2026 | 41 | 30 | 0.732 |
| **Overall** | **134** | **90** | **0.672** |

### Post-Veto / Map Known

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 63 | 48 | 0.762 |
| iem_atlanta_2026 | 30 | 21 | 0.700 |
| pgl_astana_2026 | 41 | 30 | 0.732 |
| **Overall** | **134** | **99** | **0.739** |

## Confidence Thresholds

| Product | Min confidence | Rows | Coverage | Accuracy |
|---|---:|---:|---:|---:|
| pure_pre_match | 0.55 | 95 | 0.709 | 0.705 |
| pure_pre_match | 0.60 | 66 | 0.493 | 0.742 |
| pure_pre_match | 0.65 | 42 | 0.313 | 0.762 |
| pure_pre_match | 0.70 | 32 | 0.239 | 0.750 |
| pure_pre_match | 0.75 | 21 | 0.157 | 0.905 |
| pure_pre_match | 0.80 | 13 | 0.097 | 1.000 |
| post_veto_map_known | 0.55 | 117 | 0.873 | 0.752 |
| post_veto_map_known | 0.60 | 90 | 0.672 | 0.778 |
| post_veto_map_known | 0.65 | 78 | 0.582 | 0.795 |
| post_veto_map_known | 0.70 | 65 | 0.485 | 0.800 |
| post_veto_map_known | 0.75 | 49 | 0.366 | 0.837 |
| post_veto_map_known | 0.80 | 35 | 0.261 | 0.857 |

## Stage / Phase Accuracy

Readout: `rolling_in_event` + `post_veto_map_tuned`.

| Event | Stage | Phase | Rows | Correct | Accuracy |
|---|---|---|---:|---:|---:|
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_high | 9 | 9 | 1.000 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_low | 9 | 8 | 0.889 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_mid | 4 | 3 | 0.750 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_round | 11 | 8 | 0.727 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_high | 9 | 8 | 0.889 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_low | 9 | 5 | 0.556 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_mid | 4 | 1 | 0.250 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_round | 8 | 6 | 0.750 |
| iem_atlanta_2026 | IEM Atlanta 2026 | group_stage | 24 | 16 | 0.667 |
| iem_atlanta_2026 | IEM Atlanta 2026 | playoffs | 6 | 5 | 0.833 |
| pgl_astana_2026 | PGL Astana 2026 | playoffs | 8 | 5 | 0.625 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_high | 9 | 7 | 0.778 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_low | 9 | 6 | 0.667 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_mid | 4 | 3 | 0.750 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_round | 11 | 9 | 0.818 |

## Playoff Split

| Event | Playoff flag | Rows | Correct | Accuracy |
|---|---:|---:|---:|---:|
| cologne_major_2026 | 0 | 63 | 48 | 0.762 |
| iem_atlanta_2026 | 0 | 24 | 16 | 0.667 |
| iem_atlanta_2026 | 1 | 6 | 5 | 0.833 |
| pgl_astana_2026 | 0 | 33 | 25 | 0.758 |
| pgl_astana_2026 | 1 | 8 | 5 | 0.625 |

## Model Comparison

| Mode | Model | Rows | Correct | Accuracy |
|---|---|---:|---:|---:|
| pre_event_frozen | elo | 134 | 87 | 0.649 |
| pre_event_frozen | rank | 134 | 87 | 0.649 |
| pre_event_frozen | vrs | 134 | 86 | 0.642 |
| pre_event_frozen | rank_vrs | 134 | 89 | 0.664 |
| pre_event_frozen | elo_rank_vrs | 134 | 90 | 0.672 |
| pre_event_frozen | form | 134 | 71 | 0.530 |
| pre_event_frozen | logistic | 134 | 89 | 0.664 |
| pre_event_frozen | logistic_tuned | 134 | 88 | 0.657 |
| pre_event_frozen | blend | 134 | 88 | 0.657 |
| pre_event_frozen | accuracy_blend | 134 | 89 | 0.664 |
| pre_event_frozen | calibrated_blend | 134 | 87 | 0.649 |
| pre_event_frozen | phase_selector | 134 | 87 | 0.649 |
| pre_event_frozen | post_veto_map | 134 | 89 | 0.664 |
| pre_event_frozen | post_veto_map_tuned | 134 | 88 | 0.657 |
| pre_event_frozen | phase_map_selector | 134 | 89 | 0.664 |
| pre_event_frozen | phase_map_selector_tuned | 134 | 89 | 0.664 |
| rolling_in_event | elo | 134 | 87 | 0.649 |
| rolling_in_event | rank | 134 | 87 | 0.649 |
| rolling_in_event | vrs | 134 | 86 | 0.642 |
| rolling_in_event | rank_vrs | 134 | 89 | 0.664 |
| rolling_in_event | elo_rank_vrs | 134 | 89 | 0.664 |
| rolling_in_event | form | 134 | 73 | 0.545 |
| rolling_in_event | logistic | 134 | 90 | 0.672 |
| rolling_in_event | logistic_tuned | 134 | 90 | 0.672 |
| rolling_in_event | blend | 134 | 89 | 0.664 |
| rolling_in_event | accuracy_blend | 134 | 89 | 0.664 |
| rolling_in_event | calibrated_blend | 134 | 87 | 0.649 |
| rolling_in_event | phase_selector | 134 | 87 | 0.649 |
| rolling_in_event | post_veto_map | 134 | 98 | 0.731 |
| rolling_in_event | post_veto_map_tuned | 134 | 99 | 0.739 |
| rolling_in_event | phase_map_selector | 134 | 89 | 0.664 |
| rolling_in_event | phase_map_selector_tuned | 134 | 89 | 0.664 |

## Notes

- The Cologne benchmark uses scored local warehouse rows only; any still-scheduled or unscored current Major rows are excluded.
- This benchmark measures event-holdout behavior, not random k-fold performance.
- The blend and phase selector are tuned only on pre-event non-holdout validation rows, then applied to the held-out event.
- `post_veto_map` uses known map rows and prior team-map history, so it belongs to the post-veto product path.
- `post_veto_map_tuned` tunes map-model weights only on pre-event non-holdout validation rows.

## Training Rows By Event

| Event | Training rows | Accuracy blend | Calibrated blend | Phase selector |
|---|---:|---|---|---|
| cologne_major_2026:pre_event_frozen | 623 | `{"elo_rank_vrs": 0.3333333333333333, "logistic": 0.3333333333333333, "vrs": 0.3333333333333333}` | `{"elo": 1.0}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| cologne_major_2026:rolling_in_event | 623 | `{"elo_rank_vrs": 0.3333333333333333, "logistic": 0.3333333333333333, "vrs": 0.3333333333333333}` | `{"elo": 1.0}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| pgl_astana_2026:pre_event_frozen | 623 | `{"elo_rank_vrs": 0.3333333333333333, "logistic": 0.3333333333333333, "vrs": 0.3333333333333333}` | `{"elo": 1.0}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| pgl_astana_2026:rolling_in_event | 623 | `{"elo_rank_vrs": 0.3333333333333333, "logistic": 0.3333333333333333, "vrs": 0.3333333333333333}` | `{"elo": 1.0}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| iem_atlanta_2026:pre_event_frozen | 623 | `{"elo_rank_vrs": 0.3333333333333333, "logistic": 0.3333333333333333, "vrs": 0.3333333333333333}` | `{"elo": 1.0}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| iem_atlanta_2026:rolling_in_event | 623 | `{"elo_rank_vrs": 0.3333333333333333, "logistic": 0.3333333333333333, "vrs": 0.3333333333333333}` | `{"elo": 1.0}` | `{"non_playoff": "elo", "playoff": "elo"}` |
