# StrikeSignal Release State

## Objective

Ship StrikeSignal as a populated, universal CS2 prediction product rather than a single-event Major page.

## Acceptance criteria

- Current matches, active events, and upcoming tournaments are populated.
- Tournament rooms adapt to the selected event and known format.
- July VRS rankings and projected movement are visible.
- Existing detailed Cologne playoff data remains available as an archive.
- Desktop and mobile layouts remain polished and usable.
- Refresh tooling does not spend Apify free-plan credits automatically.

## Decisions

- Preserve the StrikeSignal mark, electric-blue accent, and condensed display typography.
- Use a dense editorial broadcast-desk direction instead of generic SaaS cards.
- Use the bundled coverage snapshot as the reliable public fallback.
- Keep the credit-consuming Apify workflow manual-only until a hosted FlareSolverr worker exists.

## Completed

- Rebuilt the page around live match calls, an event calendar, tournament rooms, rankings, and model context.
- Added six current match calls, thirteen events, the XSE semifinals, the full BLAST Bounty field, and VRS top 30.
- Added format-aware event views, matchup probabilities, map context, ranking movement projections, and responsive motion.
- Verified event switching, completed-event playoff rendering, ranking order, and mobile behavior.

## Verification

- Desktop at 1280px: passed.
- Mobile at 390px: passed with no horizontal overflow.
- Browser console: no errors or warnings.
- Event switching and Cologne archive: passed.
- Static checks: passed.
- GitHub `main`: pushed.
- Vercel production: live at `https://cs2-predictor-ebon.vercel.app`.
