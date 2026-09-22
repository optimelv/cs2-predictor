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
function assertMonitoringOutcome(value) {
  const gate = value.monitoring.challenger_slice_gate;
  assert.equal(typeof gate.passed, "boolean");
  assert.ok(Array.isArray(gate.checks));
  const eligible = gate.checks.filter((check) => check.eligible);
  for (const check of eligible) assert.equal(typeof check.passed, "boolean");
  assert.equal(gate.passed, eligible.length > 0 && eligible.every((check) => check.passed));
  // Rejecting a challenger is a valid production outcome, not a broken UI.
  if (value.challenger.promotion_passed) assert.equal(gate.passed, true);
  const calibration = value.champion.segment_calibration;
  assert.equal(value.monitoring.segment_calibration.active, Boolean(calibration));
  if (calibration) {
    assert.equal(calibration.version, "tier2-shrink-v1");
    assert.ok(Number.isFinite(calibration.tier_2_shrink));
    assert.ok(calibration.tier_2_shrink > 0 && calibration.tier_2_shrink <= 1);
  }
}
assertMonitoringOutcome(registry);
const rejected = structuredClone(registry);
rejected.challenger.promotion_passed = false;
rejected.monitoring.challenger_slice_gate = {
  passed: false, checks: [{ key: "tier_2", eligible: true, passed: false }],
};
assertMonitoringOutcome(rejected);
rejected.challenger.promotion_passed = true;
assert.throws(() => assertMonitoringOutcome(rejected));
console.log("model monitoring UI contract tests ok");
