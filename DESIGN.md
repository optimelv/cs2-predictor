# StrikeSignal — Circuit

Updated 2 November 2026. The product uses React, TypeScript and shadcn/Base UI.
Its own visual identity is blue-slate match boards, readable score pairs, orange
data signals and connected winner paths. It does not reuse Relay's canvas style.

The authoritative design contract, palette, spacing, component/state matrix,
reference decisions and verification rules are in [web/DESIGN.md](web/DESIGN.md).
The rendered system is `/#/system`. New cases must extend both before introducing
view-specific styling. `npm run check` enforces spacing and semantic color rules;
`npm run test:product` exercises the product and archive boundary cases.
