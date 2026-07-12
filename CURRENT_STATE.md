# StrikeSignal Release State

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
