export function buildMatchShareUrl(currentUrl, matchKey) {
  const url = new URL(currentUrl);
  for (const key of ["event", "view", "player", "team", "pickem", "release"]) url.searchParams.delete(key);
  url.searchParams.set("match", String(matchKey || ""));
  url.hash = "matches";
  return url.toString();
}

export function buildEventShareUrl(currentUrl, eventId, view = "overview") {
  const url = new URL(currentUrl);
  for (const key of ["match", "player", "team", "pickem", "release"]) url.searchParams.delete(key);
  url.searchParams.set("event", String(eventId || ""));
  url.searchParams.set("view", String(view || "overview"));
  url.hash = "featured";
  return url.toString();
}

function validPickemEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 64).flatMap((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) return [];
    const key = String(entry[0] || "");
    const winner = String(entry[1] || "");
    if (!key || !winner || key.length > 220 || winner.length > 100) return [];
    return [[key, winner]];
  }).sort(([a], [b]) => a.localeCompare(b));
}

export function serializePickemOverrides(entries) {
  return JSON.stringify(validPickemEntries([...entries]));
}

export function parsePickemOverrides(value) {
  if (!value || String(value).length > 16_000) return [];
  try {
    return validPickemEntries(JSON.parse(String(value)));
  } catch {
    return [];
  }
}

export function buildPickemShareUrl(currentUrl, eventId, entries) {
  const url = new URL(currentUrl);
  for (const key of ["match", "view", "player", "team", "release"]) url.searchParams.delete(key);
  url.searchParams.set("event", String(eventId || ""));
  const state = serializePickemOverrides(entries);
  if (state === "[]") url.searchParams.delete("pickem");
  else url.searchParams.set("pickem", state);
  url.hash = "featured";
  return url.toString();
}

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function eventOwnsProjection(event, projection) {
  if (!event || !projection || (projection.seed_rows || []).length < 8) return false;
  if (projection.event_id) return String(event.id) === String(projection.event_id);
  const eventName = normalizedName(event.name).replace(/^iem /, "");
  const stageName = normalizedName(projection.stage);
  return Boolean(eventName && stageName && stageName.includes(eventName));
}

export function validOverrideWinner(value, team1, team2) {
  const normalizedValue = normalizedName(value);
  if (normalizedValue === normalizedName(team1)) return team1;
  if (normalizedValue === normalizedName(team2)) return team2;
  return null;
}
