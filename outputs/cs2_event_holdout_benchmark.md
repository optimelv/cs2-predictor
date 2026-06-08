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

- Best pure pre-match readout: `pre_event_frozen` + `logistic`.
- Best post-veto/map-known readout: `rolling_in_event` + `post_veto_map`.
- The post-veto result is not a fair substitute for predictions made before map vetoes are known.

### Pure Pre-Match

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 62 | 42 | 0.677 |
| iem_atlanta_2026 | 30 | 18 | 0.600 |
| pgl_astana_2026 | 41 | 29 | 0.707 |
| **Overall** | **133** | **89** | **0.669** |

### Post-Veto / Map Known

| Event | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| cologne_major_2026 | 62 | 47 | 0.758 |
| iem_atlanta_2026 | 30 | 20 | 0.667 |
| pgl_astana_2026 | 41 | 30 | 0.732 |
| **Overall** | **133** | **97** | **0.729** |

## Confidence Thresholds

| Product | Min confidence | Rows | Coverage | Accuracy |
|---|---:|---:|---:|---:|
| pure_pre_match | 0.55 | 112 | 0.842 | 0.688 |
| pure_pre_match | 0.60 | 92 | 0.692 | 0.707 |
| pure_pre_match | 0.65 | 69 | 0.519 | 0.739 |
| pure_pre_match | 0.70 | 47 | 0.353 | 0.766 |
| pure_pre_match | 0.75 | 29 | 0.218 | 0.793 |
| pure_pre_match | 0.80 | 20 | 0.150 | 0.850 |
| post_veto_map_known | 0.55 | 118 | 0.887 | 0.737 |
| post_veto_map_known | 0.60 | 95 | 0.714 | 0.758 |
| post_veto_map_known | 0.65 | 85 | 0.639 | 0.776 |
| post_veto_map_known | 0.70 | 72 | 0.541 | 0.792 |
| post_veto_map_known | 0.75 | 61 | 0.459 | 0.803 |
| post_veto_map_known | 0.80 | 48 | 0.361 | 0.854 |

## Stage / Phase Accuracy

Readout: `rolling_in_event` + `post_veto_map`.

| Event | Stage | Phase | Rows | Correct | Accuracy |
|---|---|---|---:|---:|---:|
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_high | 9 | 8 | 0.889 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_low | 9 | 9 | 1.000 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_mid | 4 | 4 | 1.000 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 1 | swiss_round | 11 | 7 | 0.636 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_high | 9 | 8 | 0.889 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_low | 8 | 4 | 0.500 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_mid | 4 | 1 | 0.250 |
| cologne_major_2026 | IEM Cologne Major 2026 Stage 2 | swiss_round | 8 | 6 | 0.750 |
| iem_atlanta_2026 | IEM Atlanta 2026 | group_stage | 24 | 15 | 0.625 |
| iem_atlanta_2026 | IEM Atlanta 2026 | playoffs | 6 | 5 | 0.833 |
| pgl_astana_2026 | PGL Astana 2026 | playoffs | 8 | 5 | 0.625 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_high | 9 | 7 | 0.778 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_low | 9 | 6 | 0.667 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_mid | 4 | 3 | 0.750 |
| pgl_astana_2026 | PGL Astana 2026 | swiss_round | 11 | 9 | 0.818 |

## Playoff Split

| Event | Playoff flag | Rows | Correct | Accuracy |
|---|---:|---:|---:|---:|
| cologne_major_2026 | 0 | 62 | 47 | 0.758 |
| iem_atlanta_2026 | 0 | 24 | 15 | 0.625 |
| iem_atlanta_2026 | 1 | 6 | 5 | 0.833 |
| pgl_astana_2026 | 0 | 33 | 25 | 0.758 |
| pgl_astana_2026 | 1 | 8 | 5 | 0.625 |

## Model Comparison

| Mode | Model | Rows | Correct | Accuracy |
|---|---|---:|---:|---:|
| pre_event_frozen | elo | 133 | 86 | 0.647 |
| pre_event_frozen | rank | 133 | 86 | 0.647 |
| pre_event_frozen | form | 133 | 70 | 0.526 |
| pre_event_frozen | logistic | 133 | 89 | 0.669 |
| pre_event_frozen | blend | 133 | 89 | 0.669 |
| pre_event_frozen | phase_selector | 133 | 86 | 0.647 |
| pre_event_frozen | post_veto_map | 133 | 88 | 0.662 |
| pre_event_frozen | phase_map_selector | 133 | 88 | 0.662 |
| rolling_in_event | elo | 133 | 83 | 0.624 |
| rolling_in_event | rank | 133 | 86 | 0.647 |
| rolling_in_event | form | 133 | 73 | 0.549 |
| rolling_in_event | logistic | 133 | 89 | 0.669 |
| rolling_in_event | blend | 133 | 88 | 0.662 |
| rolling_in_event | phase_selector | 133 | 83 | 0.624 |
| rolling_in_event | post_veto_map | 133 | 97 | 0.729 |
| rolling_in_event | phase_map_selector | 133 | 88 | 0.662 |

## Notes

- The Cologne benchmark uses scored local warehouse rows only; any still-scheduled or unscored current Major rows are excluded.
- This benchmark measures event-holdout behavior, not random k-fold performance.
- The blend and phase selector are tuned only on pre-event non-holdout validation rows, then applied to the held-out event.
- `post_veto_map` uses known map rows and prior team-map history, so it belongs to the post-veto product path.

## Training Rows By Event

| Event | Training rows | Blend weights | Phase selector |
|---|---:|---|---|
| cologne_major_2026:pre_event_frozen | 623 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| cologne_major_2026:rolling_in_event | 623 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| pgl_astana_2026:pre_event_frozen | 623 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| pgl_astana_2026:rolling_in_event | 623 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| iem_atlanta_2026:pre_event_frozen | 623 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "elo"}` |
| iem_atlanta_2026:rolling_in_event | 623 | `{"elo": 0.3, "form": 0.1, "logistic": 0.5, "rank": 0.1}` | `{"non_playoff": "elo", "playoff": "elo"}` |
