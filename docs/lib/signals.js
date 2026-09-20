export const SIGNAL_STATE_VERSION = 1;

const normalizeName = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const finiteProbability = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
};

export function signalMatchKey(match = {}) {
  if (match.match_id || match.hltv_match_id) return String(match.match_id || match.hltv_match_id);
  return [normalizeName(match.team1_name), normalizeName(match.team2_name), String(match.starts_at || match.stage_name || "")].join(":");
}

function statusGroup(match = {}) {
  const status = String(match.status || "").toLowerCase();
  if (/finished|completed|final|ended/.test(status) || match.winner_name) return "results";
  if (/live|playing|in.progress/.test(status)) return "live";
  return "upcoming";
}

function lineupFingerprint(match = {}) {
  const sides = ["team1", "team2"].map((side) => (match.lineups?.[side] || [])
    .map((player) => normalizeName(player.player_id || player.hltv_player_id || player.nickname || player))
    .filter(Boolean)
    .sort()
    .join(","));
  return sides.some(Boolean) ? sides.join("|") : "";
}

function vetoFingerprint(match = {}) {
  const maps = (match.maps || match.map_order || []).map((map) => normalizeName(map.map_name || map)).filter(Boolean);
  const vetoText = normalizeName(match.veto_text);
  return maps.length || vetoText ? `${maps.join(",")}|${vetoText}` : "";
}

function snapshotOf(match, observedAt) {
  return {
    at: observedAt,
    prob_team1: finiteProbability(match.prob_team1),
    status: statusGroup(match),
    veto: vetoFingerprint(match),
    lineup: lineupFingerprint(match),
  };
}

export function normalizeSignalState(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    version: SIGNAL_STATE_VERSION,
    matches: source.matches && typeof source.matches === "object" && !Array.isArray(source.matches) ? source.matches : {},
    notifications: Array.isArray(source.notifications) ? source.notifications.slice(0, 60) : [],
    last_checked_at: source.last_checked_at || null,
  };
}

function notification(type, key, match, observedAt, detail, extra = {}) {
  return {
    id: `${key}:${type}:${observedAt}`,
    type,
    match_key: key,
    event_name: match.event_name || "CS2 circuit",
    team1_name: match.team1_name,
    team2_name: match.team2_name,
    created_at: observedAt,
    detail,
    read: false,
    ...extra,
  };
}

function changedProbability(previous, current) {
  return previous.prob_team1 != null && current.prob_team1 != null
    ? current.prob_team1 - previous.prob_team1
    : 0;
}

export function ingestMatchSignals(value, matches = [], options = {}) {
  const state = normalizeSignalState(value);
  const observedAt = options.observedAt || new Date().toISOString();
  const observedTime = new Date(observedAt).getTime();
  const previousTime = new Date(state.last_checked_at || 0).getTime();
  if (state.last_checked_at && Number.isFinite(observedTime) && Number.isFinite(previousTime) && observedTime <= previousTime) {
    return { state, created: [] };
  }
  const isRelevant = typeof options.isRelevant === "function" ? options.isRelevant : () => true;
  const created = [];

  for (const match of matches) {
    if (!match?.team1_name || !match?.team2_name) continue;
    const key = signalMatchKey(match);
    const current = snapshotOf(match, observedAt);
    const record = state.matches[key];
    if (!record?.latest) {
      state.matches[key] = {
        match_key: key,
        event_name: match.event_name || "CS2 circuit",
        team1_name: match.team1_name,
        team2_name: match.team2_name,
        latest: current,
        timeline: [current],
        closing_prob_team1: null,
      };
      continue;
    }

    const previous = record.latest;
    const delta = changedProbability(previous, current);
    const statusChanged = previous.status !== current.status;
    const vetoChanged = previous.veto !== current.veto;
    const lineupChanged = previous.lineup !== current.lineup;
    const shouldAppend = Math.abs(delta) >= 0.005 || statusChanged || vetoChanged || lineupChanged;
    if (shouldAppend) record.timeline = [...(record.timeline || []), current].slice(-24);
    if (previous.status === "upcoming" && ["live", "results"].includes(current.status) && previous.prob_team1 != null) {
      record.closing_prob_team1 = previous.prob_team1;
      record.closed_at = observedAt;
    }
    Object.assign(record, {
      event_name: match.event_name || record.event_name,
      team1_name: match.team1_name,
      team2_name: match.team2_name,
      latest: current,
    });

    if (!isRelevant(match)) continue;
    if (Math.abs(delta) >= 0.035) {
      const team = delta > 0 ? match.team1_name : match.team2_name;
      created.push(notification("probability_shift", key, match, observedAt, `${team} moved ${Math.round(Math.abs(delta) * 100)} points`, { delta, team_name: team }));
    }
    if (!previous.veto && current.veto) created.push(notification("veto_published", key, match, observedAt, "Map veto published"));
    if (previous.lineup && current.lineup && lineupChanged) created.push(notification("lineup_change", key, match, observedAt, "Confirmed lineup changed"));
    if (previous.status !== "live" && current.status === "live") created.push(notification("match_live", key, match, observedAt, "Series is live"));
    if (previous.status !== "results" && current.status === "results") created.push(notification("match_final", key, match, observedAt, `${match.winner_name || "Result"} confirmed`));
  }

  if (created.length) state.notifications = [...created.reverse(), ...state.notifications].slice(0, 60);
  state.matches = Object.fromEntries(Object.entries(state.matches)
    .sort(([, left], [, right]) => String(right.latest?.at || "").localeCompare(String(left.latest?.at || "")))
    .slice(0, 300));
  state.last_checked_at = observedAt;
  return { state, created };
}

export function unreadSignalCount(value) {
  return normalizeSignalState(value).notifications.filter((item) => !item.read).length;
}

export function markSignalsRead(value) {
  const state = normalizeSignalState(value);
  state.notifications = state.notifications.map((item) => ({ ...item, read: true }));
  return state;
}

export function matchSignalRecord(value, matchOrKey) {
  const state = normalizeSignalState(value);
  const key = typeof matchOrKey === "string" ? matchOrKey : signalMatchKey(matchOrKey);
  return state.matches[key] || null;
}
