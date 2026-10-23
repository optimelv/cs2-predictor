import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { mergePlayerProfile } from "../docs/lib/player-history.js";

export function refreshPlayerProfiles(snapshot, source) {
  assert(source && typeof source === "object" && /^\d{4}-\d{2}-\d{2}T/.test(source.checked_at_utc || ""), "Invalid player-profile source timestamp");
  const byId = new Map(snapshot.players.map((player) => [player.player_id, player]));
  const rows = Array.isArray(source.players) ? source.players : Array.isArray(source.profiles) ? source.profiles : [];
  const counters = { received: rows.length, invalid: 0, stale_stats: 0, profile_updates: 0, stats_updates: 0, traits_updates: 0 };
  const validProfileUrl = (url, playerId) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "www.hltv.org"
        && new RegExp(`^/player/${playerId.split(":")[1]}(?:/|$)`).test(parsed.pathname);
    } catch { return false; }
  };
  const validHltvUrl = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "www.hltv.org";
    } catch { return false; }
  };
  const validPortraitUrl = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "img-cdn.hltv.org" && parsed.pathname.startsWith("/playerbodyshot/");
    } catch { return false; }
  };
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && value <= source.checked_at_utc.slice(0, 10);
  const completeTraits = (traits) => traits && Object.keys(traits).length === 7
    && Object.values(traits).every((value) => Number.isInteger(value) && value >= 0 && value <= 100);
  for (const row of rows) {
    if (row?.verified === false) continue;
    if (!/^hltv:\d+$/.test(row?.player_id || "") || !row.nickname || !validProfileUrl(row.source_url, row.player_id)) {
      counters.invalid++;
      continue;
    }
    const existing = byId.get(row.player_id) || {};
    const statsDate = row.stats_through_date;
    const hasStats = row.stats_window === "past_3_months" && Number.isFinite(row.rating_3_0) && row.rating_3_0 > 0 && row.rating_3_0 < 5
      && Number.isInteger(row.maps_3m) && row.maps_3m > 0 && validDate(statsDate)
      && /^\d{4}-\d{2}-\d{2}T/.test(row.stats_fetched_at_utc || "")
      && validHltvUrl(row.stats_source_url || row.source_url);
    const canAdvanceStats = hasStats && (!existing.stats_through_date || statsDate >= existing.stats_through_date);
    if (hasStats && !canAdvanceStats) counters.stale_stats++;
    const hasTraits = completeTraits(row.traits) && validDate(row.traits_through_date || statsDate);
    const input = {
      player_id: row.player_id,
      hltv_player_id: row.player_id.split(":")[1],
      nickname: row.nickname,
      team_name: row.team_name || row.current_team || existing.team_name || "Unattached",
      source_url: row.source_url,
    };
    if (/^\d{4}-\d{2}-\d{2}T/.test(row.profile_fetched_at_utc || "")) input.profile_fetched_at_utc = row.profile_fetched_at_utc;
    for (const key of ["country", "age"]) if (row[key] !== undefined && row[key] !== null) input[key] = row[key];
    if (validPortraitUrl(row.portrait_url)) input.portrait_url = row.portrait_url;
    if (canAdvanceStats) {
      input.rating_3_0 = row.rating_3_0;
      input.maps_3m = row.maps_3m;
      input.kd_ratio_3m = Number.isFinite(row.kd_ratio_3m) ? row.kd_ratio_3m : null;
      input.stats_window = "past_3_months";
      input.stats_from_date = validDate(row.stats_from_date) ? row.stats_from_date : null;
      input.stats_through_date = statsDate;
      input.stats_fetched_at_utc = row.stats_fetched_at_utc;
      input.stats_source_url = validHltvUrl(row.stats_source_url) ? row.stats_source_url : row.source_url;
      counters.stats_updates++;
    }
    if (hasTraits) {
      input.traits = row.traits;
      input.traits_through_date = row.traits_through_date || statsDate;
      const traitAverage = Object.values(row.traits).reduce((sum, value) => sum + value, 0) / 7;
      input.signal_index = Math.round(Math.min(100, traitAverage * .55 + (canAdvanceStats ? row.rating_3_0 : existing.rating_3_0 || 0) / 1.35 * 100 * .45));
      input.signal_index_through_date = input.traits_through_date;
      counters.traits_updates++;
    }
    byId.set(row.player_id, mergePlayerProfile(existing, input));
    counters.profile_updates++;
  }
  const coverage = source.coverage && typeof source.coverage === "object" ? source.coverage : {};
  const completeCoverage = Number.isInteger(coverage.requested) && coverage.requested > 0
    && Number(coverage.succeeded) >= coverage.requested && Number(coverage.failed || 0) === 0;
  return { ...snapshot,
    // This legacy field means a complete aggregate-stat sweep, never a partial profile retry.
    profiles_updated_at_utc: completeCoverage && counters.stats_updates === coverage.requested ? source.checked_at_utc : snapshot.profiles_updated_at_utc,
    profile_refresh: { checked_at_utc: source.checked_at_utc, ...coverage, ...counters },
    players: [...byId.values()].sort((a, b) => (b.rating_3_0 || 0) - (a.rating_3_0 || 0)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.argv[2], "Usage: npm run build:players -- <verified-profile-source.json>");
  const source = JSON.parse(await readFile(process.argv[2], "utf8"));
  const snapshot = refreshPlayerProfiles(JSON.parse(await readFile("docs/data/players.json", "utf8")), source);
  await writeFile("docs/data/players.json", JSON.stringify(snapshot, null, 2) + "\n");
  await writeFile("docs/data/players.js", `window.__STRIKESIGNAL_PLAYERS__ = ${JSON.stringify(snapshot)};\n`);
  console.log(`Preserved ${snapshot.players.length} profiles; merged ${snapshot.profile_refresh?.profile_updates || 0} verified profile updates.`);
}
