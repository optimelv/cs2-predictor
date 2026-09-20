import assert from "node:assert/strict";
import { matchRosterRead, rosterHistoryForTeam, rosterSignal } from "../docs/lib/rosters.js";

const snapshot = {
  matches: [
    { match_date: "2026-05-10", tier: "tier_1", team1_name: "Alpha", team2_name: "Bravo", lineups: { team1: ["a", "b", "c", "d", "e"], team2: ["v", "w", "x", "y", "z"] } },
    { match_date: "2026-05-04", tier: "tier_2", team1_name: "Charlie", team2_name: "Alpha", lineups: { team1: ["f", "g", "h", "i", "j"], team2: ["a", "b", "c", "d", "e"] } },
    { match_date: "2026-04-20", tier: "tier_3", team1_name: "Alpha", team2_name: "Delta", lineups: { team1: ["a", "b", "c", "d", "e"], team2: [] } },
    { match_date: "2026-04-01", tier: "tier_1", team1_name: "Alpha", team2_name: "Echo", lineups: { team1: ["a", "b", "c", "old1", "old2"], team2: [] } },
  ],
};

assert.equal(rosterHistoryForTeam(snapshot, "Alpha").length, 3);
assert.equal(rosterHistoryForTeam(snapshot, "Alpha", { asOf: "2026-05-05T00:00:00Z" }).length, 2);

const stable = rosterSignal(snapshot, "Alpha", ["a", "b", "c", "d", "e"]);
assert.equal(stable.status, "changed");
assert.equal(stable.score, 87);
assert.equal(stable.era_matches, 2);
assert.deepEqual(stable.added_players.sort(), ["d", "e"]);
assert.deepEqual(stable.removed_players.sort(), ["old1", "old2"]);

const rebuilding = rosterSignal(snapshot, "Alpha", ["a", "b", "new1", "new2", "new3"]);
assert.equal(rebuilding.status, "rebuild");
assert.equal(rebuilding.shared_players.length, 2);

const read = matchRosterRead(snapshot, { team1_name: "Alpha", team2_name: "Bravo", starts_at: "2026-05-11T12:00:00Z" }, ["a", "b", "c", "d", "e"], ["v", "w", "x", "new", "new2"]);
assert.equal(read.team1.team_name, "Alpha");
assert.equal(read.team2.status, "changed");
assert.equal(read.leader, "Alpha");
assert.equal(read.material, true);

const unknown = rosterSignal({ matches: [] }, "Nobody", []);
assert.equal(unknown.status, "unknown");
assert.equal(unknown.score, null);

console.log("roster intelligence tests passed");
