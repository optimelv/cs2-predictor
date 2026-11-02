# Circuit design and archive review — 2 November 2026

The revision gives StrikeSignal its own blue-slate sports interface, orange data
signals, day-grouped match boards and connected tournament paths. The reference
catalog and explicit reuse decisions are recorded in `web/DESIGN.md`.

## Reproduced failures and corrections

- The event view and bracket API used the small event/current-match snapshot,
  leaving existing historical results out. BLAST Bounty S2 Finals had seven
  stored results but displayed only its final; the World Cup had 56 but showed
  only its final. Both now load the stored event results.
- An old live/scheduled copy could override an archived final. Finished results
  now survive these stale copies.
- BLAST's complete eight-team knockout field yields four quarterfinals, two
  semifinals, one final and six proven winner connections. Reconstruction is
  labelled explicitly. World Cup's missing stage assignments are not invented;
  its 56 matches remain visible, including the unassigned results.
- Published playoff rounds previously arrived in reverse order. Stage/group
  lanes are separate, rounds ordered and verified progression connected. Stable
  published slot identities survive refreshes and remain compatible with embeds.
- The provider migration created cross-provider duplicates. Only one-to-one
  same-day/team/per-team-score matches collapse; original IDs are retained as
  alternate identities. Ambiguous rematches and conflicting results stay separate.
- A new final may not yet exist in the historical export. Exact result detail
  lookup now also resolves supported published finals, preventing dead-end links.
- All/current filters were redundant. Schedule, Results and personal Following
  have distinct purposes. Current events, Archive and Dates pending are disjoint.
  An event with a future end date is not archived just because its first round is done.

## Design verification

The system page mounts actual series cards and the actual bracket renderer for
long names, zero scores, unknown scores, TBD pairings and connected rounds.
Shared spacing tokens and semantic view colors have automated guards. Both themes,
320/390/768/1440px layouts, keyboard navigation and reduced motion are covered.
The mobile event header and tabs were condensed after screenshot review.

`npm run check` passed after integrating origin/main `94b70f8` (including new
published data). `npm run test:product` passed its 13 existing scenarios across
23 supported event fixtures plus six new Circuit regression scenarios. The last
focused repeat also checks the portable browser launcher and stable slot targeting.

Screenshots and machine-readable results are in the ignored directory
`outputs/product-readiness/design-review/`; baseline and extended product checks
are in `outputs/product-readiness/browser/`. Taste inspection at 1440 and 390px
found zero page overflow and no broken loaded images. Its phone side scroller is
the intentional, labelled tournament viewport. Desktop and mobile screenshots
were visually inspected in both appearances, not inferred from build success.

Automated browser runs block external media. White/black/failed artwork is tested
with synthetic fixtures. This verifies rendering and fallback behavior, not the
availability of every third-party portrait. No HLTV collection or Oracle restart
was initiated for this revision. Existing provider polling and publication remain
on their established schedules.

## Remaining data boundaries

Historical mixed/group tournaments may still lack round assignments. Current
player statistics and portrait completeness remain source-dependent. This release
does not claim complete HLTV profiles or that every possible device/data state is
bug-free. Regression coverage is tied to the documented component/state matrix.
