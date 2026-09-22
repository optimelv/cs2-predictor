import assert from "node:assert/strict";
import { access, readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

assert.match(workflow, /cron: "17 \* \* \* \*"/);
assert.match(workflow, /ghcr\.io\/flaresolverr\/flaresolverr:v3\.5\.0/);
assert.doesNotMatch(workflow, /flaresolverr:latest/);
assert.match(workflow, /server\.py --once --output/);
assert.match(workflow, /MAX_DETAIL_MATCHES=6/);
assert.match(workflow, /preserving the last verified release/);
assert.match(workflow, /from datetime import datetime, timedelta, timezone/);
assert.match(workflow, /fetched > now \+ timedelta\(minutes=5\)/);
assert.match(workflow, /Snapshot timestamp is in the future/);
assert.match(workflow, /steps\.snapshot\.outputs\.available == 'true'/);
assert.match(workflow, /git pull --rebase\s+git push/);
const publicationFiles = workflow.match(/git add ([^\n]+)/)?.[1].trim().split(/\s+/) || [];
assert.ok(publicationFiles.length > 0);
for (const file of publicationFiles) await access(file);
const entryHtml = await readFile("docs/index.html", "utf8");
for (const name of ["predictions", "coverage", "players"]) {
  const bundle = [...entryHtml.matchAll(/src="\.\/([^"?]+)(?:\?[^"]*)?"/g)].find((match) => match[1].endsWith(`/${name}.js`))?.[1];
  assert.ok(bundle, `Find the browser's ${name} bundle`);
  assert.ok(publicationFiles.includes(`docs/${bundle}`), `Publish the browser's ${name} bundle`);
}
assert.match(workflow, /--connect-timeout 10 --max-time 30/);

const freshness = position("Validate freshness and source health");
const tierFilter = position("Enforce the Tier 1/2 product boundary");
const modelPromotion = position("Evaluate and safely promote the production model");
const publication = position("Commit verified Tier 1/2 data");
assert.ok(freshness < tierFilter, "Freshness must be checked before product filtering.");
assert.ok(tierFilter < modelPromotion, "Tier filtering must happen before model promotion.");
assert.ok(modelPromotion < publication, "Model gates must pass before publication.");

// Exercise the exact promotion gate from the workflow, not a duplicate validator.
const gateBlock = workflow.slice(freshness, tierFilter);
const gateMatch = gateBlock.match(/<<'PY'\r?\n([\s\S]*?)\r?\n\s*PY\s*\n/);
assert.ok(gateMatch, "The executable freshness gate must be available to test.");
const gate = gateMatch[1].split("\n").map((line) => line.replace(/^ {10}/, "")).join("\n");
const fixtureDir = await mkdtemp(join(tmpdir(), "strikesignal-freshness-gate-"));
try {
  const file = join(fixtureDir, "snapshot.json");
  const now = Date.now();
  const cases = [
    ["current", new Date(now - 60_000).toISOString(), true],
    ["small clock skew", new Date(now + 60_000).toISOString(), true],
    ["stale", new Date(now - 13 * 60 * 60_000).toISOString(), false],
    ["future", new Date(now + 60 * 60_000).toISOString(), false],
    ["malformed", "not-a-timestamp", false],
    ["missing", undefined, false],
    ["timezone missing", "2026-09-20T05:00:00", false],
  ];
  for (const [name, timestamp, accepted] of cases) {
    await writeFile(file, JSON.stringify({ ok: true, contract_version: "1.1", matches: [{}], fetched_at_utc: timestamp }));
    let passed = true;
    try { execFileSync("python3", ["-", file], { input: gate, stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error) {
      if (error.code === "ENOENT") throw error;
      passed = false;
    }
    assert.equal(passed, accepted, `${name} source timestamp should ${accepted ? "pass" : "fail"} the production gate`);
  }
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}

console.log("refresh workflow contract tests ok");
