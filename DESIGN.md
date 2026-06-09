# Design System

## Register

product

## Visual Direction

Trading desk meets esports broadcast control room. Dark neutral surfaces, amber model-confidence accent, compact analysis cards, and clear warnings around prediction limits.

## Color

All colors are defined in OKLCH in `docs/styles.css`.

- `--bg`: near-black app shell
- `--surface`: elevated analysis panels
- `--ink`: primary readable text
- `--muted`: secondary labels and metadata
- `--primary`: amber confidence/action color
- `--accent`: cyan support accent used sparingly
- `--success`, `--warning`, `--danger`: semantic states

## Typography

Use a native system sans stack for product speed and legibility. Use tabular numerals for probabilities, ranks, and counts. Keep labels compact and uppercase only for metadata roles.

## Components

- Match cards show teams, event, confidence badge, probability rail, model pick, tags, and metadata.
- Summary cards use large tabular numbers with short labels.
- Segmented controls switch between upcoming and benchmark views.
- Tier tables stay dense, scrollable, and numeric-aligned.
- Buttons and controls use pill radii; panels use soft rounded rectangles.

## Motion

Use short 150-180ms ease-out transitions for hover and press feedback. Avoid decorative choreography. Respect `prefers-reduced-motion`.

## Accessibility

Target WCAG AA contrast, keyboard-visible focus, semantic landmarks, skip link, text labels on controls, and non-color confidence labels.
