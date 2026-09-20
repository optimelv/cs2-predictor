# Verified defects and fixes

Date: 20 September 2026. This is the implementation handoff for the final
orange release candidate. The reports distinguish source limitations from
software defects and do not treat a fresh envelope timestamp as proof that
every source row is current.

## Fixed in this candidate

| Defect | Fix | Evidence |
| --- | --- | --- |
| The orange/blue preview could change the product palette and preview state could leak through URLs or storage. | Removed the preview toolbar, accent script, blue branch and preview copy. Legacy accent parameters are inert; semantic status and comparison-series colors remain distinct. | `node scripts/test-theme.mjs`; root CUA saw no preview controls in the final header and both themes kept orange branding. |
| Date-less events with current matches were classified as unknown or historical, and same-name source records could discard the current match array. | `eventDisplayStatus()` gives a current dated match precedence; `availableEvents()` merges same-name records while deduplicating all match evidence. The public catalog applies the same status boundary. | Root CUA opened the current CCT event from Active and saw its 20 September schedule. `node scripts/test-catalog.mjs` passed date-less/current and stale fixtures. |
| Old unresolved matches and events could surface as live/upcoming merely because a snapshot was fetched recently. | Added a 24-hour unresolved grace boundary, result evidence checks, current-surface filtering and `display_status` at the catalog boundary. A past score such as live 0:1 is not accepted as a completed result; terminal status without a plausible score or winner is also unresolved. | Catalog regression fixtures plus `npm run check`; no elapsed source row is auto-finished. |
| History and model promotion could treat a finished row without a source timestamp as fresh, or accept a live partial score as a result. | All three promotion paths now require a positive source timestamp and terminal status before model/history updates. Missing timestamps are skipped instead of being ordered at Unix epoch or stamped with export time. Eleven fabricated 20 September history rows were removed. | `node scripts/test-live-promotion.mjs`; `python3 -m unittest work.cs2_predictor.test_live_promotion work.cs2_predictor.test_portable_model` (18 tests, one optional sklearn skip). |
| Netlify manual refresh could run without a secret and accepted a query-string secret; live veto parsing manufactured map probabilities. | Refresh now fails closed without `REFRESH_SECRET`, accepts the header only, and preserves missing map evidence. Official veto map names take precedence over manual assumptions. | Source review, syntax checks and full `npm run check`; deployment contract updated in `NETLIFY.md`. |
| Release workflows validated only a narrow build, and Pages could upload without validation. | Quality and Pages workflows run `npm run check`; Vercel `buildCommand` is now `npm run check`. The refresh workflow rejects future source timestamps and its behavioral fixture test executes the real gate. | `npm run check`; `node scripts/test-refresh-workflow.mjs`. |
| Player rows exposed generic list-item semantics instead of native button semantics. | Kept native buttons and removed the conflicting `role=listitem`. | Root accessibility-tree inspection showed real player buttons after the fix. |
| Player and comparison charts only exposed tiny point targets and lacked stable interaction after rerenders. | Integrated the shared accessible chart module owned by Terra: nearest-point pointer/touch selection, keyboard traversal, bounded evidence tooltips, crosshair/marker cleanup and semantic data tables. | `node scripts/test-chart-interactions.mjs`; root CUA verified ArrowRight/End selection, 320px tooltip bounds and two-step Escape dismissal. |
| The page and embeds lacked complete share metadata and a raster social card. | Added canonical, Open Graph/Twitter metadata, favicon, manifest, theme color and a valid 1200×630 PNG social card. | `file docs/assets/strikesignal-og.png`; metadata inspected in `docs/index.html` and both embeds. |
| Vercel refresh copy claimed a cron that is not configured, and the legacy major endpoint lacked an upstream timeout. | The route reports its actual static fallback/config state; the legacy endpoint is bounded and documented as compatibility-only. | API syntax checks and `VERCEL.md`. |

## Remaining source limits

- The current forecast envelope is fresh (`2026-09-20T05:58:10Z`, 24 rows),
  but the retained `bounded-elo-vrs-v1` model was trained through 8 June and
  the registry evaluation was generated on 28 July. The candidate reports
  those dates separately; it does not imply a fresh model benchmark.
- Player statistics and form history are from 8 June/24 May while lineup
  metadata was checked on 20 September. The product discloses the mixed age.
- The public live envelope omitted player records. The local fallback retains
  20 last-published lineup records and labels that fallback in `source_health`;
  the full 244-player profile snapshot remains a separate, older statistics
  contract.
- The raw coverage still contains source rows with old dates and unresolved
  statuses. They are retained for provenance and excluded from current
  Matches/Events/catalog surfaces when outside the unresolved grace window.
  No result is inferred from elapsed time.
- Same-name, different-ID event records still use a conservative name merge
  when the source lacks a stable event identity. Current CCT joins were
  checked and no wrong matchup was found in this capture.
- A physical touch device, every browser engine, and a hosted Netlify runtime
  were not exercised in this local pass. The implementation has deterministic
  touch/keyboard paths and bounded requests, but those environments remain
  operational checks for the deployment owner.

No public deployment, account change, paid service, or credential mutation was
performed by this pass.
