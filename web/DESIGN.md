# Circuit — StrikeSignal interface system

Revision: 2 November 2026. The system is specific to a CS2 match and tournament
product. It replaces the previous true-black desktop-tool direction. The live
reference is `/#/system`; `web/styles.css` owns the tokens and compositions.

## Identity and reference decisions

Blue-slate match boards, readable score pairs, an orange data signal and visible
winner paths are the signature. Keep Sora and the StrikeSignal name; use the new
angular two-stroke mark. This is not Relay's desktop canvas or Margin's editor.
The work surface is the schedule and its tournament context, not a KPI dashboard.

GBrain's component-libraries, Margin resource index, inspiration/design-systems
and icons/fonts/assets pages were reviewed as a resource catalog. BoardUI's
[data components](https://www.boardui.com/) informed hierarchy and restraint;
no BoardUI code or Pro assets were copied. Its [license](https://www.boardui.com/license)
distinguishes public/free source from Pro. [Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview)
informed the shared spacing scale. [Spectrum color](https://spectrum.adobe.com/page/color-system/)
informed semantic color roles and paired themes. Their brand palettes are not copied.

The catalog considered shadcn/ui, pdfcn, ShadcnLabs, Obsidian UI, PixelPerfect,
Xevrion, Rare UI, Arise UI, Spectrum UI, EvilCharts, Originkit, Atelier, Sora UI,
Cue, beUI, Panel UI, useLayouts, Libraries.dev, Affect UI, Kobra, Watermelon,
21st.dev, Cult UI, BoardUI, UIArc, 404s, mcpcn, termcn, editorcn, Komo and Bencho.
These are catalog references, not a claim to have audited every current component
or license. Existing shadcn/Base UI controls cover the product. Chart, editor,
marketing and terminal packages add no needed behavior here and are not installed.

Taste app guidance, Emil's interaction guidance and Jakub's interface/layout/
color/accessibility guidance govern review. Use these principles to assess the
actual screen, not to reproduce another project's style.

## Foundation contract

| Role | Dark | Light |
|---|---|---|
| Canvas | #101c24 | #edf2f3 |
| Surface | #182a35 | #ffffff |
| Raised surface | #203643 | #ffffff |
| Main text | #edf4f7 | #172b36 |
| Secondary text | #a8bdc8 | #526773 |
| Boundary | #344c5a | #c5d2d8 |
| Model/winner signal | #ffa36c | #a53d0e |
| Error | #fb8a9a | #b4233c |

Use semantic tokens, never hex colors in view components. Original artwork gets
a neutral plate (#767676), with no invert/brightness filters. Missing artwork
uses initials; the readable team name always remains next to it.

Sora is served locally. Page headings 42px desktop/30px phone; section headings
18px; team/body 14px; supporting labels 12px; tiny bracket metadata 11px. Scores
and probabilities use tabular numbers. Important numbers remain selectable text.
Headings wrap; team names may break inside long words; labels must not obscure actions.

Spacing uses named `--space-*` tokens on a four-pixel scale: 4, 8, 12, 16, 20,
24, 32, 40, 48, 64, 80px. A 1px list seam is a border treatment, not layout spacing.
Product view spacing outside these tokens fails `test-design-system.mjs`.
Shadcn internals retain their package geometry. Views use the shared compositions.
Max canvas 1240px including gutters; desktop gutters 24px, phone gutters 16px.
Cards 16/24px inset, sections 32/48px apart, control groups 12/16px gap.
All flex/grid content columns use min-width zero or minmax(0,1fr). Horizontal
scroll belongs to the labelled bracket viewport, never the page.

## Product composition and case matrix

| Composition | Cases that must remain covered | Contract |
|---|---|---|
| Header/navigation | 320px, desktop, current route, keyboard | Brand and controls first; phone nav on second row; one current-route indicator |
| Page/object heading | long title, one action, narrow viewport | Shared gap; action moves below on phone; no manual per-title offset |
| Match row | fixture, result, missing forecast, cancelled, long team, failed crest | Two team rows, numeric column, separate context; genuine zero stays zero; missing stays dash |
| Match list | multiple days, empty filter, more results, saved picks | Day separators; Schedule and Results are disjoint; Following is explicitly personal |
| Event list | current, archived, undated, search empty, long event name | Current/Archive/Dates pending are disjoint; no duplicate All view |
| Event coverage | complete reconstruction, published partial draw, unknown format, retry | Count all stored matches; state what is actually known |
| Series card | zero, missing score, long name, detail expanded, TBD draw | One shared `Series` component used in events and showcase |
| Bracket lane | complete knockout, multiple groups, third place, absent edges, phone scroll | One shared measured connector renderer; only known winners connect; expanding a card recalculates paths |
| Partial archive | assigned plus unassigned results, pagination, source overlap | No stored result disappears; no fabricated round; only exact one-to-one cross-provider duplicates collapse |
| Player/profile | portrait missing, old stats, missing trait, comparison | Preserve source dates; unknown and zero differ; Closing and Clutching stay separate |
| Data recovery | initial load, refresh, API failure, retry, older snapshot | Keep verified content; visible retry; never relabel old data as fresh |
| Inputs/overlays | focus, disabled, selected, busy, validation, Escape | Installed Base UI primitives own behavior; focus returns to trigger |

Installed primitive families and their interaction matrix live on `/#/system`.
The same page mounts real long-name, score-zero, unknown-score, TBD and connected
bracket compositions. It is not a separate imitation of product markup.
New cases must first extend this matrix and the rendered reference. New layout
exceptions require a shared composition or token; do not add one-off offsets.

## Tournament evidence rules

Join stored history with the supported event's snapshot and current feed using
exact event names or reviewed aliases. A recorded final result outranks an old
live/scheduled copy. Same event/day/teams/per-team scores can identify a single
HLTV/PandaScore duplicate; ambiguous rematches and disagreements are preserved.

Reconstruction requires a complete power-of-two single-elimination field, one
loss per eliminated team, one champion and an explicitly identified final.
Each preceding round is proven by the recorded winners and opponents' win counts.
All matches must be consumed. Dates do not invent progression. Label the output
“Reconstructed”, not “Published draw”. Mixed/group formats remain published or
partial, with every unassigned stored result listed. Published knockout rounds
connect only when the preceding recorded winner uniquely matches the next team.
Third-place matches do not become an input to the final.

## Motion contract

Pointer press: 150ms, subtle scale. Row arrow: 180ms, 2px movement on fine hover.
Series detail and entering tab panel: 180ms, 6px reveal with
cubic-bezier(.16,1,.3,1). The departing panel leaves layout immediately; two tab
panels must never stack during animation. Refresh rotation exists only during
an active request. No ambient animation, animated scores or artificial loading.
Keyboard navigation suppresses decorative motion. Reduced-motion preference
suppresses animations and transforms. Resizing connectors is immediate.

## Verification and limits

`npm run check`: shared contracts, archive reconstruction/deduplication, data
state rules, token boundaries, build and reliability checks.
`npm run test:product`: previous product flows plus the concrete archive/filter/
retry/long-name/connector regressions, both themes, 320/390/768/1440px, contrast,
keyboard and reduced motion. External media requests are blocked in automated
checks; synthetic white/black/broken artwork tests the rendering behavior.
Screenshots still require visual inspection. These tests cover the listed cases;
they do not prove that all future data or devices are bug-free.

Legacy tournament simulation/transfer tools and embeds keep their contracts and
remain under the labelled classic tools link. PandaScore's fixture feed does not
provide complete current player traits/photos. Stored profile coverage and
unknown archive rounds remain explicit data limits. No historical collection or
HLTV access was started for this redesign.
