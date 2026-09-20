# Staged current-model forecast review

## Scope

This review covers an isolated forecast refresh. It did not retrain, promote, or modify the warehouse, canonical predictions, coverage, registry, or live snapshot.

The exporter was first inspected. With a nonexistent `--db-path` and `--allow-missing-db`, it takes `fallback_payload_from_existing`: it reads the seeded staged payload, the local registry, canonical coverage, and the supplied live feed; it writes only the staged output and its three sibling files.

`python` is unavailable in this environment, so the equivalent available interpreter was used:

```sh
python3 -m work.cs2_predictor.export_site_predictions \
  --allow-missing-db \
  --db-path /private/tmp/strikesignal-staged-current-model/missing.sqlite3 \
  --out /private/tmp/strikesignal-staged-current-model/predictions.json \
  --live-feed docs/data/live-snapshot.json
```

The staged `predictions.json` was seeded from the canonical version before this command. The command produced only:

- `/private/tmp/strikesignal-staged-current-model/predictions.json`
- `/private/tmp/strikesignal-staged-current-model/predictions.js`
- `/private/tmp/strikesignal-staged-current-model/coverage.json`
- `/private/tmp/strikesignal-staged-current-model/coverage.js`

## Result

The initial diagnostic run exposed 11 finished feed rows without any populated time anchor (`starts_at`, `startsAt`, `timestamp`, `matchTimestamp`, `startTime`, `startTimestamp`, `dateUnix`, `date`, or `matchDate`). A guard was then added to skip unanchored result updates. This review reports the required fresh rerun from the canonical seed.

The fresh export completed at `2026-09-20T05:58:10Z` with 24 upcoming predictions. Its updater reports 47 feed items and **zero** online results applied. All 11 finished feed rows remain unanchored, so none changed the staged model state.

The live feed and coverage both declare `2026-09-20T04:55:46Z`; therefore the feed was 3,744 seconds old at fresh staged generation. The staged state has the same 408 teams and applied-result IDs as the canonical seed.

| Check | Evidence |
| --- | --- |
| Forecast/live identity | All 24 prediction IDs are nonempty and unique, and each is present among the 36 nonterminal live-feed IDs. |
| Forecast eligibility | Every staged prediction is `upcoming` and `tier_2`. |
| Probability validity | All 24 probabilities are finite and strictly between zero and one; observed range: 0.4129 to 0.5955. |
| Champion alignment | `model.production`, `model_state.portable_model`, and the embedded `model_registry` exactly equal the local registry champion: `bounded-elo-vrs-v1`. |
| Calibration alignment | Every staged forecast has `tier2-shrink-v1` with shrink `0.5`, matching the champion configuration. |
| Canonical integrity | SHA-256 hashes before and after matched for `docs/data/predictions.json`, `predictions.js`, `coverage.json`, `coverage.js`, `model-registry.json`, and `live-snapshot.json`. |
| Temporal consistency | Passed for the fresh rerun: the 11 completed feed rows have no time anchor, `online_results_applied` is zero, and staged team state plus applied-result IDs equal the canonical seed. |

## Monitoring interpretation

The embedded local registry retains its monitoring evidence. Its `challenger_slice_gate.passed` is `true`. A separate registry field, `monitoring.segment_calibration.passed`, is `false`. This staging run does not change either value and must not be described as full monitoring-gate clearance.

The registry champion itself is a heuristic model trained through `2026-06-08`; this run refreshes forecasts from the supplied current feed while preserving the existing team state and does not establish a new benchmark or retraining result.

## Decision boundary

The artifacts in `/private/tmp/strikesignal-staged-current-model/` are a reviewable candidate for a subsequent, separately authorized publish decision. They have not been copied into canonical public data.

## Subsequent root adoption

After this isolated review, root found that the stage retained old embedded
coverage (29 events and 129 matches). Those staged coverage files were rejected.
Only the 24 validated forecasts and unchanged model state were adopted into the
canonical prediction pair, with its embedded coverage replaced by the exact
current canonical coverage (125 events and 180 matches). `coverage.json/js`
and the model registry were preserved. Sol independently checked the composed
candidate. No publication took place. See `INDEPENDENT-REVIEW.md` and
`SOL-REVIEW.md` for the final candidate assessment.
