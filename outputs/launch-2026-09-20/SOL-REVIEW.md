# Independent release review

Date: 20 September 2026  
Scope: settled local candidate versus `recovery/2026-09-20-before-luna-final`, focused on the API, data freshness and promotion paths, deployment configuration, security boundaries, release claims, and final verification evidence. Chart implementation had separate ownership; this review assessed its integration evidence without duplicating that implementation review. No deployment, credential mutation, or production write was performed.

## Verdict: ship

The settled candidate is deployable. The release-blocking temporal, data-pairing, refresh-auth, map-evidence, catalog-status, and deployment-gate defects found during review were fixed and retested. The final canonical artifacts contain 24 current forecasts paired with the retained validated champion and the full current coverage snapshot. Timestamp-less results no longer enter history, online model state, or training data.

`ship` here means the local candidate is ready for the authorized deployment step. It does not mean production was deployed, the model was retrained, every source row is current, or every hosted runtime and physical device was exercised.

## Release-blocker resolution

### Current forecasts and data pairing

The canonical forecast pair was generated at `2026-09-20T05:58:10Z` from the verified live feed and the existing `bounded-elo-vrs-v1` champion, without retraining or promotion. Independent assertions confirmed:

- 24 nonempty, unique forecast IDs, all present in the live feed;
- all forecasts are future, nonterminal Tier 2 rows;
- every probability is finite and strictly between zero and one;
- every forecast uses `tier2-shrink-v1` with shrink `0.5`;
- `model.production`, `model_state.portable_model`, the embedded registry, and `docs/data/model-registry.json` identify the same champion;
- `online_results_applied` is zero and the team state equals the validated seed;
- embedded prediction coverage exactly equals canonical coverage: 125 events and 180 daily matches;
- `predictions.js` parses to the same object as `predictions.json`.

The initial staged exporter output carried an older embedded coverage set with 29 events and 129 matches. That artifact was not adopted. The final composition preserved the current canonical coverage instead, avoiding a silent data-loss regression.

### Result chronology and source-state handling

All three ingestion paths now require terminal status and a valid source result timestamp before changing history, online Elo/form state, or training data. Focused fixtures prove that a timestamp-less finished row and a live 1:0 partial score are ignored, while a timestamped terminal result is accepted.

Eleven previously imported history rows had been dated from the feed-envelope timestamp despite lacking match timestamps. They were removed; canonical history now contains 2,149 rows, reports `through_date: 2026-09-19`, and contains none of those eleven IDs. This was a real chronology defect: the official page for `hltv:2397821` dates the match 18 September, while the discarded generated row had labeled it 20 September ([official HLTV match page](https://www.hltv.org/matches/2397821/black-phoenix-vs-lavked-cct-2026-europe-series-9)). Future refreshes cannot recreate that failure.

The raw source still contains elapsed unresolved matches and source-labeled active events. The application and catalog now derive current display state from result evidence and a 24-hour unresolved grace boundary. They exclude stale unresolved rows from current surfaces without inventing winners or finished scores. Current catalog evidence is 36 current matches and 7 current events.

### Refresh and deployment gates

The GitHub refresh workflow now rejects source timestamps more than five minutes in the future, as well as stale, missing, malformed, and timezone-less timestamps, before filtering, model work, or publication. `scripts/test-refresh-workflow.mjs` extracts and executes the workflow's exact inline Python gate instead of testing a duplicate implementation.

GitHub quality and Pages workflows run `npm run check`; Pages validates before upload; and Vercel's `buildCommand` is also `npm run check`. Deployment documentation now matches the `/api/live-snapshot` runtime, hourly GitHub refresh schedule, required Netlify secret, and compatibility status of `/api/live-major`. The legacy route has a 12-second upstream deadline.

### Netlify and API security/correctness

The Netlify refresh route fails closed when `REFRESH_SECRET` is absent, accepts the secret only through `x-refresh-secret`, and returns explicit failure responses. The scheduler sends the header and does not log the secret. Live veto refresh preserves missing map statistics as missing, removes stale aggregate map probabilities when the map set changes, and lets official parsed vetoes override the manual paiN heuristic.

No browser-side secret was found in the reviewed API/config surfaces. Catalog pagination is bounded, unsupported methods are rejected, workflow credentials remain in provider secret storage, and upstream Vercel requests are time-bounded.

## Verification evidence

- `npm run check` completed with exit code 0 on the settled candidate. It covered syntax, chart/snapshot/catalog/embed/model/veto/watchlist contracts, live/fallback handlers, the exact refresh gate, history promotion, site-data validation, freshness, prediction fallbacks/timeouts, and theme/contrast checks.
- Final site-data validation reported 123/125 public Tier 1/2 events, 180 current matches, 2,149 historical matches, 30 VRS teams, 244 players, 53 player timelines, 53 map profiles, and 50 veto profiles.
- `python3 -m unittest work.cs2_predictor.test_live_promotion work.cs2_predictor.test_portable_model` collected 18 tests: 17 passed and one optional scikit-learn test skipped.
- Root browser verification loaded the settled 24-forecast candidate with zero console errors in the checked paths. It covered the main product flows, the pick save/reload/change/remove cycle, chart keyboard and plot-area selection, bounded mobile tooltips, two-stage Escape handling, Veto interactions, both themes, and widths 320, 390, 768, 1024, and 1440 pixels.
- API, workflow, Netlify, deployment-document, and configuration changes were reviewed against the named recovery snapshot. The workspace has no Git metadata, so the recovery snapshot and final artifact reports are the available provenance boundary.

## Residual limits

These limits do not block this deployment, but release claims must preserve them:

- The champion is a heuristic model trained through 8 June; its registry evaluation is dated 28 July. The current forecast envelope is fresh, but it is not a fresh benchmark or retraining result.
- `monitoring.challenger_slice_gate.passed` is true, while `monitoring.segment_calibration.passed` is false. The retained Tier 2 shrink is versioned and consistently applied, but the release must not claim that every monitoring or calibration gate passed.
- Player performance evidence remains older than lineup metadata. The UI and release documents disclose the separate dates.
- A bundled hosted Netlify runtime, physical touch hardware, every browser engine, a true pointer-hover sweep across every chart, 200% zoom, and OS-level reduced motion were not executed in this pass. These remain deployment-owner checks rather than demonstrated evidence.
- The reviewed local candidate has not been published. Production freshness after deployment still depends on configured upstream services and the guarded refresh workflow.

The final release contract and rollback instructions are in `outputs/launch-2026-09-20/RELEASE.md`; resolved defects and source limits are in `outputs/launch-2026-09-20/BUGS.md`.
