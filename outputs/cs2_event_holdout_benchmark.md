# CS2 Event Holdout Benchmark

Date: 2026-06-08

## Benchmark Setup

- Holdout events: IEM Cologne Major 2026, PGL Astana 2026, IEM Atlanta 2026.
- Training excludes all three holdout event source titles.
- For each event, model training uses only non-holdout matches before that event starts.
- `pre_event_frozen` keeps team state fixed at event start.
- `rolling_in_event` updates team state with earlier known results from the same event, but does not retrain model weights.
- Showmatches and unscored/scheduled rows are excluded.

## Best Current Benchmarks

- Best pure pre-match readout: `pre_event_frozen` + `blend`.
- Best post-veto/map-known readout: `rolling_in_event` + `post_veto_map`.
- The post-veto result is not a fair substitute for predictions made before map vetoes are known.

### Pure Pre-Match

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 61 | 39 | 0.639 |
| iem_atlanta_2026 | 30 | 18 | 0.600 |
| pgl_astana_2026 | 41 | 30 | 0.732 |
| **Overall** | **132** | **87** | **0.659** |

### Post-Veto / Map Known

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 61 | 48 | 0.787 |
| iem_atlanta_2026 | 30 | 21 | 0.700 |
| pgl_astana_2026 | 41 | 29 | 0.707 |
| **Overall** | **132** | **98** | **0.742** |

## Confidence Thresholds

| Product | Min confidence | Rows | Coverage | Accuracy |
|---|---:|---:|---:|---:|
| pure_pre_match | 0.55 | 100 | 0.758 | 0.660 |
| pure_pre_match | 0.60 | 69 | 0.523 | 0.710 |
| pure_pre_match | 0.65 | 51 | 0.386 | 0.706 |
| pure_pre_match | 0.70 | 36 | 0.273 | 0.778 |
| pure_pre_match | 0.75 | 21 | 0.159 | 0.810 |
| pure_pre_match | 0.80 | 9 | 0.068 | 0.889 |
| post_veto_map_known | 0.55 | 113 | 0.856 | 0.761 |
| post_veto_map_known | 0.60 | 96 | 0.727 | 0.781 |
| post_veto_map_known | 0.65 | 82 | 0.621 | 0.780 |
| post_veto_map_known | 0.70 | 71 | 0.538 | 0.789 |
| post_veto_map_known | 0.75 | 61 | 0.462 | 0.820 |
| post_veto_map_known | 0.80 | 48 | 0.364 | 0.854 |

## Stage / Phase Accuracy

Readout: `rolling_in_event` + `post_veto_map`.

| Event | Stage | Phase | Rows | Correct | Accuracy |
|---|---|---|---:|---:|---:|
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_high | 9 | 9 | 1.000 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_low | 9 | 9 | 1.000 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_mid | 4 | 4 | 1.000 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_round | 11 | 7 | 0.636 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_high | 8 | 7 | 0.875 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_low | 8 | 4 | 0.500 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_mid | 4 | 2 | 0.500 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_round | 8 | 6 | 0.750 |
| iem_atlanta_2026 | IEM Atlanta 2026 | group_stage | 24 | 16 | 0.667 |
| iem_atlanta_2026 | IEM Atlanta 2026 | playoffs | 6 | 5 | 0.833 |
| pgl_astana_2026 | PGL Astana 2026 | playoffs | 8 | 5 | 0.625 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_high | 9 | 6 | 0.667 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_low | 9 | 6 | 0.667 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_mid | 4 | 3 | 0.750 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_round | 11 | 9 | 0.818 |

## Playoff Split

| Event | Playoff flag | Rows | Correct | Accuracy |
|---|---:|---:|---:|---:|
| cologne_major_2026 | 0 | 61 | 48 | 0.787 |
| iem_atlanta_2026 | 0 | 24 | 16 | 0.667 |
| iem_atlanta_2026 | 1 | 6 | 5 | 0.833 |
| pgl_astana_2026 | 0 | 33 | 24 | 0.727 |
| pgl_astana_2026 | 1 | 8 | 5 | 0.625 |

## Model Comparison

| Mode | Model | Rows | Correct | Accuracy |
|---|---|---:|---:|---:|
| pre_event_frozen | elo | 132 | 75 | 0.568 |
| pre_event_frozen | rank | 132 | 85 | 0.644 |
| pre_event_frozen | form | 132 | 75 | 0.568 |
| pre_event_frozen | logistic | 132 | 84 | 0.636 |
| pre_event_frozen | blend | 132 | 87 | 0.659 |
| pre_event_frozen | phase_selector | 132 | 76 | 0.576 |
| pre_event_frozen | post_veto_map | 132 | 83 | 0.629 |
| pre_event_frozen | phase_map_selector | 132 | 87 | 0.659 |
| rolling_in_event | elo | 132 | 77 | 0.583 |
| rolling_in_event | rank | 132 | 85 | 0.644 |
| rolling_in_event | form | 132 | 80 | 0.606 |
| rolling_in_event | logistic | 132 | 84 | 0.636 |
| rolling_in_event | blend | 132 | 87 | 0.659 |
| rolling_in_event | phase_selector | 132 | 77 | 0.583 |
| rolling_in_event | post_veto_map | 132 | 98 | 0.742 |
| rolling_in_event | phase_map_selector | 132 | 87 | 0.659 |

## Notes

- The Cologne benchmark uses scored local warehouse rows only; any still-scheduled or unscored current Major rows are excluded.
- This benchmark measures event-holdout behavior, not random k-fold performance.
- The blend and phase selector are tuned only on pre-event non-holdout validation rows, then applied to the held-out event.
- `post_veto_map` uses known map rows and prior team-map history, so it belongs to the post-veto product path.

## Training Rows By Event

| Event | Training rows | Blend weights | Phase selector |
|---|---:|---|---|
| cologne_major_2026:pre_event_frozen | 621 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "form"}` |
| cologne_major_2026:rolling_in_event | 621 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "form"}` |
| pgl_astana_2026:pre_event_frozen | 621 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "form"}` |
| pgl_astana_2026:rolling_in_event | 621 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "form"}` |
| iem_atlanta_2026:pre_event_frozen | 621 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "form"}` |
| iem_atlanta_2026:rolling_in_event | 621 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "form"}` |
