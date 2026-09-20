import { normalizeWatchlist } from "./watchlist.js";

const DESK_LINK_VERSION = 1;
const MAX_ENCODED_LENGTH = 16_000;
const MAX_ENTITIES_PER_TYPE = 50;
const MAX_PICKS = 20;

const cleanText = (value, maxLength = 160) => String(value ?? "").trim().slice(0, maxLength);

function cleanEntityRows(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.slice(0, MAX_ENTITIES_PER_TYPE * 2).flatMap((row) => {
    if (!Array.isArray(row) || row.length < 1) return [];
    const id = cleanText(row[0], 180);
    const name = cleanText(row[1] || id, 160);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: name || id, added_at: null }];
  }).slice(0, MAX_ENTITIES_PER_TYPE);
}

function cleanPick(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const teamName = cleanText(value.t ?? value.team_name);
  const opponentName = cleanText(value.o ?? value.opponent_name);
  const probability = Number(value.p ?? value.probability);
  if (!teamName || !opponentName || !Number.isFinite(probability)) return null;
  return {
    team_name: teamName,
    opponent_name: opponentName,
    event_name: cleanText(value.e ?? value.event_name),
    starts_at: cleanText(value.s ?? value.starts_at, 80) || null,
    probability: Math.max(0, Math.min(1, probability)),
    saved_at: cleanText(value.a ?? value.saved_at, 80) || null,
    match_id: cleanText(value.m ?? value.match_id, 220) || null,
  };
}

function cleanPickRows(rows) {
  if (!Array.isArray(rows)) return {};
  return Object.fromEntries(rows.slice(0, MAX_PICKS * 2).flatMap((row) => {
    if (!Array.isArray(row) || row.length !== 2) return [];
    const key = cleanText(row[0], 240);
    const pick = cleanPick(row[1]);
    return key && pick ? [[key, pick]] : [];
  }).slice(0, MAX_PICKS));
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function serializeDeskState(watchlist, savedPicks = {}) {
  const normalized = normalizeWatchlist(watchlist);
  const pickRows = Object.entries(savedPicks)
    .map(([key, pick]) => [key, cleanPick(pick)])
    .filter(([, pick]) => pick)
    .sort(([, left], [, right]) => String(right.saved_at || "").localeCompare(String(left.saved_at || "")))
    .slice(0, MAX_PICKS)
    .map(([key, pick]) => [cleanText(key, 240), {
      t: pick.team_name,
      o: pick.opponent_name,
      e: pick.event_name,
      s: pick.starts_at,
      p: pick.probability,
      a: pick.saved_at,
      m: pick.match_id,
    }])
    .filter(([key]) => key);
  const payload = {
    v: DESK_LINK_VERSION,
    w: {
      t: normalized.teams.slice(0, MAX_ENTITIES_PER_TYPE).map(({ id, name }) => [id, name]),
      p: normalized.players.slice(0, MAX_ENTITIES_PER_TYPE).map(({ id, name }) => [id, name]),
      e: normalized.events.slice(0, MAX_ENTITIES_PER_TYPE).map(({ id, name }) => [id, name]),
    },
    p: pickRows,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return encoded.length <= MAX_ENCODED_LENGTH ? encoded : "";
}

export function parseDeskState(value) {
  if (!value || String(value).length > MAX_ENCODED_LENGTH) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(value));
    if (!payload || payload.v !== DESK_LINK_VERSION || !payload.w || typeof payload.w !== "object") return null;
    return {
      version: DESK_LINK_VERSION,
      watchlist: normalizeWatchlist({
        teams: cleanEntityRows(payload.w.t),
        players: cleanEntityRows(payload.w.p),
        events: cleanEntityRows(payload.w.e),
      }),
      savedPicks: cleanPickRows(payload.p),
    };
  } catch {
    return null;
  }
}

export function mergeDeskState(currentWatchlist, currentPicks = {}, incoming) {
  if (!incoming) return { watchlist: normalizeWatchlist(currentWatchlist), savedPicks: { ...currentPicks } };
  const current = normalizeWatchlist(currentWatchlist);
  const mergedWatchlist = { version: current.version };
  for (const [type, limit] of [["teams", 100], ["players", 100], ["events", 100]]) {
    mergedWatchlist[type] = [...current[type], ...incoming.watchlist[type]]
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
      .slice(0, limit);
  }
  const savedPicks = { ...currentPicks };
  for (const [key, pick] of Object.entries(incoming.savedPicks)) {
    const existing = savedPicks[key];
    if (!existing || String(pick.saved_at || "") > String(existing.saved_at || "")) savedPicks[key] = pick;
  }
  return { watchlist: normalizeWatchlist(mergedWatchlist), savedPicks };
}

export function buildDeskShareUrl(currentUrl, watchlist, savedPicks) {
  const state = serializeDeskState(watchlist, savedPicks);
  if (!state) return "";
  const url = new URL(currentUrl);
  for (const key of ["event", "view", "player", "team", "match", "pickem", "release"]) url.searchParams.delete(key);
  url.searchParams.set("desk", state);
  url.hash = "top";
  return url.toString();
}
