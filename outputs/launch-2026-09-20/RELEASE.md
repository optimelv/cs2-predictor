# StrikeSignal release candidate

Date: 20 September 2026. Status: **deployable local candidate; production
deployment not performed by this pass**.

The candidate is the existing vanilla StrikeSignal product with one orange
brand treatment, current source data separated from older evidence, bounded
current-surface status handling, accessible player/comparison charts and
validated deployment gates. The named recovery snapshot is
`recovery/2026-09-20-before-luna-final`.

## Candidate data contract

These are the local artifacts after the final temporal guard and history
cleanup. Timestamps describe each artifact's source or generation semantics;
they are not interchangeable.

| Artifact | Evidence | Notes |
| --- | --- | --- |
| `docs/data/live-snapshot.json` | fetched `2026-09-20T04:55:46Z`; 47 matches, 8 events | Public capture; 20 last-published player rows retained because the live envelope omitted players. |
| `docs/data/coverage.json` and `coverage.js` | verified `2026-09-20T04:55:46Z`; 180 daily matches, 125 events | `validate-site-data` reports 123/125 public Tier 1/2 events and 180 current matches. Old unresolved rows remain source evidence and are filtered by age/status. |
| `docs/data/predictions.json` and `predictions.js` | generated `2026-09-20T05:58:10Z`; 24 forecasts | Canonical fresh forecast export with the retained `bounded-elo-vrs-v1` champion and the canonical coverage embedded. |
| `docs/data/history.json` | generated `2026-09-20T04:55:46Z`; 2,149 matches | Eleven rows lacking a source result timestamp were removed instead of being dated 20 September from the envelope timestamp; `through_date` is 19 September. |
| `docs/data/players.json` and `players.js` | statistics generated `2026-06-08`; lineups checked `2026-09-20T04:55:46Z`; 244 profiles | Mixed freshness is visible in the UI. |
| `docs/data/model-registry.json` | champion `bounded-elo-vrs-v1`; registry generated `2026-07-28T21:00:06Z`; five monitoring slices | The registry is the last validated evaluation for this champion. It is intentionally not relabeled as a fresh benchmark. |

The source consistency checks for the staged public capture passed before
promotion: 47 live-to-coverage joins, 133 coverage-to-history field joins and
24 finite probabilities. The final local validator passes after the eleven
unanchored history rows are quarantined.

## Verification performed

Automated checks that passed on the settled candidate:

- `npm run check` — build, chart/snapshot/catalog/embed/model/veto/watchlist
  contracts, live/fallback handlers, refresh workflow, live-history promotion
  regression and site-data validation; reliability/freshness, prediction
  fallback/timeout and orange palette checks. Final site-data summary:
  123/125 public events, 180 current matches, 2,149 historical matches, 30
  VRS teams, 244 players, 53 timelines, 53 map profiles and 50 veto profiles.
- `node scripts/test-live-promotion.mjs` — missing timestamp, live partial
  score and valid terminal history rows.
- `python3 -m unittest work.cs2_predictor.test_live_promotion work.cs2_predictor.test_portable_model` — 17 tests passed and one optional scikit-learn test skipped because the lightweight environment does not require it (18 tests collected).
- `node --check` covers the Vercel/API/server modules and promotion scripts;
  `vercel.json` now uses `npm run check`, matching the CI and Pages gates.

Root's CUA browser verification against the local preview covered the final
orange header without preview controls; Matches, Events, Teams/Players, Picks,
Veto, search, comparison and chart flows; 320, 390, 768, 1024 and 1440px
widths in both themes with no document overflow or broken images; and zero
console errors in the checked paths. The fresh isolated-pick fixture selected,
saved, reloaded, changed and removed a pick while preserving existing follows.
The chart replay selected a real point with ArrowRight, selected the second
comparison series with End, kept the tooltip within a 320px dialog, and used
the first Escape for tooltip dismissal and the second for dialog close.
The following checked-in images are historical/baseline design-review evidence,
not a claim that a final screenshot bundle was saved after the last code/data
sync:

- `outputs/design-review-2026-09-20/implemented-orange-desktop.png`
- `outputs/design-review-2026-09-20/implemented-orange-light.png`
- `outputs/design-review-2026-09-20/implemented-orange-mobile.png`
- `outputs/design-review-2026-09-20/implemented-orange-veto.png`
- `outputs/design-review-2026-09-20/10-compare.png`
- `outputs/browser-check/player-compare.png`

## Deployment and rollback

Before deployment, run `npm ci` and `npm run check` from the repository root.
Vercel should build `docs/` with the checked-in `vercel.json`; GitHub Pages
must use its workflow, which validates before uploading. Netlify scheduled
refresh is supported only when `FLARESOLVERR_URL` and `REFRESH_SECRET` are
configured. Manual refresh sends `x-refresh-secret`; query-string secrets are
rejected. No deployment was initiated here.

For rollback in this no-Git workspace, preserve the named recovery snapshot,
restore the affected files from `recovery/2026-09-20-before-luna-final`, rerun
`npm run check`, and redeploy the verified restored `docs/` output. Keep the
current candidate reports and source snapshot separate so the rollback is
auditable. A hosted operator should use the provider's previous verified
deployment as the first rollback target and then repeat the local check before
any subsequent promotion.

## Release limits

The existing public Vercel deployment and 20 September source capture were
read-only evidence; this candidate was not published. A future release should
refresh the model monitoring evaluation and player performance snapshot before
describing the model as newly trained. Current-surface filtering is a safety
boundary for unresolved source rows, not a substitute for correcting their
upstream status. See `BUGS.md`, `DATA-REVIEW.md` and `INDEPENDENT-REVIEW.md`
for the evidence and remaining operational checks. Physical touch hardware,
a true pointer-hover sweep across every chart, 200% zoom, OS-level reduced
motion, every browser engine, the standalone browser runner, and a bundled
Netlify runtime were not exercised in this local pass.

## Packaged candidate

`strikesignal-orange-release.zip` contains the application, checked-in static
assets and data, API/server code, refresh code, validation scripts, deployment
configuration and these release reports. `MANIFEST.json` records each included
file's SHA-256 and byte length. Local authentication, environment files,
dependency folders, caches, the warehouse and recovery copies are excluded.
Extract to a clean directory, enter `strikesignal`, run `npm ci` and then
`npm run check`. Start `npm run dev` for the local preview at
`http://127.0.0.1:4173/`. Deploy the extracted project only through the intended
existing hosting project after reviewing its current data age and configuration.
The ZIP integrity and every manifest hash were verified when packaged.
