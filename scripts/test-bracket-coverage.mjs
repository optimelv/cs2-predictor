import assert from "node:assert/strict";
import fs from "node:fs";
import { compileBracketContract } from "../server/bracket-contract.js";

const snapshot = JSON.parse(fs.readFileSync(new URL("../docs/data/predictions.json", import.meta.url), "utf8"));
const events = snapshot.coverage?.events || [];
const matches = snapshot.coverage?.daily_matches || [];
const projection = snapshot.major_projection || null;
const supported = new Set(["single_elimination", "double_elimination", "swiss", "gsl", "round_robin"]);
let compiled = 0;
let slots = 0;

for (const event of events.filter((row) => supported.has(row.format?.type))) {
  const eventMatches = matches.filter((match) => String(match.event_id || "") === String(event.id || "") || match.event_name === event.name);
  const contract = compileBracketContract(event, eventMatches, projection);
  assert.ok(contract.lanes.length, `${event.name} did not compile a bracket lane`);
  const allMatches = contract.lanes.flatMap((lane) => lane.rounds.flatMap((round) => round.matches || []));
  const ids = allMatches.map((match) => match.slot_id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, `${event.name} produced duplicate slot ids`);
  const idSet = new Set(ids);
  for (const match of allMatches) {
    for (const dependency of match.feeds_from || []) {
      assert.ok(idSet.has(dependency), `${event.name} has missing dependency ${dependency}`);
    }
  }
  compiled += 1;
  slots += ids.length;
}

assert.ok(compiled >= 8, `Expected broad format coverage, received ${compiled} events`);
assert.ok(slots >= 100, `Expected a meaningful generated slot sample, received ${slots}`);
console.log(`bracket coverage tests ok: ${compiled} events, ${slots} stable slots`);
