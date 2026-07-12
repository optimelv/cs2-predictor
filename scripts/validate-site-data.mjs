import { readFile } from "node:fs/promises";
import { normalizePlatformSnapshot } from "../docs/lib/snapshot.js";

const parse = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const base = await parse("../docs/data/predictions.json");
const coverage = await parse("../docs/data/coverage.json");
const teamAssets = await parse("../docs/data/team-assets.json");
await parse("../contracts/live-snapshot.schema.json");
const snapshot = normalizePlatformSnapshot(base, coverage);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const eventIds = new Set();
invariant(String(snapshot.coverage.contract_version).startsWith("1."), "Unsupported coverage contract version.");
for (const event of snapshot.coverage.events) {
  invariant(event.id && event.name, "Every event needs a stable id and name.");
  invariant(!eventIds.has(event.id), `Duplicate event id: ${event.id}`);
  invariant(event.format?.type, `Missing format type: ${event.name}`);
  invariant(new Set(event.participants).size === event.participants.length, `Duplicate team in ${event.name}`);
  eventIds.add(event.id);
}

const matchIds = new Set();
for (const match of snapshot.coverage.daily_matches) {
  invariant(match.match_id, "Every match needs a stable id.");
  invariant(match.team1_name && match.team2_name && match.team1_name !== match.team2_name, `Invalid matchup: ${match.match_id}`);
  invariant(!matchIds.has(match.match_id), `Duplicate match id: ${match.match_id}`);
  if (match.prob_team1 !== undefined) invariant(Number(match.prob_team1) >= 0 && Number(match.prob_team1) <= 1, `Invalid probability: ${match.match_id}`);
  matchIds.add(match.match_id);
}

const rankingNames = new Set();
for (const row of snapshot.coverage.vrs?.teams || []) {
  invariant(row.team_name && Number(row.rank) > 0, "Every VRS row needs a team and rank.");
  invariant(!rankingNames.has(row.team_name), `Duplicate VRS team: ${row.team_name}`);
  rankingNames.add(row.team_name);
}

for (const [teamName, asset] of Object.entries(teamAssets)) {
  invariant(teamName === teamName.toLowerCase(), `Team asset key must be normalized: ${teamName}`);
  invariant(typeof asset.logo_url === "string" && asset.logo_url.length > 0, `Missing crest URL: ${teamName}`);
}

console.log(`site data ok: ${eventIds.size} events, ${matchIds.size} current matches, ${rankingNames.size} VRS teams, ${Object.keys(teamAssets).length} supplemental crests`);
