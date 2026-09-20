# Independent release review

Root-agent assessment. Implementation and local test ownership remains with the Luna executor. This file distinguishes externally verified facts from pending candidate checks.

## Existing public release and source evidence

Checked 20 September 2026 against the existing public alias https://cs2-predictor-ebon.vercel.app/. These are read-only checks, not a deployment of the current local UI.

| Check | Evidence | Result |
| --- | --- | --- |
| Live snapshot endpoint | GET /api/live-snapshot | HTTP 200, contract 1.1, ok true, fetched_at_utc 2026-09-20T04:55:46Z, 47 matches and 8 events |
| Source health | Live snapshot source_health | 4 detail matches, no detail errors, 80 recent results, 86 scheduled source matches; delivery_mode published_last_good |
| Predictions API and static artifact | GET /api/predictions and /data/predictions.json | Both HTTP 200, JSON structurally equal, generated_at_utc 2026-09-20T04:56:04Z, 24 upcoming predictions |
| Coverage | GET /data/coverage.json | HTTP 200, last_verified_utc 2026-09-20T04:55:46Z |
| History | GET /data/history.json | HTTP 200, generated_at_utc 2026-09-20T04:55:46Z |
| Model registry | GET /data/model-registry.json | HTTP 200, generated_at_utc 2026-09-20T04:56:03Z |
| Player evidence | GET /data/players.json | HTTP 200; statistics generated_at_utc remains 2026-06-08T00:08:00Z, while lineups_updated_at_utc is 2026-09-20T04:55:46Z. These dates must not be conflated. |
| Existing refresh workflow | GitHub Actions run 35490317299 | Completed successfully, created_at 2026-09-20T04:54:35Z |

[Verified refresh run](https://github.com/optimelv/cs2-predictor/actions/runs/35490317299)

The initial restricted-network DNS failure was an execution-environment limitation. A subsequently approved public request succeeded. It is not evidence of a site outage.

The fresh public feed resolves the suspected absence of source access. The final local candidate now uses this verified live capture and 24 regenerated forecasts from the existing validated champion. A successful endpoint at one time is not a guarantee of future refresh availability, and source age must remain visible at runtime.

## Repository findings passed to the executor

- Quality workflow and Vercel build ran the narrower build command; include applicable reliability checks.
- GitHub Pages upload workflow lacked its own pre-upload validation.
- Netlify manual refresh allowed unauthenticated work if REFRESH_SECRET was unset and accepted a secret query parameter. Harden or disable the unsupported path, preserving the authorized scheduler.
- Vercel refresh placeholder claimed cron was configured without such a configuration.
- Main page missing release metadata/icons; user-requested chart interaction and final orange branding remain part of the executor's plan.

## Candidate verification

Root verification completed on the final orange candidate. The independent release verdict and operational limits are recorded in SOL-REVIEW.md and RELEASE.md.

### Root browser verification during integration

The following were performed through CUA against the local candidate at `http://127.0.0.1:4173/` on 20 September 2026:

- Final orange header and navigation rendered without the color-preview controls.
- Single-player chart: ArrowRight selected donk's real 2025-11-13 observation (1.32 rating, The MongolZ, event/ADR/KD evidence); visible tooltip bounds fit the sidebar and viewport. Fresh console check returned no errors.
- Comparison: donk and ZywOo opened through the player selection controls. End selected ZywOo's 2026-05-03 observation (1.33, Natus Vincere), independently of donk's dates. Reload of the comparison URL reopened the correct pair.
- Comparison at 320px: document and dialog scroll width both equaled 320px; the selected tooltip fit horizontally in the viewport. The updated scale labels were visually inspected.
- A browser-detected Escape ordering defect was fixed by coordinating dialog capture and chart capture listeners. With an active tooltip, the first Escape left one dialog open and hid the tooltip; the next Escape closed the dialog. No console errors were recorded in that replay.
- Fresh-data pick path: selected ex-RUSTEC, saved, reloaded, found the saved pick in My picks, returned to Matches, changed it to Azuolas, saved, then removed the test pick. The saved count returned to zero; two existing follows were preserved.

Additional executed browser checks:

- Matches at 320, 390, 768, 1024 and 1440 CSS pixels in both light and dark themes: no document overflow, broken visible images or console errors.
- Veto: selecting Ancient kept step 1; committing Ban advanced to step 2; Undo returned to step 1; Auto completed all seven steps; Reset restored the initial state. Missing map history remained disclosed.
- Current Events after the state fix showed the CCT and ESL schedules, and CCT Europe Series 9 opened with its 11 published matches.
- Clicking the single-player plot area selected donk's actual 2026-03-06 observation (2.32 rating, 3DMAX, 127.0 ADR, 3.00 K/D). Escape cleared it. This verifies plot-area pointer selection, not a physical touch device.

Limits: no physical-device touch pass, true pointer-hover sweep, 200% browser zoom, or OS reduced-motion preference run was performed in this review. Chart helper tests and source review cover nearest-point mapping and reduced-motion CSS, but do not replace those device checks. Final release data consistency is recorded separately below.

### Executed production freshness gate

`node scripts/test-refresh-workflow.mjs` passed after extending it to execute the exact inline Python gate extracted from the workflow. Current time and allowed one-minute clock skew passed; stale, one-hour future, malformed, missing, and timezone-less timestamps failed. Sol independently reran and confirmed this check. The test does not substitute for a hosted GitHub Actions run.

## Final data composition and aggregate check

- Adopted 24 forecasts generated at `2026-09-20T05:58:10Z` from the verified `04:55:46Z` source capture using the existing `bounded-elo-vrs-v1` champion. No model promotion or retraining took place.
- The 11 undated finished feed rows applied zero online model updates. Existing team state remains unchanged. Exporter, training and history ingestion now require anchored terminal results; already fabricated history dates were removed.
- The first staged payload retained old embedded coverage. Root rejected those staged coverage files and composed the forecast payload with the exact canonical current coverage, preserving all 180 match rows and 125 event records. Canonical coverage files were left intact.
- Embedded registry equals the canonical registry. Its older training/monitoring dates remain truthful. Segment calibration is still flagged in monitoring, so this is not proof of universal model quality or a new validation result.
- `npm run check` passed with exit code 0 after adoption and the temporal-history fixes. It includes chart logic, match/event/catalog contracts, data validation, freshness, timeouts, theme contrast and the executed workflow timestamp gate. Full output: `check.log`.
- Final browser reload rendered today's matches and current forecasts with zero captured console errors. No public deployment was performed.

Verification limits remain: the checked-in standalone browser runner was not executed in this pass; the browser observations above were performed directly through CUA. Screenshots were visually inspected in the session, not saved as a new screenshot bundle. Netlify production bundling/runtime and a hosted execution of the modified workflow were not exercised. These are not claimed as passes.
