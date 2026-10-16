import { eventIsProductEligible } from "../docs/lib/snapshot.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Exercise the actual application loader with failed and recovering requests.
const source = await readFile(new URL("../docs/app.js", import.meta.url), "utf8");
const start = source.indexOf("function loadHistorySnapshot()");
const end = source.indexOf("function teamHistoryHtml(", start);
assert.ok(start >= 0 && end > start);
let attempts = 0;
const snapshot = { contract_version: "1.0", matches: [{ match_id: "verified", event_name: "IEM Beijing", tier: "tier_1" }, { match_id: "unreviewed", event_name: "Local Cup", tier: "tier_2" }] };
const context = vm.createContext({
  AbortSignal,
  eventIsProductEligible,
  historyEvents: () => [],
  fetch: async (_url, options) => {
    attempts++;
    assert.ok(options.signal instanceof AbortSignal);
    return attempts === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => snapshot };
  },
});
vm.runInContext(`let historySnapshot = null, historyLoadPromise = null, archiveEvents = [], appData = {}; ${source.slice(start, end)}`, context);
const load = () => vm.runInContext("loadHistorySnapshot()", context);
assert.equal((await load()).load_error, true);
const [recovered, concurrent] = await Promise.all([load(), load()]);
assert.equal(recovered, snapshot, "A transient archive failure must be retryable");
assert.equal(concurrent, snapshot);
assert.equal(await load(), snapshot);
assert.equal(attempts, 2, "Successful loads and concurrent requests must reuse the cache");
console.log("History timeout, retry and concurrent-cache recovery tests passed");

assert.equal(recovered.matches.length, 1, "Historical browsing must apply the same event selection as the current feed");
assert.equal(recovered.scope.matches, 1);
