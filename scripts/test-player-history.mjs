import assert from "node:assert/strict";
import { mergePlayerTimeline, summarizePlayerEvents, summarizePlayerMaps, summarizePlayerRosterEras, summarizePlayerTimeline } from "../docs/lib/player-history.js";

const existing = Array.from({ length: 12 }, (_, index) => ({ match_id: `m${index + 1}`, date: `2026-01-${String(index + 1).padStart(2, "0")}`, rating: 1 + index / 100, adr: 70 + index }));
const merged = mergePlayerTimeline(existing, [
  { match_id: "m12", date: "2026-01-12", rating: 1.5, adr: 100 },
  { match_id: "m13", date: "2026-01-13", rating: 1.6, adr: 110 },
]);
assert.equal(merged.length, 13);
assert.equal(merged[0].match_id, "m1");
assert.equal(merged.at(-1).match_id, "m13");
assert.equal(merged.find((row) => row.match_id === "m12").rating, 1.5);

const summary = summarizePlayerTimeline(merged);
assert.equal(summary.series, 13);
assert.equal(summary.recent_rating, 1.4);
assert.equal(summary.average_adr, 79.6);
assert.equal(summary.rating_delta, 0.32);
console.log("player history contract tests ok");

const mapSummary = summarizePlayerMaps([
  { map_name: "Mirage", maps: 5, average_rating: 1.31 },
  { map_name: "Nuke", maps: 2, average_rating: 1.55 },
  { map_name: "Inferno", maps: 4, average_rating: 1.12 },
]);
assert.deepEqual(mapSummary, { maps: 11, map_count: 3, best_map: "Mirage", best_rating: 1.31 });

const richTimeline = [
  { date: "2026-01-01", event_name: "Event A", team_name: "Alpha", rating: 1.1, adr: 74, won: true },
  { date: "2026-01-02", event_name: "Event A", team_name: "Alpha", rating: 1.3, adr: 82, won: false },
  { date: "2026-02-01", event_name: "Event B", team_name: "Bravo", rating: 1.4, adr: 88, won: true },
];
assert.deepEqual(summarizePlayerEvents(richTimeline).map((row) => [row.event_name, row.series, row.average_rating]), [["Event B", 1, 1.4], ["Event A", 2, 1.2]]);
assert.deepEqual(summarizePlayerRosterEras(richTimeline).map((row) => [row.team_name, row.series, row.win_rate]), [["Bravo", 1, 1], ["Alpha", 2, 0.5]]);
console.log("player intelligence contract tests ok");
