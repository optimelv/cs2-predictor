import assert from "node:assert/strict";
import { mergePlayerTimeline, summarizePlayerTimeline } from "../docs/lib/player-history.js";

const existing = Array.from({ length: 12 }, (_, index) => ({ match_id: `m${index + 1}`, date: `2026-01-${String(index + 1).padStart(2, "0")}`, rating: 1 + index / 100, adr: 70 + index }));
const merged = mergePlayerTimeline(existing, [
  { match_id: "m12", date: "2026-01-12", rating: 1.5, adr: 100 },
  { match_id: "m13", date: "2026-01-13", rating: 1.6, adr: 110 },
]);
assert.equal(merged.length, 12);
assert.equal(merged[0].match_id, "m2");
assert.equal(merged.at(-1).match_id, "m13");
assert.equal(merged.find((row) => row.match_id === "m12").rating, 1.5);

const summary = summarizePlayerTimeline(merged);
assert.equal(summary.series, 12);
assert.equal(summary.recent_rating, 1.4);
assert.equal(summary.average_adr, 80.4);
assert.equal(summary.rating_delta, 0.32);
console.log("player history contract tests ok");
