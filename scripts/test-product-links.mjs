import assert from "node:assert/strict";
import {
  buildEventShareUrl,
  buildMatchShareUrl,
  buildPickemShareUrl,
  eventOwnsProjection,
  parsePickemOverrides,
  serializePickemOverrides,
  validOverrideWinner,
} from "../docs/lib/product-links.js";

const url = new URL(buildMatchShareUrl("https://example.com/?event=e1&view=bracket&release=test#featured", "hltv:2396007"));
assert.equal(url.searchParams.get("match"), "hltv:2396007");
assert.equal(url.searchParams.has("event"), false);
assert.equal(url.searchParams.has("view"), false);
assert.equal(url.searchParams.has("release"), false);
assert.equal(url.hash, "#matches");

const eventUrl = new URL(buildEventShareUrl("https://example.com/?match=m1&release=test#matches", "event:42", "bracket"));
assert.equal(eventUrl.searchParams.get("event"), "event:42");
assert.equal(eventUrl.searchParams.get("view"), "bracket");
assert.equal(eventUrl.searchParams.has("match"), false);
assert.equal(eventUrl.searchParams.has("release"), false);
assert.equal(eventUrl.hash, "#featured");

const overrides = new Map([
  ["stage3:2:aurora:vitality", "Vitality"],
  ["stage3:1:navi:spirit", "Spirit"],
]);
const serialized = serializePickemOverrides(overrides.entries());
assert.deepEqual(parsePickemOverrides(serialized), [
  ["stage3:1:navi:spirit", "Spirit"],
  ["stage3:2:aurora:vitality", "Vitality"],
]);
assert.deepEqual(parsePickemOverrides("not-json"), []);
assert.deepEqual(parsePickemOverrides(JSON.stringify([["", "Spirit"], ["valid", ""]])), []);
const pickemUrl = new URL(buildPickemShareUrl("https://example.com/?match=m1&release=test", "major:2027", overrides.entries()));
assert.equal(pickemUrl.searchParams.get("event"), "major:2027");
assert.equal(pickemUrl.searchParams.has("match"), false);
assert.equal(pickemUrl.searchParams.has("release"), false);
assert.deepEqual(parsePickemOverrides(pickemUrl.searchParams.get("pickem")), parsePickemOverrides(serialized));
assert.equal(pickemUrl.hash, "#featured");
assert.equal(eventOwnsProjection(
  { id: "major:2027", name: "IEM Spring Major 2027" },
  { event_id: "major:2027", seed_rows: Array.from({ length: 16 }, (_, seed) => ({ seed })) },
), true);
assert.equal(eventOwnsProjection(
  { id: "other", name: "Other Event" },
  { event_id: "major:2027", seed_rows: Array.from({ length: 16 }, (_, seed) => ({ seed })) },
), false);
assert.equal(eventOwnsProjection(
  { id: "legacy", name: "IEM Cologne Major 2026" },
  { stage: "IEM Cologne Major 2026 Stage 3", seed_rows: Array.from({ length: 16 }, (_, seed) => ({ seed })) },
), true);
assert.equal(validOverrideWinner("team spirit", "Team Spirit", "Vitality"), "Team Spirit");
assert.equal(validOverrideWinner("NAVI", "Team Spirit", "Vitality"), null);
console.log("product link contract tests ok");
