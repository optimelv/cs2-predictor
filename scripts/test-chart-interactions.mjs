import assert from "node:assert/strict";
import {
  findNearestPoint,
  getLineChartDomain,
  normalizeChartSeries,
  pointToPlotPosition,
  renderInteractiveLineChart,
} from "../docs/lib/chart-interactions.js";

const normalized = normalizeChartSeries([
  { id: "alpha", label: "Alpha <strong>", points: [{ label: "20 Sep · vs Bravo", value: "1.14", details: ["Event A", "84.2 ADR"] }, { label: "missing", value: null }] },
  { label: "Broken", points: [{ label: "no", value: "NaN" }] },
]);
assert.equal(normalized.length, 1, "series with no finite points is omitted");
assert.equal(normalized[0].points.length, 1, "missing values never become zero-valued points");
assert.equal(normalized[0].points[0].label, "20 Sep · vs Bravo");

const flat = getLineChartDomain(normalized, 1);
assert.ok(flat.max > flat.min, "one or flat values get a usable range");
assert.ok(flat.min <= 1 && flat.max >= 1.14, "baseline and observation stay in domain");
const only = pointToPlotPosition(normalized[0].points[0], 0, 1, flat);
assert.equal(only.x, 331, "a singleton is centered in the usable ordinal plot");

const nearest = findNearestPoint([{ x: 20, y: 50, name: "a" }, { x: 80, y: 52, name: "b" }], 77, 30);
assert.equal(nearest.name, "b", "nearest lookup resolves a real existing observation");
assert.equal(findNearestPoint([], 1, 1), null);

const markup = renderInteractiveLineChart({
  id: "compare <unsafe>", title: "Alpha < Bravo", description: "Recorded dates only.", metricLabel: "Rating", valueFormat: (value) => `${value.toFixed(1)} rating`, decimals: 2, baseline: 1,
  series: [
    { id: "alpha", label: "Alpha", points: [{ label: "2026-09-20 · vs Bravo", value: 1.1, details: ["Event A"] }] },
    { id: "bravo", label: "Bravo", points: [{ label: "2026-09-18 · vs Alpha", value: 0.96, details: ["Event B"] }] },
  ],
});
assert.match(markup, /data-interactive-line-chart/);
assert.match(markup, /Each line follows its player or team/);
assert.match(markup, /2026-09-20 · vs Bravo/);
assert.match(markup, /1.1 rating/, "custom value formatting survives serialization for interaction and table output");
assert.match(markup, /preserveAspectRatio="none"/, "client-point mapping stays linear at every rendered width");
assert.match(markup, /First recorded/);
assert.match(markup, /Latest recorded/);
assert.match(markup, /chart-axis-label/, "the metric scale is rendered as readable SVG text");
assert.match(markup, /Alpha &lt; Bravo/);
assert.doesNotMatch(markup, /compare <unsafe>/, "attributes and labels are escaped");
assert.match(markup, /<details class="chart-data-details">/, "native details keeps data-table tabs bounded");

console.log("chart interaction contract tests ok");
