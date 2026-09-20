import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler, { validPredictionSnapshot } from "../api/predictions.js";
import { validateLiveSnapshot } from "../api/live-snapshot.js";

const bundled = JSON.parse(await readFile(new URL("../docs/data/predictions.json", import.meta.url), "utf8"));
const recent = { ...bundled, coverage: { ...bundled.coverage, last_verified_utc: new Date(Date.now() - 1000).toISOString() } };
const originalFetch = globalThis.fetch;
const originalUrl = process.env.PREDICTIONS_SNAPSHOT_URL;
const originalWarn = console.warn;
let body, status, requestOptions;
const response = { setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; return value; } };
const upstream = (value, ok = true) => { globalThis.fetch = async (_url, options) => { requestOptions = options; return { ok, json: async () => value }; }; };
try {
  console.warn = () => {};
  process.env.PREDICTIONS_SNAPSHOT_URL = "https://example.invalid/snapshot";
  assert.equal(validPredictionSnapshot(recent), true);
  for (const invalid of [null, {}, [], { ...recent, model: [] }, { ...recent, upcoming_predictions: {} }, { ...recent, coverage: { last_verified_utc: "bad" } }]) assert.equal(validPredictionSnapshot(invalid), false);
  upstream(recent);
  await handler({ method: "GET" }, response);
  assert.equal(status, 200);
  assert.deepEqual(body, recent);
  assert.ok(requestOptions.signal instanceof AbortSignal, "Upstream request must have a deadline");
  for (const invalid of [{}, { ...recent, coverage: { last_verified_utc: "2000-01-01T00:00:00Z" } }, { ...recent, coverage: { last_verified_utc: "2999-01-01T00:00:00Z" } }]) {
    upstream(invalid);
    await handler({}, response);
    assert.deepEqual(body, bundled, "Invalid, older or future payloads must preserve bundled data");
  }
  upstream({}, false);
  await handler({}, response);
  assert.deepEqual(body, bundled);
  globalThis.fetch = async () => { throw new Error("Network failure"); };
  await handler({}, response);
  assert.deepEqual(body, bundled);
  await handler({ method: "POST" }, response);
  assert.equal(status, 405);

  const live = { ok: true, contract_version: "1.0", fetched_at_utc: recent.coverage.last_verified_utc, events: [], matches: [
    { match_id: "t1", event_name: "Test", product_tier: "tier_1" },
    { match_id: "t3", event_name: "Test lower", product_tier: "tier_3" },
  ] };
  assert.deepEqual(validateLiveSnapshot(live).matches.map((match) => match.match_id), ["t1"]);
  for (const patch of [{ matches: {} }, { events: {} }, { players: {} }, { fetched_at_utc: null }, { fetched_at_utc: "2999-01-01T00:00:00Z" }]) assert.throws(() => validateLiveSnapshot({ ...live, ...patch }));
  console.log("Prediction fallback, timeouts, timestamp and live-contract tests passed");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  if (originalUrl === undefined) delete process.env.PREDICTIONS_SNAPSHOT_URL;
  else process.env.PREDICTIONS_SNAPSHOT_URL = originalUrl;
}
