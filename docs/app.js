import { eventIsProductEligible, normalizeEvent, normalizeMatch, normalizePlatformSnapshot, productTierForEvent } from "./lib/snapshot.js?v=20260726.1";
import { buildDoubleEliminationTree } from "./lib/brackets.js?v=20260726.1";
import { tournamentBlueprint, tournamentPlayoffField, tournamentStageLabels } from "./lib/tournaments.js?v=20260726.1";
import { explainMatch } from "./lib/explanations.js?v=20260726.1";
import { normalizeWatchlist, toggleWatchlist, watchlistCount, watchlistHas } from "./lib/watchlist.js?v=20260726.1";
import {
  applyVetoMap,
  buildRecommendedVeto,
  createVetoState,
  mapWinProbability,
  recommendedMap,
  replayVeto,
  vetoSeriesRead,
  vetoTeamKey,
} from "./lib/veto.js?v=20260726.1";

const DATA_URL = "./data/predictions.json";
const SUPPLEMENTAL_TEAM_ASSETS = window.__STRIKESIGNAL_TEAM_ASSETS__ || {};
const STATIC_PLAYER_SNAPSHOT = window.__STRIKESIGNAL_PLAYERS__ || { players: [] };

const els = {
  freshnessLabel: document.querySelector("#freshnessLabel"),
  swissBoard: document.querySelector("#swissBoard"),
  playoffPanel: document.querySelector("#playoffPanel"),
  projectionTitle: document.querySelector("#projection-title"),
  projectionIntro: document.querySelector("#projection-intro"),
  eventEyebrow: document.querySelector(".section-eyebrow"),
  eventPhaseLabel: document.querySelector("#eventPhaseLabel"),
  eventSelector: document.querySelector("#eventSelector"),
  selectedEventName: document.querySelector("#selected-event-name"),
  selectedEventMeta: document.querySelector("#selected-event-meta"),
  pickemLabel: document.querySelector(".pickem-header .micro-label"),
  pickemTitle: document.querySelector(".pickem-header h3"),
  pickemScoreLabel: document.querySelector(".pickem-score span"),
  pickemChance: document.querySelector("#pickemChance"),
  pickemSummary: document.querySelector("#pickemSummary"),
  resetPicks: document.querySelector("#resetPicks"),
  boardStageTitle: document.querySelector("#boardStageTitle"),
  currentStageTab: document.querySelector("#currentStageTab"),
  playoffTab: document.querySelector('[data-board-jump="playoffs"]'),
  routeIntro: document.querySelector(".route-copy p"),
  boardJumpButtons: document.querySelectorAll("[data-board-jump]"),
  eventsGrid: document.querySelector("#eventsGrid"),
  matchToolbar: document.querySelector("#matchToolbar"),
  deciderGrid: document.querySelector("#deciderGrid"),
  modelPre: document.querySelector("#modelPre"),
  modelPost: document.querySelector("#modelPost"),
  modelCalibration: document.querySelector("#modelCalibration"),
  modelSample: document.querySelector("#modelSample"),
  modelVersion: document.querySelector("#modelVersion"),
  heroPre: document.querySelector("#heroPre"),
  heroPost: document.querySelector("#heroPost"),
  rankingsGrid: document.querySelector("#rankingsGrid"),
  rankingsSource: document.querySelector("#rankingsSource"),
  rankingsUpdated: document.querySelector("#rankingsUpdated"),
  rankingsSourceLink: document.querySelector("#rankingsSourceLink"),
  rankingToggle: document.querySelector("#rankingToggle"),
  slateCount: document.querySelector("#slateCount"),
  rankingSnapshot: document.querySelector("#rankingSnapshot"),
  eventCount: document.querySelector("#eventCount"),
  playerSearch: document.querySelector("#playerSearch"),
  playerTeamFilter: document.querySelector("#playerTeamFilter"),
  playerSnapshotMeta: document.querySelector("#playerSnapshotMeta"),
  playerGrid: document.querySelector("#playerGrid"),
  playerDetail: document.querySelector("#playerDetail"),
  teamDrawerLayer: document.querySelector("#teamDrawerLayer"),
  teamDrawerBackdrop: document.querySelector("#teamDrawerBackdrop"),
  teamDrawerClose: document.querySelector("#teamDrawerClose"),
  teamDrawerContent: document.querySelector("#teamDrawerContent"),
  openSearch: document.querySelector("#openSearch"),
  openMyDesk: document.querySelector("#openMyDesk"),
  watchCount: document.querySelector("#watchCount"),
  searchLayer: document.querySelector("#searchLayer"),
  searchBackdrop: document.querySelector("#searchBackdrop"),
  productSearch: document.querySelector("#productSearch"),
  searchResults: document.querySelector("#searchResults"),
  myDeskLayer: document.querySelector("#myDeskLayer"),
  myDeskBackdrop: document.querySelector("#myDeskBackdrop"),
  myDeskClose: document.querySelector("#myDeskClose"),
  myDeskContent: document.querySelector("#myDeskContent"),
  vetoLabLayer: document.querySelector("#vetoLabLayer"),
  vetoLabBackdrop: document.querySelector("#vetoLabBackdrop"),
  vetoLabClose: document.querySelector("#vetoLabClose"),
  vetoLabContent: document.querySelector("#vetoLabContent"),
  eventFilterButtons: document.querySelectorAll("[data-event-filter]"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
};

let teamAssets = {};
let appData = null;
let currentBoardView = "stage3";
let boardViewUserSelected = false;
let activeEventId = null;
let coverage = null;
let currentEventFilter = "active";
let currentMatchFilter = "all";
let currentMatchEvent = "all";
let selectedMatchDateKey = null;
let selectedMatchKey = null;
let activeEventView = "overview";
let selectedEventMatchKey = null;
let renderedEventMatches = [];
let rankingsExpanded = false;
let playerSnapshot = STATIC_PLAYER_SNAPSHOT;
let playerSearchTerm = "";
let playerTeamFilter = "all";
let selectedPlayerId = null;
let selectedTeamName = null;
let activeVetoMatch = null;
let vetoLabState = null;
let myDeskReturnFocus = null;
const pickOverrides = new Map();
const SAVED_PICKS_KEY = "strikesignal.saved-picks.v1";
let savedPicks = loadSavedPicks();
const WATCHLIST_KEY = "strikesignal.watchlist.v1";
let watchlist = loadWatchlist();
let teamLookupMap = {};
let probabilityCache = {};
const pickemChanceCache = new Map();

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return percentFormatter.format(Number(value));
}

function roundProb(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value))) * 10000) / 10000;
}

function formatDate(value) {
  if (!value) return "TBA";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return dateFormatter.format(parsed);
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function updateProductUrl({ eventId, view, playerId, teamName, hash } = {}) {
  if (window.location.protocol === "file:") return;
  const url = new URL(window.location.href);
  if (eventId !== undefined) eventId ? url.searchParams.set("event", eventId) : url.searchParams.delete("event");
  if (view !== undefined) view ? url.searchParams.set("view", view) : url.searchParams.delete("view");
  if (playerId !== undefined) playerId ? url.searchParams.set("player", playerId) : url.searchParams.delete("player");
  if (teamName !== undefined) teamName ? url.searchParams.set("team", teamName) : url.searchParams.delete("team");
  if (hash) url.hash = hash;
  window.history.replaceState(null, "", url);
}

function matchConfidence(match) {
  const probability = Number(match.prob_team1);
  const winnerProbability = match.predicted_winner === match.team1_name ? probability : 1 - probability;
  return Math.max(0, Math.min(1, winnerProbability));
}

function enrichMatch(match) {
  const suppliedProbability = Number(match?.prob_team1);
  const probability = Number.isFinite(suppliedProbability)
    ? Math.max(0.08, Math.min(0.92, suppliedProbability))
    : pairProbability(match.team1_name, match.team2_name, match);
  return {
    ...match,
    prob_team1: probability,
    predicted_winner: match.predicted_winner || (probability >= 0.5 ? match.team1_name : match.team2_name),
    confidence: Math.max(probability, 1 - probability),
    round: match.round || `${match.stage_name || "Scheduled series"} · ${String(match.series_format || "bo3").toUpperCase()}`,
  };
}

function matchKeyOf(match) {
  if (match?.match_id || match?.hltv_match_id) return String(match.match_id || match.hltv_match_id);
  return [normalizeName(match.team1_name), normalizeName(match.team2_name), String(match.starts_at || match.stage_name || "")].join(":");
}

function loadSavedPicks() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_PICKS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function persistSavedPicks() {
  try {
    window.localStorage.setItem(SAVED_PICKS_KEY, JSON.stringify(savedPicks));
  } catch {
    // The desk still works when storage is unavailable in a locked-down browser.
  }
  syncWatchControls();
  if (els.myDeskLayer && !els.myDeskLayer.hidden) renderMyDesk();
}

function loadWatchlist() {
  try {
    return normalizeWatchlist(JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) || "{}"));
  } catch {
    return normalizeWatchlist();
  }
}

function persistWatchlist() {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  } catch {
    // Following remains usable for the current session when storage is locked down.
  }
}

function watchButtonHtml(type, id, name, className = "") {
  const active = watchlistHas(watchlist, type, id);
  return `<button type="button" class="follow-control ${className} ${active ? "is-active" : ""}" data-watch-type="${escapeHtml(type)}" data-watch-id="${escapeHtml(id)}" data-watch-name="${escapeHtml(name)}" aria-pressed="${String(active)}"><i aria-hidden="true">${active ? "✓" : "+"}</i><span>${active ? "Following" : "Follow"}</span></button>`;
}

function syncWatchControls() {
  document.querySelectorAll("[data-watch-type][data-watch-id]").forEach((button) => {
    const active = watchlistHas(watchlist, button.dataset.watchType, button.dataset.watchId);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    const icon = button.querySelector("i");
    const label = button.querySelector("span");
    if (icon) icon.textContent = active ? "✓" : "+";
    if (label) label.textContent = active ? "Following" : "Follow";
  });
  const followedCount = watchlistCount(watchlist);
  setText(els.watchCount, String(followedCount));
  els.openMyDesk?.setAttribute("aria-label", `Open My Desk, ${followedCount} followed`);
  els.openMyDesk?.classList.toggle("has-items", followedCount > 0 || Object.keys(savedPicks).length > 0);
}

function savedPickFor(match) {
  return savedPicks[matchKeyOf(match)] || null;
}

function resolvedMatchWinner(match) {
  if (!match || matchStatusGroup(match) !== "results") return null;
  if (match.winner_name || match.winner) return match.winner_name || match.winner;
  const score1 = Number(match.score1);
  const score2 = Number(match.score2);
  if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 === score2) return null;
  return score1 > score2 ? match.team1_name : match.team2_name;
}

function savedPickState(match) {
  const pick = savedPickFor(match);
  if (!pick) return "none";
  const winner = resolvedMatchWinner(match);
  if (!winner) return "pending";
  return normalizeName(winner) === normalizeName(pick.team_name) ? "won" : "lost";
}

function saveMatchPick(match, teamName) {
  const call = enrichMatch(match);
  const probability = normalizeName(teamName) === normalizeName(call.team1_name)
    ? Number(call.prob_team1)
    : 1 - Number(call.prob_team1);
  savedPicks[matchKeyOf(call)] = {
    match_id: call.match_id || call.hltv_match_id || "",
    team_name: teamName,
    opponent_name: normalizeName(teamName) === normalizeName(call.team1_name) ? call.team2_name : call.team1_name,
    event_name: call.event_name || "CS2 circuit",
    starts_at: call.starts_at || null,
    probability: roundProb(probability),
    saved_at: new Date().toISOString(),
  };
  persistSavedPicks();
}

function bindMatchPickActions(container, match, rerender) {
  container?.querySelectorAll("[data-save-match-pick]").forEach((button) => button.addEventListener("click", () => {
    saveMatchPick(match, button.dataset.saveMatchPick);
    rerender();
  }));
  container?.querySelector("[data-remove-match-pick]")?.addEventListener("click", () => {
    delete savedPicks[matchKeyOf(match)];
    persistSavedPicks();
    rerender();
  });
}

function matchStatusGroup(match) {
  const status = String(match.status || "").toLowerCase();
  if (/finished|completed|final|ended/.test(status)) return "results";
  if (/live|playing|in.progress/.test(status)) return "live";
  return "upcoming";
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function dateFromKey(key) {
  const date = new Date(`${key}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dailyMatchCalls() {
  const verified = appData?.coverage?.daily_matches || [];
  const generated = appData?.upcoming_predictions || [];
  const merged = new Map();
  [...verified, ...generated].forEach((match) => {
    if (!match?.team1_name || !match?.team2_name) return;
    const key = matchKeyOf(match);
    merged.set(key, { ...(merged.get(key) || {}), ...match });
  });
  return [...merged.values()]
    .map(enrichMatch)
    .filter((match) => {
      const event = (appData?.coverage?.events || []).find((candidate) => candidate.id === match.event_id || normalizeName(candidate.name) === normalizeName(match.event_name));
      return event ? eventIsProductEligible(event) : eventIsProductEligible({ name: match.event_name });
    })
    .filter((match) => match.starts_at && Number.isFinite(new Date(match.starts_at).getTime()))
    .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0) || matchSignalScore(b) - matchSignalScore(a));
}

function matchSlateDays(matches) {
  const today = localDateKey(new Date());
  const keys = [...new Set(matches.map((match) => localDateKey(match.starts_at)).filter(Boolean))].sort();
  if (!keys.length) return [];
  if (!selectedMatchDateKey || !keys.includes(selectedMatchDateKey)) {
    selectedMatchDateKey = keys.find((key) => key >= today) || keys[keys.length - 1];
  }
  const selectedIndex = keys.indexOf(selectedMatchDateKey);
  const start = Math.max(0, Math.min(selectedIndex - 2, keys.length - 5));
  return keys.slice(start, start + 5);
}

function slateDayLabel(key) {
  const today = localDateKey(new Date());
  if (key === today) return "Today";
  if (key < today && key === selectedMatchDateKey) return "Latest";
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dateFromKey(key));
}

function matchSignalScore(match) {
  return [match.team1_name, match.team2_name].reduce((score, teamName) => {
    const rank = Number(teamModel(teamName).vrs_rank);
    return score + (Number.isFinite(rank) && rank > 0 ? 220 - rank : 0);
  }, 0);
}

function matchCoverage(match) {
  const team1 = teamModel(match.team1_name);
  const team2 = teamModel(match.team2_name);
  if (team1.hasState && team2.hasState) return "full";
  if (team1.hasState || team2.hasState) return "partial";
  return "limited";
}

function eventForMatch(match) {
  return availableEvents().find((event) => event.id === match.event_id || normalizeName(event.name) === normalizeName(match.event_name));
}

function mapDepth(teamName, pool) {
  const profile = appData?.model_state?.map_profiles?.[normalizeName(teamName)] || {};
  const rows = (pool || Object.keys(profile)).map((mapName) => profile[mapName]).filter(Boolean);
  if (!rows.length) return 0.5;
  return rows.reduce((sum, row) => sum + mapRateWithPrior(row), 0) / rows.length;
}

function projectedMapRead(match) {
  if (match.map_read?.maps?.length) return match.map_read;
  const profile1 = appData?.model_state?.map_profiles?.[normalizeName(match.team1_name)] || {};
  const profile2 = appData?.model_state?.map_profiles?.[normalizeName(match.team2_name)] || {};
  const eventPool = eventForMatch(match)?.map_pool || appData?.model_state?.map_pool || [];
  const common = eventPool.filter((mapName) => profile1[mapName]?.matches && profile2[mapName]?.matches);
  if (common.length < 2) return null;
  const projectedBan = (teamName, pool, profile) => {
    const historicalBan = appData?.model_state?.veto_profiles?.[normalizeName(teamName)]?.perma_ban;
    if (historicalBan && pool.includes(historicalBan)) return historicalBan;
    return [...pool].sort((a, b) => Number(profile[a]?.matches || 0) - Number(profile[b]?.matches || 0))[0];
  };
  const ban1 = projectedBan(match.team1_name, eventPool, profile1);
  const ban2 = projectedBan(match.team2_name, eventPool.filter((mapName) => mapName !== ban1), profile2);
  const baseProbability = Number(match.prob_team1) || pairProbability(match.team1_name, match.team2_name);
  const baseLogit = Math.log(baseProbability / (1 - baseProbability));
  const candidates = common
    .filter((mapName) => mapName !== ban1 && mapName !== ban2)
    .map((mapName) => {
      const rate1 = mapRateWithPrior(profile1[mapName]);
      const rate2 = mapRateWithPrior(profile2[mapName]);
      const probability = 1 / (1 + Math.exp(-(baseLogit + (rate1 - rate2) * 1.35)));
      return {
        map_name: mapName,
        source: "projected_veto",
        prob_team1: probability,
        confidence: Math.max(probability, 1 - probability),
        predicted_winner: probability >= 0.5 ? match.team1_name : match.team2_name,
        evidence_maps: Number(profile1[mapName].matches) + Number(profile2[mapName].matches),
      };
    })
    .sort((a, b) => b.evidence_maps - a.evidence_maps)
    .slice(0, 3);
  if (!candidates.length) return null;
  const adjusted = candidates.reduce((sum, row) => sum + row.prob_team1, 0) / candidates.length;
  return {
    status: "projected_veto",
    maps: candidates,
    excluded_maps: { [match.team1_name]: [ban1], [match.team2_name]: [ban2] },
    map_adjusted_prob_team1: adjusted,
    map_adjusted_confidence: Math.max(adjusted, 1 - adjusted),
    map_adjusted_predicted_winner: adjusted >= 0.5 ? match.team1_name : match.team2_name,
  };
}

function matchExplanationHtml(read) {
  const driverHtml = (row, kind) => `<article class="is-${kind}" style="--driver-strength:${Math.max(12, Math.round(Math.abs(row.directional_score) * 100))}%"><span>${kind === "support" ? "Supports" : "Pushes back"}</span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small><i><b></b></i></article>`;
  const supportRows = read.supports.slice(0, 2);
  return `<section class="match-explanation">
    <header><div><span>Model read</span><strong>Why ${escapeHtml(read.favorite)}</strong></div><b>${read.signal_count} active signals</b></header>
    <div class="match-driver-grid">${supportRows.map((row) => driverHtml(row, "support")).join("")}${read.counter ? driverHtml(read.counter, "counter") : `<article class="is-neutral"><span>Counter-signal</span><strong>None material</strong><small>Primary indicators point the same way</small></article>`}</div>
    <aside class="match-risk is-${escapeHtml(read.risk.severity)}"><span>Watch</span><strong>${escapeHtml(read.risk.label)}</strong><small>${escapeHtml(read.risk.detail)}</small></aside>
  </section>`;
}

function matchInsightHtml(match) {
  const call = enrichMatch(match);
  const team1 = teamModel(call.team1_name);
  const team2 = teamModel(call.team2_name);
  const probability = Number(call.prob_team1);
  const mapRead = projectedMapRead(call);
  const coverage = matchCoverage(call);
  const pool = eventForMatch(call)?.map_pool || appData?.model_state?.map_pool || [];
  const rankScore1 = Number(team1.vrs_points) || Number(team1.elo) || 1500;
  const rankScore2 = Number(team2.vrs_points) || Number(team2.elo) || 1500;
  const form1 = Number(team1.recent_win_rate_10) || 0.5;
  const form2 = Number(team2.recent_win_rate_10) || 0.5;
  const depth1 = mapDepth(call.team1_name, pool);
  const depth2 = mapDepth(call.team2_name, pool);
  const lineup1 = call.lineups?.team1?.length ? call.lineups.team1 : playersForTeam(call.team1_name);
  const lineup2 = call.lineups?.team2?.length ? call.lineups.team2 : playersForTeam(call.team2_name);
  const veto1 = teamVetoRead(call.team1_name);
  const veto2 = teamVetoRead(call.team2_name);
  const explanation = explainMatch({
    team1_name: call.team1_name,
    team2_name: call.team2_name,
    prob_team1: probability,
    rating1: rankScore1,
    rating2: rankScore2,
    form1,
    form2,
    map_depth1: depth1,
    map_depth2: depth2,
    vrs_rank1: team1.vrs_rank,
    vrs_rank2: team2.vrs_rank,
    lineup1_count: lineup1.length,
    lineup2_count: lineup2.length,
    veto1_sample: veto1.sample_matches,
    veto2_sample: veto2.sample_matches,
    map_adjusted_prob_team1: mapRead?.map_adjusted_prob_team1,
    veto_known: mapRead?.status === "known_veto",
    map_evidence: (mapRead?.maps || []).reduce((sum, row) => sum + (Number(row.evidence_maps) || 0), 0),
  });
  const savedPick = savedPickFor(call);
  const savedState = savedPickState(call);
  const lineupHtml = (players, teamName) => `<div><span>${escapeHtml(teamName)}</span><section>${players.slice(0, 5).map((player) => {
    const nickname = player.nickname || player.player_name || player.name;
    const playerId = player.player_id || (player.hltv_player_id ? `hltv:${player.hltv_player_id}` : "");
    return `<button type="button" data-open-player="${escapeHtml(playerId)}" title="Open ${escapeHtml(nickname)}"><i>${escapeHtml(String(nickname || "?").slice(0, 2).toUpperCase())}</i><b>${escapeHtml(nickname || "TBD")}</b></button>`;
  }).join("") || `<small>Lineup pending</small>`}</section></div>`;
  return `
    <div class="insight-status"><span class="status-token is-${matchStatusGroup(call)}">${escapeHtml(matchStatusGroup(call))}</span><span>${escapeHtml(call.series_format?.toUpperCase() || "BO3")} · ${escapeHtml(call.stage_name || "Scheduled series")}</span></div>
    <div class="insight-event">${escapeHtml(call.event_name || "CS2 circuit")}</div>
    <div class="insight-matchup">
      <div data-open-team="${escapeHtml(call.team1_name)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(call.team1_name)} team profile">${teamLogoHtml(call.team1_name)}<strong>${escapeHtml(call.team1_name)}</strong><b>${coverage === "limited" ? "--" : formatPercent(probability)}</b></div>
      <span>vs</span>
      <div data-open-team="${escapeHtml(call.team2_name)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(call.team2_name)} team profile">${teamLogoHtml(call.team2_name)}<strong>${escapeHtml(call.team2_name)}</strong><b>${coverage === "limited" ? "--" : formatPercent(1 - probability)}</b></div>
    </div>
    <div class="series-lineups">${lineupHtml(lineup1, call.team1_name)}${lineupHtml(lineup2, call.team2_name)}</div>
    <div class="insight-call">
      <span>${coverage === "full" ? "Model edge" : coverage === "partial" ? "Low-data edge" : "Awaiting data"}</span>
      <strong>${coverage === "limited" ? "Pending team state" : `${escapeHtml(call.predicted_winner)} ${formatPercent(matchConfidence(call))}`}</strong>
    </div>
    <div class="pick-console is-${escapeHtml(savedState)}">
      <div><span>Your call</span><strong>${savedPick ? `${escapeHtml(savedPick.team_name)} · ${formatPercent(savedPick.probability)}` : "Choose a side"}</strong></div>
      <section>
        <button type="button" class="${normalizeName(savedPick?.team_name) === normalizeName(call.team1_name) ? "is-active" : ""}" data-save-match-pick="${escapeHtml(call.team1_name)}">${escapeHtml(call.team1_name)}</button>
        <button type="button" class="${normalizeName(savedPick?.team_name) === normalizeName(call.team2_name) ? "is-active" : ""}" data-save-match-pick="${escapeHtml(call.team2_name)}">${escapeHtml(call.team2_name)}</button>
        ${savedPick ? `<button type="button" class="pick-remove" data-remove-match-pick aria-label="Remove saved pick">×</button>` : ""}
      </section>
      ${savedPick ? `<small>${savedState === "won" ? "Correct call" : savedState === "lost" ? "Missed call" : `Saved ${formatDate(savedPick.saved_at)}`}</small>` : `<small>Stored on this device and scored when the result arrives.</small>`}
    </div>
    ${matchExplanationHtml(explanation)}
    <div class="veto-console">
      <div class="veto-console-head"><span>Veto desk</span><strong>${mapRead ? (mapRead.status === "known_veto" ? "Maps locked" : "Projected") : "Build the map path"}</strong></div>
      ${mapRead ? `
        <div class="veto-map-strip">${mapRead.maps.map((map) => `<article><span>${escapeHtml(map.map_name)}</span><strong>${escapeHtml(map.predicted_winner)}</strong><b>${formatPercent(map.confidence)}</b></article>`).join("")}</div>
        <div class="ban-read">${Object.entries(mapRead.excluded_maps || {}).map(([teamName, maps]) => `<span>${escapeHtml(teamName)} ban · ${escapeHtml((maps || []).join(", "))}</span>`).join("")}</div>
      ` : `<div class="veto-empty"><i></i><span>Use the Veto Lab to inspect available evidence and test the map order.</span></div>`}
      <button class="open-veto-lab" type="button" data-open-veto="${escapeHtml(matchKeyOf(call))}"><span>Open Veto Lab</span><b>Ban · pick · recalculate</b><i aria-hidden="true">↗</i></button>
    </div>
  `;
}

function matchRowHtml(match, rowIndex = 0) {
  const call = enrichMatch(match);
  const key = matchKeyOf(call);
  const probability = Number(call.prob_team1);
  const status = matchStatusGroup(call);
  const coverage = matchCoverage(call);
  const isSelected = key === selectedMatchKey;
  const pick = savedPickFor(call);
  const pickState = savedPickState(call);
  const timeLabel = status === "live" ? "LIVE" : call.starts_at ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(call.starts_at)) : "TBA";
  return `
    <button class="match-row ${isSelected ? "is-selected" : ""}" style="--row-index:${rowIndex}" type="button" data-match-key="${escapeHtml(key)}" aria-pressed="${String(isSelected)}">
      <span class="match-time is-${status}">${escapeHtml(timeLabel)}<small>${escapeHtml(call.series_format?.toUpperCase() || "BO3")}</small></span>
      <span class="match-event"><strong>${escapeHtml(call.event_name || "CS2 circuit")}</strong><small>${escapeHtml(call.stage_name || "Scheduled series")}</small></span>
      <span class="match-row-teams">
        <span>${teamLogoHtml(call.team1_name)}<strong>${escapeHtml(call.team1_name)}</strong></span>
        <i>${coverage === "limited" ? "vs" : formatPercent(probability)}</i>
        <span><strong>${escapeHtml(call.team2_name)}</strong>${teamLogoHtml(call.team2_name)}</span>
      </span>
      <span class="match-row-call"><small>${pick ? `your pick · ${pickState}` : coverage === "full" ? "model pick" : coverage === "partial" ? "low data" : "rating pending"}</small><strong>${pick ? escapeHtml(pick.team_name) : coverage === "limited" ? "Open series" : escapeHtml(call.predicted_winner)}</strong></span>
      <span class="match-open" aria-hidden="true">↗</span>
    </button>
  `;
}

function renderMatchToolbar(matches) {
  if (!els.matchToolbar) return;
  const events = [...new Set(matches.map((match) => match.event_name).filter(Boolean))].sort();
  const days = matchSlateDays(matches);
  els.matchToolbar.innerHTML = `
    <div class="match-days" role="group" aria-label="Match day">
      ${days.map((key) => {
        const date = dateFromKey(key);
        return `<button type="button" class="${selectedMatchDateKey === key ? "is-active" : ""}" data-match-day="${escapeHtml(key)}"><span>${escapeHtml(slateDayLabel(key))}</span><strong>${new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(date)}</strong></button>`;
      }).join("")}
    </div>
    <div class="match-status-filters" role="group" aria-label="Match status">
      ${["all", "live", "upcoming", "results", "picks"].map((filter) => `<button type="button" class="${currentMatchFilter === filter ? "is-active" : ""}" data-match-filter="${filter}">${filter === "all" ? "All series" : filter === "picks" ? `My picks ${Object.keys(savedPicks).length || ""}` : filter}</button>`).join("")}
    </div>
    <label class="match-event-select"><span>Event</span><select id="matchEventSelect"><option value="all">All events</option>${events.map((eventName) => `<option value="${escapeHtml(eventName)}" ${currentMatchEvent === eventName ? "selected" : ""}>${escapeHtml(eventName)}</option>`).join("")}</select></label>
  `;
  els.matchToolbar.querySelectorAll("[data-match-day]").forEach((button) => button.addEventListener("click", () => {
    selectedMatchDateKey = button.dataset.matchDay;
    selectedMatchKey = null;
    renderDeciders(dailyMatchCalls());
  }));
  els.matchToolbar.querySelectorAll("[data-match-filter]").forEach((button) => button.addEventListener("click", () => {
    currentMatchFilter = button.dataset.matchFilter || "all";
    selectedMatchKey = null;
    renderDeciders(dailyMatchCalls());
  }));
  els.matchToolbar.querySelector("#matchEventSelect")?.addEventListener("change", (event) => {
    currentMatchEvent = event.target.value;
    selectedMatchKey = null;
    renderDeciders(dailyMatchCalls());
  });
}

function renderDeciders(matches) {
  const rows = (matches || []).map(enrichMatch);
  renderMatchToolbar(rows);
  const targetDate = selectedMatchDateKey;
  const visible = rows.filter((match) => {
    const status = matchStatusGroup(match);
    const dateMatches = currentMatchFilter === "picks" || localDateKey(match.starts_at) === targetDate;
    const statusMatches = currentMatchFilter === "all"
      || (currentMatchFilter === "picks" ? Boolean(savedPickFor(match)) : status === currentMatchFilter);
    const eventMatches = currentMatchEvent === "all" || match.event_name === currentMatchEvent;
    return dateMatches && statusMatches && eventMatches;
  });
  if (!visible.length) {
    const hasAnyRows = rows.length > 0;
    els.deciderGrid.innerHTML = `<div class="match-center-empty"><span>${hasAnyRows ? "FILTERED SLATE" : "FEED STANDBY"}</span><h3>${hasAnyRows ? "No series match these filters." : "The next slate is loading."}</h3><p>${hasAnyRows ? "Switch the status or event filter to reopen the desk." : "The last verified tournament data remains available below."}</p></div>`;
    return;
  }
  if (!selectedMatchKey || !visible.some((match) => matchKeyOf(match) === selectedMatchKey)) selectedMatchKey = matchKeyOf(visible[0]);
  const selected = visible.find((match) => matchKeyOf(match) === selectedMatchKey) || visible[0];
  els.deciderGrid.innerHTML = `
    <div class="match-list-pane">
      <header><span>${visible.length} ${currentMatchFilter === "picks" ? "saved calls" : "series"}</span><strong>${currentMatchFilter === "picks" ? "Personal prediction ledger" : escapeHtml(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(dateFromKey(targetDate)))}</strong></header>
      <div class="match-row-list">${visible.map(matchRowHtml).join("")}</div>
    </div>
    <aside class="match-insight" aria-live="polite">${matchInsightHtml(selected)}</aside>
  `;
  els.deciderGrid.querySelectorAll("[data-match-key]").forEach((button) => button.addEventListener("click", () => {
    selectedMatchKey = button.dataset.matchKey;
    renderDeciders(dailyMatchCalls());
  }));
  bindMatchPickActions(els.deciderGrid, selected, () => renderDeciders(dailyMatchCalls()));
}

function vetoProfiles() {
  return {
    maps: appData?.model_state?.map_profiles || {},
    vetoes: appData?.model_state?.veto_profiles || {},
  };
}

function matchBestOf(match) {
  const value = Number(String(match?.series_format || match?.format || "bo3").replace(/[^0-9]/g, ""));
  return [1, 3, 5].includes(value) ? value : 3;
}

function matchForVetoKey(key) {
  return [...dailyMatchCalls(), ...renderedEventMatches, ...activeEventCalls()].find((match) => matchKeyOf(match) === key) || null;
}

function vetoActionLabel(action) {
  if (!action) return "Complete";
  if (action.action === "decider") return "Decider";
  return `${action.actor} ${action.action === "ban" ? "bans" : "picks"}`;
}

function vetoProfileFor(teamName) {
  return appData?.model_state?.veto_profiles?.[vetoTeamKey(teamName)] || { maps: {}, sample_matches: 0 };
}

function vetoMapCardHtml(mapName, state, recommendation) {
  const match = activeVetoMatch;
  const profiles = vetoProfiles();
  const action = state.actions.find((row) => row.map_name === mapName);
  const firstMap = profiles.maps[vetoTeamKey(match.team1_name)]?.[mapName] || {};
  const secondMap = profiles.maps[vetoTeamKey(match.team2_name)]?.[mapName] || {};
  const firstVeto = profiles.vetoes[vetoTeamKey(match.team1_name)]?.maps?.[mapName] || {};
  const secondVeto = profiles.vetoes[vetoTeamKey(match.team2_name)]?.maps?.[mapName] || {};
  const firstRate = mapRateWithPrior(firstMap);
  const secondRate = mapRateWithPrior(secondMap);
  const evidence = (Number(firstMap.matches) || 0) + (Number(secondMap.matches) || 0);
  const available = state.available.includes(mapName);
  const selectable = available && !state.complete;
  const stateLabel = action ? (action.action === "ban" ? "Banned" : action.action === "pick" ? `Pick ${state.actions.filter((row) => row.action === "pick").indexOf(action) + 1}` : "Decider") : recommendation === mapName ? "Recommended" : "Available";
  return `<button type="button" class="veto-map-card ${action ? `is-${action.action}` : ""} ${recommendation === mapName && !action ? "is-recommended" : ""}" ${selectable ? `data-veto-map="${escapeHtml(mapName)}"` : "disabled"}>
    <header><span>${escapeHtml(stateLabel)}</span><strong>${escapeHtml(mapName)}</strong></header>
    <div><span>${escapeHtml(match.team1_name)}<b>${firstMap.matches ? formatPercent(firstRate) : "--"}</b></span><i></i><span><b>${secondMap.matches ? formatPercent(secondRate) : "--"}</b>${escapeHtml(match.team2_name)}</span></div>
    <footer><span>${formatPercent(Number(firstVeto.ban_share) || 0)} ban</span><small>${evidence || 0} maps</small><span>${formatPercent(Number(secondVeto.ban_share) || 0)} ban</span></footer>
  </button>`;
}

function vetoLabHtml(match, state) {
  const profiles = vetoProfiles();
  const baseProbability = Number(enrichMatch(match).prob_team1);
  const read = vetoSeriesRead(state, { baseProbability, mapProfiles: profiles.maps });
  const next = state.steps[state.actions.length] || null;
  const recommendation = recommendedMap(state, profiles.maps, profiles.vetoes);
  const firstVeto = vetoProfileFor(match.team1_name);
  const secondVeto = vetoProfileFor(match.team2_name);
  const preVetoWinner = baseProbability >= 0.5 ? match.team1_name : match.team2_name;
  const preVetoConfidence = Math.max(baseProbability, 1 - baseProbability);
  const pickedWinner = read.prob_team1 >= 0.5 ? match.team1_name : match.team2_name;
  const officialMaps = (match.maps || match.map_read?.maps?.map((row) => row.map_name) || []).filter(Boolean);
  return `
    <section class="veto-lab-hero">
      <div class="veto-lab-match">
        <span>${escapeHtml(match.event_name || "CS2 circuit")} · ${escapeHtml(String(match.series_format || "bo3").toUpperCase())}</span>
        <div><strong>${teamLogoHtml(match.team1_name)}${escapeHtml(match.team1_name)}</strong><i>vs</i><strong>${escapeHtml(match.team2_name)}${teamLogoHtml(match.team2_name)}</strong></div>
      </div>
      <div class="veto-lab-output">
        <div><span>Pre-veto</span><strong>${formatPercent(preVetoConfidence)}</strong><small>${escapeHtml(preVetoWinner)}</small></div>
        <i><b style="--veto-shift:${Math.round(read.prob_team1 * 100)}%"></b></i>
        <div><span>${state.complete ? "Final map read" : `${state.actions.length}/${state.steps.length} actions`}</span><strong>${formatPercent(Math.max(read.prob_team1, 1 - read.prob_team1))}</strong><small>${escapeHtml(pickedWinner)}</small></div>
      </div>
    </section>
    ${officialMaps.length ? `<div class="veto-official-strip"><span>Official maps detected</span><strong>${officialMaps.map(escapeHtml).join(" · ")}</strong><small>The live post-veto call remains authoritative.</small></div>` : ""}
    <section class="veto-workbench">
      <div class="veto-sequence-panel">
        <header><div><span>Veto sequence</span><strong>${escapeHtml(vetoActionLabel(next))}</strong></div><small>${escapeHtml(state.firstTeam)} acts first</small></header>
        <div class="veto-sequence">
          ${state.steps.map((step, index) => {
            const action = state.actions[index];
            return `<article class="${action ? `is-${action.action}` : index === state.actions.length ? "is-current" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(action?.map_name || (step.action === "decider" ? "Decider" : step.action))}</strong><small>${escapeHtml(action ? vetoActionLabel(action) : step.actor)}</small></article>`;
          }).join("")}
        </div>
        <div class="veto-controls">
          <button type="button" data-veto-auto>Run model veto</button>
          <button type="button" data-veto-first>First: ${escapeHtml(state.firstTeam)}</button>
          <button type="button" data-veto-undo ${state.actions.filter((row) => !row.automatic).length ? "" : "disabled"}>Undo</button>
          <button type="button" data-veto-reset>Reset</button>
        </div>
      </div>
      <aside class="veto-evidence-panel">
        <header><span>Veto identity</span><strong>Last 12 months</strong></header>
        <div><section>${teamLogoHtml(match.team1_name)}<span><b>${escapeHtml(match.team1_name)}</b><small>${firstVeto.sample_matches || 0} vetoes</small></span><strong>${escapeHtml(firstVeto.perma_ban || "No stable ban")}</strong></section><section>${teamLogoHtml(match.team2_name)}<span><b>${escapeHtml(match.team2_name)}</b><small>${secondVeto.sample_matches || 0} vetoes</small></span><strong>${escapeHtml(secondVeto.perma_ban || "No stable ban")}</strong></section></div>
        <footer>${Math.min(Number(firstVeto.sample_matches) || 0, Number(secondVeto.sample_matches) || 0) >= 10 ? "Veto history is strong enough for an automated path." : "Low sample: the recommendation stays close to the pre-veto call."}</footer>
      </aside>
    </section>
    <section class="veto-map-matrix">
      <header><div><span>Map pool</span><strong>${next ? `Choose ${next.action} for ${next.actor}` : "Veto complete"}</strong></div><small>Map win rate · historical ban share · combined sample</small></header>
      <div>${state.pool.map((mapName) => vetoMapCardHtml(mapName, state, recommendation)).join("")}</div>
    </section>
    <section class="veto-map-outlook">
      <header><span>Series map order</span><strong>${state.complete ? `${escapeHtml(pickedWinner)} ${formatPercent(Math.max(read.prob_team1, 1 - read.prob_team1))}` : "Updates with every action"}</strong></header>
      <div>${read.maps.map((row, index) => `<article><span>Map ${index + 1}</span><strong>${escapeHtml(row.map_name)}</strong><div><b>${escapeHtml(match.team1_name)} ${formatPercent(row.prob_team1)}</b><i style="--map-share:${Math.round(row.prob_team1 * 100)}%"></i><b>${formatPercent(1 - row.prob_team1)} ${escapeHtml(match.team2_name)}</b></div><small>${row.evidence_maps} historical maps · ${row.evidence} evidence</small></article>`).join("") || `<div class="veto-outlook-empty">Picks appear here as the veto develops.</div>`}</div>
    </section>`;
}

function renderVetoLab() {
  if (!activeVetoMatch || !vetoLabState || !els.vetoLabContent) return;
  els.vetoLabContent.innerHTML = vetoLabHtml(activeVetoMatch, vetoLabState);
  els.vetoLabContent.querySelectorAll("[data-veto-map]").forEach((button) => button.addEventListener("click", () => {
    vetoLabState = applyVetoMap(vetoLabState, button.dataset.vetoMap);
    renderVetoLab();
  }));
  els.vetoLabContent.querySelector("[data-veto-auto]")?.addEventListener("click", () => {
    const profiles = vetoProfiles();
    vetoLabState = buildRecommendedVeto(vetoLabState, profiles.maps, profiles.vetoes);
    renderVetoLab();
  });
  els.vetoLabContent.querySelector("[data-veto-undo]")?.addEventListener("click", () => {
    const actions = vetoLabState.actions.filter((row) => !row.automatic).slice(0, -1);
    vetoLabState = replayVeto(vetoLabState, actions);
    renderVetoLab();
  });
  els.vetoLabContent.querySelector("[data-veto-reset]")?.addEventListener("click", () => {
    vetoLabState = createVetoState(vetoLabState);
    renderVetoLab();
  });
  els.vetoLabContent.querySelector("[data-veto-first]")?.addEventListener("click", () => {
    const firstTeam = vetoLabState.firstTeam === vetoLabState.team1 ? vetoLabState.team2 : vetoLabState.team1;
    vetoLabState = createVetoState({ ...vetoLabState, firstTeam });
    renderVetoLab();
  });
}

function openVetoLab(match) {
  if (!match || !els.vetoLabLayer) return;
  const pool = eventForMatch(match)?.map_pool || appData?.model_state?.map_pool || [];
  if (pool.length < 7) return;
  activeVetoMatch = enrichMatch(match);
  vetoLabState = createVetoState({
    pool: pool.slice(0, 7),
    team1: activeVetoMatch.team1_name,
    team2: activeVetoMatch.team2_name,
    bestOf: matchBestOf(activeVetoMatch),
  });
  els.vetoLabLayer.hidden = false;
  document.body.classList.add("veto-lab-open");
  window.requestAnimationFrame(() => els.vetoLabLayer.classList.add("is-open"));
  renderVetoLab();
}

function closeVetoLab() {
  if (!els.vetoLabLayer || els.vetoLabLayer.hidden) return;
  els.vetoLabLayer.classList.remove("is-open");
  document.body.classList.remove("veto-lab-open");
  window.setTimeout(() => {
    if (!els.vetoLabLayer.classList.contains("is-open")) els.vetoLabLayer.hidden = true;
  }, 220);
}

function mapRow(map, match) {
  return `
    <article class="map-row">
      <div>
        <strong>${escapeHtml(map.map_name)}</strong>
        <span>${escapeHtml(map.source?.replaceAll("_", " ") || "map model")}</span>
      </div>
      <div>
        <span>${escapeHtml(match.team1_name)} ${formatPercent(map.prob_team1)}</span>
        <strong>${escapeHtml(map.predicted_winner)} ${formatPercent(map.confidence)}</strong>
      </div>
    </article>
  `;
}

function renderSwissBoard(board) {
  els.swissBoard.innerHTML = "";
  const lanes = document.createElement("div");
  lanes.className = "swiss-lanes";

  (board.rounds || []).forEach((round) => lanes.append(roundColumn(round)));
  lanes.append(finalColumn(board.final_groups || []));
  els.swissBoard.append(lanes);
}

function roundColumn(round) {
  const column = document.createElement("article");
  column.className = `swiss-column round-${round.round}`;
  column.innerHTML = `<h4><span>Round</span> ${round.round}</h4>`;
  const body = document.createElement("div");
  body.className = "swiss-column-body";
  let matchIndex = 0;
  (round.groups || []).forEach((group) => {
    if (!group.matches?.length) return;
    const groupNode = document.createElement("section");
    groupNode.className = "record-group";
    groupNode.dataset.record = group.record;
    groupNode.style.setProperty("--lane", swissLane(round.round, group.record));
    groupNode.innerHTML = `<h5>${escapeHtml(group.record)}</h5>`;
    group.matches.forEach((match) => groupNode.append(swissMatch(match, matchIndex++)));
    body.append(groupNode);
  });
  column.append(body);
  return column;
}

function swissLane(round, record) {
  const positions = {
    1: { "0-0": "1 / 4" },
    2: { "1-0": "1", "0-1": "3" },
    3: { "2-0": "1", "1-1": "2", "0-2": "3" },
    4: { "2-1": "1", "1-2": "3" },
    5: { "2-2": "2" },
  };
  return positions[round]?.[record] ?? "2";
}

function swissMatch(match, matchIndex = 0) {
  const node = document.createElement("article");
  const isInteractive = Boolean(match.pick_key && match.status !== "locked");
  const team1Wins = match.winner_name === match.team1_name;
  const team2Wins = match.winner_name === match.team2_name;
  const team1Probability = Math.max(0, Math.min(1, Number(match.prob_team1) || 0.5));
  const pickedConfidence = team1Wins ? team1Probability : 1 - team1Probability;
  const pickSide = team1Wins ? "pick-team-1" : "pick-team-2";
  node.className = `swiss-match ${match.status || "projected"} ${pickSide}${isInteractive ? " is-pickable" : ""}`;
  node.style.setProperty("--pick-strength", `${Math.round(Math.max(0.5, pickedConfidence) * 100)}%`);
  node.style.setProperty("--match-index", matchIndex);
  node.innerHTML = `
    ${teamRow(match.team1_name, team1Wins, match.status, match.pick_key)}
    <div class="score-chip">${escapeHtml(match.score_label || "vs")}</div>
    ${teamRow(match.team2_name, team2Wins, match.status, match.pick_key)}
    <div class="match-tooltip" role="tooltip">
      <strong>${escapeHtml(match.team1_name)}</strong>
      <span>${escapeHtml(match.score_label || "vs")}</span>
      <strong>${escapeHtml(match.team2_name)}</strong>
    </div>
  `;
  node.querySelectorAll("[data-pick-team]").forEach((button) => {
    button.addEventListener("click", () => {
      pickOverrides.set(match.pick_key, button.dataset.pickTeam);
      renderDynamicMajor();
    });
  });
  return node;
}

function teamRow(teamName, isWinner, status, pickKey = "") {
  const resultClass = isWinner ? "winner" : "loser";
  const tag = pickKey && status !== "locked" ? "button" : "div";
  const attrs = tag === "button"
    ? ` type="button" data-pick-team="${escapeHtml(teamName)}" data-pick-key="${escapeHtml(pickKey)}" aria-label="Pick ${escapeHtml(teamName)}" title="Pick ${escapeHtml(teamName)}"`
    : ` aria-label="${escapeHtml(teamName)}" title="${escapeHtml(teamName)}"`;
  return `
    <${tag} class="team-row ${resultClass} ${escapeHtml(status || "projected")}"${attrs}>
      ${teamLogoHtml(teamName)}
      <span class="sr-only">${escapeHtml(teamName)}</span>
    </${tag}>
  `;
}

function finalColumn(groups) {
  const column = document.createElement("article");
  column.className = "swiss-column final-column";
  column.id = "majorPlayoffPicture";
  column.innerHTML = "<h4><span>Final</span> outcomes</h4>";
  const body = document.createElement("div");
  body.className = "swiss-column-body final-outcomes";
  const grouped = Object.fromEntries(groups.map((group) => [group.record, group.teams || []]));
  body.append(outcomePanel("Qualified", ["3-0", "3-1", "3-2"], grouped, "qualified"));
  body.append(outcomePanel("Eliminated", ["0-3", "1-3", "2-3"], grouped, "eliminated"));
  column.append(body);
  return column;
}

function outcomePanel(label, records, grouped, variant) {
  const panel = document.createElement("section");
  panel.className = `outcome-panel ${variant}`;
  const teamCount = records.reduce((total, record) => total + (grouped[record]?.length || 0), 0);
  panel.innerHTML = `
    <header><strong>${escapeHtml(label)}</strong><span>${teamCount} teams</span></header>
    <div class="outcome-columns">
      ${records.map((record) => `
        <section class="outcome-bucket" data-record="${escapeHtml(record)}">
          <h5>${escapeHtml(record)}</h5>
          <div class="outcome-logos">
            ${(grouped[record] || []).map((team, teamIndex) => `
              <div class="final-team ${team.status || "locked"}" style="--team-index:${teamIndex}" title="${escapeHtml(team.team_name)}" data-open-team="${escapeHtml(team.team_name)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(team.team_name)} team profile, ${escapeHtml(record)}">
                ${teamLogoHtml(team.team_name)}
                <span class="sr-only">${escapeHtml(team.team_name)}</span>
              </div>
            `).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
  return panel;
}

function stage3IsComplete(stage3) {
  const matches = (stage3?.rounds || []).flatMap((round) => round.matches || []);
  return matches.length >= 30 && matches.every((match) => match.status === "locked");
}

function listTeams(rows) {
  return rows.map((row) => row.team_name).join(", ");
}

function setActiveBoardButtons() {
  els.boardJumpButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.boardJump === currentBoardView);
  });
}

function availableEvents(data = appData) {
  const merged = new Map();
  const addEvent = (event) => {
    if (!event) return;
    const name = event.name || event.event_name || event.source_title || "Unnamed event";
    const id = event.id || `event-${normalizeName(name).replaceAll(" ", "-")}`;
    const normalized = {
      ...event,
      id,
      name,
      tier: event.tier || event.publisher_tier || event.event_tier || "Tier pending",
      format: event.format || { type: "mixed", label: "Organizer format pending", confidence: "feed_detail_pending" },
    };
    const normalizedName = normalizeName(name);
    const key = normalizedName.includes("cologne") && normalizedName.includes("2026")
      ? "cologne major 2026"
      : normalizedName;
    const existing = merged.get(key);
    const value = existing ? { ...event, ...normalized, ...existing } : normalized;
    merged.set(key, value);
  };
  const sourceEvents = data?.coverage?.events?.length ? data.coverage.events : data?.event_coverage || [];
  sourceEvents.forEach(addEvent);
  const statusOrder = { ongoing: 0, upcoming: 1, finished: 2, cancelled: 3 };
  return [...merged.values()].filter(eventIsProductEligible).sort((a, b) => {
    const statusDelta = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
    if (statusDelta) return statusDelta;
    const timeA = new Date(`${a.start_date || "9999-12-31"}T12:00:00`).getTime();
    const timeB = new Date(`${b.start_date || "9999-12-31"}T12:00:00`).getTime();
    return a.status === "finished" ? timeB - timeA : timeA - timeB;
  });
}

function activeEvent() {
  const events = availableEvents();
  return events.find((event) => event.id === activeEventId) || events[0] || null;
}

function eventHasMajorBoard(event) {
  return Boolean(event?.id === "iem-cologne-major-2026" && appData?.major_projection);
}

function eventDateRange(event) {
  if (!event) return "Schedule pending";
  if (!event.start_date) return "Dates TBA";
  const start = new Date(`${event.start_date}T12:00:00`);
  const end = event.end_date ? new Date(`${event.end_date}T12:00:00`) : null;
  if (Number.isNaN(start.getTime())) return event.start_date;
  const startLabel = dateOnlyFormatter.format(start);
  const endLabel = end && !Number.isNaN(end.getTime()) ? dateOnlyFormatter.format(end) : "TBA";
  return event.start_date === event.end_date ? startLabel : `${startLabel} - ${endLabel}`;
}

function eventDateParts(event) {
  const date = new Date(`${event?.start_date || ""}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { month: "TBA", day: "--" };
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date),
  };
}

function eventFormatStages(event) {
  const type = String(event?.format?.type || "mixed");
  if (type === "single_elimination") {
    const fieldSize = Number(event?.participants?.length || event?.teams) || 8;
    const openingRound = fieldSize > 8 ? `Round of ${fieldSize}` : "Quarterfinals";
    return fieldSize > 16
      ? [openingRound, "Round of 16", "Quarterfinals", "Semifinals", "Final"]
      : fieldSize > 8
        ? [openingRound, "Quarterfinals", "Semifinals", "Final"]
        : [openingRound, "Semifinals", "Final"];
  }
  return tournamentStageLabels(event);
}

function formatPathHtml(event) {
  return eventFormatStages(event).map((stage, index, stages) => `
    <span>${escapeHtml(stage)}</span>${index < stages.length - 1 ? "<i aria-hidden=\"true\"></i>" : ""}
  `).join("");
}

function syncMajorCopy(stage3, event = activeEvent()) {
  if (!eventHasMajorBoard(event)) {
    document.body.classList.remove("stage-complete");
    if (els.playoffTab) els.playoffTab.hidden = true;
    setText(els.eventPhaseLabel, event ? `${event.status || "scheduled"} · ${event.event_type || "CS2 event"}` : "Event room");
    setText(els.projectionTitle, event ? event.name : "Choose an event.");
    setText(els.projectionIntro, event
      ? `${eventDateRange(event)} · ${event.location || "Location TBA"} · ${event.format?.label || "Format pending"}`
      : "Choose a covered event to open its forecast.");
    setText(els.boardStageTitle, event ? event.current_stage || event.format?.label || "Event forecast" : "Choose a covered event.");
    setText(els.routeIntro, event
      ? `${event.participants?.length || 0} teams · ${activeEventCalls(event).length} tracked series · ${(event.map_pool || []).length} maps`
      : "Select an event from the calendar.");
    setText(els.currentStageTab, "Event outlook");
    setText(els.playoffTab, "Bracket forecast");
    return;
  }

  const complete = stage3IsComplete(stage3);
  if (els.playoffTab) els.playoffTab.hidden = false;
  document.body.classList.toggle("stage-complete", complete);
  setText(els.currentStageTab, complete ? "Swiss results" : "Current stage");
  setText(els.playoffTab, complete ? "Playoff bracket" : "Projected playoffs");

  if (!complete) {
    setText(els.eventPhaseLabel, `${event.name} / Current stage`);
    setText(els.projectionTitle, `Every route through ${event.name}.`);
    setText(els.projectionIntro, "Change any unresolved result and the complete Swiss path, Pick'Em probability, and projected playoff bracket recalculate around your call.");
    setText(els.boardStageTitle, "Swiss stage, round by round.");
    setText(els.routeIntro, "Completed matches are fixed. Blue probabilities are projected. Select either logo in an unresolved match to rewrite the route.");
    return;
  }

  setText(els.projectionTitle, `${event.name} playoff desk.`);
  setText(els.eventPhaseLabel, `${event.name} / Playoffs`);
  setText(els.projectionIntro, "The Swiss stage is locked. The board follows the official playoff bracket, with model reads on every remaining series.");
  setText(els.boardStageTitle, currentBoardView === "playoffs" ? "Projected playoff bracket." : "Swiss results, verified.");
  setText(els.routeIntro, "The Swiss results are fixed. Review the qualified field or stay on the bracket for the current title path.");
}

function jumpMajorBoard(target) {
  boardViewUserSelected = true;
  currentBoardView = target || "stage3";
  setActiveBoardButtons();
  renderDynamicMajor();
  const activePanel = currentBoardView === "playoffs" ? els.playoffPanel : els.swissBoard;
  activePanel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderDynamicMajor() {
  const event = activeEvent();
  if (!eventHasMajorBoard(event)) {
    document.querySelector("#featured")?.classList.add("is-generic-room");
    els.swissBoard?.closest(".route-panel")?.classList.add("is-generic-event");
    currentBoardView = "stage3";
    setActiveBoardButtons();
    syncMajorCopy(null, event);
    els.swissBoard.hidden = false;
    els.playoffPanel.hidden = true;
    renderGenericEventBoard(event);
    updateGenericPickem(event);
    return;
  }

  if (!appData?.major_projection) return;
  document.querySelector("#featured")?.classList.remove("is-generic-room");
  els.swissBoard?.closest(".route-panel")?.classList.remove("is-generic-event");

  // Record focused element selector before rendering
  const activeEl = document.activeElement;
  let focusSelector = null;
  if (activeEl && activeEl !== document.body) {
    if (activeEl.hasAttribute("data-pick-key") && activeEl.hasAttribute("data-pick-team")) {
      const key = activeEl.getAttribute("data-pick-key");
      const team = activeEl.getAttribute("data-pick-team");
      focusSelector = `[data-pick-key="${key}"][data-pick-team="${team}"]`;
    }
  }

  const stage3 = simulateStage3();
  if (stage3IsComplete(stage3) && !boardViewUserSelected && currentBoardView === "stage3") {
    currentBoardView = "playoffs";
  }
  setActiveBoardButtons();
  syncMajorCopy(stage3);
  const playoff = simulatePlayoffs(stage3.final_records);
  updatePickemMeter(stage3);

  if (currentBoardView === "playoffs") {
    els.swissBoard.hidden = true;
    els.playoffPanel.hidden = false;
    renderPlayoffPanel(playoff);
  } else {
    els.playoffPanel.hidden = true;
    els.swissBoard.hidden = false;
    renderSwissBoard(stage3Board(stage3));
  }

  // Restore focus if selector exists and element is found in the new DOM
  if (focusSelector) {
    const elToFocus = document.querySelector(focusSelector);
    if (elToFocus) {
      elToFocus.focus();
    }
  }
}

function renderGenericEventBoard(event) {
  if (!els.swissBoard) return;
  if (!event) {
    els.swissBoard.replaceChildren(emptyNode("Choose a tournament.", "The current circuit remains available in the event calendar above."));
    return;
  }
  const contenders = eventContenders(event);
  const favorite = contenders[0];
  els.swissBoard.innerHTML = `
    <div class="event-room">
      <header class="event-room-hero">
        <div>
          <span>${escapeHtml(event.status || "scheduled")} · ${productTierForEvent(event) === "tier_1" ? "Tier 1" : "Tier 2"} · ${escapeHtml(event.event_type || "TBA")}</span>
          <h4>${escapeHtml(event.name)}</h4>
          ${watchButtonHtml("events", event.id, event.name, "event-follow")}
        </div>
        <div class="event-room-snapshot">
          <div><span>Dates</span><strong>${escapeHtml(eventDateRange(event))}</strong></div>
          <div><span>Location</span><strong>${escapeHtml(event.location || "TBA")}</strong></div>
          <div><span>Field</span><strong>${escapeHtml(`${event.teams || event.participants?.length || "TBA"} teams`)}</strong></div>
          <div><span>Favorite</span><strong>${favorite ? `${escapeHtml(favorite.team_name)} ${formatPercent(favorite.probability)}` : "Pending"}</strong></div>
        </div>
      </header>
      <nav class="event-room-tabs" aria-label="Tournament views">
        ${["overview", "matches", "bracket", "format", "teams"].map((view) => {
          const matchCount = activeEventCalls(event).length;
          return `<button type="button" class="${activeEventView === view ? "is-active" : ""}" data-event-view="${view}"><span>${view}</span>${view === "matches" && matchCount ? `<b>${matchCount}</b>` : ""}</button>`;
        }).join("")}
      </nav>
      <div class="event-room-view" data-view="${escapeHtml(activeEventView)}">${eventViewHtml(event, activeEventView)}</div>
    </div>
  `;
  els.swissBoard.querySelectorAll("[data-event-view]").forEach((button) => button.addEventListener("click", () => {
    activeEventView = button.dataset.eventView || "overview";
    updateProductUrl({ eventId: event.id, view: activeEventView, playerId: "", teamName: "", hash: "featured" });
    selectedEventMatchKey = null;
    renderGenericEventBoard(event);
  }));
  els.swissBoard.querySelectorAll("[data-event-view-jump]").forEach((button) => button.addEventListener("click", () => {
    activeEventView = button.dataset.eventViewJump || "overview";
    updateProductUrl({ eventId: event.id, view: activeEventView, playerId: "", teamName: "", hash: "featured" });
    renderGenericEventBoard(event);
  }));
  els.swissBoard.querySelectorAll("[data-event-match]").forEach((button) => button.addEventListener("click", () => {
    selectedEventMatchKey = button.dataset.eventMatch;
    activeEventView = "matches";
    updateProductUrl({ eventId: event.id, view: activeEventView, playerId: "", teamName: "", hash: "featured" });
    renderGenericEventBoard(event);
  }));
  const selectedEventMatch = renderedEventMatches.find((match) => matchKeyOf(match) === selectedEventMatchKey);
  if (selectedEventMatch) bindMatchPickActions(els.swissBoard, selectedEventMatch, () => renderGenericEventBoard(event));
}

function teamStrengthScore(teamName) {
  const model = teamModel(teamName);
  return Number(model.vrs_points) || Number(model.elo) || 1500;
}

function strengthSortedTeams(event) {
  return [...(event?.participants || [])].sort((a, b) => teamStrengthScore(b) - teamStrengthScore(a));
}

function projectedOpeningMatches(event) {
  const teams = strengthSortedTeams(event);
  const expectedField = Number(event?.teams) || teams.length;
  if (teams.length < 2 || teams.length < expectedField) return [];
  const pairs = [];
  for (let index = 0; index < Math.floor(teams.length / 2); index += 1) {
    const team1 = teams[index];
    const team2 = teams[teams.length - 1 - index];
    const probability = pairProbability(team1, team2);
    pairs.push({
      event_id: event.id,
      event_name: event.name,
      stage_name: event.format?.type === "single_elimination" ? `Opening round · Match ${index + 1}` : `Projected pairing ${index + 1}`,
      series_format: "bo3",
      status: "projected",
      starts_at: event.start_date ? `${event.start_date}T12:00:00` : null,
      team1_name: team1,
      team2_name: team2,
      prob_team1: probability,
      predicted_winner: probability >= 0.5 ? team1 : team2,
    });
  }
  return pairs;
}

function projectedEventMatches(event) {
  if (event?.format?.type === "double_elimination") {
    const tree = buildDoubleEliminationBracket(event);
    return [...tree.upperRounds, ...tree.lowerRounds, ...(tree.grandFinal ? [{ name: "Grand final", matches: [tree.grandFinal] }] : [])]
      .flatMap((round) => round.matches.map((match) => ({
        ...match,
        event_id: event.id,
        event_name: event.name,
        stage_name: match.round_name || round.name,
        series_format: match.series_format || "bo3",
        starts_at: match.starts_at || null,
      })));
  }
  if (event?.format?.type === "single_elimination") {
    return buildTournamentBracket(event).rounds.flatMap((round) => round.matches.map((match) => ({
      ...match,
      event_id: event.id,
      event_name: event.name,
      stage_name: match.round_name || round.name,
      series_format: match.series_format || "bo3",
      starts_at: match.starts_at || null,
    })));
  }
  if (event?.format?.type !== "gsl" || !event.groups?.length) return projectedOpeningMatches(event);
  return event.groups.flatMap((group) => {
    const teams = group.teams || [];
    return [[teams[0], teams[3]], [teams[1], teams[2]]]
      .filter(([team1, team2]) => team1 && team2)
      .map(([team1, team2], index) => {
        const probability = pairProbability(team1, team2);
        return {
          event_id: event.id,
          event_name: event.name,
          stage_name: `${group.name} · Opening ${index + 1}`,
          series_format: "bo3",
          status: "projected",
          starts_at: event.start_date ? `${event.start_date}T12:00:00` : null,
          team1_name: team1,
          team2_name: team2,
          prob_team1: probability,
          predicted_winner: probability >= 0.5 ? team1 : team2,
        };
      });
  });
}

function eventViewHtml(event, view) {
  if (view === "matches") return eventMatchesHtml(event);
  if (view === "bracket") return eventBracketHtml(event);
  if (view === "format") return eventFormatHtml(event);
  if (view === "teams") return eventTeamsHtml(event);
  return eventOverviewHtml(event);
}

function bracketField(event) {
  const ordered = strengthSortedTeams(event);
  return tournamentPlayoffField(event, ordered);
}

function nextBracketSize(count) {
  let size = 2;
  while (size < count) size *= 2;
  return size;
}

function bracketRoundName(size) {
  if (size === 2) return "Grand final";
  if (size === 4) return "Semifinals";
  if (size === 8) return "Quarterfinals";
  return `Round of ${size}`;
}

function publishedBracketMatch(event, team1, team2, roundName = "") {
  if (!team1 || !team2) return null;
  const candidates = activeEventCalls(event).map(enrichMatch).filter((match) => sameMatch(match, team1, team2));
  if (!candidates.length) return null;
  const roundKey = normalizeName(roundName);
  return candidates.sort((a, b) => {
    const aRound = normalizeName(a.round_name || a.stage_name || a.round || "");
    const bRound = normalizeName(b.round_name || b.stage_name || b.round || "");
    const aMatch = roundKey && (aRound === roundKey || aRound.includes(roundKey) || roundKey.includes(aRound)) ? 1 : 0;
    const bMatch = roundKey && (bRound === roundKey || bRound.includes(roundKey) || roundKey.includes(bRound)) ? 1 : 0;
    return bMatch - aMatch || Number(liveMatchIsFinished(b)) - Number(liveMatchIsFinished(a));
  })[0];
}

function resolveBracketMatch(event, team1, team2, roundName, matchIndex) {
  if (!team1 && !team2) return { team1_name: "TBD", team2_name: "TBD", status: "pending", round_name: roundName, match_index: matchIndex };
  if (!team1 || !team2) {
    const winner = team1 || team2;
    return { team1_name: winner, team2_name: "BYE", winner_name: winner, status: "bye", prob_team1: team1 ? 1 : 0, round_name: roundName, match_index: matchIndex };
  }
  const published = publishedBracketMatch(event, team1, team2, roundName);
  if (published) {
    const winner = published.winner_name || (liveMatchIsFinished(published) ? (Number(published.score1) > Number(published.score2) ? team1 : team2) : published.predicted_winner);
    return { ...published, winner_name: winner, round_name: published.stage_name || roundName, match_index: matchIndex, status: liveMatchIsFinished(published) ? "finished" : published.status || "projected" };
  }
  const probability = pairProbability(team1, team2);
  return {
    team1_name: team1,
    team2_name: team2,
    winner_name: probability >= 0.5 ? team1 : team2,
    predicted_winner: probability >= 0.5 ? team1 : team2,
    prob_team1: probability,
    confidence: Math.max(probability, 1 - probability),
    status: "projected",
    round_name: roundName,
    match_index: matchIndex,
  };
}

function declaredBracketTree(event) {
  const declaredRounds = event?.bracket?.rounds || [];
  if (!declaredRounds.length) return null;
  const rounds = declaredRounds
    .filter((round) => (round.matches || []).length)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((round) => ({
      name: round.name,
      size: Math.max(2, (round.matches || []).length * 2),
      bracket: round.bracket || "main",
      matches: (round.matches || []).map((match, matchIndex) => {
        const resolved = resolveBracketMatch(event, match.team1_name, match.team2_name, round.name, matchIndex);
        return {
          ...resolved,
          ...match,
          winner_name: match.winner_name || resolved.winner_name,
          predicted_winner: match.predicted_winner || resolved.predicted_winner,
          prob_team1: Number.isFinite(Number(match.prob_team1)) ? Number(match.prob_team1) : resolved.prob_team1,
          status: liveMatchIsFinished(match) ? "finished" : match.status || resolved.status,
          round_name: match.round_name || round.name,
        };
      }),
    }));
  if (!rounds.length) return null;

  let latest = rounds[rounds.length - 1].matches.map((match) => match.winner_name || match.predicted_winner || null);
  let roundSize = latest.length;
  while (latest.length > 1) {
    const roundName = bracketRoundName(roundSize);
    const matches = [];
    for (let index = 0; index < latest.length; index += 2) {
      matches.push(resolveBracketMatch(event, latest[index], latest[index + 1], roundName, index / 2));
    }
    rounds.push({ name: roundName, size: roundSize, bracket: "main", matches });
    latest = matches.map((match) => match.winner_name || match.predicted_winner || null);
    roundSize = Math.max(2, Math.ceil(roundSize / 2));
  }
  const field = [...new Set(rounds[0].matches.flatMap((match) => [match.team1_name, match.team2_name]).filter((team) => team && !["TBD", "BYE"].includes(team)))];
  return { field, rounds, champion: latest[0] || rounds.at(-1)?.matches[0]?.winner_name || null, source: "published" };
}

function buildTournamentBracket(event) {
  const declared = declaredBracketTree(event);
  if (declared) return declared;
  const field = bracketField(event);
  const size = nextBracketSize(Math.max(2, field.length));
  const slots = Array.from({ length: size }, (_, index) => field[index] || null);
  const seeded = [];
  for (let index = 0; index < size / 2; index += 1) seeded.push(slots[index], slots[size - 1 - index]);
  const rounds = [];
  let current = seeded;
  let roundSize = size;
  while (current.length >= 2) {
    const roundName = bracketRoundName(roundSize);
    const matches = [];
    for (let index = 0; index < current.length; index += 2) matches.push(resolveBracketMatch(event, current[index], current[index + 1], roundName, index / 2));
    rounds.push({ name: roundName, size: roundSize, matches });
    current = matches.map((match) => match.winner_name || match.predicted_winner || null);
    roundSize = Math.max(2, roundSize / 2);
  }
  return { field, rounds, champion: current[0] || null, source: "simulated" };
}

function declaredBracketRounds(event, lane) {
  return (event?.bracket?.rounds || [])
    .filter((round) => (round.bracket || "main") === lane && (round.matches || []).length)
    .sort((a, b) => Number(a.order) - Number(b.order));
}

function buildDoubleEliminationBracket(event) {
  const field = bracketField(event);
  const declaredUpper = declaredBracketRounds(event, "upper");
  const declaredLower = declaredBracketRounds(event, "lower");
  const declaredMain = declaredBracketRounds(event, "main");
  const openingDeclared = declaredUpper[0]?.matches || [];
  const openingPairs = openingDeclared.length
    ? (() => {
      const pairs = openingDeclared.map((match) => [match.team1_name, match.team2_name]);
      const used = new Set(pairs.flat().map(normalizeName));
      const remaining = field.filter((team) => !used.has(normalizeName(team)));
      while (remaining.length >= 2) pairs.push([remaining.shift(), remaining.pop()]);
      if (remaining.length) pairs.push([remaining.shift(), null]);
      return pairs;
    })()
    : (() => {
      const size = nextBracketSize(Math.max(2, field.length));
      const slots = Array.from({ length: size }, (_, index) => field[index] || null);
      return Array.from({ length: size / 2 }, (_, index) => [slots[index], slots[size - 1 - index]]);
    })();
  const declaredFinal = declaredMain.find((round) => /grand final|final/i.test(round.name)) || declaredMain.at(-1);
  return {
    ...buildDoubleEliminationTree({
      field,
      openingPairs,
      upperRoundNames: declaredUpper.map((round) => round.name),
      lowerRoundNames: declaredLower.map((round) => round.name),
      grandFinalName: declaredFinal?.name || "Grand final",
      resolveMatch: (team1, team2, roundName, matchIndex) => resolveBracketMatch(event, team1, team2, roundName, matchIndex),
    }),
    source: event?.bracket?.rounds?.length ? "published" : "simulated",
  };
}

function bracketTeamHtml(teamName, match, side) {
  const probability = side === 1 ? Number(match.prob_team1) : 1 - Number(match.prob_team1);
  const isWinner = teamName && match.winner_name === teamName;
  const isKnown = teamName && !["TBD", "BYE"].includes(teamName);
  const score = side === 1 ? Number(match.score1) : Number(match.score2);
  const metric = match.status === "finished" && Number.isFinite(score)
    ? String(score)
    : isKnown && Number.isFinite(probability) ? formatPercent(probability) : "";
  return `<div class="tree-team ${isWinner ? "is-winner" : ""} ${isKnown ? "" : "is-placeholder"}">
    ${isKnown ? teamLogoHtml(teamName) : `<span class="tree-slot" aria-hidden="true"></span>`}
    <strong>${escapeHtml(teamName || "TBD")}</strong>
    <b>${escapeHtml(metric)}</b>
  </div>`;
}

function doubleBracketMatchHtml(match) {
  const status = match.status || "projected";
  const state = status === "finished" ? "FINAL" : status === "live" ? "LIVE" : status === "bye" ? "BYE" : "MODEL";
  return `<button type="button" class="tree-match double-tree-match is-${escapeHtml(status)}" data-event-match="${escapeHtml(matchKeyOf(match))}" aria-label="Open ${escapeHtml(match.team1_name)} versus ${escapeHtml(match.team2_name)}">
    <span class="tree-match-state">${state}</span>
    ${bracketTeamHtml(match.team1_name, match, 1)}
    ${bracketTeamHtml(match.team2_name, match, 2)}
  </button>`;
}

function doubleBracketLaneHtml(label, subtitle, rounds, lane) {
  return `<section class="double-tree-lane is-${lane}">
    <header><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(subtitle)}</strong></div><small>${rounds.reduce((total, round) => total + round.matches.length, 0)} series</small></header>
    <div class="double-lane-rounds" style="--lane-rounds:${Math.max(1, rounds.length)}">
      ${rounds.map((round, roundIndex) => `<article style="--lane-round:${roundIndex}"><header><span>${String(roundIndex + 1).padStart(2, "0")}</span><strong>${escapeHtml(round.name)}</strong></header><div>${round.matches.map(doubleBracketMatchHtml).join("")}</div></article>`).join("")}
    </div>
  </section>`;
}

function doubleEliminationBracketHtml(event) {
  const tree = buildDoubleEliminationBracket(event);
  if (!tree.field.length) return `<div class="event-view-empty"><span>BRACKET INTAKE</span><h4>The field is not published.</h4><p>The upper and lower paths will populate from the event feed.</p></div>`;
  return `<div class="event-bracket-view double-event-bracket">
    <header class="bracket-view-head">
      <div><span>Double-elimination tree</span><h4>${escapeHtml(event.name)}</h4></div>
      <div class="bracket-legend"><span><i class="is-official"></i> Official</span><span><i class="is-live"></i> Live</span><span><i></i> Projected</span><strong>${tree.source === "published" ? "Published structure" : "Projected structure"}</strong></div>
    </header>
    <div class="double-tournament-tree">
      ${doubleBracketLaneHtml("Upper bracket", "Unbeaten route", tree.upperRounds, "upper")}
      <div class="double-drop-rail" aria-hidden="true"><span>First loss drops to the lower bracket</span><i></i></div>
      ${doubleBracketLaneHtml("Lower bracket", "Elimination route", tree.lowerRounds, "lower")}
      <aside class="double-grand-final">
        <span>Grand final</span>
        ${tree.grandFinal ? doubleBracketMatchHtml(tree.grandFinal) : `<strong>Finalists pending</strong>`}
        <div>${tree.champion ? `${teamLogoHtml(tree.champion)}<strong>${escapeHtml(tree.champion)}</strong><small>Highest-probability champion</small>` : ""}</div>
      </aside>
    </div>
  </div>`;
}

function eventBracketHtml(event) {
  const blueprint = tournamentBlueprint(event);
  if (blueprint.playoff_type === "double_elimination" || event?.bracket?.type === "double_elimination") return doubleEliminationBracketHtml(event);
  const tree = buildTournamentBracket(event);
  if (!tree.field.length) return `<div class="event-view-empty"><span>BRACKET INTAKE</span><h4>The field is not published.</h4><p>The tree will populate from the event feed.</p></div>`;
  return `
    <div class="event-bracket-view">
      <header class="bracket-view-head">
        <div><span>Tournament tree</span><h4>${escapeHtml(event.name)}</h4></div>
        <div class="bracket-legend"><span><i class="is-official"></i> Official</span><span><i class="is-live"></i> Live</span><span><i></i> Projected</span><strong>${tree.source === "published" ? "Published structure" : "Projected structure"}</strong></div>
      </header>
      <div class="tournament-tree" style="--round-count:${tree.rounds.length + 1}">
        ${tree.rounds.map((round, roundIndex) => {
          const gap = Math.min(230, 8 * (2 ** roundIndex));
          const pad = Math.min(120, gap / 2);
          return `<section class="tree-round" style="--round-index:${roundIndex};--match-gap:${gap}px;--round-pad:${pad}px">
            <header><span>${String(roundIndex + 1).padStart(2, "0")}</span><strong>${escapeHtml(round.name)}</strong><small>${round.matches.length} series</small></header>
            <div class="tree-round-matches">${round.matches.map((match) => `<button type="button" class="tree-match is-${escapeHtml(match.status || "projected")}" data-event-match="${escapeHtml(matchKeyOf(match))}" aria-label="Open ${escapeHtml(match.team1_name)} versus ${escapeHtml(match.team2_name)}">
              <span class="tree-match-state">${match.status === "finished" ? "FINAL" : match.status === "live" ? "LIVE" : "MODEL"}</span>
              ${bracketTeamHtml(match.team1_name, match, 1)}
              ${bracketTeamHtml(match.team2_name, match, 2)}
            </button>`).join("")}</div>
          </section>`;
        }).join("")}
        <section class="tree-champion"><span>Champion</span>${tree.champion ? teamLogoHtml(tree.champion) : ""}<strong>${escapeHtml(tree.champion || "TBD")}</strong><small>${tree.rounds.every((round) => round.matches.every((match) => match.status === "finished")) ? "Official winner" : "Highest-probability route"}</small></section>
      </div>
    </div>
  `;
}

function eventOverviewHtml(event) {
  const contenders = eventContenders(event);
  const matches = activeEventCalls(event);
  return `
    <div class="event-overview-grid">
      <section class="title-race">
        <header><span>Title race</span><strong>${escapeHtml(event.current_stage || (event.status === "upcoming" ? "Pre-event" : "In progress"))}</strong></header>
        <div class="contender-list">${contenders.map((row) => `
          <article class="contender-row" style="--share:${Math.max(16, Math.round(row.probability * 250))}%" data-open-team="${escapeHtml(row.team_name)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(row.team_name)} team profile">
            ${teamLogoHtml(row.team_name)}<strong>${escapeHtml(row.team_name)}</strong><span>#${row.vrs_rank || "--"} VRS · ${Math.round(row.recent * 100)}% form</span><b>${formatPercent(row.probability)}</b>
          </article>
        `).join("")}</div>
      </section>
      <section class="event-next-series">
        <header><span>On the server</span><strong>${matches.length ? `${matches.length} published` : "Bracket pending"}</strong></header>
        ${matches.length ? matches.slice(0, 4).map((match) => eventMiniMatchHtml(enrichMatch(match))).join("") : `<button type="button" class="event-empty-action" data-event-view-jump="format"><span>Bracket structure</span><strong>Explore the format</strong></button>`}
      </section>
      <section class="event-route-preview">
        <div><span>Competition path</span><strong>${escapeHtml(event.format?.label || "Format pending")}</strong></div>
        <div class="format-path">${formatPathHtml(event)}</div>
      </section>
      <section class="event-map-bank">
        <div><span>Map bank</span><strong>${event.map_pool?.length || 0} active maps</strong></div>
        <div class="map-pool">${(event.map_pool || []).map((map) => `<span>${escapeHtml(map)}</span>`).join("") || `<span>Pool pending</span>`}</div>
      </section>
    </div>
  `;
}

function eventMiniMatchHtml(match) {
  const probability = Number(match.prob_team1);
  return `
    <article class="event-mini-match">
      <div><span>${escapeHtml(match.starts_at ? formatDate(match.starts_at) : match.status || "TBA")}</span><b>${escapeHtml(match.series_format?.toUpperCase() || "BO3")}</b></div>
      <section><span>${teamLogoHtml(match.team1_name)}<strong>${escapeHtml(match.team1_name)}</strong></span><i>${formatPercent(probability)}</i><span><strong>${escapeHtml(match.team2_name)}</strong>${teamLogoHtml(match.team2_name)}</span></section>
    </article>
  `;
}

function eventMatchesHtml(event) {
  const published = activeEventCalls(event).map((match) => ({ ...match, event_id: event.id, event_name: event.name }));
  const projected = projectedEventMatches(event);
  const matches = published.length ? published : projected;
  renderedEventMatches = matches;
  if (!matches.length) return `<div class="event-view-empty"><span>BRACKET INTAKE</span><h4>Pairings are not published.</h4><p>The room is ready for the event feed.</p></div>`;
  if (!selectedEventMatchKey || !matches.some((match) => matchKeyOf(match) === selectedEventMatchKey)) selectedEventMatchKey = matchKeyOf(matches[0]);
  const selected = matches.find((match) => matchKeyOf(match) === selectedEventMatchKey) || matches[0];
  return `
    <div class="event-match-desk">
      <div class="event-match-list">
        <header><span>${published.length ? "Official match schedule" : "Projected opening path"}</span><strong>${matches.length} series</strong></header>
        ${matches.map((match) => {
          const call = enrichMatch(match);
          const key = matchKeyOf(call);
          return `<button type="button" class="event-match-row ${key === selectedEventMatchKey ? "is-selected" : ""}" data-event-match="${escapeHtml(key)}"><span>${escapeHtml(call.stage_name || "Series")}<small>${escapeHtml(call.series_format?.toUpperCase() || "BO3")}</small></span><strong>${teamLogoHtml(call.team1_name)}${escapeHtml(call.team1_name)}</strong><i>${formatPercent(Number(call.prob_team1))}</i><strong>${escapeHtml(call.team2_name)}${teamLogoHtml(call.team2_name)}</strong></button>`;
        }).join("")}
      </div>
      <aside class="match-insight event-match-insight">${matchInsightHtml(selected)}</aside>
    </div>
  `;
}

function teamBadgeHtml(teamName, extra = "") {
  return `<span class="format-team" title="${escapeHtml(teamName)}" data-open-team="${escapeHtml(teamName)}" role="button" tabindex="0">${teamLogoHtml(teamName)}<strong>${escapeHtml(teamName)}</strong>${extra}</span>`;
}

function miniFormatMatch(team1, team2) {
  const probability = pairProbability(team1, team2);
  const winner = probability >= 0.5 ? team1 : team2;
  return `<div class="format-mini-match"><span class="${winner === team1 ? "is-picked" : ""}">${teamLogoHtml(team1)}<strong>${escapeHtml(team1)}</strong><b>${formatPercent(probability)}</b></span><span class="${winner === team2 ? "is-picked" : ""}">${teamLogoHtml(team2)}<strong>${escapeHtml(team2)}</strong><b>${formatPercent(1 - probability)}</b></span></div>`;
}

function swissFormatHtml(event) {
  const teams = strengthSortedTeams(event);
  const settings = event.format?.settings || {};
  const stageCount = Number(settings.swiss_stages) || (/three[- ]stage swiss/i.test(String(event.format?.label || "")) ? 3 : 1);
  const winsToAdvance = Number(settings.wins_to_advance) || 3;
  const lossesToEliminate = Number(settings.losses_to_eliminate) || 3;
  const qualifyingTeams = Number(settings.qualifying_teams) || Math.max(2, Math.floor((teams.length || event.teams || 16) / 2));
  if (stageCount > 1) {
    const activeField = Number(settings.stage_team_count) || 16;
    const advanceCount = Number(settings.advance_per_stage) || Math.floor(activeField / 2);
    return `
      <div class="format-stage-head"><div><span>Multi-stage Swiss</span><h4>${stageCount} Swiss fields feed one playoff bracket.</h4></div><strong>${event.teams || teams.length || "TBA"} teams</strong></div>
      <div class="multi-swiss-path" style="--swiss-stages:${stageCount}">
        ${Array.from({ length: stageCount }, (_, index) => `<article style="--stage:${index}">
          <header><span>Stage ${index + 1}</span><strong>${activeField}-team Swiss</strong></header>
          <div><b>3 wins</b><small>${advanceCount} advance</small></div>
          <div><b>3 losses</b><small>${advanceCount} eliminated</small></div>
          ${index < stageCount - 1 ? `<footer><span>${advanceCount} survivors</span><i></i><span>${advanceCount} new seeds</span></footer>` : `<footer><span>${advanceCount} qualifiers</span><i></i><span>Playoffs</span></footer>`}
        </article>`).join("")}
        <article class="multi-swiss-playoffs"><span>Playoffs</span><strong>${advanceCount}</strong><small>single elimination</small></article>
      </div>
      <div class="major-stage-rule"><span>Per Swiss stage</span><strong>Five rounds maximum · BO3 advancement and elimination series</strong></div>
    `;
  }
  const buckets = { perfect: teams.slice(0, 2), advance: teams.slice(2, qualifyingTeams), danger: teams.slice(-Math.max(2, Math.min(3, lossesToEliminate))) };
  const standardColumns = [
    ["Round 1", "0-0", "8 BO1 series"],
    ["Round 2", "1-0 / 0-1", "8 BO1 series"],
    ["Round 3", "2-0 / 1-1 / 0-2", "BO3 begins"],
    ["Round 4", "2-1 / 1-2", "Qualification games"],
    ["Round 5", "2-2", "Last chance"],
  ];
  const roundCount = Number(settings.rounds) || 5;
  const columns = Array.from({ length: roundCount }, (_, index) => standardColumns[index] || [`Round ${index + 1}`, "Active records", "Pairings resolve"]);
  return `
    <div class="format-stage-head"><div><span>Swiss engine</span><h4>${roundCount} rounds. ${winsToAdvance} wins through. ${lossesToEliminate} losses out.</h4></div><strong>${teams.length || event.teams || 16} teams</strong></div>
    <div class="swiss-blueprint" style="--stage-count:${columns.length + 1}">
      ${columns.map((column, index) => `<article style="--stage:${index}"><span>${column[0]}</span><strong>${column[1]}</strong><small>${column[2]}</small><i></i></article>`).join("")}
      <article class="swiss-terminal"><span>Final records</span><strong>3-x / x-3</strong><small>Field resolves</small></article>
    </div>
    <div class="swiss-outcome-board">
      <section class="is-perfect"><header><span>Projected 3-0</span><strong>Perfect route</strong></header><div>${buckets.perfect.map((team) => teamBadgeHtml(team)).join("") || "TBA"}</div></section>
      <section class="is-advance"><header><span>Projected through</span><strong>3-1 / 3-2</strong></header><div>${buckets.advance.map((team) => teamBadgeHtml(team)).join("") || "TBA"}</div></section>
      <section class="is-danger"><header><span>Elimination risk</span><strong>0-3 / 1-3</strong></header><div>${buckets.danger.map((team) => teamBadgeHtml(team)).join("") || "TBA"}</div></section>
    </div>
  `;
}

function gslFormatHtml(event) {
  const groupSize = Number(event.format?.settings?.group_size) || 4;
  const participants = event.participants || [];
  const groupCount = Math.max(1, Math.ceil(Math.min(participants.length || event.teams || groupSize, 16) / groupSize));
  const groupRows = event.groups?.length ? event.groups : Array.from({ length: groupCount }, (_, index) => ({ name: `Group ${String.fromCharCode(65 + index)}`, teams: participants.slice(index * groupSize, index * groupSize + groupSize) }));
  const invites = event.playoff_invites || participants.slice(groupCount * groupSize);
  return `
    <div class="format-stage-head"><div><span>GSL group engine</span><h4>Two wins advance. Two losses eliminate.</h4></div><strong>${groupRows.length} groups</strong></div>
    <div class="gsl-groups">${groupRows.map((group) => {
      const teams = group.teams || [];
      return `<section class="gsl-group"><header><span>${escapeHtml(group.name)}</span><strong>${teams.length} teams</strong></header><div class="gsl-flow"><div><small>Opening</small>${teams.length >= 4 ? miniFormatMatch(teams[0], teams[3]) + miniFormatMatch(teams[1], teams[2]) : teams.map((team) => teamBadgeHtml(team)).join("")}</div><i></i><div class="gsl-resolve"><span><small>Upper</small><b>Winners' match</b></span><span><small>Lower</small><b>Elimination match</b></span></div><i></i><div class="gsl-decider"><small>Decider</small><b>2nd qualifier</b></div></div></section>`;
    }).join("")}</div>
    ${invites.length ? `<div class="playoff-invites"><header><span>Direct playoff invites</span><strong>${invites.length} seeded into Round of 16</strong></header><div>${invites.map((team) => teamBadgeHtml(team)).join("")}</div></div>` : ""}
  `;
}

function knockoutFormatHtml(event) {
  const teams = strengthSortedTeams(event);
  const count = teams.length || Number(event.teams) || 8;
  const stages = [];
  for (let size = count; size >= 2; size = Math.ceil(size / 2)) stages.push(size);
  const pairs = projectedOpeningMatches(event);
  return `
    <div class="format-stage-head"><div><span>Knockout engine</span><h4>One loss ends the run.</h4></div><strong>${count} teams</strong></div>
    <div class="knockout-funnel" style="--stage-count:${stages.length + 1}">${stages.map((size, index) => `<article style="--round:${index}"><span>${size === 2 ? "Final" : `Round of ${size}`}</span><strong>${size}</strong><small>${Math.max(1, size / 2)} series</small><i></i></article>`).join("")}<article class="knockout-trophy"><span>Champion</span><strong>1</strong><small>title</small></article></div>
    ${pairs.length ? `<div class="opening-pairings"><header><span>Projected opening order</span><strong>Strength-seeded until official pairings publish</strong></header><div>${pairs.map((match) => miniFormatMatch(match.team1_name, match.team2_name)).join("")}</div></div>` : ""}
  `;
}

function mixedFormatHtml(event) {
  const fallbackStages = eventFormatStages(event);
  const stages = event.format?.stages?.length
    ? event.format.stages.map((stage, index) => typeof stage === "string" ? { name: stage, type: "mixed", status: "pending", order: index + 1 } : stage)
    : fallbackStages.map((name, index) => ({
      name,
      type: index === fallbackStages.length - 1 ? "single_elimination" : "mixed",
      status: "pending",
      order: index + 1,
    }));
  return `
    <div class="format-stage-head"><div><span>Event architecture</span><h4>${escapeHtml(event.format?.label || "Multi-stage tournament")}</h4></div><strong>${event.teams || event.participants?.length || "TBA"} teams</strong></div>
    <div class="mixed-stage-map" style="--stage-count:${stages.length}">${stages.map((stage, index) => `<article class="is-${escapeHtml(stage.status || "pending")}" style="--stage:${index}"><span>0${index + 1} · ${escapeHtml(String(stage.type || "stage").replaceAll("_", " "))}</span><strong>${escapeHtml(stage.name || stage.label || `Stage ${index + 1}`)}</strong><small>${stage.status === "finished" ? "Complete" : index === stages.length - 1 ? "Title decided" : "Field narrows"}</small>${index < stages.length - 1 ? "<i></i>" : ""}</article>`).join("")}</div>
  `;
}

function doubleEliminationFormatHtml(event) {
  const teams = strengthSortedTeams(event);
  const pairs = projectedOpeningMatches(event);
  const finalist = teams[0];
  return `
    <div class="format-stage-head"><div><span>Double-elimination engine</span><h4>One loss sends a team down. The second ends the run.</h4></div><strong>${teams.length || event.teams || "TBA"} teams</strong></div>
    <div class="double-elim-map">
      <section class="double-lane is-upper">
        <header><span>Upper bracket</span><strong>Unbeaten route</strong></header>
        <div>${pairs.length ? pairs.slice(0, 4).map((match) => miniFormatMatch(match.team1_name, match.team2_name)).join("") : `<span class="format-slot">Opening pairings pending</span>`}</div>
      </section>
      <div class="bracket-transfer" aria-hidden="true"><i></i><span>first loss</span></div>
      <section class="double-lane is-lower">
        <header><span>Lower bracket</span><strong>Elimination route</strong></header>
        <div class="lower-route"><span>Round 1</span><i></i><span>Survival match</span><i></i><span>Lower final</span></div>
      </section>
      <div class="bracket-transfer is-final" aria-hidden="true"><i></i><span>last two</span></div>
      <section class="double-final">
        <span>Grand final</span>
        ${finalist ? `${teamLogoHtml(finalist)}<strong>${escapeHtml(finalist)} leads the route</strong>` : "<strong>Finalists pending</strong>"}
        <small>${escapeHtml(event.format?.label || "Championship series")}</small>
      </section>
    </div>
  `;
}

function roundRobinFormatHtml(event) {
  const teams = strengthSortedTeams(event);
  const groups = event.groups?.length ? event.groups : [{ name: "League table", teams }];
  const advanceCount = Number(event.format?.settings?.advance_per_group) || 2;
  return `
    <div class="format-stage-head"><div><span>Round-robin engine</span><h4>Every scheduled opponent shapes the table.</h4></div><strong>${groups.length} ${groups.length === 1 ? "table" : "groups"}</strong></div>
    <div class="round-robin-grid">${groups.map((group) => {
      const ordered = [...(group.teams || [])].sort((a, b) => teamStrengthScore(b) - teamStrengthScore(a));
      return `<section><header><span>${escapeHtml(group.name)}</span><strong>Top ${Math.min(advanceCount, ordered.length || advanceCount)} advance</strong></header><div>${ordered.map((team, index) => `<article class="${index < advanceCount ? "is-advance" : ""}"><b>${index + 1}</b>${teamLogoHtml(team)}<strong>${escapeHtml(team)}</strong><span>${index < advanceCount ? "playoff line" : "in the chase"}</span></article>`).join("") || `<span class="format-slot">Field pending</span>`}</div></section>`;
    }).join("")}</div>
  `;
}

const FORMAT_RENDERERS = {
  swiss: swissFormatHtml,
  gsl: gslFormatHtml,
  single_elimination: knockoutFormatHtml,
  double_elimination: doubleEliminationFormatHtml,
  round_robin: roundRobinFormatHtml,
  mixed: mixedFormatHtml,
};

function eventFormatHtml(event) {
  const type = String(event.format?.type || "mixed");
  const visual = (FORMAT_RENDERERS[type] || mixedFormatHtml)(event);
  return `<div class="event-format-view">${visual}<div class="format-footer"><span>Series rules</span><strong>${escapeHtml(event.format?.label || "Organizer format pending")}</strong><div class="map-pool">${(event.map_pool || []).map((map) => `<span>${escapeHtml(map)}</span>`).join("")}</div></div></div>`;
}

function eventTeamsHtml(event) {
  const teams = event.participants || [];
  if (!teams.length) return `<div class="event-view-empty"><span>FIELD INTAKE</span><h4>Teams are not announced.</h4><p>The room will rank the field as soon as invitations publish.</p></div>`;
  const meta = new Map((event.participant_meta || []).map((row) => [normalizeName(row.team_name), row]));
  return `
    <div class="event-team-view">
      <header><div><span>Competitive field</span><h4>${teams.length} teams</h4></div><strong>VRS and form at event state</strong></header>
      <div class="event-team-grid">${teams.map((teamName) => {
        const model = teamModel(teamName);
        const row = meta.get(normalizeName(teamName)) || {};
        const rank = row.vrs_rank || model.vrs_rank;
        const form = Number(model.recent_win_rate_10);
        const roster = playersForTeam(teamName).map((player) => player.nickname).slice(0, 5);
        return `<article data-open-team="${escapeHtml(teamName)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(teamName)} team profile">${teamLogoHtml(teamName)}<div><strong>${escapeHtml(teamName)}</strong><span>${escapeHtml(roster.join(" · ") || row.entry || (rank ? `#${rank} VRS` : "Invited field"))}</span></div><b>${Number.isFinite(form) ? `${Math.round(form * 100)}%` : "--"}<small>form</small></b></article>`;
      }).join("")}</div>
    </div>
  `;
}

function eventContenders(event) {
  const official = appData?.coverage?.vrs?.teams || [];
  const officialByName = new Map(official.map((row) => [normalizeName(row.team_name), row]));
  const names = event?.participants?.length
    ? event.participants
    : official.slice(0, Math.min(8, Number(event?.teams) || 8)).map((row) => row.team_name);
  const scored = names.map((teamName) => {
    const officialRow = officialByName.get(normalizeName(teamName)) || {};
    const model = teamModel(teamName);
    const recent = Number.isFinite(Number(model.recent_win_rate_10)) ? Number(model.recent_win_rate_10) : 0.5;
    const points = Number(officialRow.points || model.vrs_points || 1200);
    const elo = Number(model.elo || 1500);
    return {
      team_name: officialRow.team_name || teamName,
      vrs_rank: officialRow.rank || model.vrs_rank,
      recent,
      score: points + (elo - 1500) * 0.34 + (recent - 0.5) * 120,
    };
  });
  const maxScore = Math.max(...scored.map((row) => row.score), 0);
  const weighted = scored.map((row) => ({ ...row, weight: Math.exp((row.score - maxScore) / 175) }));
  const total = weighted.reduce((sum, row) => sum + row.weight, 0) || 1;
  return weighted
    .map((row) => ({ ...row, probability: row.weight / total }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6);
}

function updateGenericPickem(event) {
  if (els.resetPicks) els.resetPicks.hidden = true;
  const favorite = eventContenders(event)[0];
  setText(els.pickemLabel, "Field forecast");
  setText(els.pickemTitle, favorite ? `${favorite.team_name} leads the current title picture.` : "Select an event to begin.");
  setText(els.pickemScoreLabel, "Title share");
  setText(els.pickemChance, favorite ? formatPercent(favorite.probability) : "--");
  setText(els.pickemSummary, event?.participants?.length
    ? `${event.participants.length} announced teams · ${event.current_stage || event.format?.label || "event forecast"}`
    : "Field pending · early strength read");
}

function activeMajorCalls() {
  const rounds = appData?.major_projection?.current_stage_board?.rounds || [];
  const activeRound = rounds.find((round) => {
    const matches = (round.groups || []).flatMap((group) => group.matches || []);
    return matches.length && matches.some((match) => !["locked", "completed", "finished"].includes(String(match.status || "").toLowerCase()));
  });
  const matches = (activeRound?.groups || []).flatMap((group) => group.matches || []);
  if (!matches.length) {
    return (appData.upcoming_predictions || []).filter((match) => !["locked", "completed", "finished"].includes(String(match.status || "").toLowerCase()));
  }
  return matches.map((match, index) => {
    const existing = (appData.upcoming_predictions || []).find((candidate) => sameMatch(candidate, match.team1_name, match.team2_name));
    if (existing) return { ...existing, status: match.status, score_label: match.score_label };
    const probability = pairProbability(match.team1_name, match.team2_name);
    return {
      confidence: Math.max(probability, 1 - probability),
      confidence_label: Math.max(probability, 1 - probability) >= 0.72 ? "strong" : Math.max(probability, 1 - probability) >= 0.58 ? "watch" : "thin",
      map_read: match.map_read || null,
      predicted_winner: probability >= 0.5 ? match.team1_name : match.team2_name,
      prob_team1: probability,
      round: `Stage 3 round ${activeRound.round}`,
      seed: index + 1,
      source: "current_major_live_state",
      starts_at: match.starts_at || null,
      status: match.status || "scheduled",
      team1_name: match.team1_name,
      team2_name: match.team2_name,
    };
  });
}

function activeEventCalls(event = activeEvent()) {
  if (!event) return [];
  if (eventHasMajorBoard(event)) return activeMajorCalls();
  const eventKey = normalizeName(event.name || event.event_name);
  const embedded = [
    ...(event.matches || []),
    ...(event.bracket?.rounds || []).flatMap((round) => round.matches || []),
  ];
  const coverageMatches = (appData?.coverage?.daily_matches || []).filter((match) => match.event_id === event.id);
  const generated = (appData?.upcoming_predictions || []).filter((match) => {
    const matchKey = normalizeName(match.event_name || match.stage_name || "");
    return matchKey && (matchKey === eventKey || matchKey.includes(eventKey) || eventKey.includes(matchKey));
  });
  const merged = new Map();
  [...embedded, ...coverageMatches, ...generated].forEach((match) => {
    const pair = [normalizeName(match.team1_name), normalizeName(match.team2_name)].sort().join(":");
    const key = String(match.match_id || `${pair}:${normalizeName(match.stage_name || match.round_name || "")}:${match.starts_at || ""}`);
    merged.set(key, { ...(merged.get(key) || {}), ...match });
  });
  return [...merged.values()];
}

function makeOverrideKey(prefix, roundOrStage, team1, team2) {
  const n1 = normalizeName(team1);
  const n2 = normalizeName(team2);
  const teamKey = n1 < n2 ? `${n1}:${n2}` : `${n2}:${n1}`;
  return `${prefix}:${roundOrStage}:${teamKey}`;
}

function teamModel(teamName) {
  const key = normalizeName(teamName);
  if (teamLookupMap[key]) return teamLookupMap[key];
  return { elo: 1500, recent_win_rate_10: 0.5, vrs_points: 0, vrs_rank: null, hasState: false };
}

function buildTeamLookupMap() {
  teamLookupMap = {};
  const teams = appData?.model_state?.teams || [];
  for (const team of teams) {
    const model = { ...team, hasState: true };
    const nameKey = normalizeName(team.team_name);
    const keyKey = normalizeName(team.team_key);
    teamLookupMap[nameKey] = model;
    teamLookupMap[keyKey] = model;
    const words = nameKey.replace(/^the /, "").split(" ");
    if (words.length >= 2) {
      const initials = words.map((w) => w[0]).join("");
      teamLookupMap[initials] ||= model;
    }
  }
  const aliases = {
    navi: "natus vincere",
    "team spirit": "spirit",
    "team vitality": "vitality",
    "team falcons": "falcons",
    "aurora gaming": "aurora",
    "furia esports": "furia",
    "g2 esports": "g2",
    "betboom team": "betboom",
    "9z team": "9z",
    mongolz: "the mongolz",
  };
  for (const [alias, target] of Object.entries(aliases)) {
    if (teamLookupMap[target]) teamLookupMap[alias] = teamLookupMap[target];
  }

  // Overlay the dated official VRS snapshot on model state so current ranking
  // strength drives calls without mutating the historical training features.
  for (const row of appData?.coverage?.vrs?.teams || []) {
    const nameKey = normalizeName(row.team_name);
    const existing = teamLookupMap[nameKey] || { elo: 1500, recent_win_rate_10: 0.5, hasState: false };
    const merged = { ...existing, vrs_rank: row.rank, vrs_points: row.points, vrs_as_of: appData.coverage.vrs.as_of };
    teamLookupMap[nameKey] = merged;
    if (nameKey === "navi") teamLookupMap["natus vincere"] = merged;
    if (nameKey === "the mongolz") teamLookupMap.mongolz = merged;
  }
}

function buildProbabilityCache(seedRows) {
  probabilityCache = {};
  for (let i = 0; i < seedRows.length; i++) {
    for (let j = 0; j < seedRows.length; j++) {
      if (i === j) continue;
      const t1 = seedRows[i].team_name;
      const t2 = seedRows[j].team_name;
      probabilityCache[`${t1}:${t2}`] = pairProbability(t1, t2);
    }
  }
}

function getCachedProbability(team1, team2) {
  return probabilityCache[`${team1}:${team2}`] || 0.5;
}

function pickemSelection(stage3) {
  return {
    threeZero: stage3.buckets.three_zero.slice(0, 2).map((row) => row.team_name),
    advance: stage3.buckets.advance.slice(0, 6).map((row) => row.team_name),
    zeroThree: stage3.buckets.zero_three.slice(0, 2).map((row) => row.team_name),
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function currentMatchesForRound(roundNumber) {
  const round = (appData?.major_projection?.current_stage_board?.rounds || []).find(
    (row) => Number(row.round) === Number(roundNumber),
  );
  return (round?.groups || []).flatMap((group) => group.matches || []);
}

function sameMatch(match, team1, team2) {
  const pair = new Set([normalizeName(match.team1_name), normalizeName(match.team2_name)]);
  return pair.has(normalizeName(team1)) && pair.has(normalizeName(team2));
}

function simulateSwissRun(seedRows, random) {
  const seeds = Object.fromEntries(seedRows.map((row) => [row.team_name, Number(row.seed)]));
  const records = Object.fromEntries(seedRows.map((row) => [row.team_name, [0, 0]]));
  const played = Object.fromEntries(seedRows.map((row) => [row.team_name, new Set()]));
  let pairings = seedRows.slice(0, seedRows.length / 2).map((row, index) => [row.team_name, seedRows[seedRows.length - 1 - index].team_name]);

  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const sourceMatches = currentMatchesForRound(roundNumber);
    if (sourceMatches.length) pairings = sourceMatches.map((match) => [match.team1_name, match.team2_name]);
    for (const [team1, team2] of pairings) {
      const key = makeOverrideKey("stage3", roundNumber, team1, team2);
      const probability = getCachedProbability(team1, team2);
      const source = sourceMatches.find((match) => sameMatch(match, team1, team2));
      const winner = source?.status === "locked" && source.winner_name
        ? source.winner_name
        : pickOverrides.get(key) || (random() < probability ? team1 : team2);
      const loser = winner === team1 ? team2 : team1;
      records[winner][0] += 1;
      records[loser][1] += 1;
      played[team1].add(team2);
      played[team2].add(team1);
    }

    if (roundNumber === 5) break;
    const grouped = new Map();
    Object.entries(records)
      .filter(([, record]) => record[0] < 3 && record[1] < 3)
      .forEach(([team, record]) => {
        const key = `${record[0]}-${record[1]}`;
        grouped.set(key, [...(grouped.get(key) || []), team]);
      });
    pairings = [...grouped.entries()]
      .sort(([a], [b]) => {
        const [aw, al] = a.split("-").map(Number);
        const [bw, bl] = b.split("-").map(Number);
        return bw - aw || al - bl;
      })
      .flatMap(([, teams]) => pairSwissGroup(teams, seeds, played));
  }
  return records;
}

function runPickemMonteCarlo(stage3) {
  const seedRows = stage3Seeds();
  const picks = pickemSelection(stage3);
  buildProbabilityCache(seedRows);
  const overrideState = [...pickOverrides.entries()].sort(([a], [b]) => a.localeCompare(b));
  const lockedState = (appData?.major_projection?.current_stage_board?.rounds || []).flatMap((round) =>
    (round.groups || []).flatMap((group) => (group.matches || []).map((match) => [match.team1_name, match.team2_name, match.status, match.winner_name])),
  );
  const cacheKey = JSON.stringify({ seeds: seedRows, picks, overrideState, lockedState });
  if (pickemChanceCache.has(cacheKey)) return pickemChanceCache.get(cacheKey);

  const random = seededRandom(hashString(cacheKey));
  const runs = 4000;
  let successCount = 0;
  for (let run = 0; run < runs; run += 1) {
    const records = simulateSwissRun(seedRows, random);
    let correct = 0;
    for (const team of picks.threeZero) {
      if (records[team]?.[0] === 3 && records[team]?.[1] === 0) correct += 1;
    }
    for (const team of picks.advance) {
      if (records[team]?.[0] === 3) correct += 1;
    }
    for (const team of picks.zeroThree) {
      if (records[team]?.[0] === 0 && records[team]?.[1] === 3) correct += 1;
    }
    if (correct >= 5) successCount += 1;
  }
  const chance = successCount / runs;
  pickemChanceCache.set(cacheKey, chance);
  return chance;
}

function portableProductionProbability(champion, features, baseline) {
  if (!champion || !champion.kind || champion.kind === "heuristic") return baseline;
  let modelProbability = baseline;
  if (champion.kind === "portable_logistic_blend") {
    const selected = champion.features || [];
    if ((champion.weights || []).length !== selected.length + 1) return baseline;
    let value = Number(champion.weights[0]) || 0;
    selected.forEach((feature, index) => {
      const scale = Number(champion.std?.[index]) || 1;
      const normalized = Math.max(-8, Math.min(8, ((Number(features[feature]) || 0) - (Number(champion.mean?.[index]) || 0)) / scale));
      value += (Number(champion.weights[index + 1]) || 0) * normalized;
    });
    modelProbability = 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, value))));
  } else if (champion.kind === "portable_gbdt_blend") {
    const values = (champion.features || []).map((feature) => Number(features[feature]) || 0);
    let raw = Number(champion.initial_log_odds) || 0;
    for (const tree of champion.trees || []) {
      let node = 0;
      while (Number(tree.children_left?.[node]) !== -1) {
        const featureIndex = Number(tree.feature?.[node]);
        if (!Number.isInteger(featureIndex) || featureIndex < 0 || featureIndex >= values.length) return baseline;
        node = values[featureIndex] <= Number(tree.threshold?.[node]) ? Number(tree.children_left[node]) : Number(tree.children_right[node]);
        if (!Number.isInteger(node) || node < 0) return baseline;
      }
      raw += (Number(champion.learning_rate) || 0) * (Number(tree.value?.[node]) || 0);
    }
    modelProbability = 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, raw))));
  }
  const blendWeight = Math.max(0, Math.min(1, Number(champion.blend_weight) || 1));
  return blendWeight * modelProbability + (1 - blendWeight) * baseline;
}

function pairProbability(team1Name, team2Name, context = {}) {
  const team1 = teamModel(team1Name);
  const team2 = teamModel(team2Name);
  const eloProbability = 1 / (1 + Math.pow(10, -((Number(team1.elo) - Number(team2.elo)) / 400)));
  const eloLogit = Math.log(Math.max(1e-6, Math.min(1 - 1e-6, eloProbability)) / Math.max(1e-6, 1 - eloProbability));
  const rank1 = Number(team1.vrs_rank);
  const rank2 = Number(team2.vrs_rank);
  const rankAdvantage = Number.isFinite(rank1) && rank1 > 0 && Number.isFinite(rank2) && rank2 > 0
    ? Math.max(-40, Math.min(40, rank2 - rank1))
    : 0;
  const pointsDiff = Math.max(-650, Math.min(650, (Number(team1.vrs_points) || 0) - (Number(team2.vrs_points) || 0)));
  const recentDiff = Math.max(-0.5, Math.min(0.5, (Number(team1.recent_win_rate_10) || 0.5) - (Number(team2.recent_win_rate_10) || 0.5)));
  const baseline = 1 / (1 + Math.exp(-(eloLogit + 0.009 * rankAdvantage + 0.00035 * pointsDiff + 0.3 * recentDiff)));
  const stage = String(context.stage_name || context.round_name || context.round || "").toLowerCase();
  const seriesFormat = String(context.series_format || context.format || "bo3").toLowerCase();
  const bestOf = Number(seriesFormat.replace(/[^0-9]/g, "")) || 3;
  const isPlayoff = Number(["playoff", "round of", "quarter", "semi", "final"].some((token) => stage.includes(token)));
  const isElimination = Number(["lower", "elimination", "decider", "final"].some((token) => stage.includes(token)));
  const phaseOrder = stage.includes("grand final") ? 100 : stage.includes("final") ? 95 : stage.includes("semi") ? 85 : stage.includes("quarter") ? 75 : stage.includes("round of 16") ? 65 : stage.includes("round of 32") ? 55 : stage.includes("playoff") ? 50 : stage.includes("swiss") ? 25 : stage.includes("group") ? 20 : 1;
  const features = {
    baseline_logit: Math.log(Math.max(1e-6, baseline) / Math.max(1e-6, 1 - baseline)),
    elo_diff: Number(team1.elo) - Number(team2.elo),
    elo_prob_team1: eloProbability,
    vrs_rank_advantage: rankAdvantage,
    vrs_points_diff: pointsDiff,
    recent_win_rate_10_diff: recentDiff,
    best_of: bestOf,
    phase_order: phaseOrder,
    is_lan: Number(String(context.event_type || "").toLowerCase() === "lan"),
    is_playoff: isPlayoff,
    is_elimination_match: isElimination,
  };
  const champion = appData?.model_registry?.champion || appData?.model_state?.portable_model || appData?.model?.production;
  let probability = portableProductionProbability(champion, features, baseline);
  if (!team1.hasState || !team2.hasState) probability = 0.5 + (probability - 0.5) * 0.45;
  return Math.max(0.08, Math.min(0.92, probability));
}

function matchPick(team1Name, team2Name, key) {
  const probability = pairProbability(team1Name, team2Name);
  const modelWinner = probability >= 0.5 ? team1Name : team2Name;
  const pickedWinner = pickOverrides.get(key) || modelWinner;
  const pickedProbability = pickedWinner === team1Name ? probability : 1 - probability;
  return {
    key,
    probability,
    confidence: Math.max(probability, 1 - probability),
    modelWinner,
    pickedWinner,
    pickedProbability,
    status: pickOverrides.has(key) ? "override" : "projected",
  };
}

function stage3Seeds() {
  return [...(appData.major_projection.seed_rows || [])].sort((a, b) => Number(a.seed) - Number(b.seed));
}

function pairSwissGroup(names, seeds, played) {
  const pool = [...names].sort((a, b) => seeds[a] - seeds[b]);
  const pairs = [];
  while (pool.length) {
    const team1 = pool.shift();
    let opponentIndex = pool.length - 1;
    for (let index = pool.length - 1; index >= 0; index -= 1) {
      if (!played[team1].has(pool[index])) {
        opponentIndex = index;
        break;
      }
    }
    const team2 = pool.splice(opponentIndex, 1)[0];
    pairs.push([team1, team2]);
  }
  return pairs;
}

function simulateStage3() {
  const seedRows = stage3Seeds();
  const seeds = Object.fromEntries(seedRows.map((row) => [row.team_name, Number(row.seed)]));
  const records = Object.fromEntries(seedRows.map((row) => [row.team_name, [0, 0]]));
  const played = Object.fromEntries(seedRows.map((row) => [row.team_name, new Set()]));
  let pairings = seedRows.slice(0, seedRows.length / 2).map((row, index) => [row.team_name, seedRows[seedRows.length - 1 - index].team_name]);
  const rounds = [];
  const pathProbabilities = [];

  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const sourceMatches = currentMatchesForRound(roundNumber);
    if (sourceMatches.length) pairings = sourceMatches.map((match) => [match.team1_name, match.team2_name]);
    const matches = [];
    for (const [team1, team2] of pairings) {
      const key = makeOverrideKey("stage3", roundNumber, team1, team2);
      const pick = matchPick(team1, team2, key);
      const source = sourceMatches.find((match) => sameMatch(match, team1, team2));
      const isLocked = source?.status === "locked" && source.winner_name;
      const winner = isLocked ? source.winner_name : pick.pickedWinner;
      const loser = winner === team1 ? team2 : team1;
      records[winner][0] += 1;
      records[loser][1] += 1;
      played[team1].add(team2);
      played[team2].add(team1);
      if (!isLocked) pathProbabilities.push(pick.pickedProbability);
      matches.push({
        pick_key: isLocked ? "" : key,
        round: `Swiss round ${roundNumber}`,
        team1_name: team1,
        team2_name: team2,
        prob_team1: roundProb(pick.probability),
        confidence: roundProb(pick.confidence),
        predicted_winner: pick.modelWinner,
        winner_name: winner,
        score_label: isLocked ? source.score_label : pick.status === "override" ? "pick" : `${Math.round(pick.confidence * 100)}%`,
        status: isLocked ? "locked" : source?.status === "live" ? "live" : pick.status,
      });
    }
    rounds.push({ round: roundNumber, matches });
    if (roundNumber === 5) break;
    const active = Object.entries(records).filter(([, record]) => record[0] < 3 && record[1] < 3).map(([team]) => team);
    const grouped = new Map();
    active.forEach((team) => {
      const key = `${records[team][0]}-${records[team][1]}`;
      grouped.set(key, [...(grouped.get(key) || []), team]);
    });
    pairings = [...grouped.entries()]
      .sort(([a], [b]) => {
        const [aw, al] = a.split("-").map(Number);
        const [bw, bl] = b.split("-").map(Number);
        return bw - aw || al - bl;
      })
      .flatMap(([, teams]) => pairSwissGroup(teams, seeds, played));
  }

  let finalRecords = Object.entries(records)
    .map(([teamName, record]) => ({
      team_name: teamName,
      seed: seeds[teamName],
      record: `${record[0]}-${record[1]}`,
      wins: record[0],
      losses: record[1],
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.seed - b.seed);

  const officialRecords = appData?.major_projection?.final_records || [];
  if (officialRecords.length === finalRecords.length) {
    const computedByTeam = Object.fromEntries(finalRecords.map((row) => [row.team_name, row]));
    const compatible = officialRecords.every((row) => {
      const computed = computedByTeam[row.team_name];
      return computed && computed.wins === row.wins && computed.losses === row.losses;
    });
    if (compatible) {
      finalRecords = officialRecords.map((row) => ({ ...computedByTeam[row.team_name], ...row }));
    }
  }

  return {
    rounds,
    final_records: finalRecords,
    path_probability: pathProbabilities.reduce((value, probability) => value * probability, 1),
    buckets: {
      three_zero: finalRecords.filter((row) => row.record === "3-0"),
      advance: finalRecords.filter((row) => row.record === "3-1" || row.record === "3-2"),
      zero_three: finalRecords.filter((row) => row.record === "0-3"),
      eliminated: finalRecords.filter((row) => row.losses === 3),
    },
  };
}

function stage3Board(stage3) {
  const roundOrder = {
    1: ["0-0"],
    2: ["1-0", "0-1"],
    3: ["2-0", "1-1", "0-2"],
    4: ["2-1", "1-2"],
    5: ["2-2"],
  };
  const recordsBefore = Object.fromEntries(stage3.rounds[0].matches.flatMap((match) => [[match.team1_name, [0, 0]], [match.team2_name, [0, 0]]]));
  const rounds = stage3.rounds.map((round) => {
    const groups = {};
    round.matches.forEach((match) => {
      const record = `${recordsBefore[match.team1_name][0]}-${recordsBefore[match.team1_name][1]}`;
      groups[record] ||= [];
      groups[record].push(match);
      const loser = match.winner_name === match.team1_name ? match.team2_name : match.team1_name;
      recordsBefore[match.winner_name][0] += 1;
      recordsBefore[loser][1] += 1;
    });
    return {
      round: round.round,
      groups: (roundOrder[round.round] || Object.keys(groups)).map((record) => ({ record, matches: groups[record] || [] })),
    };
  });
  return {
    rounds,
    final_groups: ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"].map((record) => ({
      record,
      teams: stage3.final_records.filter((team) => team.record === record).map((team) => ({ ...team, status: "projected" })),
    })),
  };
}

function simulatePlayoffs(finalRecords) {
  const topEight = finalRecords.filter((row) => row.wins === 3).slice(0, 8);
  const officialQuarterfinals = appData?.major_projection?.playoff_bracket?.quarterfinals;
  const quarters = Array.isArray(officialQuarterfinals) && officialQuarterfinals.length
    ? officialQuarterfinals.map((match) => playoffMatch(match.team1_name, match.team2_name, match.round || "Quarterfinal", match.starts_at))
    : [[0, 7], [3, 4], [1, 6], [2, 5]]
      .map(([a, b]) => [topEight[a], topEight[b]])
      .filter(([a, b]) => a && b)
      .map(([a, b]) => playoffMatch(a.team_name, b.team_name, "Quarterfinal"));
  const semis = [
    playoffMatch(quarters[0]?.winner_name, quarters[1]?.winner_name, "Semifinal"),
    playoffMatch(quarters[2]?.winner_name, quarters[3]?.winner_name, "Semifinal"),
  ].filter((match) => match.team1_name && match.team2_name);
  const final = semis.length === 2 ? [playoffMatch(semis[0].winner_name, semis[1].winner_name, "Grand final")] : [];
  return { topEight, rounds: [{ label: "Quarterfinals", matches: quarters }, { label: "Semifinals", matches: semis }, { label: "Grand final", matches: final }] };
}

function playoffMatch(team1Name, team2Name, round, startsAt = null) {
  if (!team1Name || !team2Name) return { round, team1_name: team1Name, team2_name: team2Name, winner_name: "", confidence: 0.5, prob_team1: 0.5 };
  const pick = matchPick(team1Name, team2Name, makeOverrideKey("playoff", round, team1Name, team2Name));
  const liveState = (appData?.upcoming_predictions || []).find((match) => sameMatch(match, team1Name, team2Name));
  const liveStatus = String(liveState?.status || "").toLowerCase();
  const isLocked = liveState?.winner_name && ["locked", "completed", "finished"].includes(liveStatus);
  const winnerName = isLocked ? liveState.winner_name : pick.pickedWinner;
  return {
    round,
    team1_name: team1Name,
    team2_name: team2Name,
    winner_name: winnerName,
    confidence: roundProb(pick.confidence),
    prob_team1: roundProb(pick.probability),
    score_label: liveState?.score_label || formatPercent(pick.confidence),
    starts_at: startsAt || liveState?.starts_at || null,
    status: isLocked ? "locked" : liveState?.status || pick.status,
  };
}

function renderPlayoffPanel(playoff) {
  els.playoffPanel.innerHTML = `
    <div class="playoff-intro">
      <span>Projected playoff picture</span>
      <strong>${escapeHtml(playoff.rounds.at(-1)?.matches?.[0]?.winner_name || "TBD")} title path</strong>
    </div>
    <div class="playoff-grid">
      ${playoff.rounds.map((round) => `
        <section class="playoff-round">
          <h4>${escapeHtml(round.label)}</h4>
          ${round.matches.map((match) => `
            <article class="playoff-match">
              ${teamRow(match.team1_name, match.winner_name === match.team1_name, "projected")}
              <div class="playoff-match-center">
                <div class="score-chip">${escapeHtml(match.score_label || formatPercent(match.confidence))}</div>
                <span>${escapeHtml(match.starts_at ? formatDate(match.starts_at) : match.status || "projected")}</span>
              </div>
              ${teamRow(match.team2_name, match.winner_name === match.team2_name, "projected")}
            </article>
          `).join("")}
        </section>
      `).join("")}
    </div>
  `;
}

function updatePickemMeter(stage3) {
  if (stage3IsComplete(stage3)) {
    if (els.resetPicks) els.resetPicks.hidden = true;
    setText(els.pickemLabel, "Stage 3 result");
    setText(els.pickemTitle, "The Swiss card is locked.");
    setText(els.pickemScoreLabel, "Stage state");
    setText(els.pickemChance, "Locked");
    setText(
      els.pickemSummary,
      `3-0: ${listTeams(stage3.buckets.three_zero)}. 0-3: ${listTeams(stage3.buckets.zero_three)}. The active read is now the playoff bracket.`,
    );
    return;
  }

  if (els.resetPicks) els.resetPicks.hidden = false;
  setText(els.pickemLabel, "Current Pick'Em");
  setText(els.pickemTitle, "The model's most likely card.");
  setText(els.pickemScoreLabel, "Chance of 5+ correct");
  const chance = runPickemMonteCarlo(stage3);
  setText(els.pickemChance, formatPercent(chance));
  const overrides = pickOverrides.size;
  const summary = overrides
    ? `${overrides} custom match pick${overrides === 1 ? "" : "s"} applied. Later rounds and the Pick'Em are recalculated.`
    : "The ten model picks come from the highest-probability Swiss path. Five correct clears the Pick'Em.";
  setText(els.pickemSummary, summary);
}

function abbrev(teamName) {
  const cleaned = String(teamName || "").replace(/^the\s+/i, "");
  if (cleaned.length <= 4) return cleaned.toUpperCase();
  return cleaned
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function renderEvents(events) {
  els.eventsGrid.innerHTML = "";
  if (!events?.length) {
    els.eventsGrid.append(emptyNode("No event coverage queued.", "Supported events appear when verified schedules reach the feed."));
    return;
  }
  const statusOrder = { ongoing: 0, upcoming: 1, finished: 2 };
  const visibleEvents = events
    .filter((event) => currentEventFilter === "all" || event.status !== "finished")
    .sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1) || new Date(a.start_date || 0) - new Date(b.start_date || 0));
  setText(els.eventCount, `${visibleEvents.length} tournaments`);
  visibleEvents.forEach((event, eventIndex) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.tabIndex = 0;
    card.dataset.eventId = event.id || "";
    card.dataset.status = event.status || "upcoming";
    card.style.setProperty("--event-index", eventIndex);
    const range = eventDateRange(event);
    const date = eventDateParts(event);
    const teams = event.participants || [];
    const teamTotal = Number(event.teams) || teams.length;
    card.innerHTML = `
      <div class="event-date-block"><span>${escapeHtml(date.month)}</span><strong>${escapeHtml(date.day)}</strong><small>${escapeHtml(range)}</small></div>
      <div class="event-spine" aria-hidden="true"><i></i></div>
      <div class="event-card-main">
        <span>${escapeHtml(event.status === "ongoing" ? "Live now" : event.status === "upcoming" ? "Upcoming" : event.status || event.series || event.organizer || "Event")}</span>
        <h3>${escapeHtml(event.name || event.event_name || event.source_title || "Unnamed event")}</h3>
        <p>${escapeHtml(event.format?.label || "Organizer format pending")} · ${escapeHtml(event.location || "Location TBA")}</p>
      </div>
      <div class="event-team-stack">${teams.length
        ? `${teams.slice(0, 5).map((teamName) => teamLogoHtml(teamName)).join("")}<span>${teamTotal > 5 ? `+${teamTotal - 5}` : `${teamTotal} teams`}</span>`
        : `<span class="event-field-status">${teamTotal ? `${teamTotal} team field` : "Field pending"}</span>`}
      </div>
      <div class="event-card-meta"><strong>${escapeHtml(`${event.event_type || "TBA"} · ${event.tier || event.event_tier || "TBA"}`)}</strong><span>${escapeHtml(event.current_stage || (event.status === "upcoming" ? "Starts soon" : "In progress"))}</span></div>
      <button class="event-open" type="button" data-event-open="${escapeHtml(event.id || "")}" aria-label="Open ${escapeHtml(event.name || "event")}"><span aria-hidden="true"></span></button>
    `;
    const openEvent = () => selectEvent(event.id);
    card.addEventListener("click", (clickEvent) => {
      if (clickEvent.target.closest("a")) return;
      openEvent();
    });
    card.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter" || keyEvent.key === " ") {
        keyEvent.preventDefault();
        openEvent();
      }
    });
    els.eventsGrid.append(card);
  });
}

function renderEventSelector(events) {
  if (!els.eventSelector) return;
  els.eventSelector.innerHTML = events.map((event) => `
    <option value="${escapeHtml(event.id || "")}">${escapeHtml(event.name || event.event_name || "Unnamed event")} · ${escapeHtml(event.status || "scheduled")}</option>
  `).join("");
  els.eventSelector.value = activeEventId || events[0]?.id || "";
}

function selectEvent(eventId) {
  if (!eventId || !availableEvents().some((event) => event.id === eventId)) return;
  activeEventId = eventId;
  activeEventView = "overview";
  selectedEventMatchKey = null;
  boardViewUserSelected = false;
  currentBoardView = eventHasMajorBoard(activeEvent()) && stage3IsComplete(simulateStage3()) ? "playoffs" : "stage3";
  if (els.eventSelector) els.eventSelector.value = eventId;
  const event = activeEvent();
  setText(els.selectedEventName, event?.name || "Event desk");
  setText(els.selectedEventMeta, `${eventDateRange(event)} · ${event?.format?.label || "Organizer format pending"}`);
  renderDynamicMajor();
  updateProductUrl({ eventId, view: activeEventView, playerId: "", teamName: "", hash: "featured" });
  document.querySelector("#featured")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function rankingProjection(row) {
  const model = teamModel(row.team_name);
  const recent = Number.isFinite(Number(model.recent_win_rate_10)) ? Number(model.recent_win_rate_10) : 0.5;
  const elo = Number(model.elo);
  const formSignal = Math.max(-72, Math.min(72, (recent - 0.5) * 180));
  const skillSignal = Number.isFinite(elo) ? Math.max(-24, Math.min(24, (elo - 1600) * 0.06)) : 0;
  const projectedPoints = Number(row.points) + formSignal + skillSignal;
  return { ...row, projectedPoints, recent, formSignal, skillSignal };
}

function renderRankings(vrs) {
  if (!els.rankingsGrid) return;
  const projected = (vrs?.teams || []).map(rankingProjection).sort((a, b) => b.projectedPoints - a.projectedPoints);
  const projectedRanks = new Map(projected.map((row, index) => [normalizeName(row.team_name), index + 1]));
  const rows = (vrs?.teams || []).map(rankingProjection).sort((a, b) => Number(a.rank) - Number(b.rank));
  setText(els.rankingsSource, vrs?.source || "Valve Regional Standings");
  setText(els.rankingsUpdated, vrs?.as_of || "--");
  if (els.rankingsSourceLink && vrs?.source_url) els.rankingsSourceLink.href = vrs.source_url;
  els.rankingsGrid.innerHTML = `
    <div class="ranking-row ranking-head" role="row">
      <span>Official</span><span>Team / roster</span><span>VRS points</span><span>Signal</span><span>Next order</span>
    </div>
    ${rows.map((row) => {
      const projectedRank = projectedRanks.get(normalizeName(row.team_name));
      const delta = row.rank - projectedRank;
      const deltaLabel = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "=";
      const deltaClass = delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
      return `<div class="ranking-row" role="row" style="animation-delay:${Math.min(420, row.rank * 24)}ms">
        <span class="ranking-rank"><b>#${row.rank}</b><em class="${deltaClass}">${deltaLabel}</em></span>
        <span class="ranking-team" data-open-team="${escapeHtml(row.team_name)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(row.team_name)} team profile">${teamLogoHtml(row.team_name)}<strong>${escapeHtml(row.team_name)}</strong><small>${escapeHtml(row.players?.join(" · ") || playersForTeam(row.team_name).map((player) => player.nickname).join(" · ") || "Roster pending")}</small></span>
        <span class="ranking-points">${row.points}<small>official</small></span>
        <span class="ranking-signal"><i style="width:${Math.round(Math.max(8, Math.min(100, 50 + row.formSignal / 2)))}%"></i><small>${row.recent === 0.5 ? "neutral" : `${Math.round(row.recent * 100)}% recent wins`}</small></span>
        <span class="ranking-projected"><b>#${projectedRank}</b><small>unofficial projection</small></span>
      </div>`;
    }).join("")}
  `;
  els.rankingsGrid.classList.toggle("is-expanded", rankingsExpanded);
  if (els.rankingToggle) {
    els.rankingToggle.setAttribute("aria-expanded", String(rankingsExpanded));
    els.rankingToggle.textContent = rankingsExpanded ? "Show top 12" : "Show full top 30";
  }
}

function playersForTeam(teamName) {
  const key = normalizeName(teamName);
  return (playerSnapshot?.players || []).filter((player) => normalizeName(player.team_name) === key || normalizeName(player.source_team_name) === key);
}

function rosterForTeam(teamName) {
  const profiles = playersForTeam(teamName);
  const known = new Set(profiles.map((player) => normalizeName(player.nickname)));
  const ranking = (appData?.coverage?.vrs?.teams || []).find((row) => normalizeName(row.team_name) === normalizeName(teamName));
  const placeholders = (ranking?.players || [])
    .filter((nickname) => nickname && !known.has(normalizeName(nickname)))
    .map((nickname) => ({ nickname, team_name: teamName, roster_only: true }));
  return [...profiles, ...placeholders].slice(0, 5);
}

function playerRole(player) {
  const traits = player.traits || {};
  if (Number(traits.sniping) >= 62) return "AWPer";
  if (Number(traits.entrying) >= 62 || Number(traits.opening) >= 68) return "Entry";
  if (Number(traits.utility) >= 72) return "Support";
  if (Number(traits.clutching) >= 68) return "Closer";
  return "Rifler";
}

function playerTraitHtml(player) {
  const labels = {
    firepower: "Firepower",
    entrying: "Entry",
    trading: "Trading",
    opening: "Opening",
    clutching: "Clutch",
    sniping: "Sniping",
    utility: "Utility",
  };
  return Object.entries(labels).map(([key, label]) => {
    const value = Number(player.traits?.[key]);
    const score = Number.isFinite(value) ? value : 0;
    return `<div class="player-trait"><span>${label}</span><i><b style="width:${score}%"></b></i><strong>${Number.isFinite(value) ? score : "--"}</strong></div>`;
  }).join("");
}

function playerFormTimelineHtml(player, { compact = false } = {}) {
  const timeline = (player?.form_timeline || []).filter((row) => Number.isFinite(Number(row.rating)));
  if (timeline.length < 2) return `<section class="player-form-panel is-empty"><header><span>Series form</span><strong>History building</strong></header><p>Verified match-level ratings will appear as the result feed grows.</p></section>`;
  const width = 520;
  const height = compact ? 116 : 132;
  const padX = 16;
  const padY = 17;
  const minRating = Math.max(0.45, Math.min(...timeline.map((row) => Number(row.rating))) - 0.12);
  const maxRating = Math.min(2.6, Math.max(...timeline.map((row) => Number(row.rating))) + 0.12);
  const range = Math.max(0.25, maxRating - minRating);
  const points = timeline.map((row, index) => ({
    ...row,
    x: padX + (index / Math.max(1, timeline.length - 1)) * (width - padX * 2),
    y: padY + ((maxRating - Number(row.rating)) / range) * (height - padY * 2),
  }));
  const linePath = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1).x.toFixed(1)},${height - padY} L${points[0].x.toFixed(1)},${height - padY} Z`;
  const baselineY = Math.max(padY, Math.min(height - padY, padY + ((maxRating - 1) / range) * (height - padY * 2)));
  const summary = player.form_summary || {};
  const delta = Number(summary.rating_delta);
  const trend = Number.isFinite(delta) ? (delta > 0.04 ? "Up in sample" : delta < -0.04 ? "Down in sample" : "Stable sample") : "Tracked sample";
  const recent = [...timeline].slice(-3).reverse();
  return `<section class="player-form-panel ${compact ? "is-compact" : ""}">
    <header><div><span>Series form</span><strong>${escapeHtml(trend)}</strong></div><small>Through ${escapeHtml(timeline.at(-1).date)}</small></header>
    <div class="player-form-kpis"><div><span>Tracked avg</span><strong>${Number(summary.average_rating) ? Number(summary.average_rating).toFixed(2) : "--"}</strong></div><div><span>Recent 3</span><strong>${Number(summary.recent_rating) ? Number(summary.recent_rating).toFixed(2) : "--"}</strong></div><div><span>ADR</span><strong>${Number(summary.average_adr) ? Number(summary.average_adr).toFixed(1) : "--"}</strong></div></div>
    <div class="player-form-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(player.nickname)} rating trend across ${timeline.length} tracked series"><path class="form-area" d="${areaPath}"></path><path class="form-line" pathLength="1" d="${linePath}"></path><line class="form-baseline" x1="${padX}" x2="${width - padX}" y1="${baselineY.toFixed(1)}" y2="${baselineY.toFixed(1)}"></line>${points.map((point) => `<circle class="${Number(point.rating) >= 1 ? "is-positive" : ""}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3"><title>${escapeHtml(point.date)} vs ${escapeHtml(point.opponent_name)}: ${Number(point.rating).toFixed(2)}</title></circle>`).join("")}</svg><div><span>${escapeHtml(timeline[0].date)}</span><b>1.00 baseline</b><span>${escapeHtml(timeline.at(-1).date)}</span></div></div>
    <div class="player-recent-series">${recent.map((row) => `<article><span>${escapeHtml(row.date)} · ${escapeHtml(row.event_name)}</span><strong>vs ${escapeHtml(row.opponent_name)}</strong><b class="${Number(row.rating) >= 1 ? "is-positive" : ""}">${Number(row.rating).toFixed(2)}</b><small>${Number(row.adr).toFixed(1)} ADR · ${Number(row.kd_ratio).toFixed(2)} K/D</small></article>`).join("")}</div>
  </section>`;
}

function playerDetailHtml(player) {
  if (!player) return `<div class="player-empty"><span>PLAYER INDEX</span><h3>Select a profile.</h3></div>`;
  const rating = Number(player.rating_3_0);
  return `
    <header class="player-detail-head">
      <div class="player-monogram" aria-hidden="true">${escapeHtml(String(player.nickname || "?").slice(0, 2).toUpperCase())}</div>
      <div><span>${escapeHtml(playerRole(player))} · ${escapeHtml(player.team_name)}</span><h3>${escapeHtml(player.nickname)}</h3><p>${escapeHtml(player.real_name || "HLTV player profile")}</p></div>
      ${teamLogoHtml(player.team_name)}
    </header>
    <div class="player-primary-stats">
      <div><span>Rating 3.0</span><strong>${Number.isFinite(rating) ? rating.toFixed(2) : "--"}</strong></div>
      <div><span>Signal index</span><strong>${Number(player.signal_index) || "--"}</strong></div>
      <div><span>Map sample</span><strong>${Number(player.maps_3m) || "--"}</strong></div>
    </div>
    <div class="player-follow-row">${watchButtonHtml("players", player.player_id, player.nickname)}<span>Keep this profile in My Desk</span></div>
    ${playerFormTimelineHtml(player)}
    <div class="player-traits">${playerTraitHtml(player)}</div>
    <a class="player-source" href="${escapeHtml(player.source_url || "#")}" target="_blank" rel="noreferrer">Open HLTV profile</a>
  `;
}

function renderPlayerFilters() {
  if (!els.playerTeamFilter) return;
  const teams = [...new Set((playerSnapshot?.players || []).map((player) => player.team_name).filter(Boolean))].sort();
  els.playerTeamFilter.innerHTML = `<option value="all">All teams</option>${teams.map((team) => `<option value="${escapeHtml(normalizeName(team))}">${escapeHtml(team)}</option>`).join("")}`;
  els.playerTeamFilter.value = playerTeamFilter;
}

function renderPlayers() {
  if (!els.playerGrid || !els.playerDetail) return;
  const query = normalizeName(playerSearchTerm);
  const visible = (playerSnapshot?.players || []).filter((player) => {
    const matchesTeam = playerTeamFilter === "all" || normalizeName(player.team_name) === playerTeamFilter;
    const haystack = normalizeName(`${player.nickname} ${player.real_name} ${player.team_name}`);
    return matchesTeam && (!query || haystack.includes(query));
  });
  if (!selectedPlayerId || !visible.some((player) => player.player_id === selectedPlayerId)) selectedPlayerId = visible[0]?.player_id || null;
  const selected = visible.find((player) => player.player_id === selectedPlayerId) || null;
  els.playerGrid.innerHTML = visible.length ? visible.map((player, index) => `
    <button class="player-row ${player.player_id === selectedPlayerId ? "is-selected" : ""}" type="button" role="listitem" data-player-id="${escapeHtml(player.player_id)}" style="--player-index:${index}">
      <span class="player-rank">${String(index + 1).padStart(2, "0")}</span>
      <span class="player-row-name"><b>${escapeHtml(player.nickname)}</b><small>${escapeHtml(player.real_name || playerRole(player))}</small></span>
      <span class="player-row-team">${teamLogoHtml(player.team_name)}<b>${escapeHtml(player.team_name)}</b></span>
      <span class="player-row-rating"><b>${Number.isFinite(Number(player.rating_3_0)) && Number(player.rating_3_0) > 0 ? Number(player.rating_3_0).toFixed(2) : "--"}</b><small>rating</small></span>
      <span class="player-row-signal"><i><b style="width:${Number(player.signal_index) || 0}%"></b></i><small>${Number(player.signal_index) || "--"}</small></span>
    </button>
  `).join("") : `<div class="player-empty"><span>NO MATCH</span><h3>No player matches this filter.</h3></div>`;
  els.playerDetail.innerHTML = playerDetailHtml(selected);
  els.playerGrid.querySelectorAll("[data-player-id]").forEach((button) => button.addEventListener("click", () => {
    selectedPlayerId = button.dataset.playerId;
    updateProductUrl({ playerId: selectedPlayerId, eventId: "", view: "", teamName: "", hash: "players" });
    renderPlayers();
  }));
  setText(els.playerSnapshotMeta, `${(playerSnapshot?.players || []).length} profiles · ${formatDate(playerSnapshot?.generated_at_utc)}`);
}

function allKnownMatches() {
  const rows = [
    ...(appData?.coverage?.daily_matches || []),
    ...(appData?.upcoming_predictions || []),
    ...availableEvents().flatMap((event) => event.matches || []),
    ...(appData?.major_projection?.current_stage_board?.rounds || []).flatMap((round) => (round.groups || []).flatMap((group) => group.matches || [])),
  ];
  const unique = new Map();
  rows.filter((match) => match?.team1_name && match?.team2_name).forEach((match) => unique.set(matchKeyOf(match), enrichMatch(match)));
  return [...unique.values()];
}

function matchesForTeam(teamName) {
  const key = normalizeName(teamName);
  const now = Date.now();
  const rows = allKnownMatches().filter((match) => [match.team1_name, match.team2_name].some((name) => normalizeName(name) === key));
  const future = rows.filter((match) => new Date(match.starts_at || 0).getTime() >= now).sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0));
  const past = rows.filter((match) => new Date(match.starts_at || 0).getTime() < now).sort((a, b) => new Date(b.starts_at || 0) - new Date(a.starts_at || 0));
  return [...future, ...past].slice(0, 8);
}

function teamMapRows(teamName) {
  const profile = appData?.model_state?.map_profiles?.[normalizeName(teamName)] || {};
  return Object.entries(profile)
    .map(([mapName, row]) => ({ mapName, matches: Number(row.matches) || 0, winRate: mapRateWithPrior(row), roundDiff: Number(row.avg_round_diff) || 0 }))
    .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate);
}

function teamLineupRead(teamName) {
  const roster = rosterForTeam(teamName);
  const rated = roster.filter((player) => Number(player.rating_3_0) > 0);
  const averageRating = rated.length ? rated.reduce((sum, player) => sum + Number(player.rating_3_0), 0) / rated.length : null;
  const firepower = rated.length ? rated.reduce((sum, player) => sum + (Number(player.traits?.firepower) || 0), 0) / rated.length : null;
  return { roster, averageRating, firepower, profiled: rated.length };
}

function teamVetoRead(teamName) {
  return appData?.model_state?.veto_profiles?.[normalizeName(teamName)] || { maps: {}, sample_matches: 0 };
}

function teamPlayerProfileHtml(teamName, player) {
  const rating = Number(player.rating_3_0);
  const maps = Number(player.maps_3m) || 0;
  const lineup = teamLineupRead(teamName);
  const teammates = lineup.roster.filter((row) => row.player_id && row.player_id !== player.player_id);
  return `
    <section class="team-player-nav"><button type="button" data-back-team><i aria-hidden="true">←</i><span>Back to ${escapeHtml(teamName)}</span></button><strong>Player intelligence</strong></section>
    <section class="team-player-hero">
      <div class="team-player-monogram" aria-hidden="true">${escapeHtml(String(player.nickname || "?").slice(0, 2).toUpperCase())}</div>
      <div><span>${escapeHtml(playerRole(player))} · ${escapeHtml(teamName)}</span><h2>${escapeHtml(player.nickname)}</h2><p>${escapeHtml(player.real_name || "HLTV player profile")}</p>${watchButtonHtml("players", player.player_id, player.nickname, "profile-follow")}</div>
      ${teamLogoHtml(teamName)}
    </section>
    <section class="team-profile-metrics team-player-metrics">
      <div><span>Rating 3.0</span><strong>${Number.isFinite(rating) && rating > 0 ? rating.toFixed(2) : "--"}</strong></div>
      <div><span>Signal</span><strong>${Number(player.signal_index) || "--"}</strong></div>
      <div><span>Map sample</span><strong>${maps || "--"}</strong></div>
      <div><span>Role</span><strong class="is-role">${escapeHtml(playerRole(player))}</strong></div>
    </section>
    ${playerFormTimelineHtml(player, { compact: true })}
    <section class="team-profile-section team-player-traits">
      <header><span>Skill fingerprint</span><strong>Current profile</strong></header>
      <div class="player-traits">${playerTraitHtml(player)}</div>
    </section>
    <section class="team-profile-section">
      <header><span>Lineup context</span><strong>${teammates.length} teammates</strong></header>
      <div class="team-roster-list">${teammates.map((teammate) => `<button type="button" data-team-player="${escapeHtml(teammate.player_id)}"><i>${escapeHtml(String(teammate.nickname).slice(0, 2).toUpperCase())}</i><span><b>${escapeHtml(teammate.nickname)}</b><small>${escapeHtml(playerRole(teammate))} · ${Number(teammate.rating_3_0) > 0 ? Number(teammate.rating_3_0).toFixed(2) : "rating pending"}</small></span><em aria-hidden="true">Open</em></button>`).join("") || `<p>Lineup profiles pending.</p>`}</div>
    </section>
    <section class="team-player-actions"><button type="button" data-open-full-player="${escapeHtml(player.player_id)}">Open in player index</button><a href="${escapeHtml(player.source_url || "#")}" target="_blank" rel="noreferrer">View HLTV profile</a></section>
  `;
}

function teamProfileHtml(teamName) {
  const model = teamModel(teamName);
  const lineup = teamLineupRead(teamName);
  const roster = lineup.roster;
  const maps = teamMapRows(teamName);
  const veto = teamVetoRead(teamName);
  const bestMap = maps.filter((map) => map.matches >= 5).sort((a, b) => b.winRate - a.winRate)[0];
  const matches = matchesForTeam(teamName);
  const events = availableEvents().filter((event) => (event.participants || []).some((name) => normalizeName(name) === normalizeName(teamName))).slice(0, 6);
  const form = Number(model.recent_win_rate_10);
  const matchRow = (match) => {
    const isTeam1 = normalizeName(match.team1_name) === normalizeName(teamName);
    const opponent = isTeam1 ? match.team2_name : match.team1_name;
    const probability = isTeam1 ? Number(match.prob_team1) : 1 - Number(match.prob_team1);
    const won = match.winner_name && normalizeName(match.winner_name) === normalizeName(teamName);
    return `<button type="button" class="team-profile-match" data-open-match-key="${escapeHtml(matchKeyOf(match))}">
      <span>${escapeHtml(match.starts_at ? formatDate(match.starts_at) : match.status || "TBA")}</span>
      <strong>${teamLogoHtml(opponent)}${escapeHtml(opponent)}</strong>
      <b class="${matchStatusGroup(match) === "results" ? (won ? "is-win" : "is-loss") : ""}">${matchStatusGroup(match) === "results" ? (won ? "W" : "L") : formatPercent(probability)}</b>
    </button>`;
  };
  return `
    <section class="team-profile-hero">
      ${teamLogoHtml(teamName)}
      <div><span>${model.vrs_rank ? `#${model.vrs_rank} Valve world ranking` : "Team profile"}</span><h2 id="teamDrawerTitle">${escapeHtml(teamName)}</h2><p>${Number(model.matches) || 0} model-state matches</p>${watchButtonHtml("teams", normalizeName(teamName), teamName, "profile-follow")}</div>
    </section>
    <section class="team-profile-metrics">
      <div><span>VRS points</span><strong>${Number(model.vrs_points) || "--"}</strong></div>
      <div><span>Rating</span><strong>${Number(model.elo) ? Math.round(Number(model.elo)) : "--"}</strong></div>
      <div><span>Last 10</span><strong>${Number.isFinite(form) ? `${Math.round(form * 100)}%` : "--"}</strong></div>
      <div><span>Lineup level</span><strong>${Number.isFinite(lineup.averageRating) ? lineup.averageRating.toFixed(2) : "--"}</strong></div>
    </section>
    <section class="team-profile-section">
      <header><span>Current five</span><strong>${roster.length ? `${roster.length} profiles` : "Lineup pending"}</strong></header>
      <div class="team-roster-list">${roster.map((player) => {
        const rating = Number(player.rating_3_0);
        if (player.roster_only) return `<div><i>${escapeHtml(String(player.nickname).slice(0, 2).toUpperCase())}</i><span><b>${escapeHtml(player.nickname)}</b><small>Active VRS roster</small></span><em>Roster</em></div>`;
        return `<button type="button" data-team-player="${escapeHtml(player.player_id)}"><i>${escapeHtml(String(player.nickname).slice(0, 2).toUpperCase())}</i><span><b>${escapeHtml(player.nickname)}</b><small>${escapeHtml(playerRole(player))} · ${Number.isFinite(rating) && rating > 0 ? rating.toFixed(2) : "rating pending"}</small></span><em aria-hidden="true">Open</em></button>`;
      }).join("") || `<p>No verified player profiles in the current snapshot.</p>`}</div>
    </section>
    <section class="team-profile-section team-veto-identity">
      <header><span>Veto identity</span><strong>${veto.sample_matches || 0} tracked vetoes</strong></header>
      <div class="team-veto-cards">
        <article><span>Perma ban</span><strong>${escapeHtml(veto.perma_ban || "Pending")}</strong><small>First removal tendency</small></article>
        <article><span>First pick</span><strong>${escapeHtml(veto.first_pick || "Pending")}</strong><small>Preferred opening map</small></article>
        <article><span>Best map</span><strong>${escapeHtml(bestMap?.mapName || "Pending")}</strong><small>${bestMap ? `${formatPercent(bestMap.winRate)} · ${bestMap.matches} maps` : "Sample pending"}</small></article>
      </div>
    </section>
    <section class="team-profile-section">
      <header><span>Map pool</span><strong>${maps.length} tracked</strong></header>
      <div class="team-map-list">${maps.map((map) => `<div><span>${escapeHtml(map.mapName)}<small>${map.matches} maps</small></span><i><b style="width:${Math.round(map.winRate * 100)}%"></b></i><strong>${formatPercent(map.winRate)}</strong></div>`).join("") || `<p>Map profile pending.</p>`}</div>
    </section>
    <section class="team-profile-section">
      <header><span>Series desk</span><strong>${matches.length} shown</strong></header>
      <div class="team-match-list">${matches.map(matchRow).join("") || `<p>No current series in the snapshot.</p>`}</div>
    </section>
    <section class="team-profile-section">
      <header><span>On the circuit</span><strong>${events.length} events</strong></header>
      <div class="team-event-list">${events.map((event) => `<button type="button" data-open-event="${escapeHtml(event.id)}"><span>${escapeHtml(event.status || "scheduled")}</span><strong>${escapeHtml(event.name)}</strong></button>`).join("") || `<p>No active Tier 1/2 event found.</p>`}</div>
    </section>
  `;
}

function openTeamProfile(teamName, { updateUrl = true } = {}) {
  if (!teamName || !els.teamDrawerLayer || !els.teamDrawerContent) return;
  selectedTeamName = teamName;
  els.teamDrawerContent.innerHTML = teamProfileHtml(teamName);
  els.teamDrawerLayer.hidden = false;
  document.body.classList.add("team-drawer-open");
  window.requestAnimationFrame(() => els.teamDrawerLayer.classList.add("is-open"));
  if (updateUrl) updateProductUrl({ teamName, playerId: "" });
  els.teamDrawerClose?.focus({ preventScroll: true });
}

function closeTeamProfile({ updateUrl = true } = {}) {
  if (!els.teamDrawerLayer || els.teamDrawerLayer.hidden) return;
  els.teamDrawerLayer.classList.remove("is-open");
  document.body.classList.remove("team-drawer-open");
  selectedTeamName = null;
  if (updateUrl) updateProductUrl({ teamName: "" });
  window.setTimeout(() => { if (!els.teamDrawerLayer.classList.contains("is-open")) els.teamDrawerLayer.hidden = true; }, 220);
}

function compactStageName(value, fallback) {
  const match = String(value || "").match(/Stage\s+\d+/i);
  return match?.[0] || fallback;
}

function teamIdentity(teamName) {
  return `
    <div class="team-identity" data-open-team="${escapeHtml(teamName)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(teamName)} team profile">
      ${teamLogoHtml(teamName)}
      <strong>${escapeHtml(teamName)}</strong>
    </div>
  `;
}

function teamLogo(teamName) {
  const asset = teamAssets[normalizeName(teamName)];
  const fallback = document.createElement("span");
  fallback.className = "team-logo-fallback";
  fallback.dataset.label = abbrev(teamName);
  fallback.setAttribute("aria-hidden", "true");
  if (!asset?.logo_url) return fallback;

  const image = document.createElement("img");
  image.className = "team-logo";
  image.src = asset.logo_url;
  image.alt = "";
  image.title = teamName;
  image.dataset.team = teamName;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => image.replaceWith(fallback));
  return image;
}

function teamLogoHtml(teamName) {
  const asset = teamAssets[normalizeName(teamName)];
  if (!asset?.logo_url) {
    return `<span class="team-logo-fallback" data-label="${escapeHtml(abbrev(teamName))}" aria-hidden="true"></span>`;
  }
  return `<img class="team-logo" src="${escapeHtml(asset.logo_url)}" alt="" title="${escapeHtml(teamName)}" data-team="${escapeHtml(teamName)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function passiveTeamLogoHtml(teamName) {
  const asset = teamAssets[normalizeName(teamName)];
  if (!asset?.logo_url) return `<span class="team-logo-fallback" data-label="${escapeHtml(abbrev(teamName))}" aria-hidden="true"></span>`;
  return `<img class="team-logo" src="${escapeHtml(asset.logo_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function productSearchResults(query = "") {
  const needle = normalizeName(query);
  const teamNames = [...new Set([
    ...(appData?.model_state?.teams || []).map((team) => team.team_name),
    ...(appData?.coverage?.vrs?.teams || []).map((team) => team.team_name),
    ...availableEvents().flatMap((event) => event.participants || []),
  ].filter(Boolean))];
  const teams = teamNames
    .filter((name) => !needle || normalizeName(name).includes(needle))
    .sort((a, b) => (Number(teamModel(a).vrs_rank) || 999) - (Number(teamModel(b).vrs_rank) || 999))
    .slice(0, needle ? 7 : 5);
  const players = (playerSnapshot?.players || [])
    .filter((player) => !needle || normalizeName(`${player.nickname} ${player.real_name} ${player.team_name}`).includes(needle))
    .sort((a, b) => Number(b.rating_3_0) - Number(a.rating_3_0))
    .slice(0, needle ? 6 : 4);
  const events = availableEvents()
    .filter((event) => !needle || normalizeName(event.name).includes(needle))
    .slice(0, needle ? 5 : 3);
  return { teams, players, events };
}

function renderProductSearch(query = "") {
  if (!els.searchResults || !appData) return;
  const results = productSearchResults(query);
  const count = results.teams.length + results.players.length + results.events.length;
  if (!count) {
    els.searchResults.innerHTML = `<div class="search-empty"><span>No result</span><strong>Try a team, player, or tournament name.</strong></div>`;
    return;
  }
  const groups = [];
  if (results.teams.length) groups.push(`<section><header><span>Teams</span><strong>${results.teams.length}</strong></header>${results.teams.map((teamName) => {
    const model = teamModel(teamName);
    return `<button type="button" data-search-team="${escapeHtml(teamName)}">${passiveTeamLogoHtml(teamName)}<span><b>${escapeHtml(teamName)}</b><small>${model.vrs_rank ? `#${model.vrs_rank} VRS` : "Team intelligence"}</small></span><em>Team</em></button>`;
  }).join("")}</section>`);
  if (results.players.length) groups.push(`<section><header><span>Players</span><strong>${results.players.length}</strong></header>${results.players.map((player) => `<button type="button" data-search-player="${escapeHtml(player.player_id)}"><i>${escapeHtml(String(player.nickname).slice(0, 2).toUpperCase())}</i><span><b>${escapeHtml(player.nickname)}</b><small>${escapeHtml(player.team_name)} · ${escapeHtml(playerRole(player))}</small></span><em>${Number.isFinite(Number(player.rating_3_0)) ? Number(player.rating_3_0).toFixed(2) : "--"}</em></button>`).join("")}</section>`);
  if (results.events.length) groups.push(`<section><header><span>Events</span><strong>${results.events.length}</strong></header>${results.events.map((event) => `<button type="button" data-search-event="${escapeHtml(event.id)}"><i>${escapeHtml(eventDateParts(event).day)}</i><span><b>${escapeHtml(event.name)}</b><small>${escapeHtml(eventDateRange(event))} · ${productTierForEvent(event) === "tier_1" ? "Tier 1" : "Tier 2"}</small></span><em>${escapeHtml(event.status || "event")}</em></button>`).join("")}</section>`);
  els.searchResults.innerHTML = groups.join("");
}

function openProductSearch() {
  if (!els.searchLayer) return;
  renderProductSearch(els.productSearch?.value || "");
  els.searchLayer.hidden = false;
  document.body.classList.add("search-open");
  window.requestAnimationFrame(() => {
    els.searchLayer.classList.add("is-open");
    els.productSearch?.focus({ preventScroll: true });
  });
}

function closeProductSearch() {
  if (!els.searchLayer || els.searchLayer.hidden) return;
  els.searchLayer.classList.remove("is-open");
  document.body.classList.remove("search-open");
  window.setTimeout(() => { if (!els.searchLayer.classList.contains("is-open")) els.searchLayer.hidden = true; }, 180);
}

function followedMatches() {
  const teamIds = new Set(watchlist.teams.map((entry) => entry.id));
  const eventIds = new Set(watchlist.events.map((entry) => entry.id));
  return allKnownMatches()
    .filter((match) => matchStatusGroup(match) !== "results")
    .filter((match) => eventIds.has(String(match.event_id || "")) || [match.team1_name, match.team2_name].some((team) => teamIds.has(normalizeName(team))))
    .sort((left, right) => new Date(left.starts_at || "9999-12-31") - new Date(right.starts_at || "9999-12-31"))
    .slice(0, 8);
}

function myDeskMatchHtml(match) {
  const call = enrichMatch(match);
  const confidence = matchConfidence(call);
  return `<button type="button" class="my-desk-match" data-desk-match="${escapeHtml(matchKeyOf(call))}">
    <span class="my-desk-match-time"><b>${escapeHtml(call.starts_at ? formatDate(call.starts_at) : "TBA")}</b><small>${escapeHtml(call.event_name || "CS2 circuit")}</small></span>
    <span class="my-desk-match-teams"><span>${teamLogoHtml(call.team1_name)}<b>${escapeHtml(call.team1_name)}</b></span><i>${formatPercent(call.prob_team1)}</i><span><b>${escapeHtml(call.team2_name)}</b>${teamLogoHtml(call.team2_name)}</span></span>
    <span class="my-desk-match-call"><small>Model call</small><b>${escapeHtml(call.predicted_winner)}</b><i style="--desk-confidence:${Math.round(confidence * 100)}%"></i></span>
  </button>`;
}

function myDeskEntityListsHtml() {
  const teams = watchlist.teams.map((entry) => {
    const model = teamModel(entry.name);
    return `<article><button type="button" data-open-team="${escapeHtml(entry.name)}">${teamLogoHtml(entry.name)}<span><strong>${escapeHtml(entry.name)}</strong><small>${model.vrs_rank ? `#${model.vrs_rank} VRS` : "Team intelligence"}</small></span></button>${watchButtonHtml("teams", entry.id, entry.name, "is-icon-only")}</article>`;
  }).join("");
  const players = watchlist.players.map((entry) => {
    const player = (playerSnapshot?.players || []).find((row) => row.player_id === entry.id);
    return `<article><button type="button" data-open-player="${escapeHtml(entry.id)}"><i>${escapeHtml(String(player?.nickname || entry.name).slice(0, 2).toUpperCase())}</i><span><strong>${escapeHtml(player?.nickname || entry.name)}</strong><small>${escapeHtml(player ? `${player.team_name} · ${playerRole(player)}` : "Player profile")}</small></span></button>${watchButtonHtml("players", entry.id, player?.nickname || entry.name, "is-icon-only")}</article>`;
  }).join("");
  const events = watchlist.events.map((entry) => {
    const event = availableEvents().find((row) => row.id === entry.id);
    return `<article><button type="button" data-desk-event="${escapeHtml(entry.id)}"><i>${escapeHtml(event ? eventDateParts(event).day : "--")}</i><span><strong>${escapeHtml(event?.name || entry.name)}</strong><small>${escapeHtml(event ? `${eventDateRange(event)} · ${event.status}` : "Event profile")}</small></span></button>${watchButtonHtml("events", entry.id, event?.name || entry.name, "is-icon-only")}</article>`;
  }).join("");
  return `<div class="my-desk-entities"><section><header><span>Teams</span><strong>${watchlist.teams.length}</strong></header>${teams || `<p>No followed teams.</p>`}</section><section><header><span>Players</span><strong>${watchlist.players.length}</strong></header>${players || `<p>No followed players.</p>`}</section><section><header><span>Events</span><strong>${watchlist.events.length}</strong></header>${events || `<p>No followed events.</p>`}</section></div>`;
}

function myDeskPicksHtml() {
  const matches = new Map(allKnownMatches().map((match) => [matchKeyOf(match), match]));
  const rows = Object.entries(savedPicks).sort(([, left], [, right]) => String(right.saved_at).localeCompare(String(left.saved_at))).slice(0, 8);
  if (!rows.length) return `<div class="my-desk-empty"><span>Pick ledger</span><strong>No saved calls yet.</strong><a href="#matches" data-close-desk>Open the match desk</a></div>`;
  return `<div class="my-desk-picks">${rows.map(([key, pick]) => {
    const match = matches.get(key);
    const state = match ? savedPickState(match) : "pending";
    return `<article class="is-${escapeHtml(state)}"><span>${escapeHtml(pick.event_name || "CS2 circuit")}<small>${escapeHtml(pick.starts_at ? formatDate(pick.starts_at) : "Series pending")}</small></span><strong>${escapeHtml(pick.team_name)}<small>vs ${escapeHtml(pick.opponent_name)}</small></strong><b>${formatPercent(pick.probability)}<small>${escapeHtml(state)}</small></b></article>`;
  }).join("")}</div>`;
}

function renderMyDesk() {
  if (!els.myDeskContent) return;
  const matches = followedMatches();
  const entityCount = watchlistCount(watchlist);
  const pendingPicks = Object.keys(savedPicks).length;
  els.myDeskContent.innerHTML = `<section class="my-desk-hero"><div><span>Personal circuit</span><h2>${entityCount || pendingPicks ? "Your CS2 desk." : "Build your desk."}</h2><p>${entityCount || pendingPicks ? "Followed teams, players, events, and saved calls in one view." : "Follow any team, player, or event to start a personal match feed."}</p></div><aside><div><span>Following</span><strong>${entityCount}</strong></div><div><span>Next series</span><strong>${matches.length}</strong></div><div><span>Saved picks</span><strong>${pendingPicks}</strong></div></aside></section>
    <section class="my-desk-grid"><div class="my-desk-feed"><header><span>Next on server</span><strong>${matches.length ? `${matches.length} relevant series` : "No scheduled series"}</strong></header>${matches.length ? matches.map(myDeskMatchHtml).join("") : `<div class="my-desk-empty"><span>Match feed</span><strong>Follow a team or active event.</strong></div>`}</div><div class="my-desk-ledger"><header><span>Prediction ledger</span><strong>${pendingPicks} saved</strong></header>${myDeskPicksHtml()}</div></section>
    ${myDeskEntityListsHtml()}`;
  syncWatchControls();
}

function openMyDesk() {
  if (!els.myDeskLayer) return;
  myDeskReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  closeProductSearch();
  if (els.vetoLabLayer && !els.vetoLabLayer.hidden) closeVetoLab();
  if (els.teamDrawerLayer && !els.teamDrawerLayer.hidden) closeTeamProfile({ updateUrl: false });
  renderMyDesk();
  els.myDeskLayer.hidden = false;
  document.body.classList.add("my-desk-open");
  window.requestAnimationFrame(() => {
    els.myDeskLayer.classList.add("is-open");
    els.myDeskClose?.focus({ preventScroll: true });
  });
}

function closeMyDesk() {
  if (!els.myDeskLayer || els.myDeskLayer.hidden) return;
  els.myDeskLayer.classList.remove("is-open");
  document.body.classList.remove("my-desk-open");
  window.setTimeout(() => {
    if (!els.myDeskLayer.classList.contains("is-open")) els.myDeskLayer.hidden = true;
    myDeskReturnFocus?.focus?.({ preventScroll: true });
    myDeskReturnFocus = null;
  }, 220);
}

function normalizeName(teamName) {
  return String(teamName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function updateSummary(data) {
  const event = activeEvent();
  const verifiedAt = data.coverage?.last_verified_utc || data.generated_at_utc;
  const generatedAt = new Date(verifiedAt);
  const ageHours = Number.isNaN(generatedAt.getTime()) ? Infinity : (Date.now() - generatedAt.getTime()) / 3600000;
  const isFresh = ageHours <= 12;
  const calls = dailyMatchCalls();
  const todayKey = localDateKey(new Date());
  const currentCalls = calls.filter((match) => localDateKey(match.starts_at) >= todayKey);
  const latestKey = matchSlateDays(calls).at(-1);
  const summaryCalls = currentCalls.length ? currentCalls : calls.filter((match) => localDateKey(match.starts_at) === latestKey);

  const productionAccuracy = data.model?.production?.metrics?.accuracy ?? data.model?.best_pre_match?.accuracy;
  const postVetoAccuracy = data.model?.best_post_veto?.accuracy;
  const productionModel = data.model_registry?.champion || data.model?.production || {};
  const calibrationError = productionModel.metrics?.ece;
  const holdoutRows = Number(productionModel.test_rows || 0);
  setText(els.modelPre, formatPercent(productionAccuracy));
  setText(els.modelPost, formatPercent(postVetoAccuracy));
  setText(els.modelCalibration, Number.isFinite(Number(calibrationError)) ? `${(Number(calibrationError) * 100).toFixed(1)} pts` : "--");
  setText(els.modelSample, holdoutRows ? holdoutRows.toLocaleString("en-US") : "--");
  setText(els.modelVersion, productionModel.version ? String(productionModel.version).replaceAll("-", " ") : "Production model");
  setText(els.heroPre, formatPercent(productionAccuracy));
  setText(els.heroPost, formatPercent(postVetoAccuracy));
  setText(els.freshnessLabel, `${isFresh ? "Live check" : "Last check"} · ${formatDate(verifiedAt)}`);
  setText(els.slateCount, `${summaryCalls.length} series · ${currentCalls.length ? "current slate" : "latest archive"}`);
  setText(els.rankingSnapshot, `VRS · ${data.coverage?.vrs?.as_of ? dateOnlyFormatter.format(new Date(`${data.coverage.vrs.as_of}T12:00:00`)) : "pending"}`);
  setText(els.selectedEventName, event?.name || "Event desk");
  setText(els.selectedEventMeta, `${eventDateRange(event)} · ${event?.format?.label || "Organizer format pending"}`);
  document.body.classList.toggle("snapshot-stale", !isFresh);
}

function installViewportSignals() {
  const sections = [...document.querySelectorAll("main > section[id]")];
  const navLinks = [...document.querySelectorAll('.top-nav a[href^="#"], .mobile-dock a[href^="#"]')];
  if (!("IntersectionObserver" in window)) return;

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-entered");
      sectionObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -12%" });
  sections.forEach((section) => sectionObserver.observe(section));

  let framePending = false;
  const syncNavigation = () => {
    framePending = false;
    const active = sections.reduce((current, section) => section.getBoundingClientRect().top <= 180 ? section : current, sections[0]);
    navLinks.forEach((link) => link.toggleAttribute("aria-current", link.getAttribute("href") === `#${active.id}`));
  };
  window.addEventListener("scroll", () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(syncNavigation);
  }, { passive: true });
  navLinks.forEach((link) => link.addEventListener("click", () => {
    navLinks.forEach((candidate) => candidate.toggleAttribute("aria-current", candidate === link));
  }));
  syncNavigation();
}

function restoreProductLocation() {
  const targetId = window.location.hash.replace(/^#/, "");
  if (!targetId || !["dashboard", "matches", "events", "featured", "rankings", "players", "model"].includes(targetId)) return;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    document.getElementById(targetId)?.scrollIntoView({ block: "start", behavior: "auto" });
    window.requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior; });
  }));
}

function renderProjection(data) {
  appData = data;
  coverage = data.coverage || null;
  const events = availableEvents(data);
  const locationParams = new URLSearchParams(window.location.search);
  const requestedEventId = locationParams.get("event");
  const requestedView = locationParams.get("view");
  if (requestedEventId && events.some((event) => event.id === requestedEventId)) activeEventId = requestedEventId;
  if (["overview", "matches", "bracket", "format", "teams"].includes(requestedView)) activeEventView = requestedView;
  selectedPlayerId = locationParams.get("player") || selectedPlayerId;
  selectedTeamName = locationParams.get("team") || selectedTeamName;
  const preferredEvent = events.find((event) => event.status === "ongoing")
    || events.find((event) => event.status === "upcoming")
    || events[0];
  activeEventId = activeEventId && events.some((event) => event.id === activeEventId)
    ? activeEventId
    : preferredEvent?.id || null;
  buildTeamLookupMap();
  renderEventSelector(events);
  renderEvents(events);
  renderRankings(data.coverage?.vrs);
  renderDeciders(dailyMatchCalls());
  renderDynamicMajor();
}

function emptyNode(title, body) {
  const node = els.emptyTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = title;
  node.querySelector("p").textContent = body;
  return node;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function liveMatchIsFinished(match) {
  const status = String(match.status || "").toLowerCase();
  if (/finished|completed|final|ended/.test(status)) return true;
  const score1 = Number(match.score1);
  const score2 = Number(match.score2);
  return Number.isFinite(score1) && Number.isFinite(score2) && Math.max(score1, score2) >= 2 && Math.max(score1, score2) <= 3 && score1 !== score2;
}

function mapRateWithPrior(profile, prior = 4) {
  const matches = Number(profile?.matches) || 0;
  const wins = Number(profile?.wins) || 0;
  return matches > 0 ? (wins + 0.5 * prior) / (matches + prior) : 0.5;
}

function knownVetoMapRead(match, mapNames) {
  const maps = [...new Set((mapNames || []).filter(Boolean))].slice(0, 3);
  if (!maps.length) return null;
  const baseProbability = Math.max(1e-6, Math.min(1 - 1e-6, Number(match.prob_team1) || 0.5));
  const profiles = appData?.model_state?.map_profiles || {};
  const profile1 = profiles[normalizeName(match.team1_name)] || {};
  const profile2 = profiles[normalizeName(match.team2_name)] || {};
  const baseLogit = Math.log(baseProbability / (1 - baseProbability));
  const rows = maps.map((mapName) => {
    const row1 = profile1[mapName] || {};
    const row2 = profile2[mapName] || {};
    const rate1 = mapRateWithPrior(row1);
    const rate2 = mapRateWithPrior(row2);
    const evidence = (Number(row1.matches) || 0) + (Number(row2.matches) || 0);
    const weight = Math.min(1, evidence / 28);
    const probability = 1 / (1 + Math.exp(-(baseLogit + weight * 1.85 * (rate1 - rate2))));
    return {
      map_name: mapName,
      source: "known_veto",
      prob_team1: roundProb(probability),
      predicted_winner: probability >= 0.5 ? match.team1_name : match.team2_name,
      confidence: roundProb(Math.max(probability, 1 - probability)),
      team1_map_win_rate: roundProb(rate1),
      team2_map_win_rate: roundProb(rate2),
      evidence_maps: evidence,
    };
  });
  const probability = rows.reduce((sum, row) => sum + row.prob_team1, 0) / rows.length;
  return {
    status: "known_veto",
    base_prob_team1: roundProb(baseProbability),
    map_adjusted_prob_team1: roundProb(probability),
    map_adjusted_predicted_winner: probability >= 0.5 ? match.team1_name : match.team2_name,
    map_adjusted_confidence: roundProb(Math.max(probability, 1 - probability)),
    maps: rows,
    excluded_maps: match.map_read?.excluded_maps || {},
    note: "Official veto loaded. The series probability now uses the selected maps.",
  };
}

function normalizeLiveMatch(match) {
  return normalizeMatch(match);
}

function sameLiveSeries(candidate, incoming) {
  const candidateId = candidate?.match_id || candidate?.hltv_match_id || candidate?.id;
  if (candidateId && incoming.match_id && String(candidateId) === String(incoming.match_id)) return true;
  if (!sameMatch(candidate, incoming.team1_name, incoming.team2_name)) return false;
  const candidateEvent = normalizeName(candidate.event_id || candidate.event_name || "");
  const incomingEvent = normalizeName(incoming.event_id || incoming.event_name || "");
  if (candidateEvent && incomingEvent && candidateEvent !== incomingEvent) return false;
  const candidateTime = new Date(candidate.starts_at || 0).getTime();
  const incomingTime = new Date(incoming.starts_at || 0).getTime();
  return !candidateTime || !incomingTime || Math.abs(candidateTime - incomingTime) < 64_800_000;
}

function mergeLiveSeries(target, incoming) {
  const score1 = Number(incoming.score1);
  const score2 = Number(incoming.score2);
  const hasScore = Number.isFinite(score1) && Number.isFinite(score2);
  const finished = liveMatchIsFinished(incoming);
  Object.assign(target, {
    match_id: incoming.match_id || target.match_id,
    event_id: incoming.event_id || target.event_id,
    event_name: incoming.event_name || target.event_name,
    stage_name: incoming.stage_name || target.stage_name,
    series_format: incoming.series_format || target.series_format,
    starts_at: incoming.starts_at || target.starts_at,
    status: finished ? "finished" : incoming.status || target.status,
  });
  if (hasScore) {
    target.score1 = score1;
    target.score2 = score2;
    target.score_label = `${score1}:${score2}`;
  }
  if (finished) {
    target.winner_name = incoming.winner_name || incoming.winner || (score1 > score2 ? incoming.team1_name : incoming.team2_name);
  }
  if (incoming.maps.length) {
    const mapRead = knownVetoMapRead({ ...target, prob_team1: Number(target.prob_team1) || pairProbability(target.team1_name, target.team2_name) }, incoming.maps);
    if (mapRead) target.map_read = mapRead;
  }
  if (incoming.lineups) target.lineups = incoming.lineups;
  if (incoming.map_results?.length) target.map_results = incoming.map_results;
  if (incoming.veto_text) target.veto_text = incoming.veto_text;
  return target;
}

function upsertLiveSeries(collection, incoming) {
  if (!Array.isArray(collection)) return false;
  const existing = collection.find((match) => sameLiveSeries(match, incoming));
  if (existing) {
    mergeLiveSeries(existing, incoming);
    return true;
  }
  collection.push(enrichMatch({ ...incoming, source: incoming.source || "live_snapshot" }));
  return true;
}

function mergeLiveEvents(events) {
  if (!Array.isArray(events) || !appData?.coverage) return false;
  appData.coverage.events ||= [];
  events.forEach((incoming) => {
    if (!incoming?.id && !incoming?.name) return;
    const normalized = normalizeEvent(incoming);
    const existing = appData.coverage.events.find((event) => event.id === normalized.id || normalizeName(event.name) === normalizeName(normalized.name));
    if (!existing) {
      appData.coverage.events.push(normalized);
      return;
    }
    const participants = [...new Set([...(existing.participants || []), ...(normalized.participants || [])])];
    const matches = [...(existing.matches || [])];
    (normalized.matches || []).forEach((match) => upsertLiveSeries(matches, match));
    const existingFormatIsRich = existing.format && !/pending|event schedule/i.test(String(existing.format.label || ""));
    const format = existingFormatIsRich ? {
      ...(normalized.format || {}),
      ...existing.format,
      stages: normalized.format?.stages?.length ? normalized.format.stages : existing.format.stages || [],
      settings: { ...(normalized.format?.settings || {}), ...(existing.format.settings || {}) },
    } : normalized.format || existing.format;
    Object.assign(existing, normalized, {
      participants,
      teams: Math.max(Number(existing.teams) || 0, Number(normalized.teams) || 0, participants.length),
      matches,
      format,
      start_date: normalized.start_date || existing.start_date,
      end_date: normalized.end_date || existing.end_date,
      location: normalized.location || existing.location,
    });
  });
  return events.length > 0;
}

function mergeLivePlayers(players) {
  if (!Array.isArray(players) || !players.length) return false;
  playerSnapshot ||= { contract_version: "1.1", generated_at_utc: new Date().toISOString(), players: [] };
  playerSnapshot.players ||= [];
  players.forEach((incoming) => {
    const playerId = String(incoming.player_id || (incoming.hltv_player_id ? `hltv:${incoming.hltv_player_id}` : ""));
    if (!playerId || !incoming.nickname) return;
    const existing = playerSnapshot.players.find((player) => player.player_id === playerId);
    if (!existing) {
      playerSnapshot.players.push({ traits: {}, signal_index: 50, maps_3m: 0, rating_3_0: null, ...incoming, player_id: playerId });
      return;
    }
    Object.assign(existing, incoming, {
      player_id: playerId,
      traits: { ...(existing.traits || {}), ...(incoming.traits || {}) },
      rating_3_0: incoming.rating_3_0 ?? existing.rating_3_0,
      maps_3m: incoming.maps_3m ?? existing.maps_3m,
      signal_index: incoming.signal_index ?? existing.signal_index,
    });
  });
  playerSnapshot.lineups_updated_at_utc = new Date().toISOString();
  return true;
}

function applyLiveSnapshot(live) {
  if (!live?.ok || !appData) return false;
  let changed = mergeLiveEvents(live.events);
  const playersChanged = mergeLivePlayers(live.players);
  changed = changed || playersChanged;
  if (live.rankings?.teams?.length) {
    appData.coverage.vrs = live.rankings;
    changed = true;
  }
  appData.coverage ||= {};
  appData.coverage.daily_matches ||= [];
  appData.upcoming_predictions ||= [];
  const boardMatches = (appData.major_projection?.current_stage_board?.rounds || [])
    .flatMap((round) => (round.groups || []).flatMap((group) => group.matches || []));

  (live.matches || []).map(normalizeLiveMatch).filter(Boolean).forEach((incoming) => {
    upsertLiveSeries(appData.coverage.daily_matches, incoming);
    const predicted = appData.upcoming_predictions.find((match) => sameLiveSeries(match, incoming));
    if (predicted) mergeLiveSeries(predicted, incoming);

    const event = availableEvents().find((candidate) => candidate.id === incoming.event_id || normalizeName(candidate.name) === normalizeName(incoming.event_name));
    if (event) {
      event.matches = Array.isArray(event.matches) ? event.matches : [];
      upsertLiveSeries(event.matches, incoming);
    }

    const boardMatch = boardMatches.find((match) => sameLiveSeries(match, incoming));
    if (boardMatch) mergeLiveSeries(boardMatch, incoming);
    changed = true;
  });

  if (!changed) return false;
  const checkedAt = live.fetched_at_utc || new Date().toISOString();
  appData.coverage.last_verified_utc = checkedAt;
  buildTeamLookupMap();
  renderEventSelector(availableEvents());
  renderEvents(availableEvents());
  renderRankings(appData.coverage.vrs);
  if (playersChanged) {
    renderPlayerFilters();
    renderPlayers();
  }
  renderDeciders(dailyMatchCalls());
  renderDynamicMajor();
  updateSummary(appData);
  setText(els.freshnessLabel, `Live desk checked ${formatDate(checkedAt)}`);
  return true;
}

async function refreshLiveSnapshot() {
  if (refreshLiveSnapshot.pending) return { supported: true, pollAfterMs: 180_000 };
  refreshLiveSnapshot.pending = true;
  try {
    const response = await fetch("/api/live-snapshot", { cache: "no-store" });
    if (response.status === 404 || response.status === 501) return { supported: false };
    if (!response.ok) return { supported: true, pollAfterMs: 300_000 };
    const live = await response.json();
    applyLiveSnapshot(live);
    return { supported: true, pollAfterMs: Math.max(60_000, Number(live.poll_after_ms) || 180_000) };
  } catch {
    return { supported: false };
  } finally {
    refreshLiveSnapshot.pending = false;
  }
}

function startLiveUpdater() {
  let timerId;
  let stopped = false;
  const refresh = async () => {
    if (stopped) return;
    const result = document.hidden ? { supported: true, pollAfterMs: 300_000 } : await refreshLiveSnapshot();
    if (!result.supported) return;
    timerId = window.setTimeout(refresh, result.pollAfterMs);
  };
  refresh();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !timerId) refresh();
  });
  window.addEventListener("pagehide", () => {
    stopped = true;
    window.clearTimeout(timerId);
  }, { once: true });
}

async function boot() {
  try {
    const baseData = window.location.protocol === "file:"
      ? window.__STRIKESIGNAL_DATA__
      : await fetchPredictionData();
    const coverageData = window.__STRIKESIGNAL_COVERAGE__ || await fetchCoverageData();
    const data = normalizePlatformSnapshot(baseData, coverageData || baseData.coverage || null);
    if (!data || typeof data !== "object") throw new Error("Prediction snapshot is empty.");
    teamAssets = { ...SUPPLEMENTAL_TEAM_ASSETS, ...(data.team_assets || {}) };
    renderProjection(data);
    renderPlayerFilters();
    renderPlayers();
    updateSummary(data);
    syncWatchControls();
    installViewportSignals();
    restoreProductLocation();
    if (selectedTeamName) openTeamProfile(selectedTeamName, { updateUrl: false });
    document.body.classList.add("product-ready");
    if (window.location.protocol !== "file:") startLiveUpdater();
  } catch (error) {
    document.body.classList.add("data-error");
    setText(els.freshnessLabel, "Projection failed to load");
    els.swissBoard?.append(emptyNode("Projection unavailable.", error.message));
  }
}

document.addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !target.classList.contains("team-logo")) return;
    const fallback = document.createElement("span");
    fallback.className = "team-logo-fallback";
    const teamName = target.dataset.team || target.title || "Team";
    fallback.dataset.label = abbrev(teamName);
    fallback.setAttribute("aria-hidden", "true");
    target.replaceWith(fallback);
  },
  true,
);

els.boardJumpButtons.forEach((button) => {
  button.addEventListener("click", () => jumpMajorBoard(button.dataset.boardJump || "stage3"));
});

els.eventSelector?.addEventListener("change", (event) => {
  selectEvent(event.target.value);
});

els.playerSearch?.addEventListener("input", (event) => {
  playerSearchTerm = event.target.value || "";
  renderPlayers();
});

els.playerTeamFilter?.addEventListener("change", (event) => {
  playerTeamFilter = event.target.value || "all";
  selectedPlayerId = null;
  renderPlayers();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest("[data-open-veto]");
  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  const match = matchForVetoKey(trigger.dataset.openVeto);
  if (match) openVetoLab(match);
}, true);

els.vetoLabClose?.addEventListener("click", closeVetoLab);
els.vetoLabBackdrop?.addEventListener("click", closeVetoLab);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.vetoLabLayer && !els.vetoLabLayer.hidden) closeVetoLab();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest("[data-watch-type][data-watch-id]");
  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  watchlist = toggleWatchlist(watchlist, trigger.dataset.watchType, {
    id: trigger.dataset.watchId,
    name: trigger.dataset.watchName,
  });
  persistWatchlist();
  syncWatchControls();
  if (els.myDeskLayer && !els.myDeskLayer.hidden) renderMyDesk();
}, true);

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest("[data-open-player]");
  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  const playerId = trigger.dataset.openPlayer;
  if (!playerId) return;
  if (els.myDeskContent?.contains(trigger)) closeMyDesk();
  closeTeamProfile({ updateUrl: false });
  selectedPlayerId = playerId;
  playerSearchTerm = "";
  playerTeamFilter = "all";
  if (els.playerSearch) els.playerSearch.value = "";
  renderPlayerFilters();
  renderPlayers();
  updateProductUrl({ playerId, eventId: "", view: "", teamName: "", hash: "players" });
  document.querySelector("#players")?.scrollIntoView({ block: "start", behavior: "smooth" });
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest("[data-open-team]");
  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  if (els.myDeskContent?.contains(trigger)) closeMyDesk();
  openTeamProfile(trigger.dataset.openTeam || trigger.dataset.team || trigger.title);
}, true);

document.addEventListener("keydown", (event) => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest("[data-open-team]");
  if (!trigger || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  openTeamProfile(trigger.dataset.openTeam || trigger.dataset.team || trigger.title);
}, true);

els.teamDrawerClose?.addEventListener("click", () => closeTeamProfile());
els.teamDrawerBackdrop?.addEventListener("click", () => closeTeamProfile());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.teamDrawerLayer && !els.teamDrawerLayer.hidden) closeTeamProfile();
});

els.teamDrawerContent?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const teamPlayerTrigger = event.target.closest("[data-team-player]");
  if (teamPlayerTrigger?.dataset.teamPlayer && selectedTeamName) {
    event.preventDefault();
    const player = (playerSnapshot?.players || []).find((row) => row.player_id === teamPlayerTrigger.dataset.teamPlayer);
    if (player) {
      els.teamDrawerContent.innerHTML = teamPlayerProfileHtml(selectedTeamName, player);
      els.teamDrawerContent.scrollTo({ top: 0, behavior: "smooth" });
    }
    return;
  }
  if (event.target.closest("[data-back-team]") && selectedTeamName) {
    event.preventDefault();
    els.teamDrawerContent.innerHTML = teamProfileHtml(selectedTeamName);
    els.teamDrawerContent.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const fullPlayerTrigger = event.target.closest("[data-open-full-player]");
  if (fullPlayerTrigger?.dataset.openFullPlayer) {
    event.preventDefault();
    const playerId = fullPlayerTrigger.dataset.openFullPlayer;
    closeTeamProfile({ updateUrl: false });
    selectedPlayerId = playerId;
    playerSearchTerm = "";
    playerTeamFilter = "all";
    if (els.playerSearch) els.playerSearch.value = "";
    renderPlayerFilters();
    renderPlayers();
    updateProductUrl({ playerId, eventId: "", view: "", teamName: "", hash: "players" });
    document.querySelector("#players")?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  const eventTrigger = event.target.closest("[data-open-event]");
  if (eventTrigger?.dataset.openEvent) {
    event.preventDefault();
    closeTeamProfile({ updateUrl: false });
    selectEvent(eventTrigger.dataset.openEvent);
    return;
  }
  const matchTrigger = event.target.closest("[data-open-match-key]");
  if (!matchTrigger?.dataset.openMatchKey) return;
  const match = allKnownMatches().find((row) => matchKeyOf(row) === matchTrigger.dataset.openMatchKey);
  if (!match) return;
  event.preventDefault();
  selectedMatchKey = matchKeyOf(match);
  selectedMatchDateKey = localDateKey(match.starts_at);
  currentMatchFilter = "all";
  currentMatchEvent = "all";
  closeTeamProfile({ updateUrl: false });
  renderDeciders(dailyMatchCalls());
  updateProductUrl({ teamName: "", playerId: "", eventId: "", view: "", hash: "matches" });
  document.querySelector("#matches")?.scrollIntoView({ block: "start", behavior: "smooth" });
});

els.openSearch?.addEventListener("click", openProductSearch);
els.openMyDesk?.addEventListener("click", openMyDesk);
els.myDeskBackdrop?.addEventListener("click", closeMyDesk);
els.myDeskClose?.addEventListener("click", closeMyDesk);
els.myDeskContent?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-close-desk]")) {
    closeMyDesk();
    return;
  }
  const eventId = event.target.closest("[data-desk-event]")?.dataset.deskEvent;
  if (eventId) {
    closeMyDesk();
    selectEvent(eventId);
    return;
  }
  const matchKey = event.target.closest("[data-desk-match]")?.dataset.deskMatch;
  if (!matchKey) return;
  const match = allKnownMatches().find((row) => matchKeyOf(row) === matchKey);
  if (!match) return;
  selectedMatchKey = matchKeyOf(match);
  selectedMatchDateKey = localDateKey(match.starts_at);
  currentMatchFilter = "all";
  currentMatchEvent = "all";
  closeMyDesk();
  renderDeciders(dailyMatchCalls());
  updateProductUrl({ eventId: "", view: "", playerId: "", teamName: "", hash: "matches" });
  document.querySelector("#matches")?.scrollIntoView({ block: "start", behavior: "smooth" });
});
els.searchBackdrop?.addEventListener("click", closeProductSearch);
els.productSearch?.addEventListener("input", (event) => renderProductSearch(event.target.value || ""));
els.searchResults?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const team = event.target.closest("[data-search-team]")?.dataset.searchTeam;
  const playerId = event.target.closest("[data-search-player]")?.dataset.searchPlayer;
  const eventId = event.target.closest("[data-search-event]")?.dataset.searchEvent;
  if (team) {
    closeProductSearch();
    openTeamProfile(team);
    return;
  }
  if (playerId) {
    closeProductSearch();
    selectedPlayerId = playerId;
    playerSearchTerm = "";
    playerTeamFilter = "all";
    if (els.playerSearch) els.playerSearch.value = "";
    renderPlayerFilters();
    renderPlayers();
    updateProductUrl({ playerId, teamName: "", eventId: "", view: "", hash: "players" });
    document.querySelector("#players")?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (eventId) {
    closeProductSearch();
    selectEvent(eventId);
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    els.searchLayer?.classList.contains("is-open") ? closeProductSearch() : openProductSearch();
    return;
  }
  if (event.key === "/" && !isTyping && els.searchLayer?.hidden) {
    event.preventDefault();
    openProductSearch();
    return;
  }
  if (event.key === "Escape" && els.searchLayer && !els.searchLayer.hidden) closeProductSearch();
  if (event.key === "Escape" && els.myDeskLayer && !els.myDeskLayer.hidden) closeMyDesk();
  if (event.key === "Tab" && els.myDeskLayer?.classList.contains("is-open")) {
    const focusable = [...els.myDeskLayer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

els.eventFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentEventFilter = button.dataset.eventFilter || "active";
    els.eventFilterButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    renderEvents(availableEvents());
  });
});

els.resetPicks?.addEventListener("click", () => {
  pickOverrides.clear();
  renderDynamicMajor();
});

els.rankingToggle?.addEventListener("click", () => {
  rankingsExpanded = !rankingsExpanded;
  renderRankings(appData?.coverage?.vrs);
});

async function fetchPredictionData() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Prediction snapshot failed with ${response.status}`);
  return response.json();
}

async function fetchCoverageData() {
  const response = await fetch("./data/coverage.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Coverage snapshot failed with ${response.status}`);
  return response.json();
}

boot();
