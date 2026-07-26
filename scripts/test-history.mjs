import assert from "node:assert/strict";
import { historyEvents, historyMatchesForTeam, historyOpponents, mergeHistoryMatches, summarizeHeadToHead } from "../docs/lib/history.js";

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

const events = historyEvents({ matches: [
  { match_id: "qf1", match_date: "2026-06-01", tier: "tier_1", event_name: "Archive Cup", team1_name: "Alpha", team2_name: "Beta", winner_name: "Alpha", score1: 2, score2: 0, best_of: 3, phase: "playoffs", is_playoff: true, maps: [] },
  { match_id: "qf2", match_date: "2026-06-01", tier: "tier_1", event_name: "Archive Cup", team1_name: "Gamma", team2_name: "Delta", winner_name: "Gamma", score1: 2, score2: 1, best_of: 3, phase: "playoffs", is_playoff: true, maps: [] },
  { match_id: "f", match_date: "2026-06-02", tier: "tier_1", event_name: "Archive Cup", team1_name: "Alpha", team2_name: "Gamma", winner_name: "Alpha", score1: 3, score2: 1, best_of: 5, phase: "grand_final", is_playoff: true, maps: [] },
] });
assert.equal(events.length, 1);
assert.equal(events[0].champion_name, "Alpha");
assert.equal(events[0].participants.length, 4);
assert.equal(events[0].bracket.rounds.length, 2);
assert.equal(events[0].matches.at(-1).series_format, "bo5");

console.log("historical event compiler tests ok");

const archiveMatch = (overrides) => ({
  tier: "tier_1",
  event_name: "Inferred Cup",
  best_of: 3,
  maps: [],
  ...overrides,
});

const inferred = historyEvents({
  matches: [
    archiveMatch({ match_id: "iq1", match_date: "2026-03-01", team1_name: "Alpha", team2_name: "Delta", winner_name: "Alpha", score1: 2, score2: 0, is_playoff: true, phase: "playoffs" }),
    archiveMatch({ match_id: "iq2", match_date: "2026-03-01", team1_name: "Bravo", team2_name: "Echo", winner_name: "Bravo", score1: 2, score2: 1, is_playoff: true, phase: "playoffs" }),
    archiveMatch({ match_id: "is1", match_date: "2026-03-02", team1_name: "Alpha", team2_name: "Bravo", winner_name: "Alpha", score1: 2, score2: 1, is_playoff: true, phase: "playoffs" }),
    archiveMatch({ match_id: "if1", match_date: "2026-03-03", team1_name: "Alpha", team2_name: "Foxtrot", winner_name: "Alpha", score1: 3, score2: 1, best_of: 5, is_playoff: true, phase: "playoffs" }),
    archiveMatch({ match_id: "ip3", match_date: "2026-03-03", team1_name: "Bravo", team2_name: "Echo", winner_name: "Bravo", score1: 2, score2: 0, is_playoff: true, phase: "playoffs" }),
  ],
})[0];
assert.equal(inferred.champion_name, "Alpha");
assert.deepEqual(inferred.bracket.rounds.map((round) => round.name).slice(-3), ["Semifinals", "Third place", "Grand final"]);
assert.equal(inferred.bracket.rounds.find((round) => round.name === "Grand final").matches[0].best_of, 5);
console.log("historical playoff inference tests ok");
