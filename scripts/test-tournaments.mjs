import assert from "node:assert/strict";
import { tournamentBlueprint, tournamentPlayoffField, tournamentStageLabels } from "../docs/lib/tournaments.js";

const majorEvent = { teams: 32, format: { type: "swiss", label: "Three-stage Swiss + playoffs" } };
const major = tournamentBlueprint(majorEvent);
assert.equal(major.stages.length, 4);
assert.equal(major.playoff_size, 8);
assert.deepEqual(tournamentStageLabels(majorEvent), ["Stage 1 Swiss", "Stage 2 Swiss", "Stage 3 Swiss", "Playoffs"]);

const gsl = tournamentBlueprint({ teams: 16, format: { type: "gsl", settings: { group_size: 4 } } });
assert.equal(gsl.playoff_size, 8);
assert.equal(gsl.stages[0].type, "gsl");

const mixed = tournamentBlueprint({ teams: 16, format: { type: "mixed", label: "Group stage + double-elimination playoffs" } });
assert.equal(mixed.stages[0].type, "round_robin");
assert.equal(mixed.playoff_type, "double_elimination");

const explicit = tournamentBlueprint({ format: { stages: [{ name: "Play-in", type: "gsl", team_count: 8, advance_count: 4 }, { name: "Finals", type: "double_elimination", team_count: 8 }] } });
assert.equal(explicit.source, "published");
assert.equal(explicit.playoff_type, "double_elimination");

assert.deepEqual(tournamentPlayoffField({ teams: 16, format: { type: "round_robin", settings: { playoff_teams: 4 } } }, ["A", "B", "C", "D", "E"]), ["A", "B", "C", "D"]);
console.log("tournament format compiler tests ok");
