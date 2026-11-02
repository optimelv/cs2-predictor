import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["web/lib/desk.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const desk = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const now = new Date().toISOString(),
  old = new Date(Date.now() - 86_400_000).toISOString();
const match = {
  match_id: "test:1",
  event_id: "test:event",
  event_name: "IEM Test",
  product_tier: "tier_1",
  team1_name: "A",
  team2_name: "B",
  starts_at: now,
  status: "upcoming",
  prob_team1: 0.65,
};
const data = {
  snapshot: {
    coverage: {
      events: [{ id: "test:event", name: "IEM Test", product_tier: "tier_1" }],
      daily_matches: [match],
      last_verified_utc: old,
    },
  },
  players: [],
  assets: {},
  warnings: [],
};
for (const value of [undefined, null, "", false, true, "bad"])
  assert.equal(desk.number(value), null);
assert.equal(desk.number(0), 0);
assert.equal(desk.probability({ ...match, status: "cancelled" }), null);
assert.equal(desk.probability({ ...match, model_coverage: "limited" }), null);
assert.ok(
  desk.matchPriority({
    ...match,
    starts_at: new Date(Date.now() + 3600000).toISOString(),
  }) < desk.matchPriority({ ...match, status: "cancelled", starts_at: old }),
);
assert.equal(desk.sourceAge("bad"), null);
assert.equal(desk.sourceAge(new Date(Date.now() + 60_000).toISOString()), null);
assert.equal(desk.matchState({ ...match, starts_at: old }), "Awaiting result");
assert.equal(
  desk.winner({ ...match, status: "finished", score1: null, score2: 2 }),
  null,
);
assert.equal(desk.winner({ ...match, predicted_winner: "A" }), null);
assert.equal(
  desk.winner({ ...match, status: "finished", score1: 0, score2: 2 }),
  "B",
);
const final = {
  ...match,
  status: "finished",
  score1: 2,
  score2: 0,
  winner_name: "A",
  slot_id: "round:1",
};
assert.deepEqual(desk.mergeMatches([final], [match]), [final]);
assert.equal(
  desk.mergeMatches(
    [match],
    [{ ...match, team2_name: "C", prob_team1: null }],
  )[0].prob_team1,
  null,
);
assert.equal(
  desk.mergeMatches(
    [{ ...match, slot_id: "semi:2" }],
    [{ ...match, slot_id: "semi:1", prob_team1: null }],
  )[0].slot_id,
  "semi:2",
);
const canonical = desk.canonicalEvents([
  {
    id: "stored",
    name: "IEM Test",
    location: "Berlin",
    participants: ["A"],
    format: { type: "gsl", label: "GSL groups" },
  },
  { id: "provider", name: "IEM Test", status: "finished", participants: ["B"] },
]);
const aliases = desk.canonicalEvents(
  [
    {
      id: "blast-rivals-s2-2026",
      name: "BLAST Rivals 2026 Season 2",
      start_date: "2026-11-09",
      matches: [match],
    },
    {
      id: "pandascore:series:11137",
      name: "BLAST Rivals Fall 2026",
      start_date: "2026-11-11",
      matches: [],
    },
  ],
  true,
);
assert.equal(aliases.length, 1);
assert.equal(aliases[0].id, "blast-rivals-s2-2026");
assert.equal(aliases[0].start_date, "2026-11-11");
assert.deepEqual(aliases[0].matches, []);
assert.equal(canonical.length, 1);
assert.equal(canonical[0].id, "stored");
assert.equal(canonical[0].status, "finished");
assert.equal(canonical[0].format.type, "gsl");
assert.deepEqual(canonical[0].participants, ["A", "B"]);
let replies = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (path) => {
  if (replies[path] instanceof Error) throw replies[path];
  return new Response(JSON.stringify(replies[path]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
try {
  replies = {
    "/data/predictions.json": data.snapshot,
    "/data/players.json": new Error("offline"),
    "/data/team-assets.json": new Error("offline"),
  };
  const partial = await desk.loadDesk(new AbortController().signal);
  assert.equal(partial.snapshot.coverage.daily_matches.length, 1);
  assert.equal(partial.warnings.length, 2);
  assert.deepEqual(partial.players, []);
  replies["/data/predictions.json"] = { coverage: { events: null } };
  await assert.rejects(() => desk.loadDesk(new AbortController().signal));
  replies["/api/live-snapshot"] = {
    ok: true,
    contract_version: "1.1",
    fetched_at_utc: now,
    matches: [
      final,
      {
        ...match,
        match_id: "excluded",
        event_name: "Regional Cash Cup",
        product_tier: "excluded",
      },
    ],
    events: [],
    players: [],
  };
  const updated = await desk.refreshFeed(data, new AbortController().signal);
  assert.equal(updated.snapshot.coverage.daily_matches.length, 1);
  assert.equal(updated.snapshot.coverage.daily_matches[0].status, "finished");
  assert.equal(updated.snapshot.coverage.last_verified_utc, now);
  const pandaEvent = {
    id: "provider",
    name: "IEM Test",
    product_tier: "tier_1",
    participants: ["A", "B"],
    matches: [final],
    bracket: { rounds: [] },
  };
  replies["/api/live-snapshot"] = {
    ...replies["/api/live-snapshot"],
    source: "pandascore",
    events: [pandaEvent],
  };
  const panda = await desk.refreshFeed(
    {
      ...data,
      snapshot: {
        ...data.snapshot,
        upcoming_predictions: [{ ...match, match_id: "obsolete" }],
        coverage: {
          ...data.snapshot.coverage,
          daily_matches: [match, { ...match, match_id: "old-fixture" }],
        },
      },
    },
    new AbortController().signal,
  );
  assert.deepEqual(
    desk.allMatches(panda).map((m) => m.match_id),
    [match.match_id],
    "PandaScore owns the current board without replaying old fixtures",
  );
  assert.equal(panda.snapshot.coverage.fixture_provider, "pandascore");
  assert.equal(panda.snapshot.coverage.events[0].id, "test:event");
  assert.deepEqual(
    panda.snapshot.coverage.events[0].bracket,
    pandaEvent.bracket,
  );
  replies["/api/live-snapshot"].fetched_at_utc = old;
  assert.equal(
    await desk.refreshFeed(updated, new AbortController().signal),
    updated,
  );
  replies["/api/live-snapshot"].source_health = { access_error: "paused" };
  assert.equal(
    (await desk.refreshFeed(updated, new AbortController().signal))
      .feedUnavailable,
    true,
  );
  replies["/api/live-snapshot"].fetched_at_utc = "invalid";
  await assert.rejects(() =>
    desk.refreshFeed(updated, new AbortController().signal),
  );
  const incoming = {
    ...data,
    players: [
      {
        player_id: "p1",
        nickname: "one",
        rating_3_0: 1.2,
        stats_window: "past_3_months",
        stats_through_date: now.slice(0, 10),
      },
    ],
  };
  const merged = desk.mergeDesk(updated, incoming);
  assert.equal(merged.snapshot.coverage.last_verified_utc, now);
  assert.equal(merged.players[0].rating_3_0, 1.2);
  console.log(
    "Product data checks passed: missing values, status, winners, stable slots, changed opponents, aliases, partial failures, monotonic source time, independent profiles.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
