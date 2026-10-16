# StrikeSignal Release State

## Release — 2026-10-16

The release combines current public/private data inputs with the reviewed Taste v2 and Product Design implementation. Vercel project `cs2-predictor` serves `https://cs2-predictor-ebon.vercel.app/`; the release evidence and deployment receipt are retained locally in `outputs/release-2026-10-16/`.

- **Design and workflows:** four destinations, orange/Sora identity, light/dark/system themes, all six mobile status filters visible. Finished-series probabilities are labelled as current snapshot estimates. Recent form is a smoothed /100 indicator. My picks uses the current match estimate and retains verified closing observations. Veto choices have named controls and restore focus after rerenders.
- **Data:** 806 player profiles retained, with 562 independently dated three-month profile updates from 8–14 October. Official Valve global standings are dated 5 October (latest official release checked on 16 October): 380 source lineups and public top 30. Historical observations are deduplicated without deleting their source provenance. Recorded player/map history remains partial and carries its own dates.
- **Tournament selection:** `roman-imperium-floor-v1` is shared by collection, export/model intake, browser and public catalog. Keep reviewed professional main events, including Roman Imperium and CCT Europe. Exclude qualifiers, CCT Challengers/Contenders and non-European regional CCT, plus ECL cups; abbreviations follow the same policy. Unreviewed Tier 2 events remain pending. Raw historical evidence is retained while public queries apply curation.
- **Model:** 1,159 eligible training rows, four purged chronological folds, 773 held-out series. `bounded-elo-vrs-v1` remains champion; accuracy 62.35%, Brier 0.22633, log loss 0.64226 and ECE 0.03831. The challenger failed promotion gates. These are historical validation results, not guaranteed future performance.
- **Collector:** timed-out pages release the single browser slot; cancellation closes the session. Source-star markup no longer implies a live match. Oracle runs the repaired collector with `aiohttp==3.14.5`; 29 worker tests pass locally and on the server. The historical index backfill is complete through its configured floor; individual match/player detail is not complete.
- **Checks:** fresh npm install, all build/reliability/data checks, 31 Python model/ranking/chronology tests, 29 worker tests and the public-model privacy guard pass. Complete npm audit and declared/installed collector dependency audits have zero known vulnerabilities. The unused Netlify CLI/image toolchain was removed; optional Netlify adapters remain tested. CI enforces npm and collector security audits.
- **Taste v2:** upstream checked, no update available. Main entry/CSS source lint: zero failures and seven warnings for control boundaries. Real-browser flow verification is recorded separately; the marketing-site inspector is not substituted for app workflow tests.

## Local project review — 2026-09-22

Reviewed frontend contracts and interactions, public APIs, Python model updates, worker lifecycle, refresh/export workflows, and npm dependencies. Corrected browser-bundle publication paths, missing-value handling, retryable caches, snapshot ordering, timestamp/online-state guards, and collector startup. Optimized purged-fold cutoff lookup and upgraded the Netlify toolchain for Node.js 24. Changes and verification are recorded in `outputs/review-2026-09-22/REVIEW.md`; original source copies are in that directory's `before/` folder.

This is a local code update. No production deployment, collector run, historical-data repair, or model retraining was performed. The existing source/model ages below remain applicable.

## Production release candidate — 2026-09-20

Final release candidate work is implemented in the canonical workspace. Run `npm run dev`, then open `http://127.0.0.1:4173/`. The product uses one orange brand treatment with native dark/light/system appearance; old `accent` query parameters are inert. Publication uses the existing GitHub-to-Vercel integration; current deployment status is recorded in GitHub deployments.

- Four page destinations replace the sidebar/long-page structure: Matches, Events, Teams & players, My picks. Mobile has a fixed bottom navigation.
- Match pairing, probabilities and draft/save controls lead the page, with supporting evidence, expandable lineups and a Veto Lab alongside. Veto now separates selecting a map from committing it.
- Stable orange brand treatment, dark/light/system appearance, local Sora and matching compact embeds. Semantic status and chart series colors remain distinct from the brand color.
- Preserved existing event formats, profiles, comparisons, follows, sharing, model information and storage keys.
- Corrected match normalization so an old date alone cannot create a completed result; missing scores and missing veto evidence stay unknown.
- Verification: `npm run check`, orange palette contrast, chart contract tests, catalog age fixtures, direct browser interactions and five responsive widths. The isolated fresh-data pick fixture passed select/save/reload/change/remove. Details and limits: `outputs/launch-2026-09-20/RELEASE.md`.
- Schedule, history, player lineup, live-envelope and forecast artifacts are synchronized to the verified 20 September public capture. The candidate carries 24 forecasts generated at 12:54 UTC from the 11:26 UTC source capture from the retained `bounded-elo-vrs-v1` champion; its registry metadata remains the last validated evaluation (generated July 28, trained through June 8) and is not presented as a fresh model benchmark. Player performance remains mixed-age (statistics June 8; lineup metadata September 20). Eleven history rows with no source result timestamp were quarantined instead of being dated from the envelope timestamp; raw source rows remain available to the current-surface age/status filters.

## Earlier local work — 2026-09-16

The canonical workspace is `/Users/melvin/Documents/CS2 Predictor`. Start the local preview with `npm run dev`; it uses bundled snapshots and does not collect live data. Production has not been updated in this pass.

- Rebuilt the interface as a task-first workspace with sidebar navigation, native Dark/Light/System themes and locally served Sora fonts, following the user's latest direction.
- Added strict source-age checks, stale-pick locking, monotonic snapshot application, bounded upstream requests and explicit retry/fallback messaging.
- Fixed the Veto Lab's empty-event-map-pool failure, with an explicit model-pool simulation notice.
- Added shared dialog keyboard containment, background isolation, search arrows, focus restoration and reduced/keyboard motion behavior.
- Verification: `npm run check`, `npm run test:browser`. Browser checks cover real interactions and responsive widths from 320px to 1440px; screenshots are under `outputs/browser-check/`.
- Data remains historical (July snapshots; some player evidence is older). No model retraining, collector deployment, warehouse migration, cloud refresh or production release was performed. Historical deployment statements below are not current verification.

## Historical release record (preserved)

The remaining sections describe the recovered earlier release, not the current deployment state.

## Objective

Ship a populated, premium CS2 intelligence product whose frontend scales to new events and data sources without event-specific rewrites.

## Acceptance Criteria

- Current matches, rankings, and the tournament calendar are populated.
- Every event opens into matches, format, field, and forecast views.
- New formats and source updates enter through a versioned data boundary.
- Official crests resolve where HLTV publishes one; honest initials remain for source placeholders.
- Desktop and 390px mobile layouts have no overflow, broken images, or console errors.

## Decisions

- Preserve the StrikeSignal mark, electric-blue broadcast palette, and condensed editorial type.
- Keep motion tied to model flow, live state, or bracket movement rather than decoration.
- Use stable IDs and normalized snapshots as the collector/frontend boundary.
- Keep the scraping worker external to Vercel; the frontend probes a generic live endpoint and stops polling when it is unavailable.

## Completed

- Built a dense match desk with date, status, event, series, probability, signal, and veto views.
- Built reusable Swiss, GSL, knockout, double-elimination, round-robin, and custom-stage renderers.
- Added event-level overview, match, format, and team workspaces plus partial-field safeguards.
- Added 17 events, 11 current series, July VRS top 30, XSE results, EPL groups, and the full BLAST 32-team field.
- Added a standalone 39-crest registry sourced from official HLTV assets.
- Added contract normalization, live upserts, stable fallback IDs, schema documentation, and build-time data validation.

## Verification

- Desktop: zero overflow, zero broken images, zero console warnings or errors.
- Mobile 390x844: landing, match desk, event overview, and GSL format passed with zero overflow.
- Event engines: XSE 7 results, BLAST 16 pairings, EPL 4 groups and 8 invites, FRAG partial-field fallback passed.
- BLAST field: 32 teams, 32 resolved crests. EPL field: 24 teams, 20 official crests and 4 HLTV placeholders.
- `npm run build` and `git diff --check`: passing.

## Deployment

- Product release commit: `55e355a`.
- Vercel production deployment: `dpl_8pnoMsXZVnxWrHZzV31RoED1AKbC`.
- Production alias: `https://cs2-predictor-ebon.vercel.app/`.
- Production browser QA matches local verification with zero console errors.
- GitHub `main` still needs the local fast-forward because the installed GitHub integration rejects write operations and terminal Git has no credentials.

## Remaining

- Implement the hosted `/api/live-snapshot` collector later; no frontend changes are required.
