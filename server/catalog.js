import { compileBracketContract } from "./bracket-contract.js";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const first = (value) => Array.isArray(value) ? value[0] : value;
const UNRESOLVED_MATCH_GRACE_MS = 24 * 60 * 60 * 1000;

function boundedLimit(value) {
  const parsed = Number.parseInt(first(value), 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 25;
}

function decodeCursor(value) {
  if (!value) return 0;
  try {
    const decoded = Number.parseInt(Buffer.from(String(first(value)), "base64url").toString("utf8"), 10);
    return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function textIncludes(row, fields, query) {
  if (!query) return true;
  return normalize(fields.map((field) => row[field]).join(" ")).includes(query);
}

function dateInRange(row, params) {
  const value = String(row.starts_at || row.match_date || row.start_date || "").slice(0, 10);
  if (params.date_from && value && value < params.date_from) return false;
  if (params.date_to && value && value > params.date_to) return false;
  return true;
}

function matchSummary(row) {
  const { lineups: _lineups, map_results: _mapResults, veto_text: _vetoText, ...summary } = row;
  return summary;
}

function playerSummary(row) {
  const { form_timeline: _timeline, map_profile: _maps, roster_eras: _eras, ...summary } = row;
  return summary;
}

function matchIdentity(row) {
  if (row.match_id || row.hltv_match_id) return String(row.match_id || row.hltv_match_id);
  return [normalize(row.team1_name), normalize(row.team2_name), String(row.starts_at || row.stage_name || "")].join(":");
}

function matchHasRecordedResult(row) {
  if (String(row?.winner_name || row?.winner || "").trim()) return true;
  const score1 = Number(row?.score1);
  const score2 = Number(row?.score2);
  if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 < 0 || score2 < 0 || score1 === score2) return false;
  const bestOf = Number(String(row?.series_format || row?.best_of || "bo3").replace(/[^0-9]/g, ""));
  const target = bestOf === 1 ? 1 : bestOf === 5 ? 3 : 2;
  return Math.max(score1, score2) >= target;
}

function matchIsStaleUnresolved(row, now = Date.now()) {
  if (matchHasRecordedResult(row)) return false;
  const startsAt = Date.parse(row?.starts_at || row?.start_time || "");
  return Number.isFinite(startsAt) && startsAt < now - UNRESOLVED_MATCH_GRACE_MS;
}

function matchIsCurrentCandidate(row, now = Date.now()) {
  if (matchHasRecordedResult(row)) return false;
  const startsAt = Date.parse(row?.starts_at || row?.start_time || "");
  return Number.isFinite(startsAt) && startsAt >= now - UNRESOLVED_MATCH_GRACE_MS;
}

function eventDisplayStatus(event, datasets, now = Date.now()) {
  const declared = String(event?.status || "upcoming").toLowerCase();
  if (event?.archived || /finished|completed|cancelled|canceled/.test(declared)) return declared;
  const start = Date.parse(`${event?.start_date || ""}T12:00:00`);
  const end = Date.parse(`${event?.end_date || ""}T23:59:59`);
  const matches = [
    ...(datasets.predictions?.coverage?.daily_matches || []),
    ...(datasets.predictions?.upcoming_predictions || []),
    ...(datasets.live?.matches || []),
  ].filter((match) => String(match.event_id || "") === String(event.id || "") || normalize(match.event_name) === normalize(event.name));
  const hasCurrentMatch = matches.some((match) => matchIsCurrentCandidate(match, now));
  if (Number.isFinite(end) && end < now - UNRESOLVED_MATCH_GRACE_MS) return "historical";
  if (Number.isFinite(start) && start < now - UNRESOLVED_MATCH_GRACE_MS && !hasCurrentMatch) return "historical";
  if (!Number.isFinite(start) && !Number.isFinite(end)) {
    if (hasCurrentMatch) return declared === "ongoing" || declared === "upcoming" ? declared : "upcoming";
    return matches.some(matchHasRecordedResult) ? "historical" : "unknown";
  }
  return declared === "ongoing" || declared === "upcoming" ? declared : "upcoming";
}

function currentMatches(datasets) {
  const eligible = new Set(["tier_1", "tier_2"]);
  const eventTiers = datasets.live.product_filter?.event_tiers || {};
  const rows = [
    ...(datasets.predictions?.coverage?.daily_matches || []),
    ...(datasets.predictions?.upcoming_predictions || []),
    ...datasets.live.matches,
  ];
  const merged = new Map();
  for (const row of rows) {
    const id = matchIdentity(row);
    if (!id || id === "::") continue;
    const tier = row.product_tier || eventTiers[row.event_id];
    if (!eligible.has(tier)) continue;
    merged.set(id, { ...(merged.get(id) || {}), ...row, match_id: id, product_tier: tier });
  }
  return [...merged.values()].filter((row) => !matchIsStaleUnresolved(row) && Number.isFinite(Date.parse(row.starts_at || row.start_time || "")));
}

function rowsFor(resource, datasets, params) {
  if (resource === "matches") return params.history ? datasets.history.matches : currentMatches(datasets);
  if (resource === "events") return datasets.live.events.map((event) => ({ ...event, display_status: eventDisplayStatus(event, datasets) }));
  if (resource === "players") return datasets.players.players;
  if (resource === "rankings") return datasets.live.rankings?.teams || [];
  return null;
}

function eventMatches(datasets, event) {
  const id = String(event.id || "");
  const name = normalize(event.name);
  return currentMatches(datasets).filter((match) => String(match.event_id || "") === id || normalize(match.event_name) === name);
}

function bracketState(datasets, eventQuery) {
  const needle = normalize(eventQuery);
  const projection = datasets.predictions?.major_projection;
  let event = datasets.live.events.find((row) => {
    const id = normalize(row.id);
    const name = normalize(row.name);
    return id === needle || name === needle;
  });
  if (!event && projection && [projection.event_id, projection.stage].some((value) => normalize(value).includes(needle) || needle.includes(normalize(value)))) {
    event = {
      id: projection.event_id,
      name: String(projection.stage || projection.event_id).replace(/\s+(stage\s*\d+|playoffs).*$/i, ""),
      status: projection.stage_status,
      current_stage: projection.stage,
      format: projection.format || { type: "swiss", label: "Swiss into playoffs", settings: {} },
      participants: (projection.seed_rows || []).map((row) => row.team_name),
    };
  }
  if (!event) return null;
  return compileBracketContract(event, eventMatches(datasets, event).map(matchSummary), projection);
}

function filteredRows(resource, rows, params) {
  const query = normalize(params.q);
  const team = normalize(params.team);
  const event = normalize(params.event);
  const status = normalize(params.status);
  const region = normalize(params.region);
  const id = String(params.id || "");
  return rows.filter((row) => {
    if (id) {
      const rowId = String(row.match_id || row.id || row.player_id || "");
      if (rowId !== id) return false;
    }
    if (team && ![row.team_name, row.team1_name, row.team2_name].some((value) => normalize(value) === team)) return false;
    if (event && ![row.event_id, row.event_name, row.id, row.name].some((value) => {
      const normalized = normalize(value);
      const words = new Set(normalized.split(" ").filter(Boolean));
      return normalized === event || normalized.includes(event) || event.split(" ").filter(Boolean).every((word) => words.has(word));
    })) return false;
    if (status && normalize(resource === "events" ? row.display_status : row.status) !== status) return false;
    if (region && normalize(row.region) !== region) return false;
    if (!dateInRange(row, params)) return false;
    if (resource === "matches" && !textIncludes(row, ["event_name", "team1_name", "team2_name", "stage_name", "round_name"], query)) return false;
    if (resource === "events" && !textIncludes(row, ["name", "location", "status"], query)) return false;
    if (resource === "players" && !textIncludes(row, ["nickname", "real_name", "team_name"], query)) return false;
    if (resource === "rankings" && !textIncludes(row, ["team_name", "region"], query)) return false;
    return true;
  });
}

export function catalogManifest(datasets) {
  const events = datasets.live.events.map((event) => ({ ...event, display_status: eventDisplayStatus(event, datasets) }));
  return {
    ok: true,
    contract_version: "1.0",
    resources: {
      matches: { current: currentMatches(datasets).length, historical: datasets.history.matches.length },
      events: { current: events.filter((event) => ["ongoing", "upcoming"].includes(event.display_status)).length },
      players: { profiles: datasets.players.players.length },
      rankings: { teams: datasets.live.rankings?.teams?.length || 0 },
      brackets: { event_bound: true },
    },
    eligible_tiers: ["tier_1", "tier_2"],
    generated_at_utc: datasets.live.fetched_at_utc,
  };
}

export function validateCatalogDatasets(datasets) {
  if (!datasets?.live?.ok || !Array.isArray(datasets.live.matches) || !Array.isArray(datasets.live.events)) throw new Error("Live catalog contract is invalid.");
  if (!Array.isArray(datasets?.history?.matches) || !Array.isArray(datasets?.players?.players)) throw new Error("Historical catalog contract is invalid.");
  const eligible = new Set(["tier_1", "tier_2"]);
  if (!datasets.live.matches.every((match) => eligible.has(match.product_tier))) throw new Error("Live catalog contains an ineligible match.");
  if (!datasets.history.matches.every((match) => eligible.has(match.tier))) throw new Error("Historical catalog contains an ineligible match.");
  const eventTiers = datasets.live.product_filter?.event_tiers || {};
  if (!datasets.live.events.every((event) => eligible.has(eventTiers[event.id]))) throw new Error("Live catalog contains an ineligible event.");
  return datasets;
}

export function queryCatalog(resource, datasets, rawParams = {}) {
  const params = {
    q: first(rawParams.q) || "",
    team: first(rawParams.team) || "",
    event: first(rawParams.event) || "",
    status: first(rawParams.status) || "",
    region: first(rawParams.region) || "",
    id: first(rawParams.id) || "",
    date_from: first(rawParams.date_from) || "",
    date_to: first(rawParams.date_to) || "",
    history: ["1", "true", "yes"].includes(String(first(rawParams.history) || "").toLowerCase()),
    detail: String(first(rawParams.detail) || "summary").toLowerCase(),
  };
  if (resource === "brackets") {
    if (!params.event && !params.id) return { error: "Bracket state requires an exact event id or event name.", status: 400 };
    const bracket = bracketState(datasets, params.event || params.id);
    if (!bracket) return { error: "Event bracket not found.", status: 404 };
    return {
      ok: true,
      contract_version: "1.0",
      resource,
      generated_at_utc: datasets.live.fetched_at_utc,
      data: [bracket],
      pagination: { count: 1, total: 1, next_cursor: null },
      filters: params,
    };
  }
  const rows = rowsFor(resource, datasets, params);
  if (!rows) return { error: "Unknown resource. Use matches, events, players, rankings, or brackets.", status: 400 };
  if (params.detail === "full" && !params.id) return { error: "Full detail requires an exact id.", status: 400 };

  const filtered = filteredRows(resource, rows, params);
  const offset = decodeCursor(rawParams.cursor);
  const limit = boundedLimit(rawParams.limit);
  const page = filtered.slice(offset, offset + limit).map((row) => {
    if (params.detail === "full") return row;
    if (resource === "matches") return matchSummary(row);
    if (resource === "players") return playerSummary(row);
    return row;
  });
  const nextOffset = offset + page.length;
  return {
    ok: true,
    contract_version: "1.0",
    resource,
    generated_at_utc: resource === "matches" && params.history ? datasets.history.generated_at_utc : datasets.live.fetched_at_utc,
    data: page,
    pagination: {
      count: page.length,
      total: filtered.length,
      next_cursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
    },
    filters: params,
  };
}
