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
    },
  ],
});

assert.deepEqual(rows.map((row) => row.match_id), ["anchored-result"]);
assert.equal(rows[0].match_date, "2026-09-18");
console.log("live history promotion timestamp/status tests ok");
