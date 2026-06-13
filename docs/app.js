const DATA_URL = "./data/predictions.json";

const els = {
  freshnessLabel: document.querySelector("#freshnessLabel"),
  swissBoard: document.querySelector("#swissBoard"),
  playoffPanel: document.querySelector("#playoffPanel"),
  pickemChance: document.querySelector("#pickemChance"),
  pickemSummary: document.querySelector("#pickemSummary"),
  resetPicks: document.querySelector("#resetPicks"),
  boardStageTitle: document.querySelector("#boardStageTitle"),
  currentStageTab: document.querySelector("#currentStageTab"),
  boardJumpButtons: document.querySelectorAll("[data-board-jump]"),
  eventsGrid: document.querySelector("#eventsGrid"),
  deciderGrid: document.querySelector("#deciderGrid"),
  modelPre: document.querySelector("#modelPre"),
  modelPost: document.querySelector("#modelPost"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
};

let teamAssets = {};
let appData = null;
let currentBoardView = "stage3";
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

function renderDeciders(matches) {
  els.deciderGrid.innerHTML = "";
  matches.forEach((match, index) => {
    const confidence = matchConfidence(match);
    const rawTeam1Probability = Number(match.prob_team1);
    const team1Probability = Number.isFinite(rawTeam1Probability)
      ? Math.max(0, Math.min(1, rawTeam1Probability))
      : 0.5;
    const team2Probability = 1 - team1Probability;
    const mapRead = match.map_read;
    const hasKnownMaps = mapRead?.maps?.some((map) => normalizeName(map.map_name) !== "tba");
    const adjustedProbability = Number(mapRead?.map_adjusted_prob_team1);
    const adjustedConfidence = Number(mapRead?.map_adjusted_confidence);
    const card = document.createElement("article");
    const favoredSide = match.predicted_winner === match.team1_name ? "favorite-team-one" : "favorite-team-two";
    card.className = `match-card is-clickable ${favoredSide}`;
    card.tabIndex = 0;
    card.style.setProperty("--card-index", String(index));
    card.innerHTML = `
      <div class="match-card-top">
        <span>${escapeHtml(match.round || match.stage_name || match.event_name || "Upcoming series")}</span>
        <strong>${escapeHtml(match.starts_at ? formatDate(match.starts_at) : match.status || "Scheduled")}</strong>
      </div>
      <div class="match-teams">
        <div class="match-side ${match.predicted_winner === match.team1_name ? "is-favored" : ""}">
          ${teamIdentity(match.team1_name)}
          <strong class="team-probability">${formatPercent(team1Probability)}</strong>
        </div>
        <span class="versus-mark">vs</span>
        <div class="match-side ${match.predicted_winner === match.team2_name ? "is-favored" : ""}">
          ${teamIdentity(match.team2_name)}
          <strong class="team-probability">${formatPercent(team2Probability)}</strong>
        </div>
      </div>
      <div class="probability-track" aria-label="${escapeHtml(match.team1_name)} ${formatPercent(team1Probability)}, ${escapeHtml(match.team2_name)} ${formatPercent(team2Probability)}">
        <div class="probability-split">
          <span class="team-one ${match.predicted_winner === match.team1_name ? "is-favored" : ""}" style="width:${Math.round(team1Probability * 100)}%"></span>
          <span class="team-two ${match.predicted_winner === match.team2_name ? "is-favored" : ""}" style="width:${Math.round(team2Probability * 100)}%"></span>
        </div>
      </div>
      <div class="prediction-call">
        <span>Model pick</span>
        <strong>${escapeHtml(match.predicted_winner)}</strong>
        <small>${formatPercent(confidence)} before veto</small>
      </div>
      ${
        mapRead?.maps?.length
          ? `<div class="pick-line map-adjusted-line">
              <span>${mapRead.status === "known_veto" && hasKnownMaps ? "Post-veto" : "Projected maps"}</span>
              <strong>${escapeHtml(mapRead.map_adjusted_predicted_winner)} / ${formatPercent(adjustedConfidence)}</strong>
            </div>
            <button class="map-toggle" type="button" aria-expanded="false">Show map outlook</button>
            <div class="map-outlook" hidden>
              <div class="map-outlook-head">
                <span>${escapeHtml(mapRead.status?.replaceAll("_", " ") || "map read")}</span>
                <strong>${escapeHtml(match.team1_name)} ${formatPercent(adjustedProbability)}</strong>
              </div>
              <div class="map-list">
                ${mapRead.maps.map((map) => mapRow(map, match)).join("")}
              </div>
              <p>${escapeHtml(mapRead.note || "Map read updates when veto data is available.")}</p>
            </div>`
          : `<p class="map-unavailable">${escapeHtml(mapRead?.note || "Map outlook is not available for this matchup yet.")}</p>`
      }
    `;
    card.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button && !button.classList.contains("map-toggle")) return;
      toggleMapOutlook(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleMapOutlook(card);
    });
    els.deciderGrid.append(card);
  });
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

function toggleMapOutlook(card) {
  const panel = card.querySelector(".map-outlook");
  const button = card.querySelector(".map-toggle");
  if (!panel || !button) return;
  const isOpening = panel.hidden;
  panel.hidden = !isOpening;
  button.setAttribute("aria-expanded", String(isOpening));
  button.textContent = isOpening ? "Hide map outlook" : "Show map outlook";
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

function jumpMajorBoard(target) {
  currentBoardView = target || "stage3";
  els.boardJumpButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.boardJump === currentBoardView);
  });
  renderDynamicMajor();
  const activePanel = currentBoardView === "playoffs" ? els.playoffPanel : els.swissBoard;
  activePanel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderDynamicMajor() {
  if (!appData?.major_projection) return;

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
  const playoff = simulatePlayoffs(stage3.final_records);
  updatePickemMeter(stage3);
  renderDeciders(activeMajorCalls());

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

  const finalRecords = Object.entries(records)
    .map(([teamName, record]) => ({
      team_name: teamName,
      seed: seeds[teamName],
      record: `${record[0]}-${record[1]}`,
      wins: record[0],
      losses: record[1],
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.seed - b.seed);

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
  const pairs = [[0, 7], [3, 4], [1, 6], [2, 5]]
    .map(([a, b]) => [topEight[a], topEight[b]])
    .filter(([a, b]) => a && b);
  const quarters = pairs.map(([a, b]) => playoffMatch(a.team_name, b.team_name, "Quarterfinal"));
  const semis = [
    playoffMatch(quarters[0]?.winner_name, quarters[1]?.winner_name, "Semifinal"),
    playoffMatch(quarters[2]?.winner_name, quarters[3]?.winner_name, "Semifinal"),
  ].filter((match) => match.team1_name && match.team2_name);
  const final = semis.length === 2 ? [playoffMatch(semis[0].winner_name, semis[1].winner_name, "Grand final")] : [];
  return { topEight, rounds: [{ label: "Quarterfinals", matches: quarters }, { label: "Semifinals", matches: semis }, { label: "Grand final", matches: final }] };
}

function playoffMatch(team1Name, team2Name, round) {
  const pick = matchPick(team1Name, team2Name, makeOverrideKey("playoff", round, team1Name, team2Name));
  return {
    round,
    team1_name: team1Name,
    team2_name: team2Name,
    winner_name: pick.pickedWinner,
    confidence: roundProb(pick.confidence),
    prob_team1: roundProb(pick.probability),
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
              <div class="score-chip">${formatPercent(match.confidence)}</div>
              ${teamRow(match.team2_name, match.winner_name === match.team2_name, "projected")}
            </article>
          `).join("")}
        </section>
      `).join("")}
    </div>
  `;
}

function updatePickemMeter(stage3) {
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
  events.forEach((event) => {
    const url = event.hltv_url || event.event_url || event.source_url;
    const card = document.createElement(url ? "a" : "article");
    card.className = "event-card";
    if (url) {
      card.href = url;
      card.target = "_blank";
      card.rel = "noreferrer";
    }
    const range = event.start_date === event.end_date ? event.start_date : `${event.start_date} - ${event.end_date}`;
    card.innerHTML = `
      <div>
        <span>${escapeHtml(event.series || event.organizer || "Event")}</span>
        <h3>${escapeHtml(event.event_name || event.source_title || "Unnamed event")}</h3>
      </div>
      <dl>
        <div><dt>Date</dt><dd>${escapeHtml(range || "TBA")}</dd></div>
        <div><dt>Type</dt><dd>${escapeHtml(event.event_type || "Unknown")}</dd></div>
        <div><dt>Tier</dt><dd>${escapeHtml(event.publisher_tier || event.event_tier || "TBA")}</dd></div>
      </dl>
    `;
    els.eventsGrid.append(card);
  });
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
  fallback.setAttribute("aria-hidden", "true");
  if (!asset?.logo_url) return fallback;

  const image = document.createElement("img");
  image.className = "team-logo";
  image.src = asset.logo_url;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => image.replaceWith(fallback));
  return image;
}

function teamLogoHtml(teamName) {
  const asset = teamAssets[normalizeName(teamName)];
  if (!asset?.logo_url) {
    return '<span class="team-logo-fallback" aria-hidden="true"></span>';
  }
  return `<img class="team-logo" src="${escapeHtml(asset.logo_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function normalizeName(teamName) {
  return String(teamName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function updateSummary(data) {
  const projection = data.major_projection;
  const currentStage = compactStageName(projection.current_stage_board?.stage, "Current stage");
  const generatedAt = new Date(data.generated_at_utc);
  const ageHours = Number.isNaN(generatedAt.getTime()) ? Infinity : (Date.now() - generatedAt.getTime()) / 3600000;
  const isFresh = ageHours <= 12;

  setText(els.modelPre, formatPercent(data.model?.best_pre_match?.accuracy));
  setText(els.modelPost, formatPercent(data.model?.best_post_veto?.accuracy));
  setText(els.freshnessLabel, `Updated ${formatDate(data.generated_at_utc)}`);
  setText(els.boardStageTitle, `${currentStage} live state and projected route.`);
  setText(els.currentStageTab, currentStage);
  document.body.classList.toggle("snapshot-stale", !isFresh);
}

function renderProjection(data) {
  appData = data;
  buildTeamLookupMap();
  renderEvents(data.event_coverage || []);
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

function applyLiveMajorSnapshot(live) {
  if (!live?.ok || !Array.isArray(live.matches) || !appData?.major_projection?.current_stage_board) return false;
  let changed = false;
  const boardMatches = (appData.major_projection.current_stage_board.rounds || [])
    .flatMap((round) => (round.groups || []).flatMap((group) => group.matches || []));
  for (const liveMatch of live.matches) {
    const boardMatch = boardMatches.find((match) => sameMatch(match, liveMatch.team1, liveMatch.team2));
    if (!boardMatch) continue;
    const score1 = Number(liveMatch.score1);
    const score2 = Number(liveMatch.score2);
    const hasScore = Number.isFinite(score1) && Number.isFinite(score2);
    const finished = liveMatchIsFinished(liveMatch);
    if (hasScore) boardMatch.score_label = `${score1}:${score2}`;
    if (finished && liveMatch.winner) {
      boardMatch.status = "locked";
      boardMatch.winner_name = liveMatch.winner;
    } else if (/live|playing|in.progress/.test(String(liveMatch.status || "").toLowerCase())) {
      boardMatch.status = "live";
    }
    const upcoming = (appData.upcoming_predictions || []).find((match) => sameMatch(match, liveMatch.team1, liveMatch.team2));
    if (upcoming) {
      upcoming.status = finished ? "locked" : boardMatch.status;
      if (hasScore) upcoming.score_label = `${score1}:${score2}`;
      const liveMapRead = knownVetoMapRead(upcoming, liveMatch.maps);
      if (liveMapRead) upcoming.map_read = liveMapRead;
    } else if (liveMatch.maps?.length) {
      const liveMapRead = knownVetoMapRead({
        team1_name: boardMatch.team1_name,
        team2_name: boardMatch.team2_name,
        prob_team1: pairProbability(boardMatch.team1_name, boardMatch.team2_name),
      }, liveMatch.maps);
      if (liveMapRead) boardMatch.map_read = liveMapRead;
    }
    changed = true;
  }
  if (changed) {
    setText(els.freshnessLabel, `Live scores checked ${formatDate(live.fetched_at_utc)}`);
    renderDynamicMajor();
  }
  return changed;
}

async function refreshLiveMajor() {
  if (refreshLiveMajor.pending) return;
  refreshLiveMajor.pending = true;
  try {
    const response = await fetch("/api/live-major", { cache: "no-store" });
    if (!response.ok) return;
    applyLiveMajorSnapshot(await response.json());
  } catch {
    // The bundled snapshot remains the safe fallback when the live source is unavailable.
  } finally {
    refreshLiveMajor.pending = false;
  }
}

function startLiveMajorUpdater() {
  const refreshWhenVisible = () => {
    if (!document.hidden) refreshLiveMajor();
  };
  refreshWhenVisible();
  const intervalId = window.setInterval(refreshWhenVisible, 60_000);
  document.addEventListener("visibilitychange", refreshWhenVisible);
  window.addEventListener("pagehide", () => window.clearInterval(intervalId), { once: true });
}

async function boot() {
  try {
    const data = window.location.protocol === "file:"
      ? window.__STRIKESIGNAL_DATA__
      : await fetchPredictionData();
    if (!data.major_projection) throw new Error("Major projection is missing from the snapshot.");
    teamAssets = data.team_assets || {};
    updateSummary(data);
    renderProjection(data);
    if (window.location.protocol !== "file:") startLiveMajorUpdater();
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
    fallback.setAttribute("aria-hidden", "true");
    target.replaceWith(fallback);
  },
  true,
);

els.boardJumpButtons.forEach((button) => {
  button.addEventListener("click", () => jumpMajorBoard(button.dataset.boardJump || "stage3"));
});

els.resetPicks?.addEventListener("click", () => {
  pickOverrides.clear();
  renderDynamicMajor();
});

async function fetchPredictionData() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Prediction snapshot failed with ${response.status}`);
  return response.json();
}

boot();
