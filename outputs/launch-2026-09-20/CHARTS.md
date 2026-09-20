# Chart inventory and interaction contract

| Surface | Current visual | Interaction decision |
| --- | --- | --- |
| Player profile | Rating 3.0 form timeline by recorded series | Shared interactive line chart. |
| Player comparison | Two Rating 3.0 timelines on a common value scale | Shared interactive line chart, with independent-series-order warning. |
| Player traits, map profile, team map/history and model slices | Labeled score rows or data bars | Keep direct values and text labels; no tooltip that merely repeats them. |
| Match probability split and prediction movement | Directly labeled probability/statistic | Keep the existing label as the accessible value. |
| Event formats and brackets | Structural event visualization | Do not treat as metric charts. |

`docs/lib/chart-interactions.js` provides `renderInteractiveLineChart(options)` and `installChartInteractions(root)`. The renderer accepts finite source points only. A point carries its supplied `label` (for example, date and opponent), `value`, and optional evidence `details`; missing or invalid values are omitted rather than converted to zero. The browser-safe module also exports `normalizeChartSeries`, `getLineChartDomain`, `pointToPlotPosition`, and `findNearestPoint` for deterministic tests.

Each rendered chart has a full-plot pointer target, nearest-real-point lookup, visible marker and crosshair, and a tooltip clamped to the visible chart, viewport, and scroll-container bounds. Pointer tracking is immediate. Tap selects a point; tap outside the plot or Escape dismisses it. Keyboard focus exposes the first point, arrows move through recorded points, Home/End jump, and Enter/Space confirms the current point.

The SVG is one keyboard stop. A native `details` disclosure holds the complete semantic data table, avoiding a tab stop for every point. Tooltips preserve supplied date/opponent/event evidence. Comparison charts state that horizontal positions are each series' independent order, so equal x positions do not imply matching dates. The styles maintain orange branding while using red, green, and violet for additional compared lines, include visible `:focus-visible` outlines, respect forced colors, and disable transitions under reduced motion.

Focused Node verification: `node scripts/test-chart-interactions.mjs` covers invalid/missing values, one-point and flat domains, ordinal geometry, nearest-point selection, escaping, actual labels, the comparison-date warning, and the accessible data-table contract. In the local browser preview on 20 September, keyboard focus plus ArrowRight displayed donk’s recorded Rating 3.0, date/opponent, event, ADR/K/D, active marker, and crosshair. The tooltip remained within the plot and viewport; Escape hid the tooltip, marker, and crosshair. No new browser console errors were present after that check. Broader responsive and touch-device release checks remain part of the final release pass.
