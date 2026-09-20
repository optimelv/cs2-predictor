import assert from "node:assert/strict";
import { buildDeskShareUrl, mergeDeskState, parseDeskState, serializeDeskState } from "../docs/lib/desk-links.js";

const watchlist = {
  teams: [{ id: "spirit", name: "Team Spirit" }, { id: "honved", name: "Honv\u00e9d Esport" }],
  players: [{ id: "hltv:21167", name: "donk" }],
  events: [{ id: "event:major", name: "Cologne Major" }],
};
const picks = {
  "hltv:42": {
    team_name: "Team Spirit",
    opponent_name: "NAVI",
    event_name: "Cologne Major",
    starts_at: "2026-07-28T18:00:00Z",
    probability: 0.613,
    saved_at: "2026-07-28T12:00:00Z",
    match_id: "hltv:42",
  },
};

const encoded = serializeDeskState(watchlist, picks);
assert.ok(encoded.length > 0 && encoded.length < 16_000);
const parsed = parseDeskState(encoded);
assert.equal(parsed.watchlist.teams[1].name, "Honv\u00e9d Esport");
assert.equal(parsed.savedPicks["hltv:42"].probability, 0.613);

const url = new URL(buildDeskShareUrl("https://example.com/?event=e1&match=m1&release=x#matches", watchlist, picks));
assert.ok(url.searchParams.get("desk"));
assert.equal(url.searchParams.has("event"), false);
assert.equal(url.searchParams.has("match"), false);
assert.equal(url.searchParams.has("release"), false);
assert.equal(url.hash, "#top");

const merged = mergeDeskState(
  { teams: [{ id: "navi", name: "NAVI" }], players: [], events: [] },
  { "hltv:42": { ...picks["hltv:42"], probability: 0.51, saved_at: "2026-07-28T10:00:00Z" } },
  parsed,
);
assert.deepEqual(merged.watchlist.teams.map(({ id }) => id), ["navi", "spirit", "honved"]);
assert.equal(merged.savedPicks["hltv:42"].probability, 0.613);
assert.equal(parseDeskState("not-valid"), null);
assert.equal(parseDeskState("x".repeat(16_001)), null);

const oversized = { teams: Array.from({ length: 80 }, (_, index) => ({ id: `t${index}`, name: `Team ${index}` })) };
assert.equal(parseDeskState(serializeDeskState(oversized, {})).watchlist.teams.length, 50);
console.log("desk link contract tests ok");
