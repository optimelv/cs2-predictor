import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const workflowPath = ".github/workflows/update-predictions.yml";
try {
  await access(workflowPath);
} catch {
  console.log("refresh workflow contract tests skipped: workflow is excluded from this deploy context");
  process.exit(0);
}

const workflow = await readFile(workflowPath, "utf8");
const position = (needle) => {
  const index = workflow.indexOf(needle);
  assert.notEqual(index, -1, `Refresh workflow is missing: ${needle}`);
  return index;
};

assert.match(workflow, /cron: "17 \*\/3 \* \* \*"/);
assert.match(workflow, /ghcr\.io\/flaresolverr\/flaresolverr:v3\.5\.0/);
assert.doesNotMatch(workflow, /flaresolverr:latest/);
assert.match(workflow, /server\.py --once --output/);
assert.match(workflow, /preserving the last verified release/);
assert.match(workflow, /steps\.snapshot\.outputs\.available == 'true'/);

const freshness = position("Validate freshness and source health");
const tierFilter = position("Enforce the Tier 1/2 product boundary");
const modelPromotion = position("Evaluate and safely promote the production model");
const publication = position("Commit verified Tier 1/2 data");
assert.ok(freshness < tierFilter, "Freshness must be checked before product filtering.");
assert.ok(tierFilter < modelPromotion, "Tier filtering must happen before model promotion.");
assert.ok(modelPromotion < publication, "Model gates must pass before publication.");

console.log("refresh workflow contract tests ok");
