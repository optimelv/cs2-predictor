export const SNAPSHOT_CONTRACT_VERSION = "1.1";

const FORMAT_ALIASES = new Map([
  ["single elimination", "single_elimination"],
  ["single elimination bracket", "single_elimination"],
  ["knockout", "single_elimination"],
  ["double elimination", "double_elimination"],
  ["double elimination bracket", "double_elimination"],
  ["gsl groups", "gsl"],
  ["gsl", "gsl"],
  ["swiss", "swiss"],
  ["round robin", "round_robin"],
  ["league", "round_robin"],
  ["mixed", "mixed"],
]);

const STATUS_ALIASES = new Map([
  ["scheduled", "upcoming"],
  ["not started", "upcoming"],
  ["playing", "live"],
  ["in progress", "live"],
  ["completed", "finished"],
  ["ended", "finished"],
  ["final", "finished"],
]);

const TIER_TWO_EVENT_PATTERN = /\b(?:cct|roman imperium|esl challenger|thunderpick world championship|european pro league)\b/i;
const TIER_ONE_EVENT_PATTERN = /\b(?:major|iem|blast|esl pro league|pgl masters|esports world cup|fissure playground)\b/i;

export function productTierForEvent(event = {}) {
  const declared = String(event.product_tier || event.tier || event.publisher_tier || event.event_tier || "").trim().toLowerCase();
  const name = String(event.name || event.event_name || event.source_title || "");
  if (["tier_1", "tier 1", "major", "s-tier", "s tier", "a-tier", "a tier"].includes(declared)) return "tier_1";
  if (["tier_2", "tier 2", "b-tier", "b tier"].includes(declared)) return "tier_2";
  if (/^(?:c-tier|c tier|tier[_ -]?3|d-tier|d tier|excluded)$/.test(declared)) return "excluded";
  if (TIER_TWO_EVENT_PATTERN.test(name)) return "tier_2";
  if (TIER_ONE_EVENT_PATTERN.test(name)) return "tier_1";
  return "pending";
}

export function eventIsProductEligible(event = {}) {
  return ["tier_1", "tier_2"].includes(productTierForEvent(event));
}

export function slugify(value) {
  return String(value || "")
    .replace(/intel extreme masters/gi, "IEM")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function cleanTeam(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return String(value.team_name || value.name || value.team || "").trim();
}

function teamReference(value) {
  if (typeof value === "string") return { team_id: "", team_name: value.trim() };
  if (!value || typeof value !== "object") return { team_id: "", team_name: "" };
  return {
    team_id: String(value.team_id || value.id || value.source_id || ""),
    team_name: cleanTeam(value),
  };
}

function isPlaceholderTeam(value) {
  return /^(?:tbd|unknown|team\s*\d+|(?:quarter|semi)?final(?:ist)?\s+(?:winner|loser)|(?:winner|loser)\s+of|[a-z]+\s+qualifier)$/i.test(String(value || "").trim());
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(cleanTeam).filter((value) => value && !isPlaceholderTeam(value)))];
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inferredStatus(status, startDate, endDate) {
  const normalized = String(status || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const declared = STATUS_ALIASES.get(normalized) || normalized.replace(/\s+/g, "_");
  if (declared === "cancelled") return declared;
  const now = Date.now();
  const start = new Date(startDate ? `${String(startDate).slice(0, 10)}T00:00:00` : 0).getTime();
  const end = new Date((endDate || startDate) ? `${String(endDate || startDate).slice(0, 10)}T23:59:59` : 0).getTime();
  if (start && now < start) return "upcoming";
  if (end && now > end) return "finished";
  if (start && now >= start && (!end || now <= end)) return "ongoing";
  return declared || "upcoming";
}

function normalizeStage(stage, index) {
  const source = typeof stage === "string" ? { name: stage } : { ...(stage || {}) };
  const name = source.name || source.label || `Stage ${index + 1}`;
  const rawType = String(source.type || source.kind || name).toLowerCase().replace(/[_-]+/g, " ").trim();
  const type = FORMAT_ALIASES.get(rawType)
    || [...FORMAT_ALIASES].find(([alias]) => rawType.includes(alias))?.[1]
    || "mixed";
  return {
    ...source,
    id: source.id || slugify(name),
    name,
    type,
    order: finiteNumber(source.order) || index + 1,
    status: source.status || "pending",
    settings: { ...(source.settings || {}) },
  };
}

function normalizeFormat(rawFormat, event = {}) {
  const source = typeof rawFormat === "string" ? { label: rawFormat } : { ...(rawFormat || {}) };
  const rawType = String(source.type || source.kind || source.label || "mixed")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  const type = FORMAT_ALIASES.get(rawType)
    || [...FORMAT_ALIASES].find(([alias]) => rawType.includes(alias))?.[1]
    || "mixed";
  const stages = (source.stages || event.stages || [])
    .map(normalizeStage)
    .sort((a, b) => a.order - b.order);
  return {
    ...source,
    type,
    label: source.label || source.name || type.replaceAll("_", " "),
    stages,
    settings: { ...(source.settings || {}) },
  };
}

function normalizeBracket(rawBracket, context) {
  if (!rawBracket || typeof rawBracket !== "object") return null;
  const rounds = (rawBracket.rounds || []).map((round, roundIndex) => {
    const source = typeof round === "string" ? { name: round } : { ...(round || {}) };
    const name = source.name || source.label || `Round ${roundIndex + 1}`;
    const matches = (source.matches || [])
      .map((match) => normalizeMatch(match, { eventId: context.id, eventName: context.name }))
      .filter(Boolean)
      .map((match, matchIndex) => ({
        ...match,
        slot_id: String(match.slot_id || `${slugify(name)}-${matchIndex + 1}`),
        round_name: match.round_name || name,
        feeds_from: Array.isArray(match.feeds_from) ? match.feeds_from.map(String) : [],
      }));
    return {
      ...source,
      id: String(source.id || slugify(name)),
      name,
      order: finiteNumber(source.order) || roundIndex + 1,
      bracket: source.bracket || "main",
      matches,
    };
  }).filter((round) => round.matches.length).sort((a, b) => a.order - b.order);
  if (!rounds.length) return null;
  return {
    ...rawBracket,
    type: rawBracket.type || "single_elimination",
    rounds,
  };
}

export function normalizeMatch(match, context = {}) {
  if (!match || typeof match !== "object") return null;
  const rawTeam1 = match.team1_name || match.team1 || match.home || match.opponent1;
  const rawTeam2 = match.team2_name || match.team2 || match.away || match.opponent2;
  const team1Name = cleanTeam(rawTeam1);
  const team2Name = cleanTeam(rawTeam2);
  if (!team1Name || !team2Name || team1Name === team2Name) return null;
  const eventId = String(match.event_id || context.eventId || "").trim();
  const eventName = String(match.event_name || context.eventName || "").trim();
  const startsAt = match.starts_at || match.start_time || match.match_time || null;
  const stageName = String(match.stage_name || match.stage || match.round || "Scheduled series");
  const score1 = finiteNumber(match.score1 ?? match.team1_score);
  const score2 = finiteNumber(match.score2 ?? match.team2_score);
  const maps = (match.maps || match.map_names || [])
    .map((map) => typeof map === "string" ? map : map?.map_name || map?.name)
    .filter(Boolean);
  const status = inferredStatus(match.status, startsAt, startsAt);
  const identity = [eventId || slugify(eventName), startsAt || "tba", stageName, team1Name, team2Name].map(slugify).join("--");
  return {
    ...match,
    match_id: String(match.match_id || match.hltv_match_id || match.id || identity),
    event_id: eventId,
    event_name: eventName,
    team1_id: String(match.team1_id || teamReference(rawTeam1).team_id || ""),
    team2_id: String(match.team2_id || teamReference(rawTeam2).team_id || ""),
    team1_name: team1Name,
    team2_name: team2Name,
    starts_at: startsAt,
    stage_name: stageName,
    series_format: String(match.series_format || match.best_of || "bo3").toLowerCase(),
    status,
    score1,
    score2,
    winner_name: cleanTeam(match.winner_name || match.winner),
    maps: [...new Set(maps)],
  };
}

export function normalizeEvent(event, index = 0) {
  if (!event || typeof event !== "object") return null;
  const name = String(event.name || event.event_name || event.source_title || `Event ${index + 1}`).trim();
  const nameSlug = slugify(name);
  const startYear = String(event.start_date || "").slice(0, 4);
  const fallbackId = startYear && !nameSlug.endsWith(`-${startYear}`) ? `${nameSlug}-${startYear}` : nameSlug;
  const id = String(event.id || event.event_id || fallbackId).trim();
  const rawParticipants = event.participants || event.teams_attending || event.field || [];
  const participantRefs = rawParticipants.map(teamReference).filter((team) => team.team_name && !isPlaceholderTeam(team.team_name));
  const participants = uniqueStrings(rawParticipants);
  const groups = (event.groups || []).map((group, groupIndex) => ({
    ...group,
    id: group.id || slugify(group.name || `group-${groupIndex + 1}`),
    name: group.name || `Group ${String.fromCharCode(65 + groupIndex)}`,
    teams: uniqueStrings(group.teams || group.participants || []),
  }));
  const groupTeams = uniqueStrings(groups.flatMap((group) => group.teams));
  const fullField = uniqueStrings([...participants, ...groupTeams, ...(event.playoff_invites || [])]);
  const matches = (Array.isArray(event.matches) ? event.matches : [])
    .map((match) => normalizeMatch(match, { eventId: id, eventName: name }))
    .filter(Boolean);
  const normalizedEvent = {
    ...event,
    id,
    name,
    status: inferredStatus(event.status, event.start_date, event.end_date),
    participants: fullField,
    participant_refs: participantRefs,
    teams: Math.max(finiteNumber(event.teams) || 0, fullField.length),
    groups,
    matches,
    map_pool: uniqueStrings(event.map_pool || event.maps || []),
    format: normalizeFormat(event.format || event.event_format, event),
    product_tier: productTierForEvent(event),
  };
  normalizedEvent.bracket = normalizeBracket(event.bracket, normalizedEvent);
  return normalizedEvent;
}

function mergeEvents(primary, secondary) {
  const byId = new Map();
  [...primary, ...secondary].filter(Boolean).forEach((event) => {
    const key = event.id || slugify(event.name);
    const existing = byId.get(key);
    byId.set(key, existing ? {
      ...event,
      ...existing,
      participants: uniqueStrings([...(event.participants || []), ...(existing.participants || [])]),
      matches: [...(event.matches || []), ...(existing.matches || [])],
    } : event);
  });
  return [...byId.values()];
}

export function normalizeCoverage(snapshot = {}, eventCoverage = []) {
  const dailyMatches = (snapshot.daily_matches || []).map((match) => normalizeMatch(match)).filter(Boolean);
  const declaredEvents = (snapshot.events || []).map(normalizeEvent).filter(Boolean);
  const discoveredEvents = (eventCoverage || []).map(normalizeEvent).filter(Boolean);
  const events = mergeEvents(declaredEvents, discoveredEvents);
  const byId = new Map(events.map((event) => [event.id, event]));
  const byName = new Map(events.map((event) => [slugify(event.name), event]));

  dailyMatches.forEach((match) => {
    const event = byId.get(match.event_id) || byName.get(slugify(match.event_name));
    if (!event) return;
    event.participants = uniqueStrings([...event.participants, match.team1_name, match.team2_name]);
    event.teams = Math.max(event.teams || 0, event.participants.length);
  });

  return {
    ...snapshot,
    contract_version: snapshot.contract_version || SNAPSHOT_CONTRACT_VERSION,
    events,
    daily_matches: dailyMatches,
  };
}

export function normalizePlatformSnapshot(base = {}, coverage = null) {
  const normalizedCoverage = normalizeCoverage(coverage || base.coverage || {}, base.event_coverage || []);
  return {
    ...base,
    coverage: normalizedCoverage,
    upcoming_predictions: (base.upcoming_predictions || []).map((match) => normalizeMatch(match)).filter(Boolean),
  };
}
