# StrikeSignal product readiness — 2 November 2026

## Scope and data decision

The product keeps the existing dataset and supports Tier 1 and curated Tier 2
main events. It adds current fixtures and results through the user-authorized
PandaScore free Fixtures account. It does not resume a historical collection.
The previous HLTV heartbeat was removed at the user's request. No paid plan,
provider contact, proxy rotation or challenge bypass was used.

The source checkout is `/Users/melvin/ChatGPT/StrikeSignal`. The existing
Documents workspace and its local changes were preserved.

## Verified source activation

- PR19 merged as `867372650456d16ba4768a25e972c0d21c00e9e7`.
- Oracle activation: 2026-11-02 01:34:47 UTC; backend `pandascore-rest`.
- First snapshot: 112 normalized fixtures/results, 9 provider events. Sixteen
  unqualified catalog tournaments were excluded by the source/product filters.
- Second automatic poll: 01:39:48 UTC, healthy. Cadence: 300 seconds.
- Existing source pauses and all 874 profile retry records were preserved.
- Native server SHA256: `397decba513bd9359d66cb6b0a27ca28226e32281ab9e25f3c4accf5e5adca56`.
- Native adapter SHA256: `6e7917c15022bf07bb1602ec46fcce7a6d1a23be688f139b9c1759e7085b69fc`.
- Root-only credential file mode: 0600. No provider key is required in the browser,
  GitHub or Vercel. The local handoff file was deleted after activation.
- Oracle rollback evidence is retained in
  `/var/lib/strikesignal/releases/pandascore-20261102T013438Z/ACTIVATION.json`.
  Returning to HLTV is not an automatic fallback.

The complete data publisher succeeded:
https://github.com/optimelv/cs2-predictor/actions/runs/41373516938.
It published commit `9c2af7b535c8501652f0b79f8117a8cc91d050d0`.
Vercel production `dpl_4cTXHYccRZ3LM8qtmuy9cawGzLQt` was READY at the public
alias `https://cs2-predictor-ebon.vercel.app`. Predictions, live cache, catalog and
IEM bracket endpoints returned HTTP 200. A subsequent UI release is verified below.

## Product implementation

React 19, TypeScript, Vite and official shadcn Base UI/Nova components own the
main entry point. Local Sora and the existing orange identity are preserved.
The interface system documents 14 installed component families, contrast pairs,
state matrices, geometry, motion, evidence language and real product recipes.

Current matches lead the desk; cancelled fixtures do not carry forecasts.
Published scores, model estimates and unknown pairings have separate states.
PandaScore owns the current board, with conservative fixture identity reuse and
an activation barrier against replaying old results into the online model.
Five verified provider event aliases share one canonical event each, retaining
working links and replacing outdated calendar dates and rounds.

Tournament views use the shared bracket contract. Predicted winners never become
verified advancement. Published rounds remain browseable on small screens.
Player search, dated profiles, separate closing/clutching traits, two-person
comparison, team rankings, deliberate picks, veto select/confirm/undo/reset,
following, storage recovery and the paginated results archive are available.
Original artwork keeps its colors; a neutral plate supports white and black
logos, while broken images fall back to initials.

Existing query links are preserved. Tournament simulation, desk-link transfer
and the remaining classic tools stay reachable at `/legacy.html`; they are not
silently removed or placed in an iframe. Existing embed endpoints remain intact.

## Validation

- `npm run check`: all existing contracts/reliability checks, TypeScript and React
  production build, new product-data invariants.
- `npm run test:browser`: 13 Playwright product scenarios and 23 supported event formats,
  storage/source failures, old links and classic-tool compatibility.
- Viewports 1440, 768, 390 and 320px; light and dark; reduced motion; keyboard
  overlay closure and focus restoration. Axe WCAG 2 A/AA and 2.1 AA checks.
- Python live promotion: 14 tests, including provider event identity, cancelled
  forecasts and rejection of old-provider result replay. Worker adapter suite:
  52 tests in the source-channel release.
- shadcn showcase coverage: 14/14 component families.
- npm dependency audit: zero known vulnerabilities at this check.
- Public model privacy guard and `git diff --check` passed.

Browser checks block all non-origin requests. Taste's inspector additionally
blocks HTTPS before navigation so no player images or HLTV pages are fetched.
The checks establish rendered behavior and image-failure handling, not external
image availability. No physical-device, Safari or multi-day uptime claim is made.

## Design review

Taste app direction `true-black-flat`, seed 753842474. The app-screen criteria
apply; a sports desk does not acquire decorative photography or scroll reveals.
All nine final inspector images (three widths, fold and contact sheets) were
opened. Final measured result: 0 FAIL, 0 WARN. Source lint: 0 FAIL; warnings are
literal color-code formatting, documented state labels, disabled skeleton
animation, actual overlay shadows, a hover focus cue and unavailable-value dashes.

ROUND 1
Seen in one second: cancelled September fixtures precede the current slate.
Idea (one sentence): a CS2 match desk that keeps the evidence beside each series.
Live thing: fixtures refresh; users can inspect, simulate and save an eligible call.
Layout words by section: header=compact / filters=flat / fixtures=aligned rows.
Scores: design 7 · usability 6 · creativity 6.5 · content 6 → overall 6.5.
Caps applied: inaccurate content priority caps usability; no marketing-image cap
is applied to the app-screen brief.
Top three problems:
1. All fold screenshots: old cancellations displace today's fixtures. Sort current
   matches first and remove forecasts for cancelled/postponed fixtures.
2. All widths: dates and tournament context are too small. Raise data labels to 13px.
3. Event/data review: provider aliases duplicate old event dates. Use the reviewed
   source IDs to merge events consistently in publication and live refresh.

ROUND 2
Seen in one second: the next IEM pairings, their start times and model estimates.
Idea (one sentence): a compact match desk with separate source results and estimates.
Live thing: current fixtures, independent profile evidence, picks and veto scenarios.
Layout words by section: header=quiet / filters=compact / fixtures=readable table /
footer=tools and evidence.
Scores: design 7.5 · usability 8 · creativity 6.5 · content 8 → overall 7.5.
Caps applied: none from the app-screen measurements. This is an internal qualitative
review, not a measured user-outcome claim.
Remaining limits: third-party photos were deliberately blocked; the classic tool
surface remains visually older than the primary React desk.

| Before | After | Why |
| --- | --- | --- |
| Raster artwork flattened into white rectangles | Original artwork and tested neutral plates | Preserve identity and support white/black crests |
| Forecasts could imply verified advancement | Source-only winners and TBD future pairings | Keep results distinct from simulations |
| A provider refresh could replace stable event/slot IDs | Canonical event aliases and preserved fixture slots | Keep links and bracket positions stable |
| Refresh failures could leave eligible pick controls | Preserve dated data and block new picks | Avoid treating failed checks as current evidence |
| Unscoped CSS and DOM entry | Typed React views and shared shadcn states | Make loading/error/focus behavior consistent |

## Profile evidence and model limits

Oracle profile audit completed at 01:34:33 UTC for all 874 requested IDs. Counts
remain field-specific: 645 cached verified profiles, 643 stored statistics sets,
528 stored portrait URLs. A stored URL is not proof that its image can load now.

| Audit category | IDs |
| --- | ---: |
| Current statistics and stored portrait | 37 |
| Current statistics; source explicitly lacks portrait | 30 |
| Older verified statistics | 576 |
| Fetch error | 39 |
| Pending or partial evidence | 192 |

The audit also identifies 110 source-confirmed absent **fields** across IDs;
this is not an additional disjoint player category. Statistics retain source dates
from 23 October through 1 November. The full per-ID/source/date ledger stays on
Oracle at `/var/lib/strikesignal/player-profile-coverage-audit.json`.
The old HLTV profile import is not represented as fully successful.
PandaScore Fixtures does not supply replacement Rating 3.0/traits or complete
current lineups/map statistics. Those values remain dated or unavailable.

The current stored model monitoring evaluates 842 held-out series, with 61.8%
accuracy and Brier 0.230 before the recorded segment adjustment. Tier slices:
Tier 1 65.7% over 362 series; Tier 2 58.8% over 480. These are historical evaluation
results, not prospective performance, betting returns or proof that more history
would improve the model. Model training date and registry generation are separate.

GBrain's new design-resource pages were identified by the supplied brain context.
A fresh read was unavailable: no configured GBrain MCP tools were exposed and the
ambient CLI's datastore was held by another live server. That server and its locks
were left untouched. The named local Taste, Emil, Jakub and shadcn skills were applied.
