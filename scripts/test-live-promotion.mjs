import assert from "node:assert/strict";
import { historyRowsFromLive, resultTimestamp } from "./promote-live-snapshot.mjs";

assert.equal(resultTimestamp({ starts_at: null }), null);
assert.ok(resultTimestamp({ starts_at: "2026-09-18T18:00:00Z" }) > 0);

const rows = historyRowsFromLive({
  fetched_at_utc: "2026-09-20T04:55:46Z",
  matches: [
    {
      match_id: "missing-time",
      status: "finished",
      product_tier: "tier_2",
      starts_at: null,
      event_name: "CCT Europe Series 9",
      team1_name: "Alpha",
      team2_name: "Beta",
      score1: 2,
      score2: 0,
      winner_name: "Alpha",
    },
    {
      match_id: "live-partial",
      status: "live",
      product_tier: "tier_2",
      starts_at: "2026-09-20T04:00:00Z",
      event_name: "CCT Europe Series 9",
      team1_name: "Alpha",
      team2_name: "Beta",
      score1: 1,
      score2: 0,
      winner_name: "Alpha",
    },
    {
      match_id: "anchored-result",
      status: "finished",
      product_tier: "tier_2",
      starts_at: "2026-09-18T18:00:00Z",
      event_name: "CCT Europe Series 9",
      team1_name: "Alpha",
      team2_name: "Beta",
      score1: 2,
      score2: 0,
      winner_name: "Alpha",
      map_results: [
        { map_name: "Nuke", status: "finished", score1: 13, score2: 0 },
        { map_name: "Ancient", status: "upcoming", score1: null, score2: null },
        { map_name: "Mirage", score1: null, score2: 13 },
        { map_name: "Dust2", score1: "", score2: 13 },
        { map_name: "Inferno", score1: false, score2: 13 },
        { map_name: "Anubis", status: "live", score1: 5, score2: 7 },
      ],
    },
  ],
});

assert.deepEqual(rows.map((row) => row.match_id), ["anchored-result"]);
assert.equal(rows[0].match_date, "2026-09-18");
assert.deepEqual(rows[0].maps.map((map) => map.map_name), ["Nuke"], "Unplayed, live and unknown-score maps cannot become historical wins");
assert.equal(rows[0].maps[0].score2, 0, "A verified zero score remains valid");
console.log("live history promotion timestamp/status tests ok");
