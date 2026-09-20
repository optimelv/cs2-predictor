import assert from "node:assert/strict";
import { compileBracketContract } from "../server/bracket-contract.js";

const event = {
  id: "major",
  name: "PGL Major",
  status: "ongoing",
  format: { type: "swiss", label: "Swiss into playoffs", settings: { playoff_teams: 8 } },
  participants: ["Spirit", "Vitality", "NAVI", "MOUZ"],
};
const projection = {
  event_id: "major",
  stage: "Major Swiss",
  seed_rows: event.participants.map((team_name, index) => ({ team_name, seed: index + 1 })),
  current_stage_board: {
    rounds: [{ round: 1, groups: [{ record: "0-0", matches: [{ team1_name: "Spirit", team2_name: "MOUZ", prob_team1: 0.63, status: "locked", score1: 2, score2: 0, winner_name: "Spirit" }] }] }],
  },
  playoff_bracket: { quarterfinals: [{ team1_name: "Spirit", team2_name: "Vitality", status: "upcoming" }] },
  final_records: [{ team_name: "Spirit", record: "3-0" }],
};

const projected = compileBracketContract(event, [], projection);
assert.equal(projected.source, "projection");
assert.deepEqual(projected.lanes.map(({ id }) => id), ["swiss", "playoffs"]);
assert.equal(projected.lanes[0].rounds[0].groups[0].label, "0-0");
assert.equal(projected.lanes[0].rounds[0].matches[0].status, "finished");
assert.deepEqual(projected.lanes[1].rounds.map(({ label }) => label), ["Quarterfinals", "Semifinals", "Grand final"]);
assert.equal(projected.final_records.length, 1);

const published = compileBracketContract({
  id: "double",
  name: "Double Cup",
  participants: ["A", "B", "C", "D"],
  format: { type: "double_elimination", label: "Double elimination" },
  bracket: { rounds: [
    { name: "Upper round 1", bracket: "upper", order: 1, matches: [{ team1_name: "A", team2_name: "D" }] },
    { name: "Lower round 1", bracket: "lower", order: 1, matches: [{ team1_name: "B", team2_name: "C" }] },
  ] },
}, [], null);
assert.equal(published.source, "published");
assert.deepEqual(published.lanes.map(({ id }) => id), ["upper", "lower"]);

const schedule = compileBracketContract({ id: "cct", name: "CCT", participants: ["A", "B"] }, [
  { match_id: "m1", team1_name: "A", team2_name: "B", stage_name: "Round of 16", starts_at: "2026-08-01T10:00:00Z", status: "live" },
  { match_id: "m2", team1_name: "C", team2_name: "D", stage_name: "Quarterfinals", starts_at: "2026-08-02T10:00:00Z", status: "upcoming" },
]);
assert.equal(schedule.source, "schedule");
assert.equal(schedule.lanes[0].rounds.length, 2);
assert.equal(schedule.lanes[0].rounds[0].matches[0].status, "live");
assert.deepEqual(schedule.field, ["A", "B", "C", "D"]);

const futureKnockout = compileBracketContract({
  id: "future-ko",
  name: "Future Knockout",
  status: "upcoming",
  participants: ["A", "B", "C", "D", "E", "F", "G", "H"],
  format: { type: "single_elimination", label: "Eight-team knockout" },
}, [{ match_id: "opening-1", team1_name: "A", team2_name: "H", round_name: "Quarterfinals", status: "upcoming" }]);
assert.equal(futureKnockout.source, "format");
assert.equal(futureKnockout.lanes[0].rounds.length, 3);
assert.equal(futureKnockout.lanes[0].rounds[0].matches[0].match_id, "opening-1");
assert.deepEqual(futureKnockout.lanes[0].rounds[1].matches[0].feeds_from, ["future-ko:main:r1:m1", "future-ko:main:r1:m2"]);
assert.equal(futureKnockout.lanes[0].rounds[2].matches[0].team1_source.outcome, "winner");

const futureMajor = compileBracketContract({
  id: "future-major",
  name: "Future Major",
  teams: 32,
  format: { type: "swiss", label: "Three-stage Swiss + playoffs", settings: { swiss_stages: 3, playoff_teams: 8 } },
}, []);
assert.equal(futureMajor.source, "format");
assert.deepEqual(futureMajor.lanes.map((row) => row.id), ["swiss-1", "swiss-2", "swiss-3", "playoffs"]);
assert.equal(futureMajor.lanes[0].rounds[0].matches.length, 8);
assert.equal(futureMajor.lanes[0].rounds[4].groups[0].label, "2-2");
assert.equal(futureMajor.lanes.at(-1).rounds.length, 3);

const futureGsl = compileBracketContract({
  id: "future-gsl",
  name: "Future GSL",
  teams: 8,
  participants: ["A", "B", "C", "D", "E", "F", "G", "H"],
  format: { type: "gsl", settings: { group_count: 2, group_size: 4, playoff_teams: 4 } },
}, []);
assert.deepEqual(futureGsl.lanes.map((row) => row.id), ["groups", "playoffs"]);
assert.equal(futureGsl.lanes[0].rounds.length, 4);
assert.equal(futureGsl.lanes[0].rounds[0].groups.length, 2);
assert.deepEqual(futureGsl.lanes[0].rounds[1].groups[0].matches[0].feeds_from, ["future-gsl:groups:r1:g1:m1", "future-gsl:groups:r1:g1:m2"]);
assert.equal(futureGsl.lanes[0].rounds[3].groups[0].matches[0].team2_source.outcome, "loser");

const futureDouble = compileBracketContract({
  id: "future-double",
  name: "Future Double",
  participants: ["A", "B", "C", "D", "E", "F", "G", "H"],
  format: { type: "double_elimination" },
}, []);
assert.deepEqual(futureDouble.lanes.map((row) => row.id), ["upper", "lower", "final"]);
assert.equal(futureDouble.lanes[0].rounds.length, 3);
assert.equal(futureDouble.lanes[1].rounds.length, 4);
assert.equal(futureDouble.lanes[2].rounds[0].matches[0].feeds_from.length, 2);
console.log("bracket contract tests ok");
