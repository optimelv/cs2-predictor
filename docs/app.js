import { normalizeEvent, normalizeMatch, normalizePlatformSnapshot } from "./lib/snapshot.js?v=20260712.2";

const DATA_URL = "./data/predictions.json";
const SUPPLEMENTAL_TEAM_ASSETS = window.__STRIKESIGNAL_TEAM_ASSETS__ || {};

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
  rankingsGrid: document.querySelector("#rankingsGrid"),
  rankingsSource: document.querySelector("#rankingsSource"),
  rankingsUpdated: document.querySelector("#rankingsUpdated"),
  rankingsSourceLink: document.querySelector("#rankingsSourceLink"),
  rankingToggle: document.querySelector("#rankingToggle"),
  slateCount: document.querySelector("#slateCount"),
  rankingSnapshot: document.querySelector("#rankingSnapshot"),
  eventCount: document.querySelector("#eventCount"),
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
let matchDayOffset = 0;
let selectedMatchKey = null;
let activeEventView = "overview";
let selectedEventMatchKey = null;
let rankingsExpanded = false;
const pickOverrides = new Map();
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

function matchConfidence(match) {
  const probability = Number(match.prob_team1);
  const winnerProbability = match.predicted_winner === match.team1_name ? probability : 1 - probability;
  return Math.max(0, Math.min(1, winnerProbability));
}

function enrichMatch(match) {
  const suppliedProbability = Number(match?.prob_team1);
  const probability = Number.isFinite(suppliedProbability)
    ? Math.max(0.08, Math.min(0.92, suppliedProbability))
    : pairProbability(match.team1_name, match.team2_name);
  return {
    ...match,
    prob_team1: probability,
    predicted_winner: match.predicted_winner || (probability >= 0.5 ? match.team1_name : match.team2_name),
    confidence: Math.max(probability, 1 - probability),
    round: match.round || `${match.stage_name || "Scheduled series"} · ${String(match.series_format || "bo3").toUpperCase()}`,
  };
}

function matchKeyOf(match) {
  return [normalizeName(match.team1_name), normalizeName(match.team2_name), String(match.starts_at || match.stage_name || "")].join(":");
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

function dateAtOffset(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
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
  const oldest = dateAtOffset(-1).getTime();
  const newest = dateAtOffset(2).getTime() + 43_200_000;
  return [...merged.values()]
    .map(enrichMatch)
    .filter((match) => {
      const startsAt = new Date(match.starts_at || 0).getTime();
      return Number.isFinite(startsAt) && startsAt >= oldest && startsAt <= newest;
    })
    .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0) || matchSignalScore(b) - matchSignalScore(a));
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
  const ban1 = [...common].sort((a, b) => Number(profile1[a]?.matches || 0) - Number(profile1[b]?.matches || 0))[0];
  const ban2 = [...common].sort((a, b) => Number(profile2[a]?.matches || 0) - Number(profile2[b]?.matches || 0))[0];
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

function signalRow(label, team1Name, team2Name, team1Value, team2Value, formatValue) {
  const total = Math.max(0.0001, team1Value + team2Value);
  const share = Math.max(8, Math.min(92, (team1Value / total) * 100));
  return `
    <div class="series-signal">
      <div><span>${escapeHtml(team1Name)} ${escapeHtml(formatValue(team1Value))}</span><b>${escapeHtml(label)}</b><span>${escapeHtml(formatValue(team2Value))} ${escapeHtml(team2Name)}</span></div>
      <i><span style="width:${share}%"></span></i>
    </div>
  `;
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
  return `
    <div class="insight-status"><span class="status-token is-${matchStatusGroup(call)}">${escapeHtml(matchStatusGroup(call))}</span><span>${escapeHtml(call.series_format?.toUpperCase() || "BO3")} · ${escapeHtml(call.stage_name || "Scheduled series")}</span></div>
    <div class="insight-event">${escapeHtml(call.event_name || "CS2 circuit")}</div>
    <div class="insight-matchup">
      <div>${teamLogoHtml(call.team1_name)}<strong>${escapeHtml(call.team1_name)}</strong><b>${coverage === "limited" ? "--" : formatPercent(probability)}</b></div>
      <span>vs</span>
      <div>${teamLogoHtml(call.team2_name)}<strong>${escapeHtml(call.team2_name)}</strong><b>${coverage === "limited" ? "--" : formatPercent(1 - probability)}</b></div>
    </div>
    <div class="insight-call">
      <span>${coverage === "full" ? "Model edge" : coverage === "partial" ? "Low-data edge" : "Awaiting data"}</span>
      <strong>${coverage === "limited" ? "Pending team state" : `${escapeHtml(call.predicted_winner)} ${formatPercent(matchConfidence(call))}`}</strong>
    </div>
    <div class="series-signals">
      ${signalRow("Rating", call.team1_name, call.team2_name, rankScore1, rankScore2, (value) => Math.round(value).toString())}
      ${signalRow("Form", call.team1_name, call.team2_name, form1, form2, (value) => `${Math.round(value * 100)}%`)}
      ${signalRow("Map depth", call.team1_name, call.team2_name, depth1, depth2, (value) => `${Math.round(value * 100)}%`)}
    </div>
    <div class="veto-console">
      <div class="veto-console-head"><span>Veto desk</span><strong>${mapRead ? (mapRead.status === "known_veto" ? "Maps locked" : "Projected") : "Awaiting profiles"}</strong></div>
      ${mapRead ? `
        <div class="veto-map-strip">${mapRead.maps.map((map) => `<article><span>${escapeHtml(map.map_name)}</span><strong>${escapeHtml(map.predicted_winner)}</strong><b>${formatPercent(map.confidence)}</b></article>`).join("")}</div>
        <div class="ban-read">${Object.entries(mapRead.excluded_maps || {}).map(([teamName, maps]) => `<span>${escapeHtml(teamName)} ban · ${escapeHtml((maps || []).join(", "))}</span>`).join("")}</div>
      ` : `<div class="veto-empty"><i></i><span>Map probabilities unlock when both team profiles reach the feed.</span></div>`}
    </div>
  `;
}

function matchRowHtml(match) {
  const call = enrichMatch(match);
  const key = matchKeyOf(call);
  const probability = Number(call.prob_team1);
  const status = matchStatusGroup(call);
  const coverage = matchCoverage(call);
  const isSelected = key === selectedMatchKey;
  const timeLabel = status === "live" ? "LIVE" : call.starts_at ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(call.starts_at)) : "TBA";
  return `
    <button class="match-row ${isSelected ? "is-selected" : ""}" type="button" data-match-key="${escapeHtml(key)}" aria-pressed="${String(isSelected)}">
      <span class="match-time is-${status}">${escapeHtml(timeLabel)}<small>${escapeHtml(call.series_format?.toUpperCase() || "BO3")}</small></span>
      <span class="match-event"><strong>${escapeHtml(call.event_name || "CS2 circuit")}</strong><small>${escapeHtml(call.stage_name || "Scheduled series")}</small></span>
      <span class="match-row-teams">
        <span>${teamLogoHtml(call.team1_name)}<strong>${escapeHtml(call.team1_name)}</strong></span>
        <i>${coverage === "limited" ? "vs" : formatPercent(probability)}</i>
        <span><strong>${escapeHtml(call.team2_name)}</strong>${teamLogoHtml(call.team2_name)}</span>
      </span>
      <span class="match-row-call"><small>${coverage === "full" ? "model pick" : coverage === "partial" ? "low data" : "rating pending"}</small><strong>${coverage === "limited" ? "Open series" : escapeHtml(call.predicted_winner)}</strong></span>
      <span class="match-open" aria-hidden="true">↗</span>
    </button>
  `;
}

function renderMatchToolbar(matches) {
  if (!els.matchToolbar) return;
  const events = [...new Set(matches.map((match) => match.event_name).filter(Boolean))].sort();
  els.matchToolbar.innerHTML = `
    <div class="match-days" role="group" aria-label="Match day">
      ${[-1, 0, 1].map((offset) => {
        const date = dateAtOffset(offset);
        const label = offset === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
        return `<button type="button" class="${matchDayOffset === offset ? "is-active" : ""}" data-match-day="${offset}"><span>${label}</span><strong>${new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(date)}</strong></button>`;
      }).join("")}
    </div>
    <div class="match-status-filters" role="group" aria-label="Match status">
      ${["all", "live", "upcoming", "results"].map((filter) => `<button type="button" class="${currentMatchFilter === filter ? "is-active" : ""}" data-match-filter="${filter}">${filter === "all" ? "All series" : filter}</button>`).join("")}
    </div>
    <label class="match-event-select"><span>Event</span><select id="matchEventSelect"><option value="all">All events</option>${events.map((eventName) => `<option value="${escapeHtml(eventName)}" ${currentMatchEvent === eventName ? "selected" : ""}>${escapeHtml(eventName)}</option>`).join("")}</select></label>
  `;
  els.matchToolbar.querySelectorAll("[data-match-day]").forEach((button) => button.addEventListener("click", () => {
    matchDayOffset = Number(button.dataset.matchDay);
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
  const targetDate = localDateKey(dateAtOffset(matchDayOffset));
  const visible = rows.filter((match) => {
    const status = matchStatusGroup(match);
    const dateMatches = localDateKey(match.starts_at) === targetDate;
    const statusMatches = currentMatchFilter === "all" || status === currentMatchFilter;
    const eventMatches = currentMatchEvent === "all" || match.event_name === currentMatchEvent;
    return dateMatches && statusMatches && eventMatches;
  });
  if (!visible.length) {
    els.deciderGrid.innerHTML = `<div class="match-center-empty"><span>NO SERIES</span><h3>The selected desk is clear.</h3><p>Choose another date, status, or event.</p></div>`;
    return;
  }
  if (!selectedMatchKey || !visible.some((match) => matchKeyOf(match) === selectedMatchKey)) selectedMatchKey = matchKeyOf(visible[0]);
  const selected = visible.find((match) => matchKeyOf(match) === selectedMatchKey) || visible[0];
  els.deciderGrid.innerHTML = `
    <div class="match-list-pane">
      <header><span>${visible.length} series</span><strong>${escapeHtml(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(dateAtOffset(matchDayOffset)))}</strong></header>
      <div class="match-row-list">${visible.map(matchRowHtml).join("")}</div>
    </div>
    <aside class="match-insight" aria-live="polite">${matchInsightHtml(selected)}</aside>
  `;
  els.deciderGrid.querySelectorAll("[data-match-key]").forEach((button) => button.addEventListener("click", () => {
    selectedMatchKey = button.dataset.matchKey;
    renderDeciders(dailyMatchCalls());
  }));
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
              <div class="final-team ${team.status || "locked"}" style="--team-index:${teamIndex}" title="${escapeHtml(team.team_name)}" aria-label="${escapeHtml(team.team_name)}, ${escapeHtml(record)}">
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
  return [...merged.values()];
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
  const declaredStages = (event?.format?.stages || []).map((stage) => typeof stage === "string" ? stage : stage.name || stage.label).filter(Boolean);
  if (declaredStages.length) return declaredStages;
  if (type === "swiss") return ["Swiss", "Playoffs", "Final"];
  if (type === "gsl") return ["GSL groups", "Playoffs", "Final"];
  if (type === "single_elimination") {
    const fieldSize = Number(event?.participants?.length || event?.teams) || 8;
    const openingRound = fieldSize > 8 ? `Round of ${fieldSize}` : "Quarterfinals";
    return fieldSize > 16
      ? [openingRound, "Round of 16", "Quarterfinals", "Semifinals", "Final"]
      : fieldSize > 8
        ? [openingRound, "Quarterfinals", "Semifinals", "Final"]
        : [openingRound, "Semifinals", "Final"];
  }
  if (type === "double_elimination") return ["Opening round", "Upper bracket", "Lower bracket", "Grand final"];
  if (type === "round_robin") return ["League table", "Tiebreakers", "Playoffs"];
  return ["Opening stage", "Playoffs", "Final"];
}

function formatPathHtml(event) {
  return eventFormatStages(event).map((stage, index, stages) => `
    <span>${escapeHtml(stage)}</span>${index < stages.length - 1 ? "<i></i>" : ""}
  `).join("");
}

function syncMajorCopy(stage3, event = activeEvent()) {
  if (!eventHasMajorBoard(event)) {
    document.body.classList.remove("stage-complete");
    if (els.playoffTab) els.playoffTab.hidden = true;
    setText(els.eventPhaseLabel, "Live event intelligence");
    setText(els.projectionTitle, event ? "Tournament room." : "Choose an event.");
    setText(els.projectionIntro, event
      ? `${eventDateRange(event)} · ${event.location || "Location TBA"} · ${event.format?.label || "Format pending"}`
      : "Choose a covered event to open its forecast.");
    setText(els.boardStageTitle, event ? `${event.current_stage || (event.status === "upcoming" ? "Pre-event" : "Current stage")} forecast.` : "Choose a covered event.");
    setText(els.routeIntro, event
      ? `${event.participants?.length || 0} teams announced · ${activeEventCalls(event).length} published series`
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
          <span>${escapeHtml(event.status || "scheduled")} · ${escapeHtml(event.tier || "event")} · ${escapeHtml(event.event_type || "TBA")}</span>
          <h4>${escapeHtml(event.name)}</h4>
        </div>
        <div class="event-room-snapshot">
          <div><span>Dates</span><strong>${escapeHtml(eventDateRange(event))}</strong></div>
          <div><span>Location</span><strong>${escapeHtml(event.location || "TBA")}</strong></div>
          <div><span>Field</span><strong>${escapeHtml(`${event.teams || event.participants?.length || "TBA"} teams`)}</strong></div>
          <div><span>Favorite</span><strong>${favorite ? `${escapeHtml(favorite.team_name)} ${formatPercent(favorite.probability)}` : "Pending"}</strong></div>
        </div>
      </header>
      <nav class="event-room-tabs" aria-label="Tournament views">
        ${["overview", "matches", "format", "teams"].map((view) => {
          const matchCount = activeEventCalls(event).length;
          return `<button type="button" class="${activeEventView === view ? "is-active" : ""}" data-event-view="${view}"><span>${view}</span>${view === "matches" && matchCount ? `<b>${matchCount}</b>` : ""}</button>`;
        }).join("")}
      </nav>
      <div class="event-room-view" data-view="${escapeHtml(activeEventView)}">${eventViewHtml(event, activeEventView)}</div>
    </div>
  `;
  els.swissBoard.querySelectorAll("[data-event-view]").forEach((button) => button.addEventListener("click", () => {
    activeEventView = button.dataset.eventView || "overview";
    selectedEventMatchKey = null;
    renderGenericEventBoard(event);
  }));
  els.swissBoard.querySelectorAll("[data-event-view-jump]").forEach((button) => button.addEventListener("click", () => {
    activeEventView = button.dataset.eventViewJump || "overview";
    renderGenericEventBoard(event);
  }));
  els.swissBoard.querySelectorAll("[data-event-match]").forEach((button) => button.addEventListener("click", () => {
    selectedEventMatchKey = button.dataset.eventMatch;
    renderGenericEventBoard(event);
  }));
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
  if (view === "format") return eventFormatHtml(event);
  if (view === "teams") return eventTeamsHtml(event);
  return eventOverviewHtml(event);
}

function eventOverviewHtml(event) {
  const contenders = eventContenders(event);
  const matches = activeEventCalls(event);
  return `
    <div class="event-overview-grid">
      <section class="title-race">
        <header><span>Title race</span><strong>${escapeHtml(event.current_stage || (event.status === "upcoming" ? "Pre-event" : "In progress"))}</strong></header>
        <div class="contender-list">${contenders.map((row) => `
          <article class="contender-row" style="--share:${Math.max(16, Math.round(row.probability * 250))}%">
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
  const matches = published.length ? published : projectedEventMatches(event);
  if (!matches.length) return `<div class="event-view-empty"><span>BRACKET INTAKE</span><h4>Pairings are not published.</h4><p>The room is ready for the event feed.</p></div>`;
  if (!selectedEventMatchKey || !matches.some((match) => matchKeyOf(match) === selectedEventMatchKey)) selectedEventMatchKey = matchKeyOf(matches[0]);
  const selected = matches.find((match) => matchKeyOf(match) === selectedEventMatchKey) || matches[0];
  return `
    <div class="event-match-desk">
      <div class="event-match-list">
        <header><span>${published.length ? "Published schedule" : "Projected opening round"}</span><strong>${matches.length} series</strong></header>
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
  return `<span class="format-team" title="${escapeHtml(teamName)}">${teamLogoHtml(teamName)}<strong>${escapeHtml(teamName)}</strong>${extra}</span>`;
}

function miniFormatMatch(team1, team2) {
  const probability = pairProbability(team1, team2);
  const winner = probability >= 0.5 ? team1 : team2;
  return `<div class="format-mini-match"><span class="${winner === team1 ? "is-picked" : ""}">${teamLogoHtml(team1)}<strong>${escapeHtml(team1)}</strong><b>${formatPercent(probability)}</b></span><span class="${winner === team2 ? "is-picked" : ""}">${teamLogoHtml(team2)}<strong>${escapeHtml(team2)}</strong><b>${formatPercent(1 - probability)}</b></span></div>`;
}

function swissFormatHtml(event) {
  const teams = strengthSortedTeams(event);
  const settings = event.format?.settings || {};
  const winsToAdvance = Number(settings.wins_to_advance) || 3;
  const lossesToEliminate = Number(settings.losses_to_eliminate) || 3;
  const qualifyingTeams = Number(settings.qualifying_teams) || Math.max(2, Math.floor((teams.length || event.teams || 16) / 2));
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
  const stages = eventFormatStages(event);
  return `
    <div class="format-stage-head"><div><span>Event architecture</span><h4>${escapeHtml(event.format?.label || "Multi-stage tournament")}</h4></div><strong>${event.teams || event.participants?.length || "TBA"} teams</strong></div>
    <div class="mixed-stage-map" style="--stage-count:${stages.length}">${stages.map((stage, index) => `<article style="--stage:${index}"><span>0${index + 1}</span><strong>${escapeHtml(stage)}</strong><small>${index === stages.length - 1 ? "Title decided" : "Field narrows"}</small><i></i></article>`).join("")}</div>
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
        return `<article>${teamLogoHtml(teamName)}<div><strong>${escapeHtml(teamName)}</strong><span>${escapeHtml(row.entry || (rank ? `#${rank} VRS` : "Invited field"))}</span></div><b>${Number.isFinite(form) ? `${Math.round(form * 100)}%` : "--"}<small>form</small></b></article>`;
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
  const embedded = event.matches || [];
  const coverageMatches = (appData?.coverage?.daily_matches || []).filter((match) => match.event_id === event.id);
  const generated = (appData?.upcoming_predictions || []).filter((match) => {
    const matchKey = normalizeName(match.event_name || match.stage_name || "");
    return matchKey && (matchKey === eventKey || matchKey.includes(eventKey) || eventKey.includes(matchKey));
  });
  const merged = new Map();
  [...embedded, ...coverageMatches, ...generated].forEach((match) => {
    const key = [normalizeName(match.team1_name), normalizeName(match.team2_name)].sort().join(":");
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

function pairProbability(team1Name, team2Name) {
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
  let probability = 1 / (1 + Math.exp(-(eloLogit + 0.009 * rankAdvantage + 0.00035 * pointsDiff + 0.3 * recentDiff)));
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
  visibleEvents.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.tabIndex = 0;
    card.dataset.eventId = event.id || "";
    card.dataset.status = event.status || "upcoming";
    const range = eventDateRange(event);
    const date = eventDateParts(event);
    const teams = event.participants || [];
    const teamTotal = Number(event.teams) || teams.length;
    card.innerHTML = `
      <div class="event-date-block"><span>${escapeHtml(date.month)}</span><strong>${escapeHtml(date.day)}</strong><small>${escapeHtml(range)}</small></div>
      <div class="event-spine" aria-hidden="true"><i></i></div>
      <div class="event-card-main">
        <span>${escapeHtml(event.status || event.series || event.organizer || "Event")}</span>
        <h3>${escapeHtml(event.name || event.event_name || event.source_title || "Unnamed event")}</h3>
        <p>${escapeHtml(event.format?.label || "Organizer format pending")} · ${escapeHtml(event.location || "Location TBA")}</p>
      </div>
      <div class="event-team-stack">${teams.length
        ? `${teams.slice(0, 5).map((teamName) => teamLogoHtml(teamName)).join("")}<span>${teamTotal > 5 ? `+${teamTotal - 5}` : `${teamTotal} teams`}</span>`
        : `<span class="event-field-status">${teamTotal ? `${teamTotal} team field` : "Field pending"}</span>`}
      </div>
      <div class="event-card-meta"><strong>${escapeHtml(`${event.event_type || "TBA"} · ${event.tier || event.event_tier || "TBA"}`)}</strong><span>${escapeHtml(event.current_stage || (event.status === "upcoming" ? "Starts soon" : "In progress"))}</span></div>
      <button class="event-open" type="button" data-event-open="${escapeHtml(event.id || "")}" aria-label="Open ${escapeHtml(event.name || "event")}">↗</button>
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
        <span class="ranking-team">${teamLogoHtml(row.team_name)}<strong>${escapeHtml(row.team_name)}</strong><small>${escapeHtml(row.players?.join(" · ") || "Roster pending")}</small></span>
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

function compactStageName(value, fallback) {
  const match = String(value || "").match(/Stage\s+\d+/i);
  return match?.[0] || fallback;
}

function teamIdentity(teamName) {
  return `
    <div class="team-identity">
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
  const generatedAt = new Date(data.generated_at_utc);
  const ageHours = Number.isNaN(generatedAt.getTime()) ? Infinity : (Date.now() - generatedAt.getTime()) / 3600000;
  const isFresh = ageHours <= 12;

  setText(els.modelPre, formatPercent(data.model?.best_pre_match?.accuracy));
  setText(els.modelPost, formatPercent(data.model?.best_post_veto?.accuracy));
  setText(els.freshnessLabel, `Coverage ${data.coverage?.last_verified_utc ? formatDate(data.coverage.last_verified_utc) : formatDate(data.generated_at_utc)}`);
  setText(els.slateCount, `${dailyMatchCalls().length} series loaded`);
  setText(els.rankingSnapshot, `VRS · ${data.coverage?.vrs?.as_of ? dateOnlyFormatter.format(new Date(`${data.coverage.vrs.as_of}T12:00:00`)) : "pending"}`);
  setText(els.selectedEventName, event?.name || "Event desk");
  setText(els.selectedEventMeta, `${eventDateRange(event)} · ${event?.format?.label || "Organizer format pending"}`);
  document.body.classList.toggle("snapshot-stale", !isFresh);
}

function renderProjection(data) {
  appData = data;
  coverage = data.coverage || null;
  const events = availableEvents(data);
  activeEventId = activeEventId || data.coverage?.default_event_id || events.find((event) => event.status === "ongoing")?.id || events[0]?.id || null;
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
    if (existing) Object.assign(existing, normalized);
    else appData.coverage.events.push(normalized);
  });
  return events.length > 0;
}

function applyLiveSnapshot(live) {
  if (!live?.ok || !appData) return false;
  let changed = mergeLiveEvents(live.events);
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
    updateSummary(data);
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
    fallback.dataset.label = abbrev(target.dataset.team || target.title || "Team");
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
