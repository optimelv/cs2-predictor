import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  collectEventResults,
  completeKnockoutRounds,
  uniqueEventResults,
} from "../server/event-results.js";
import { compileBracketContract } from "../server/bracket-contract.js";
import { queryCatalog } from "../server/catalog.js";
const load = async (name) =>
  JSON.parse(await readFile(`docs/data/${name}.json`, "utf8"));
const datasets = {
  predictions: await load("predictions"),
  live: await load("live-snapshot"),
  history: await load("history"),
  players: await load("players"),
};
const blast = queryCatalog("brackets", datasets, {
  id: "blast-bounty-s2-finals-2026",
}).data[0];
assert.equal(blast.source, "reconstructed");
assert.deepEqual(
  blast.lanes[0].rounds.map((r) => r.matches.length),
  [4, 2, 1],
);
assert.equal(
  blast.lanes[0].rounds.flatMap((r) => r.matches).flatMap((m) => m.feeds_from)
    .length,
  6,
);
assert.equal(blast.unassigned.length, 0);
assert.ok(blast.matches.every((m) => m.status === "finished"));
const ewc = queryCatalog("brackets", datasets, { id: "esports-world-cup-2026" })
  .data[0];
assert.ok(ewc.matches.length >= 56);
assert.notEqual(ewc.source, "reconstructed");
assert.equal(
  new Set(
    [
      ...ewc.lanes.flatMap((l) => l.rounds.flatMap((r) => r.matches)),
      ...ewc.unassigned,
    ].map((m) => m.match_id),
  ).size,
  ewc.matches.length,
);
const m = (id, a, b, score1 = 2, score2 = 0) => ({
  match_id: id,
  event_name: "Test",
  team1_name: a,
  team2_name: b,
  status: "finished",
  score1,
  score2,
  match_date: "2026-01-01",
});
const rows = [m("a", "A", "B"), m("b", "C", "D"), m("f", "A", "C")];
const event = {
  id: "test",
  name: "Test",
  format: { type: "single_elimination" },
  bracket: {
    rounds: [
      {
        name: "Grand Final",
        matches: [{ ...rows[2], status: "live", score1: null, score2: null }],
      },
    ],
  },
};
assert.equal(
  collectEventResults(event, [], rows, []).find((m) => m.match_id === "f")
    .status,
  "finished",
);
assert.deepEqual(
  completeKnockoutRounds(event, rows).map((r) => r.matches.length),
  [2, 1],
);
assert.equal(completeKnockoutRounds(event, rows.slice(1)), null);
assert.equal(
  completeKnockoutRounds(event, [...rows, m("extra", "B", "D")]),
  null,
);
assert.equal(
  completeKnockoutRounds(
    event,
    rows.map((m) => ({ ...m, score1: null })),
  ),
  null,
);
assert.equal(
  completeKnockoutRounds(
    { ...event, format: { type: "double_elimination" } },
    rows,
  ),
  null,
);
assert.equal(completeKnockoutRounds({ ...event, bracket: null }, rows), null);
const reversed = {
  ...event,
  bracket: {
    rounds: [
      { name: "Playoffs · Grand Final", matches: [rows[2]] },
      { name: "Playoffs · Semifinals", matches: rows.slice(0, 2) },
      { name: "Group A · Round 1", matches: [m("g", "E", "F")] },
    ],
  },
};
const draw = compileBracketContract(reversed, []);
assert.equal(draw.lanes.length, 2);
assert.deepEqual(draw.lanes[0].rounds[1].matches[0].feeds_from, ["a", "b"]);
assert.deepEqual(
  draw.lanes[0].rounds.map((r) => r.label),
  ["Semifinals", "Grand Final"],
);
console.log(
  "Event results: archived finals preserved, complete winner paths, partial draw coverage and stage ordering passed.",
);

const cross = [m("hltv:1", "A", "B"), m("pandascore:2", "B", "A", 0, 2)];
assert.deepEqual(
  uniqueEventResults(cross).map((m) => m.match_id),
  ["pandascore:2"],
);
assert.deepEqual(uniqueEventResults(cross)[0].alternate_match_ids, ["hltv:1"]);
assert.equal(
  uniqueEventResults([...cross, m("hltv:3", "A", "B")]).length,
  3,
  "Ambiguous same-day rematches must stay separate",
);
assert.equal(
  uniqueEventResults([cross[0], { ...cross[1], score1: 1 }]).length,
  2,
  "Conflicting results must not be silently collapsed",
);

const latestFinal = queryCatalog("brackets", datasets, {
  id: "pgl-masters-bucharest-2026",
}).data[0].matches.find(
  (m) => m.status === "finished" && m.match_id.startsWith("pandascore:"),
);
const detail = queryCatalog("matches", datasets, {
  history: "1",
  id: latestFinal.match_id,
  detail: "full",
});
assert.equal(
  detail.data.length,
  1,
  "A published final must open even before the historical export catches up",
);
assert.equal(detail.data[0].status, "finished");
assert.equal(detail.data[0].score1, latestFinal.score1);
const stable = compileBracketContract(
  {
    id: "slots",
    bracket: {
      rounds: [
        {
          name: "Semifinals",
          matches: [
            { ...rows[0], slot_id: "original:a" },
            { ...rows[1], slot_id: "original:b" },
          ],
        },
        {
          name: "Grand Final",
          matches: [
            {
              ...rows[2],
              slot_id: "original:f",
              feeds_from: ["original:a", "original:b"],
            },
          ],
        },
      ],
    },
  },
  rows.map((m) => ({ ...m, slot_id: m.match_id, feeds_from: [] })),
);
assert.deepEqual(stable.lanes[0].rounds[1].matches[0].feeds_from, [
  "original:a",
  "original:b",
]);
assert.equal(stable.lanes[0].rounds[0].matches[0].slot_id, "original:a");

assert.equal(uniqueEventResults([cross[0],{...cross[1],status:"live"}]).length,2,"An unfinished series is not a duplicate final");
