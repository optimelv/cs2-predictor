# CS2 Model-Ready Dataset Status

Date: 2026-06-09

## Dataset

- Training rows: 12197
- CSV: `/Users/melvin/Documents/Codex/2026-06-07/explore-the-area-and-find-the/work/data/model/training_matches.csv`
- SQLite table: `model_training_matches`
- Target: `target_team1_win` at series level
- Leakage guard: rolling team, h2h, rest, pressure, and Elo features are computed before each match is added to history.

## Tier Counts

| Model tier | Rows |
|---|---:|
| T1 | 494 |
| T1_5 | 461 |
| T2 | 31 |
| T3 | 11211 |

## Integrity Risk Counts

| Integrity risk | Rows |
|---|---:|
| high | 11441 |
| low | 733 |
| medium | 23 |

## Baseline Validation

Validation scope: T1/T1.5/T2 rows with low or medium integrity risk, using purged forward time folds.

- Rows evaluated: 756
- Folds: 5
- Logistic baseline accuracy: 0.608
- Logistic baseline log loss: 0.789
- Logistic baseline Brier: 0.265
- Elo-only baseline accuracy: 0.603
- Elo-only baseline log loss: 0.652
- Elo-only baseline Brier: 0.230

These metrics are sanity checks on the current seed data, not final model claims. The sample is still too small and too Tier-1-heavy for a serious 60%+ accuracy claim.

## Largest Phase Buckets

| Phase | Rows |
|---|---:|
| unknown | 11363 |
| group_stage | 168 |
| swiss_round | 151 |
| swiss_high | 126 |
| swiss_low | 125 |
| regular | 81 |
| playoffs | 64 |
| swiss_mid | 56 |
| round_of_32 | 32 |
| round_of_16 | 17 |
| quarterfinal | 8 |
| semifinal | 4 |
