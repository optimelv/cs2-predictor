import assert from "node:assert/strict";
import handler from "../api/live-snapshot.js";

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
console.log("live snapshot handler fallback tests ok");
