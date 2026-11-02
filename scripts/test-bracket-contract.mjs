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

for (const absent of [null, undefined, "", " ", false, true]) {
  const value = compileBracketContract({id:'missing', name:'Unknown format'}, [{match_id:'m', team1_name:'A',team2_name:'B',status:'finished',score1:absent,score2:2,prob_team1:absent,predicted_winner:'A'}]);
  assert.equal(value.matches[0].score1,null);
  assert.equal(value.matches[0].prob_team1,null);
  assert.equal(value.matches[0].winner_name,'', 'Missing score cannot prove a winner');
}
const projectedWinner=compileBracketContract({id:'upcoming',name:'Unknown'},[{team1_name:'A',team2_name:'B',status:'upcoming',predicted_winner:'A',winner_name:'A'}]);
assert.equal(projectedWinner.matches[0].winner_name,'', 'Predictions never become results');

const unplayed = compileBracketContract({id:"unplayed",name:"Test",participants:["A","B","C","D"],format:{type:"single_elimination"}},[
  {match_id:"semi",team1_name:"A",team2_name:"D",round_name:"Semifinals",status:"upcoming",predicted_winner:"A",prob_team1:0.8}
]);
assert.equal(unplayed.lanes[0].rounds[1].matches[0].team1_name,"TBD","A forecast cannot advance a team in a published format tree");
const decided = compileBracketContract({id:"decided",name:"Test",participants:["A","B","C","D"],format:{type:"single_elimination"}},[
  {match_id:"semi",team1_name:"A",team2_name:"D",round_name:"Semifinals",status:"finished",score1:2,score2:0}
]);
assert.equal(decided.lanes[0].rounds[1].matches[0].team1_name,"A","A verified result advances its winner");

// New fixtures arrive in arbitrary source order; rounds and parallel branches must stay stable.
const m = (id, a, b, extra = {}) => ({
  match_id: id,
  team1_name: a,
  team2_name: b,
  status: "upcoming",
  ...extra,
});
const pairRounds = compileBracketContract(
  {
    id: "pairs",
    name: "Future groups",
    bracket: {
      rounds: [
        {
          id: "p1",
          name: "Group A · LGC vs FURIA",
          matches: [m("p1", "Legacy", "FURIA")],
        },
        {
          id: "p2",
          name: "Group A · VIT vs FAL",
          matches: [m("p2", "Vitality", "Falcons")],
        },
      ],
    },
  },
  [],
);
assert.equal(pairRounds.lanes[0].rounds.length, 1);
assert.equal(pairRounds.lanes[0].rounds[0].matches.length, 2);
const branches = compileBracketContract(
  {
    id: "branches",
    name: "Groups",
    bracket: {
      rounds: [
        {
          name: "Group A · Lower Bracket Quarterfinal",
          matches: [m("lower", "A", "B")],
        },
        {
          name: "Group A · Upper Bracket Semifinal",
          matches: [m("upper-s", "C", "D")],
        },
        {
          name: "Group A · Upper Bracket Quarterfinal",
          matches: [m("upper-q", "E", "F")],
        },
      ],
    },
  },
  [],
);
assert.equal(branches.lanes.length, 2);
assert.deepEqual(
  branches.lanes
    .find((l) => l.id.includes("Upper"))
    .rounds.map((r) => r.matches[0].match_id),
  ["upper-q", "upper-s"],
);
const chronology = compileBracketContract(
  {
    id: "order",
    name: "Playoffs",
    bracket: {
      rounds: [
        { name: "Playoffs · Grand final", matches: [m("f", "A", "B")] },
        { name: "Playoffs · Round of 16 match", matches: [m("r16", "C", "D")] },
      ],
    },
  },
  [],
);
assert.deepEqual(
  chronology.lanes[0].rounds.map((r) => r.matches[0].match_id),
  ["r16", "f"],
);
const noDraw = compileBracketContract(
  {
    id: "none",
    name: "Future",
    participants: ["A", "B", "C", "D"],
    format: { type: "single_elimination" },
  },
  [],
);
assert.ok(
  noDraw.lanes
    .flatMap((l) => l.rounds.flatMap((r) => r.matches))
    .every((m) => m.team1_name === "TBD" && m.team2_name === "TBD"),
);
const repeatedPair = compileBracketContract(
  {
    id: "repeat",
    name: "Rematch",
    participants: ["A", "B", "C", "D"],
    format: { type: "double_elimination" },
  },
  [
    m("up", "A", "B", {
      round_name: "Upper round 1",
      status: "finished",
      score1: 2,
      score2: 0,
    }),
    m("low", "A", "B", {
      round_name: "Lower final",
      status: "finished",
      score1: 0,
      score2: 2,
    }),
  ],
);
assert.equal(
  repeatedPair.lanes[0].rounds[0].matches.filter((m) => m.match_id === "low")
    .length,
  0,
);
assert.equal(repeatedPair.lanes[1].rounds.at(-1).matches[0].match_id, "low");
const progressEvent = {
  id: "progress",
  name: "Future knockout",
  teams: 4,
  format: { type: "single_elimination" },
};
const opening = [
  m("s1", "A", "B", { round_name: "Semifinals" }),
  m("s2", "C", "D", { round_name: "Semifinals" }),
];
const before = compileBracketContract(progressEvent, opening);
const after = compileBracketContract(
  progressEvent,
  opening.map((row) => ({ ...row, status: "finished", score1: 2, score2: 0 })),
);
assert.deepEqual(
  before.lanes[0].rounds.map((r) => r.matches.map((m) => m.slot_id)),
  after.lanes[0].rounds.map((r) => r.matches.map((m) => m.slot_id)),
);
assert.equal(before.lanes[0].rounds[1].matches[0].team1_name, "TBD");
assert.equal(after.lanes[0].rounds[1].matches[0].team1_name, "A");
const correction = compileBracketContract(
  progressEvent,
  opening.map((row) => ({ ...row, status: "finished", score1: 0, score2: 2 })),
);
assert.equal(correction.lanes[0].rounds[1].matches[0].team1_name, "B");
console.log("Future tree evidence and correction regressions passed");

for (const status of ["cancelled", "postponed"]) {
  const c = compileBracketContract(progressEvent, [
    { ...opening[0], status, score1: 2, score2: 0 },
  ]);
  assert.equal(c.lanes[0].rounds[0].matches[0].status, status);
  assert.equal(c.lanes[0].rounds[1].matches[0].team1_name, "TBD");
}

const correctedDeclared = compileBracketContract(
  progressEvent,
  opening.map((row) => ({
    ...row,
    status: "finished",
    score1: 0,
    score2: 2,
    winner_name: row.team1_name,
  })),
);
assert.equal(
  correctedDeclared.lanes[0].rounds[1].matches[0].team1_name,
  "B",
  "Corrected scores override an old winner field",
);

const stageContext = compileBracketContract(
  {
    id: "stage-context",
    name: "Future groups",
    teams: 8,
    format: { type: "gsl", settings: { group_count: 2, playoff_teams: 4 } },
  },
  [
    m("group-qf", "A", "B", {
      round_name: "Quarterfinal",
      stage_name: "Group A",
    }),
    m("playoff-sf", "C", "D", {
      round_name: "Semifinal",
      stage_name: "Playoffs",
    }),
  ],
);
const playoffRows = stageContext.lanes
  .find((l) => l.id === "playoffs")
  .rounds.flatMap((r) => r.matches);
assert.ok(!playoffRows.some((m) => m.match_id === "group-qf"));
assert.ok(playoffRows.some((m) => m.match_id === "playoff-sf"));
