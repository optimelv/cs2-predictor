# CS2 Model-Ready Dataset Status

Date: 2026-06-08

## Dataset

- Training rows: 970
- CSV: `/Users/melvin/Documents/Codex/2026-06-07/explore-the-area-and-find-the/work/data/model/training_matches.csv`
- SQLite table: `model_training_matches`
- Target: `target_team1_win` at series level
- Leakage guard: rolling team, h2h, rest, pressure, and Elo features are computed before each match is added to history.

## Tier Counts

| Model tier | Rows |
|---|---:|
| T1 | 492 |
| T1_5 | 311 |
| T2 | 26 |
| T3 | 141 |

## Integrity Risk Counts

| Integrity risk | Rows |
|---|---:|
| high | 216 |
| low | 731 |
| medium | 23 |

## Baseline Validation

Validation scope: T1/T1.5/T2 rows with low or medium integrity risk, using purged forward time folds.

- Rows evaluated: 754
- Folds: 5
- Logistic baseline accuracy: 0.583
- Logistic baseline log loss: 0.812
- Logistic baseline Brier: 0.272
- Elo-only baseline accuracy: 0.631
- Elo-only baseline log loss: 0.640
- Elo-only baseline Brier: 0.225

These metrics are sanity checks on the current seed data, not final model claims. The sample is still too small and too Tier-1-heavy for a serious 60%+ accuracy claim.

## Largest Phase Buckets

| Phase | Rows |
|---|---:|
| group_stage | 168 |
| swiss_round | 150 |
| unknown | 138 |
| swiss_high | 126 |
| swiss_low | 124 |
| regular | 81 |
| playoffs | 64 |
| swiss_mid | 56 |
| round_of_32 | 32 |
| round_of_16 | 17 |
| quarterfinal | 8 |
| semifinal | 4 |
