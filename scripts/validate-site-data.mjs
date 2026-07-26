import { readFile } from "node:fs/promises";
import { eventIsProductEligible, normalizePlatformSnapshot, productTierForEvent } from "../docs/lib/snapshot.js";

const parse = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const base = await parse("../docs/data/predictions.json");
const coverage = await parse("../docs/data/coverage.json");
const teamAssets = await parse("../docs/data/team-assets.json");
const playerSnapshot = await parse("../docs/data/players.json");
const modelRegistry = await parse("../docs/data/model-registry.json");
await parse("../contracts/live-snapshot.schema.json");
const snapshot = normalizePlatformSnapshot(base, coverage);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const eventIds = new Set();
let productEventCount = 0;
invariant(String(snapshot.coverage.contract_version).startsWith("1."), "Unsupported coverage contract version.");
for (const event of snapshot.coverage.events) {
  invariant(event.id && event.name, "Every event needs a stable id and name.");
  invariant(!eventIds.has(event.id), `Duplicate event id: ${event.id}`);
  invariant(event.format?.type, `Missing format type: ${event.name}`);
  invariant(["tier_1", "tier_2", "excluded", "pending"].includes(productTierForEvent(event)), `Invalid product tier: ${event.name}`);
  if (eventIsProductEligible(event)) productEventCount += 1;
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

const playerIds = new Set();
let playerTimelineCount = 0;
for (const player of playerSnapshot.players || []) {
  invariant(player.player_id && player.nickname && player.team_name, "Every player needs a stable id, nickname, and team.");
  invariant(!playerIds.has(player.player_id), `Duplicate player id: ${player.player_id}`);
  invariant(player.rating_3_0 === null || Number(player.rating_3_0) > 0, `Invalid player rating: ${player.player_id}`);
  invariant(Number(player.signal_index) >= 0 && Number(player.signal_index) <= 100, `Invalid player signal index: ${player.player_id}`);
  const timeline = player.form_timeline || [];
  invariant(Array.isArray(timeline) && timeline.length <= 12, `Invalid player timeline length: ${player.player_id}`);
  if (timeline.length) playerTimelineCount += 1;
  const timelineIds = new Set();
  let previousDate = "";
  for (const row of timeline) {
    invariant(row.match_id && row.date && row.opponent_name, `Malformed player timeline row: ${player.player_id}`);
    invariant(!timelineIds.has(row.match_id), `Duplicate player timeline match: ${player.player_id} ${row.match_id}`);
    invariant(!previousDate || row.date >= previousDate, `Player timeline is not chronological: ${player.player_id}`);
    invariant(Number(row.rating) > 0 && Number(row.adr) >= 0 && Number(row.kd_ratio) >= 0, `Invalid player timeline metric: ${player.player_id}`);
    timelineIds.add(row.match_id);
    previousDate = row.date;
  }
  playerIds.add(player.player_id);
}
invariant(String(playerSnapshot.contract_version).startsWith("1."), "Unsupported player snapshot contract.");
invariant(playerTimelineCount >= 40, "Player timeline coverage regressed below 40 profiles.");
invariant(playerSnapshot.history_through_date, "Player history needs a verified through-date.");

invariant(String(modelRegistry.contract_version).startsWith("1."), "Unsupported model registry contract.");
invariant(modelRegistry.champion?.version && modelRegistry.champion?.metrics, "The production model needs a version and metrics.");
for (const metric of ["accuracy", "log_loss", "brier", "ece"]) {
  invariant(Number.isFinite(Number(modelRegistry.champion.metrics[metric])), `Missing champion metric: ${metric}`);
}
if (modelRegistry.champion.kind === "portable_logistic_blend") {
  invariant(modelRegistry.champion.weights.length === modelRegistry.champion.features.length + 1, "Portable logistic artifact is malformed.");
}
if (modelRegistry.champion.kind === "portable_gbdt_blend") {
  invariant(modelRegistry.champion.trees?.length === modelRegistry.champion.n_estimators, "Portable GBDT artifact is malformed.");
}
invariant(base.model_registry?.champion?.version === modelRegistry.champion.version, "Published predictions do not embed the production champion.");

const mapProfiles = base.model_state?.map_profiles || {};
const vetoProfiles = base.model_state?.veto_profiles || {};
invariant(Object.keys(mapProfiles).length >= 40, "Map strategy coverage regressed below 40 teams.");
invariant(Object.keys(vetoProfiles).length >= 40, "Veto strategy coverage regressed below 40 teams.");
for (const [teamKey, profile] of Object.entries(vetoProfiles)) {
  invariant(Number(profile.sample_matches) >= 5, `Veto profile has insufficient sample: ${teamKey}`);
  invariant(profile.maps && Object.keys(profile.maps).length > 0, `Veto profile has no map actions: ${teamKey}`);
}

invariant(productEventCount > 0, "The public Tier 1/2 circuit cannot be empty.");
console.log(`site data ok: ${productEventCount}/${eventIds.size} public Tier 1/2 events, ${matchIds.size} current matches, ${rankingNames.size} VRS teams, ${playerIds.size} players, ${playerTimelineCount} timelines, ${Object.keys(mapProfiles).length} map profiles, ${Object.keys(vetoProfiles).length} veto profiles`);
