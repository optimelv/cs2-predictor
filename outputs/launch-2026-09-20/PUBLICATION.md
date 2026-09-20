# Publication candidate, 20 September 2026

Target: existing `optimelv/cs2-predictor` main branch and its existing Vercel integration. Base commit: `1a04d0ab15b3f7c4a34efc6f3373ce4228b82d7f`.

The earlier reports describe the reviewed 05:58 UTC candidate. For publication, source code was combined with the newer 11:26:22 UTC live capture and its exact coverage (126 events, 180 raw match rows). The guarded exporter generated 24 forecasts at 12:54:07 UTC with the retained `bounded-elo-vrs-v1` champion and zero online state updates. No retraining or model promotion was performed. The embedded registry and coverage match their canonical artifacts.

Remote history added only twelve unanchored results, so the reviewed 2,149-row history was retained. Player statistics and the earlier lineup verification date were retained because the newer feed supplied no player records. Its 20 last-published player records are explicitly marked as fallback.

All 1,174 remote online-training rows lacked dates and had zero timestamps. Their exact original bytes are preserved under `models/quarantine/2026-09-20-undated-online.jsonl`; the 65 earlier rows also had synthetic noon timestamps and are separately preserved in `models/quarantine/2026-09-20-synthetic-noon-online.jsonl`. The active online ledger is empty pending genuinely anchored new results. This archive is excluded from the active ledger. The existing 757-row dated training seed is retained. Date-only history can no longer manufacture training timestamps, and unresolved legacy rows are excluded from chronological folds.

`npm run check` passed on the combined candidate. The Vercel build runs the same command. The optional Pages workflow is manual-only, so this release does not activate a second hosting target. The direct Vercel CLI credential was unavailable; the existing GitHub deployment integration remains the supported publication path.

The older model and player-performance windows, segment-calibration monitoring flag, and device-testing limits from RELEASE.md still apply. Live verification follows the GitHub push. Rollback target is the previous verified production deployment; this change uses a normal commit, without force-pushing or rewriting history.

Final pre-push review: independent deployment GO. Python promotion tests: 18 passed, one optional skip (19 collected). Worker parser tests: 9 passed, including missing/malformed/naive timestamps and live partial results. Player timeline ingestion now retains lineup identity without assigning a result date until a timezone-aware source time and terminal result exist. `git diff --check` passed. Source branch remained at the reviewed base immediately before committing.
