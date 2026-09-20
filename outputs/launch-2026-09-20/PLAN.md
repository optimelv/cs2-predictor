# StrikeSignal: final orange release plan

Date: 20 September 2026. User authorization: finalize the site in orange, fix remaining bugs, make charts hoverable, prepare a launch-ready version, first write the complete plan and then have one Luna agent at maximum reasoning execute it.

## Target and boundaries

Deliver one reviewed release candidate of the existing CS2 consumer product, using the approved orange direction. Finish existing features and repair defects rather than adding an unrelated product roadmap or migrating frameworks. Maintain the canonical workspace, local Sora, dark/light/system appearance, existing data contracts and local-storage compatibility. The current folder has no Git metadata; take a named recovery snapshot before edits and report the actual files changed.

Use the installed ibelick/Jakub/Emil-related skills. `better-interface` owns the cross-domain inspection using the six `better-*` owners; `emil-design-eng` governs restrained, responsive interaction feedback. `fixing-metadata` covers share metadata. No Impeccable-driven redesign and no installation/synchronization of skills.

This plan authorizes repository changes, local builds, reversible test fixtures, read-only production/source checks and tests. It does not authorize a paid service, new account, destructive data replacement, model promotion without its gates, unsolicited communications or public deployment. Prepare a concrete deployable artifact and exact release instructions. Existing deployment/data access may be inspected without printing credentials. Record any external gate honestly rather than claiming it passed.

## Known starting evidence

- Orange and blue are currently selectable via a preview toolbar, `docs/accent.js`, URL parameters, CSS and compact embeds. This must become a single orange production design.
- `docs/app.js` contains player rating line charts with tiny circle `<title>` targets and a comparison line chart with no per-point interaction.
- The existing browser CLI script uses agent-browser and has not been executed against the latest refinement. Native CUA browser tooling is available for permitted live interaction checks.
- `npm run check` and the most recent reliability/veto tests passed before this task. They are a baseline, not proof that all user flows work.
- The real snapshots are historical. Stale locks and unavailable-result semantics are intentional and must remain intact.
- CURRENT_STATE.md, ROADMAP.md and deployment docs contain historical release statements and some outdated design directions. Distinguish historical claims from current evidence.

## Phase 1: inventory and reproducible defect list

1. Read local instructions and current source, PRODUCT.md, DESIGN.md, CURRENT_STATE.md, deployment configuration and existing tests.
2. Inventory every chart/visualization and its render path: individual player form, two-player comparison, traits, map performance, team/history form, probability/closing history, model monitoring/calibration and event/bracket visuals. Classify what is a true data chart versus a progress/selection decoration.
3. Walk the complete product flow at desktop and mobile: Matches, filters/days, match selection, profiles, Veto, Events and all supported formats, Teams/rankings, Players and comparison, My picks/follows, search, sharing/import and embeds.
4. Record each verified defect with reproduction, impact, owner and acceptance check. Prioritize broken actions, wrong data/state, inaccessible content and overflow before minor polish. Include loading, empty, unavailable, error, missing-image and long-name cases.
5. Preserve unrelated/user changes. Work in existing modules and avoid another global override stylesheet.

## Phase 2: orange production design

- Remove color-preview UI, preview-only copy, blue branding branch and temporary review behavior from the product and embeds. Orange remains the only brand accent in both themes.
- Old `?accent=blue` links and saved preview preferences must not revive blue, break routing, or wipe unrelated URL state or local picks. Remove obsolete imports/tests where appropriate.
- Keep useful semantic colors and distinct chart series colors: orange branding does not mean rendering two compared series indistinguishably.
- Apply consistent readable type, surfaces, focus/selected states and action hierarchy across the existing destinations, dialogs and embeds. Remove confirmed leftover slogans and duplicate wrappers, not useful evidence.
- Consolidate the touched styling rules where safe. Do not claim a full legacy-CSS rewrite unless actually completed.

## Phase 3: interactive charts

Build a small shared chart interaction module consistent with the vanilla app rather than introducing a heavy chart dependency.

Acceptance:
- Pointer hover within a usable chart plot area resolves the nearest real point or bar, shows a stable tooltip and visible active marker/crosshair where appropriate. Tiny circles alone are insufficient targets.
- Tooltip content gives the actual metric, value/unit, player/team, date/opponent/event and sample where the underlying record supplies them. Missing evidence remains missing. Never interpolate invented observations or turn missing values into zero.
- Comparison charts identify both series and distinguish chronological date alignment from per-series order. Do not pretend two differently dated matches occurred simultaneously.
- Tooltips stay within viewport/scroll container bounds, do not obscure their own trigger or clip under dialogs, and update/clear correctly after rerender, filtering, theme change and navigation.
- Keyboard users can enter the chart and inspect points with clear instructions/focus; Escape dismisses. Provide an accessible text/table alternative without hundreds of Tab stops.
- Touch tap selects a point/bar, another tap updates it and dismissal works. Tooltips are not hover-only. Respect reduced motion; frequent point tracking should be immediate.
- Verify zero/one/many points, absent values, long names, resizing, both themes, overlapping series and detached/recreated charts. Clean up listeners and avoid duplicate handlers/memory growth.
- For probability bars or simple statistics that already label every value, add interaction only when it reveals useful additional evidence; do not add meaningless tooltips solely to satisfy a visual checklist.

## Phase 4: functional completion and reliability

- Navigation: canonical hashes/entity links, reload, Back/Forward, active page, scrolling and focus after opening/closing details. Preserve match/event/player/compare/picks share URLs and meaningful page titles.
- Picks: draft → save → reload → My picks → change/remove while eligible, settled results, stale/live locks and storage failure. Use an isolated test origin/fixture for fresh states; never modify real timestamps to unlock the live dataset.
- Follows/imports: persistence, counts, suggestions, direct navigation and non-destructive import preview.
- Veto: selection versus commitment, 7-step rules, auto/undo/reset, pool/missing-history semantics, first-team switch and mobile sticky action.
- Events/brackets: Swiss/GSL/knockout/double elimination/round robin/custom/partial/unknown cases, official versus simulated state, dependencies and shared links.
- Players/teams: loading/missing data, comparisons, history tabs, correct labels/scales and search keyboard flow.
- Runtime/API: bounded requests, abort/timeouts, retry/backoff, last-good fallbacks, no uncaught errors, stable IDs and status normalization. Never mark an elapsed scheduled match as finished without result evidence.

## Phase 5: release surface and data gate

- Check title/description/canonical/OG/Twitter metadata, favicon/manifest/theme color, 404 and deep-link behavior, external link safety, asset paths and cache rules. Do not invent contact/company/legal facts.
- Check frontend for embedded secrets and unsafe HTML/URL handling without printing sensitive values. Keep API inputs bounded and rate/caching behavior appropriate to existing endpoints.
- Verify static production build and deployment configuration agree on commands/output/API routing. Prepare the release candidate and rollback instructions.
- Inspect existing data-update workflow, public source timestamps and live endpoint. Correct repository-level pipeline problems where possible, and validate any genuine newer source in staging before publishing a snapshot. Do not overwrite the warehouse or promote unsupported tiers/models.
- If no verified current source is accessible, the live-data launch gate fails. Complete all other work and identify the exact missing access/service/fresh data requirement. An honestly labeled archive preview may be technically deployable, but it is not equivalent to the requested live consumer launch.

## Phase 6: verification and handoff

Required checks:
1. `npm run check` after implementation, plus focused substantive tests for chart data/interaction logic and confirmed bug regressions. Do not add tests that merely duplicate implementation strings.
2. Real browser checks of the core paths above and charts via supported CUA tooling. Update the checked-in browser suite for the final product. If a runner is not executed, say so; do not call syntax-checking the runner a browser pass.
3. 320, 390, 768, 1024 and 1440px layouts; both themes; keyboard-only critical flows; reduced-motion behavior and 200% zoom where tooling allows. Inspect actual component clipping as well as document width.
4. Fresh/stale/missing/error fixture states and storage/reload; fixtures clearly isolated, no production data changes.
5. Captures of final orange desktop/mobile, interactive player/comparison tooltip and Veto. No preview controls in final screenshots.
6. Root-agent independent review of changed files, reported verification and selected browser checks. Fix material review findings and rerun only affected checks.

Deliver files under `outputs/launch-2026-09-20/`:
- `BUGS.md`: verified defects, fixes and evidence.
- `CHARTS.md`: chart inventory and interaction/accessibility contract.
- `RELEASE.md`: exact candidate status, commands, verification results, remaining gates and deployment/rollback steps.
- Relevant final screenshots and concise test logs, with no credentials/private auth data.

Update CURRENT_STATE.md and appropriate README/DESIGN/deployment docs to the final orange implementation, retaining historical records clearly as historical. Do not claim launch readiness while a critical functional, security, build or data gate remains unresolved.

## Execution ownership

One Luna executor at maximum reasoning owns the full implementation, bug fixes, relevant tests, product documentation and the three reports above. It must not delegate further. The root agent owns this plan and an independent read-only release assessment, and performs final review. The worker is not alone in the workspace and must not revert other edits.
