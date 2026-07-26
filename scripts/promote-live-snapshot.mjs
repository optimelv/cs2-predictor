import { readFile, writeFile } from "node:fs/promises";
import { mergeHistoryMatches } from "../docs/lib/history.js";
import { mergePlayerTimeline, summarizePlayerRosterEras, summarizePlayerTimeline } from "../docs/lib/player-history.js";

const snapshotPath = process.argv[2];
if (!snapshotPath) throw new Error("Usage: node scripts/promote-live-snapshot.mjs <snapshot.json>");

const parse = async (path) => JSON.parse(await readFile(path, "utf8"));
const live = await parse(snapshotPath);
if (!live?.ok || !String(live.contract_version || "").startsWith("1.")) {
  throw new Error("Live snapshot contract is invalid.");
}

const historyPath = "docs/data/history.json";
const history = await parse(historyPath);
const historyRows = (live.matches || [])
  .filter((match) => /finished|completed|final|ended/i.test(String(match.status || "")))
  .filter((match) => ["tier_1", "tier_2"].includes(match.product_tier))
  .filter((match) => match.match_id && match.team1_name && match.team2_name && match.winner_name)
  .map((match) => ({
    match_id: match.match_id,
    match_date: String(match.starts_at || live.fetched_at_utc || "").slice(0, 10),
    event_name: match.event_name || "CS2 circuit",
    team1_name: match.team1_name,
    team2_name: match.team2_name,
    score1: match.score1,
    score2: match.score2,
    winner_name: match.winner_name,
    tier: match.product_tier,
    best_of: Number(String(match.series_format || "bo3").match(/\d+/)?.[0]) || 3,
    phase: match.stage_name || "Series",
    stage_name: match.stage_name || "",
    round_name: match.round_name || "",
    is_playoff: /playoff|quarter|semi|final/i.test(String(match.stage_name || "")),
    is_elimination: /elimination/i.test(String(match.stage_name || "")),
    maps: (match.map_results || []).filter((map) => Number.isFinite(Number(map.score1)) && Number.isFinite(Number(map.score2))).map((map) => ({
      map_name: map.map_name,
      score1: map.score1,
      score2: map.score2,
      winner_name: Number(map.score1) > Number(map.score2) ? match.team1_name : match.team2_name,
      picked_by: map.picked_by || null,
    })),
    lineups: {
      team1: (match.lineups?.team1 || []).map((player) => player.nickname).filter(Boolean),
      team2: (match.lineups?.team2 || []).map((player) => player.nickname).filter(Boolean),
    },
  }));
const mergedHistory = mergeHistoryMatches(history, historyRows);
mergedHistory.generated_at_utc = live.fetched_at_utc;
await writeFile(historyPath, `${JSON.stringify(mergedHistory, null, 2)}\n`);

const playersPath = "docs/data/players.json";
const players = await parse(playersPath);
const byId = new Map((players.players || []).map((player) => [String(player.player_id), player]));

for (const incoming of live.players || []) {
  const playerId = String(incoming.player_id || (incoming.hltv_player_id ? `hltv:${incoming.hltv_player_id}` : ""));
  if (!playerId || !incoming.nickname) continue;
  const existing = byId.get(playerId) || {
    player_id: playerId,
    nickname: incoming.nickname,
    team_name: incoming.team_name || "Roster pending",
    rating_3_0: null,
    maps_3m: 0,
    signal_index: 50,
    traits: {},
  };
  const incomingTimeline = incoming.form_timeline || (incoming.timeline_entry ? [incoming.timeline_entry] : []);
  const mergedTimeline = mergePlayerTimeline(existing.form_timeline, incomingTimeline);
  byId.set(playerId, {
    ...existing,
    ...incoming,
    player_id: playerId,
    rating_3_0: incoming.rating_3_0 ?? existing.rating_3_0,
    maps_3m: incoming.maps_3m ?? existing.maps_3m,
    signal_index: incoming.signal_index ?? existing.signal_index,
    traits: { ...(existing.traits || {}), ...(incoming.traits || {}) },
    form_timeline: mergedTimeline,
    form_summary: incoming.form_summary || (incomingTimeline.length ? summarizePlayerTimeline(mergedTimeline) : existing.form_summary),
    map_profile: incoming.map_profile || existing.map_profile || [],
    roster_eras: incoming.roster_eras || (incomingTimeline.length ? summarizePlayerRosterEras(mergedTimeline) : existing.roster_eras || []),
  });
}

players.players = [...byId.values()];
players.lineups_updated_at_utc = live.fetched_at_utc;
const latestIncomingHistory = (live.players || []).flatMap((player) => player.form_timeline || (player.timeline_entry ? [player.timeline_entry] : [])).map((row) => row.date).filter(Boolean).sort().at(-1);
if (live.player_history_through_date || latestIncomingHistory) players.history_through_date = live.player_history_through_date || latestIncomingHistory;
await writeFile(playersPath, `${JSON.stringify(players, null, 2)}\n`);
await writeFile("docs/data/players.js", `window.__STRIKESIGNAL_PLAYERS__ = ${JSON.stringify(players, null, 2)};\n`);

const predictions = await parse("docs/data/predictions.json");
const coverage = predictions.coverage || await parse("docs/data/coverage.json");
coverage.last_verified_utc = live.fetched_at_utc;
await writeFile("docs/data/coverage.json", `${JSON.stringify(coverage, null, 2)}\n`);
await writeFile("docs/data/coverage.js", `window.__STRIKESIGNAL_COVERAGE__ = ${JSON.stringify(coverage, null, 2)};\n`);

console.log(JSON.stringify({ players: players.players.length, history_matches: mergedHistory.matches.length, updated_at: live.fetched_at_utc }, null, 2));
