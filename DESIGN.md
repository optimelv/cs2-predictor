# StrikeSignal design system

Updated 20 September 2026. This consumer direction supersedes the quiet workspace proposal of 16 September. The user asked for an enjoyable CS2 prediction product with strong insights, clear interaction and a fixed brand color independent of team identity.

## Structure

Four primary destinations: Matches, Events, Teams & players, My picks. Desktop uses a top navigation bar; mobile uses a persistent four-item bottom bar. Team rankings and Players have their own subnavigation. Model & data remains available from the footer and match insights. Existing entity URLs remain supported.

Matches lead with the selected pairing and labelled win probabilities, followed by the user's pick. Supporting and opposing evidence sits alongside on desktop and below on mobile. Further series stay in compact rows. Detailed lineups and form expand on demand.

## Color and type

- Local Sora, tabular numbers and sentence case. Charcoal surfaces in Dark, warm near-white in Light. System appearance remains supported.
- `docs/consumer.css` contains the current main-app tokens and compositions. Legacy component structure and shared interaction behavior still come from the earlier sheets. Consolidation is a later maintenance task; do not add another override sheet.
- Orange is the single production brand treatment. Filled controls use `#ff6b35` with accessible text-accent tokens; semantic status and chart series colors remain independent where they carry meaning.
- The former accent preview script and controls were removed. Legacy `?accent=orange|blue` query parameters remain harmless URL state and cannot revive a second theme.
- `docs/embed/consumer.css` aligns match and bracket embeds with the same palette and local typeface.
- No decorative gradients, ambient glows or page-entry cascades. Separate content primarily with space and neutral rules.

## Interaction

Pick controls distinguish draft selection from the explicit Save action. Existing freshness and eligibility checks remain enforced. Veto choices similarly have separate selection and confirmation, with Undo, Reset and auto-completion. A confirmed action focuses the next available map.

Press feedback uses 140ms transforms; dialog transitions use 180ms transform/opacity. Keyboard interactions are immediate. Reduced-motion styles remove positional motion. No probability counters animate through fabricated values.

## Data language

Historical snapshots are explicitly labelled and do not permit new real picks. A passed start time does not prove a match finished. Only the source's declared match status is normalized; unknown scores remain unknown. Missing map/veto evidence is not rendered as a 0% statistic or a supported recommendation. Simulations remain distinct from published results.

## Validation boundary

`npm run check` covers product/data contracts, chart behavior helpers, catalog freshness fixtures and the orange text/background contrast pairs. Browser checks and screenshots for this implementation are recorded in `outputs/launch-2026-09-20/RELEASE.md`. This is not a full accessibility certification, physical-device test or evidence of engagement improvement.
