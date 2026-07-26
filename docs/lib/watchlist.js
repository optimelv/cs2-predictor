export const WATCHLIST_VERSION = 1;
export const WATCH_TYPES = ["teams", "players", "events"];

const cleanEntry = (entry) => {
  if (typeof entry === "string") return { id: entry, name: entry, added_at: null };
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id || "").trim();
  if (!id) return null;
  return { id, name: String(entry.name || id).trim(), added_at: entry.added_at || null };
};

export function normalizeWatchlist(value = {}) {
  const normalized = { version: WATCHLIST_VERSION, teams: [], players: [], events: [] };
  for (const type of WATCH_TYPES) {
    const seen = new Set();
    normalized[type] = (Array.isArray(value[type]) ? value[type] : [])
      .map(cleanEntry)
      .filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id))
      .slice(0, 100);
  }
  return normalized;
}

export function watchlistHas(watchlist, type, id) {
  if (!WATCH_TYPES.includes(type) || !id) return false;
  return normalizeWatchlist(watchlist)[type].some((entry) => entry.id === String(id));
}

export function toggleWatchlist(watchlist, type, entity, now = new Date().toISOString()) {
  const next = normalizeWatchlist(watchlist);
  if (!WATCH_TYPES.includes(type)) return next;
  const entry = cleanEntry(entity);
  if (!entry) return next;
  const existingIndex = next[type].findIndex((row) => row.id === entry.id);
  if (existingIndex >= 0) next[type].splice(existingIndex, 1);
  else next[type].unshift({ ...entry, added_at: entry.added_at || now });
  return next;
}

export function watchlistCount(watchlist) {
  const value = normalizeWatchlist(watchlist);
  return WATCH_TYPES.reduce((total, type) => total + value[type].length, 0);
}
