# StrikeSignal Release State

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
