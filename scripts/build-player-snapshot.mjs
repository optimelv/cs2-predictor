import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultSource = "/Users/melvin/Documents/CS2 Predictor/work/data/raw/hltv/player_profiles_2026_06_07_top50.json";
const sourcePath = resolve(process.argv[2] || defaultSource);
const outputPath = resolve("docs/data/players.json");
const browserOutputPath = resolve("docs/data/players.js");

const rows = JSON.parse(await readFile(sourcePath, "utf8"));

const score = (value) => {
  const parsed = Number.parseInt(String(value || "").split("/")[0], 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
};

const players = rows
  .filter((row) => row?.ok && row?.hltv_player_id && row?.nickname)
  .map((row) => {
    const traits = {
      firepower: score(row.firepower),
      entrying: score(row.entrying),
      trading: score(row.trading),
      opening: score(row.opening),
      clutching: score(row.clutching),
      sniping: score(row.sniping),
      utility: score(row.utility),
    };
    const availableTraits = Object.values(traits).filter(Number.isFinite);
    const traitAverage = availableTraits.reduce((sum, value) => sum + value, 0) / Math.max(1, availableTraits.length);
    const rating = Number(row.rating_3_0) || null;
    const signalIndex = Math.round(Math.max(0, Math.min(100, traitAverage * 0.55 + ((rating || 1) / 1.35) * 100 * 0.45)));
    return {
      player_id: `hltv:${row.hltv_player_id}`,
      hltv_player_id: row.hltv_player_id,
      nickname: row.nickname,
      real_name: row.real_name || "",
      team_name: row.current_team || row.source_team_name || "Unattached",
      source_team_name: row.source_team_name || "",
      source_team_rank: Number(row.source_team_rank) || null,
      rating_3_0: rating,
      maps_3m: Number(row.maps_3m) || 0,
      traits,
      signal_index: signalIndex,
      source_url: row.fetched_url || `https://www.hltv.org${row.player_href || ""}`,
    };
  })
  .sort((a, b) => (b.rating_3_0 || 0) - (a.rating_3_0 || 0) || b.signal_index - a.signal_index);

const snapshot = {
  contract_version: "1.1",
  generated_at_utc: "2026-06-08T00:08:00Z",
  source: "HLTV player profiles",
  stats_window: "Past 3 months at collection time",
  players,
};

const json = `${JSON.stringify(snapshot, null, 2)}\n`;
await writeFile(outputPath, json, "utf8");
await writeFile(browserOutputPath, `window.__STRIKESIGNAL_PLAYERS__ = ${JSON.stringify(snapshot)};\n`, "utf8");
console.log(`wrote ${players.length} player profiles to ${outputPath}`);
