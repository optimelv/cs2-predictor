import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, app, registry] = await Promise.all([
  readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
  readFile(new URL("../docs/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/app.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/data/model-registry.json", import.meta.url), "utf8").then(JSON.parse),
]);

assert.match(html, /id="modelSlices"/);
assert.match(app, /monitoring\.champion_slices/);
assert.match(app, /Accuracy by match type/);
assert.match(css, /\.model-slices/);
assert.equal(registry.monitoring.window, "purged_chronological_cv");
assert.deepEqual(registry.monitoring.champion_slices.map(({ key }) => key), ["tier_1", "tier_2", "bo1", "bo3", "bo5"]);
assert.equal(registry.monitoring.challenger_slice_gate.passed, true);
assert.equal(registry.champion.segment_calibration.version, "tier2-shrink-v1");
assert.equal(registry.monitoring.segment_calibration.active, true);
console.log("model monitoring UI contract tests ok");
