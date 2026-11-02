# StrikeSignal design system

Updated 2 November 2026. The main application uses React, TypeScript and the
official shadcn Base UI/Nova components. Detailed tokens, component rules and data
language live in `web/DESIGN.md`; the rendered reference is `/#/system`.

The product keeps the existing Sora/orange identity. Main navigation is flat,
neutral and compact. Match pairings and probabilities carry the emphasis.
Dark mode uses true-black ground; light mode uses quiet neutral surfaces.
Original crests retain their colors, on a neutral plate where required. Broken
media uses named initials. No raster brightness/invert filters or decorative
page-entry animation.

Matches, events, players, teams and saved picks have dedicated views. Source
results, model estimates, dated statistics and unknown data have separate
language. Unconfirmed pairings stay TBD, and predicted winners never create real
advancement. New picks require a verified future fixture and a current source.

The local design-system page demonstrates every installed component family,
visible interaction states, measured contrast pairs and product compositions.
Keyboard interactions, touch targets, reduced motion, missing media, refresh
failure and blocked storage are part of the runtime contract.

The public entry is built from `web/`. `docs/next/` contains generated chunks;
`docs/index.html` points to those chunks after `npm run check`. Vercel and Netlify
build before publishing. Existing entity query links
are routed to the new desk. Classic tournament simulations and shared-desk links
remain reachable at `docs/legacy.html`; embeds retain their existing routes.

Release evidence and explicit limits: `outputs/product-readiness/RELEASE.md`.
