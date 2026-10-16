import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";

if (!existsSync(new URL("../netlify/functions/predictions.mts", import.meta.url))) {
  console.log("Netlify tests skipped: functions are excluded from this deploy context");
  process.exit(0);
}

// Use Node's TypeScript runtime and a local Blobs fixture: no credentials,
// dependency installation, network requests, or writes to hosted stores.
let stored;
let storeUnavailable = false;
const environments = { SITE_URL: "https://site.invalid" };
globalThis.Netlify = { env: { get: (name) => environments[name] } };
globalThis.__netlifyFixtureStore = () => {
  if (storeUnavailable) throw new Error("Blobs unavailable");
  return { get: async () => stored, setJSON: async (_key, value) => { stored = value; } };
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@netlify/blobs") return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent('export const getStore = () => globalThis.__netlifyFixtureStore(); export const getDeployStore = getStore;')}` };
    if (specifier.startsWith(".") && specifier.endsWith(".mjs")) {
      const source = new URL(specifier.replace(/\.mjs$/, ".mts"), context.parentURL);
      if (existsSync(source)) return next(source.href, context);
    }
    return next(specifier, context);
  },
});
const originalFetch = globalThis.fetch;
try {
  const { default: handler } = await import("../netlify/functions/predictions.mts");
  const { jsonResponse } = await import("../netlify/functions/lib/prediction-store.mts");
  const { refreshSnapshot } = await import("../netlify/functions/lib/live-refresh.mts");
  const recent = new Date(Date.now() - 60_000).toISOString();
  const bundled = { generated_at_utc: recent, coverage: { last_verified_utc: recent }, model: {}, upcoming_predictions: [] };
  let staticUnavailable = false;
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal, "Static fallback requests need a deadline");
    if (staticUnavailable) throw new Error("Static unavailable");
    return Response.json(bundled);
  };
  const get = () => handler(new Request("https://site.invalid/api/predictions"), {});
  storeUnavailable = true;
  assert.deepEqual(await (await get()).json(), bundled, "A Blobs failure must fall back to the static release");
  storeUnavailable = false;
  stored = { ...bundled, coverage: { last_verified_utc: "2000-01-01T00:00:00Z" } };
  assert.deepEqual(await (await get()).json(), bundled, "An older stored snapshot must not replace a newer release");
  stored = { ...bundled, coverage: { last_verified_utc: new Date(Date.now() - 30_000).toISOString() } };
  assert.deepEqual(await (await get()).json(), stored);
  staticUnavailable = true;
  assert.deepEqual(await (await get()).json(), stored, "A valid stored snapshot survives a static read failure");
  stored = {};
  const unavailable = await get();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.equal((await handler(new Request("https://site.invalid/api/predictions", { method: "POST" }), {})).status, 405);
  assert.equal(jsonResponse({}, { headers: { "cache-control": "private" } }).headers.get("cache-control"), "private");
  staticUnavailable = false;
  const refreshed = await refreshSnapshot(new Request("https://site.invalid/api/refresh"));
  assert.equal(refreshed.generated_at_utc, recent, "Refreshing a cached snapshot must not pretend predictions were regenerated");
  assert.equal(refreshed.coverage.last_verified_utc, recent);
  assert.ok(refreshed.updater.refreshed_at_utc);
  console.log("Netlify storage failure, monotonic fallback, deadlines and source-age tests passed");
} finally {
  hooks.deregister();
  globalThis.fetch = originalFetch;
  delete globalThis.Netlify;
  delete globalThis.__netlifyFixtureStore;
}
