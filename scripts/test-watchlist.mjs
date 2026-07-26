import assert from "node:assert/strict";
import { normalizeWatchlist, toggleWatchlist, watchlistCount, watchlistHas } from "../docs/lib/watchlist.js";

const normalized = normalizeWatchlist({ teams: ["Spirit", "Spirit", null], players: [{ id: "hltv:1", name: "Player" }], events: "bad" });
assert.equal(normalized.teams.length, 1);
assert.equal(normalized.players.length, 1);
assert.equal(normalized.events.length, 0);

const added = toggleWatchlist(normalized, "events", { id: "major", name: "Major" }, "2026-07-26T00:00:00Z");
assert.equal(watchlistCount(added), 3);
assert.equal(watchlistHas(added, "events", "major"), true);
assert.equal(added.events[0].added_at, "2026-07-26T00:00:00Z");

const removed = toggleWatchlist(added, "teams", { id: "Spirit", name: "Spirit" });
assert.equal(watchlistHas(removed, "teams", "Spirit"), false);
assert.equal(watchlistCount(removed), 2);
console.log("watchlist contract tests ok");
