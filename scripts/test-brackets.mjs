import assert from "node:assert/strict";
import { buildDoubleEliminationTree, seededOpeningPairs } from "../docs/lib/brackets.js";

function deterministicResolver(team1, team2, roundName, index) {
  const first = team1 || "BYE";
  const second = team2 || "BYE";
  const winner = first === "BYE" ? second : first;
  return {
    match_id: `${roundName}:${index}`,
    team1_name: first,
    team2_name: second,
    predicted_winner: winner,
    winner_name: winner,
    status: second === "BYE" ? "bye" : "projected",
    prob_team1: first === "BYE" ? 0 : 0.6,
  };
}

function matchCount(tree) {
  return tree.upperRounds.reduce((sum, round) => sum + round.matches.length, 0)
    + tree.lowerRounds.reduce((sum, round) => sum + round.matches.length, 0)
    + (tree.grandFinal ? 1 : 0);
}

const eightTeams = Array.from({ length: 8 }, (_, index) => `Team ${index + 1}`);
const eight = buildDoubleEliminationTree({ field: eightTeams, resolveMatch: deterministicResolver });
assert.deepEqual(eight.upperRounds.map((round) => round.matches.length), [4, 2, 1]);
assert.deepEqual(eight.lowerRounds.map((round) => round.matches.length), [2, 2, 1, 1]);
assert.equal(matchCount(eight), 14);
assert.equal(eight.champion, "Team 1");

const sixteenTeams = Array.from({ length: 16 }, (_, index) => `Seed ${index + 1}`);
const sixteen = buildDoubleEliminationTree({ field: sixteenTeams, resolveMatch: deterministicResolver });
assert.equal(matchCount(sixteen), 30);
assert.equal(sixteen.upperRounds.length, 4);
assert.equal(sixteen.lowerRounds.length, 6);

const customPairs = [["Alpha", "Delta"], ["Bravo", "Charlie"]];
const four = buildDoubleEliminationTree({
  field: ["Alpha", "Bravo", "Charlie", "Delta"],
  openingPairs: customPairs,
  resolveMatch: deterministicResolver,
});
assert.deepEqual(
  four.upperRounds[0].matches.map((match) => [match.team1_name, match.team2_name]),
  customPairs,
);
assert.deepEqual(seededOpeningPairs(["A", "B", "C", "D"]), [["A", "D"], ["B", "C"]]);

console.log("bracket engine tests ok");
