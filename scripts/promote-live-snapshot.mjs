import { readFile, writeFile } from "node:fs/promises";

const snapshotPath = process.argv[2];
if (!snapshotPath) throw new Error("Usage: node scripts/promote-live-snapshot.mjs <snapshot.json>");

const parse = async (path) => JSON.parse(await readFile(path, "utf8"));
const live = await parse(snapshotPath);
if (!live?.ok || !String(live.contract_version || "").startsWith("1.")) {
  throw new Error("Live snapshot contract is invalid.");
}

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
  byId.set(playerId, {
    ...existing,
    ...incoming,
    player_id: playerId,
    rating_3_0: incoming.rating_3_0 ?? existing.rating_3_0,
    maps_3m: incoming.maps_3m ?? existing.maps_3m,
    signal_index: incoming.signal_index ?? existing.signal_index,
    traits: { ...(existing.traits || {}), ...(incoming.traits || {}) },
  });
}

players.players = [...byId.values()];
players.lineups_updated_at_utc = live.fetched_at_utc;
await writeFile(playersPath, `${JSON.stringify(players, null, 2)}\n`);
await writeFile("docs/data/players.js", `window.__STRIKESIGNAL_PLAYERS__ = ${JSON.stringify(players, null, 2)};\n`);

const predictions = await parse("docs/data/predictions.json");
const coverage = predictions.coverage || await parse("docs/data/coverage.json");
coverage.last_verified_utc = live.fetched_at_utc;
await writeFile("docs/data/coverage.json", `${JSON.stringify(coverage, null, 2)}\n`);
await writeFile("docs/data/coverage.js", `window.__STRIKESIGNAL_COVERAGE__ = ${JSON.stringify(coverage, null, 2)};\n`);

console.log(JSON.stringify({ players: players.players.length, updated_at: live.fetched_at_utc }, null, 2));
