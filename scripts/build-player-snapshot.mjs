import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mergePlayerProfile } from "../docs/lib/player-history.js";

export function refreshPlayerProfiles(snapshot, source) {
  const byId = new Map(snapshot.players.map((player) => [player.player_id, player]));
  let updated = 0;
  for (const row of source.players || []) {
    if (!row.verified) continue;
    assert(/^hltv:\d+$/.test(row.player_id) && row.nickname, "Invalid player identity");
    assert(new URL(row.source_url).hostname === "www.hltv.org" && row.source_url.includes(`/player/${row.player_id.split(":")[1]}/`), "Mismatched player source");
    assert(Number.isFinite(row.rating_3_0) && row.rating_3_0 > 0 && row.rating_3_0 < 5, "Invalid profile rating");
    assert(Number.isInteger(row.maps_3m) && row.maps_3m > 0, "Invalid map sample");
    assert(Object.keys(row.traits).length === 7 && Object.values(row.traits).every((value) => Number.isInteger(value) && value >= 0 && value <= 100), "Invalid traits");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(row.stats_through_date) && row.stats_through_date <= source.checked_at_utc.slice(0, 10), "Invalid source date");
    const existing = byId.get(row.player_id) || {};
    if ((existing.stats_through_date || "") > row.stats_through_date) continue;
    const traitAverage = Object.values(row.traits).reduce((sum, value) => sum + value, 0) / 7;
    const profile = mergePlayerProfile(existing, {
      player_id: row.player_id, hltv_player_id: row.player_id.split(":")[1], nickname: row.nickname,
      team_name: row.current_team || "Unattached", source_url: row.source_url,
      rating_3_0: row.rating_3_0, maps_3m: row.maps_3m, traits: row.traits, kd_ratio_3m: null, stats_from_date: null,
      signal_index: Math.round(Math.min(100, traitAverage * .55 + row.rating_3_0 / 1.35 * 100 * .45)),
      stats_window: "past_3_months", stats_through_date: row.stats_through_date,
      stats_fetched_at_utc: row.checked_at_utc, stats_source_url: row.source_url,
    });
    byId.set(row.player_id, profile);
    updated++;
  }
  assert(updated > 0, "No verified profiles; preserving the existing snapshot");
  return { ...snapshot, profiles_updated_at_utc: source.checked_at_utc,
    players: [...byId.values()].sort((a, b) => (b.rating_3_0 || 0) - (a.rating_3_0 || 0)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.argv[2], "Usage: npm run build:players -- <verified-profile-source.json>");
  const source = JSON.parse(await readFile(process.argv[2], "utf8"));
  const snapshot = refreshPlayerProfiles(JSON.parse(await readFile("docs/data/players.json", "utf8")), source);
  await writeFile("docs/data/players.json", JSON.stringify(snapshot, null, 2) + "\n");
  await writeFile("docs/data/players.js", `window.__STRIKESIGNAL_PLAYERS__ = ${JSON.stringify(snapshot)};\n`);
  console.log(`Preserved ${snapshot.players.length} profiles; merged ${source.players.filter((row) => row.verified).length} verified updates.`);
}
