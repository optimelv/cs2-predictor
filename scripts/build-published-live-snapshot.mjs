import { readFile, writeFile } from "node:fs/promises";
import { filterProductLiveSnapshot } from "../docs/lib/live-feed.js";

const coverage = JSON.parse(await readFile("docs/data/coverage.json", "utf8"));
const source = {
  ok: true,
  contract_version: "1.1",
  fetched_at_utc: coverage.last_verified_utc,
  poll_after_ms: 900_000,
  events: coverage.events || [],
  matches: coverage.daily_matches || [],
  players: [],
  rankings: coverage.vrs || null,
  source: "Last verified Tier 1/2 release",
  source_health: {
    delivery_mode: "published_last_good",
    scheduled_matches: (coverage.daily_matches || []).filter((match) => match.status !== "finished").length,
    recent_results: (coverage.daily_matches || []).filter((match) => match.status === "finished").length,
  },
};

const snapshot = filterProductLiveSnapshot(source);
if (!snapshot.fetched_at_utc || !snapshot.matches.length) throw new Error("Cannot publish an empty live fallback snapshot.");
await writeFile("docs/data/live-snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ matches: snapshot.matches.length, events: snapshot.events.length, fetched_at_utc: snapshot.fetched_at_utc }));
