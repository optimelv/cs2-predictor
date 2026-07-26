import assert from "node:assert/strict";
import { historyMatchesForTeam, historyOpponents, mergeHistoryMatches, summarizeHeadToHead } from "../docs/lib/history.js";

const fixture = {
  contract_version: "1.0",
  matches: [
    { match_id: "1", match_date: "2026-06-01", tier: "tier_1", team1_name: "Alpha", team2_name: "Beta", winner_name: "Alpha", lineups: { team1: ["a", "b", "c", "d", "e"], team2: [] }, maps: [{ map_name: "Mirage", winner_name: "Alpha", score1: 13, score2: 8 }] },
    { match_id: "2", match_date: "2026-05-01", tier: "tier_2", team1_name: "Beta", team2_name: "Alpha", winner_name: "Beta", lineups: { team1: [], team2: ["a", "b", "c", "x", "y"] }, maps: [{ map_name: "Mirage", winner_name: "Beta", score1: 13, score2: 10 }, { map_name: "Nuke", winner_name: "Alpha", score1: 9, score2: 13 }] },
    { match_id: "3", match_date: "2026-04-01", tier: "excluded", team1_name: "Alpha", team2_name: "Gamma", winner_name: "Gamma", maps: [] },
  ],
};

assert.equal(historyMatchesForTeam(fixture, "Alpha").length, 2);
assert.deepEqual(historyOpponents(fixture, "Alpha").map((row) => row.team_name), ["Beta"]);
const summary = summarizeHeadToHead(fixture, "Alpha", "Beta", ["a", "b", "c", "d", "e"]);
assert.equal(summary.matches.length, 2);
assert.equal(summary.wins, 1);
assert.equal(summary.current_era_matches, 2);
assert.equal(summary.maps.find((row) => row.map_name === "Mirage").win_rate, 0.5);
assert.equal(summary.maps.find((row) => row.map_name === "Nuke").round_diff, 4);

const merged = mergeHistoryMatches(fixture, [{ match_id: "4", match_date: "2026-07-01", tier: "tier_1", team1_name: "Alpha", team2_name: "Delta", maps: [], lineups: { team1: [], team2: [] } }, { match_id: "5", tier: "excluded" }]);
assert.equal(merged.matches.length, 4);
assert.equal(merged.through_date, "2026-07-01");
assert.equal(merged.scope.matches, 4);

console.log("historical explorer contract tests ok");
