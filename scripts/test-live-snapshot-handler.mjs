import assert from "node:assert/strict";
import { createLiveSnapshotHandler } from "../api/live-snapshot.js";

const handler = createLiveSnapshotHandler({ workerUrl: "" });

const headers = new Map();
let statusCode = 0;
let body = null;
const response = {
  setHeader(name, value) {
    headers.set(String(name).toLowerCase(), value);
  },
  status(value) {
    statusCode = value;
    return this;
  },
  json(value) {
    body = value;
    return value;
  },
};

await handler({}, response);
assert.equal(statusCode, 200);
assert.equal(body.ok, true);
assert.equal(body.source_health.delivery_mode, "published_last_good");
assert.ok(body.matches.length > 0);
assert.equal(headers.get("cache-control"), "no-store, max-age=0");

const published = { ...body, fetched_at_utc: new Date(Date.now() - 60_000).toISOString() };
for (const age of [120_000, 30_000]) {
  const timestamp = new Date(Date.now() - age).toISOString();
  const upstream = { ...published, fetched_at_utc: timestamp };
  let calls = 0;
  const worker = createLiveSnapshotHandler({
    workerUrl: "https://worker.invalid",
    readPublished: async () => published,
    fetchUpstream: async (_url, options) => {
      calls++;
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => upstream };
    },
  });
  await worker({ method: "GET" }, response);
  assert.equal(body.fetched_at_utc, timestamp < published.fetched_at_utc ? published.fetched_at_utc : timestamp);
  await worker({ method: "POST" }, response);
  assert.equal(statusCode, 405);
  assert.equal(calls, 1, "Invalid methods must not contact the worker");
}
console.log("live snapshot handler fallback tests ok");
