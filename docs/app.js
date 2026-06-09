const DATA_URL = "./data/predictions.json";
const LIVE_DATA_URL = "/api/predictions";

const els = {
  freshnessLabel: document.querySelector("#freshnessLabel"),
  heroThreeZero: document.querySelector("#heroThreeZero"),
  heroZeroThree: document.querySelector("#heroZeroThree"),
  preAccuracy: document.querySelector("#preAccuracy"),
  postAccuracy: document.querySelector("#postAccuracy"),
  eventMode: document.querySelector("#eventMode"),
  readoutMode: document.querySelector("#readoutMode"),
  threeZeroList: document.querySelector("#threeZeroList"),
  advanceList: document.querySelector("#advanceList"),
  zeroThreeList: document.querySelector("#zeroThreeList"),
  swissBoard: document.querySelector("#swissBoard"),
  playoffPanel: document.querySelector("#playoffPanel"),
  pickemChance: document.querySelector("#pickemChance"),
  pickemSummary: document.querySelector("#pickemSummary"),
  resetPicks: document.querySelector("#resetPicks"),
  boardJumpButtons: document.querySelectorAll("[data-board-jump]"),
  eventsGrid: document.querySelector("#eventsGrid"),
  deciderGrid: document.querySelector("#deciderGrid"),
  modelPre: document.querySelector("#modelPre"),
  modelPost: document.querySelector("#modelPost"),
  generatedAt: document.querySelector("#generatedAt"),
  updaterStatus: document.querySelector("#updaterStatus"),
  projectionMode: document.querySelector("#projectionMode"),
  teamPillTemplate: document.querySelector("#teamPillTemplate"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
};

let teamAssets = {};
let appData = null;
let currentBoardView = "stage2";
const pickOverrides = new Map();

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

function names(rows) {
  return rows.map((row) => row.team_name).join(", ");
}

function teamPill(row, variant = "") {
  const node = els.teamPillTemplate.content.firstElementChild.cloneNode(true);
  if (variant) node.classList.add(variant);
  node.querySelector(".team-logo-slot").append(teamLogo(row.team_name));
  node.querySelector("span").textContent = `#${row.seed} · ${row.record}`;
  node.querySelector("strong").textContent = row.team_name;
  return node;
}

function renderBucket(target, rows, variant = "") {
  target.innerHTML = "";
  if (!rows.length) {
    target.append(emptyNode("No teams in this bucket.", "The projection did not return this outcome."));
    return;
  }
  rows.forEach((row) => target.append(teamPill(row, variant)));
}

function matchConfidence(match) {
  const probability = Number(match.prob_team1);
  const winnerProbability = match.predicted_winner === match.team1_name ? probability : 1 - probability;
  return Math.max(0, Math.min(1, winnerProbability));
}

function renderDeciders(matches) {
  els.deciderGrid.innerHTML = "";
  matches.forEach((match) => {
    const confidence = matchConfidence(match);
    const mapRead = match.map_read;
    const adjustedProbability = Number(mapRead?.map_adjusted_prob_team1);
    const adjustedConfidence = Number(mapRead?.map_adjusted_confidence);
    const card = document.createElement("article");
    card.className = "match-card is-clickable";
    card.tabIndex = 0;
    card.style.setProperty("--confidence", `${Math.round(confidence * 100)}%`);
    card.innerHTML = `
      <div class="match-card-top">
        <span>Projected seed #${escapeHtml(match.seed)}</span>
        <strong>${escapeHtml(formatDate(match.starts_at))}</strong>
      </div>
      <div class="match-teams">
        ${teamIdentity(match.team1_name)}
        <span>vs</span>
        ${teamIdentity(match.team2_name)}
      </div>
      <div class="confidence-bar"><span></span></div>
      <div class="pick-line">
        <span>Model pick</span>
        <strong>${escapeHtml(match.predicted_winner)} · ${formatPercent(confidence)}</strong>
      </div>
      <div class="pick-controls" aria-label="Override winner">
        <button type="button" data-stage2-pick="${escapeHtml(match.team1_name)}">${escapeHtml(match.team1_name)}</button>
        <button type="button" data-stage2-pick="${escapeHtml(match.team2_name)}">${escapeHtml(match.team2_name)}</button>
      </div>
      ${
        mapRead?.maps?.length
          ? `<div class="pick-line map-adjusted-line">
              <span>${mapRead.status === "known_veto" ? "Post-veto" : "Projected maps"}</span>
              <strong>${escapeHtml(mapRead.map_adjusted_predicted_winner)} · ${formatPercent(adjustedConfidence)}</strong>
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
      if (event.target.closest("button")) return;
      toggleMapOutlook(card);
    });
    card.querySelectorAll("[data-stage2-pick]").forEach((button) => {
      button.addEventListener("click", () => {
        pickOverrides.set(`stage2:${match.seed}`, button.dataset.stage2Pick);
        renderDynamicMajor();
      });
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
  column.className = "swiss-column";
  column.innerHTML = `<h4>Round ${round.round}</h4>`;
  (round.groups || []).forEach((group) => {
    if (!group.matches?.length) return;
    const groupNode = document.createElement("section");
    groupNode.className = "record-group";
    groupNode.innerHTML = `<h5>${escapeHtml(group.record)}</h5>`;
    group.matches.forEach((match) => groupNode.append(swissMatch(match)));
    column.append(groupNode);
  });
  return column;
}

function swissMatch(match) {
  const node = document.createElement("article");
  const isInteractive = Boolean(match.pick_key && match.status !== "locked");
  node.className = `swiss-match ${match.status || "projected"}${isInteractive ? " is-pickable" : ""}`;
  const team1Wins = match.winner_name === match.team1_name;
  const team2Wins = match.winner_name === match.team2_name;
  node.innerHTML = `
    ${teamRow(match.team1_name, team1Wins, match.status, match.pick_key)}
    <div class="score-chip">${escapeHtml(match.score_label || "vs")}</div>
    ${teamRow(match.team2_name, team2Wins, match.status, match.pick_key)}
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
    ? ` type="button" data-pick-team="${escapeHtml(teamName)}" title="Pick ${escapeHtml(teamName)}"`
    : "";
  return `
    <${tag} class="team-row ${resultClass} ${escapeHtml(status || "projected")}"${attrs}>
      ${teamLogoHtml(teamName)}
      <strong>${escapeHtml(teamName)}</strong>
    </${tag}>
  `;
}

function finalColumn(groups) {
  const column = document.createElement("article");
  column.className = "swiss-column final-column";
  column.id = "majorPlayoffPicture";
  column.innerHTML = "<h4>Final</h4>";
  groups.forEach((group) => {
    if (!group.teams?.length) return;
    const groupNode = document.createElement("section");
    groupNode.className = "record-group final-group";
    groupNode.innerHTML = `<h5>${escapeHtml(group.record)}</h5>`;
    group.teams.forEach((team) => {
      const row = document.createElement("div");
      row.className = `final-team ${team.status || "locked"}`;
      row.innerHTML = `
        ${teamLogoHtml(team.team_name)}
        <strong>${escapeHtml(team.team_name)}</strong>
        <em>${team.status === "projected" ? "projected" : "locked"}</em>
      `;
      groupNode.append(row);
    });
    column.append(groupNode);
  });
  return column;
}

function jumpMajorBoard(target) {
  currentBoardView = target || "stage2";
  els.boardJumpButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.boardJump === currentBoardView);
  });
  renderDynamicMajor();
  els.swissBoard?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderDynamicMajor() {
  if (!appData?.major_projection) return;
  const stage3 = simulateStage3();
  const playoff = simulatePlayoffs(stage3.final_records);
  renderBucket(els.threeZeroList, stage3.buckets.three_zero, "success");
  renderBucket(els.advanceList, stage3.buckets.advance, "advance");
  renderBucket(els.zeroThreeList, stage3.buckets.zero_three, "danger");
  updatePickemMeter(stage3, playoff);

  if (currentBoardView === "playoffs") {
    els.swissBoard.hidden = true;
    els.playoffPanel.hidden = false;
    renderPlayoffPanel(playoff);
    return;
  }

  els.playoffPanel.hidden = true;
  els.swissBoard.hidden = false;
  if (currentBoardView === "stage3") {
    renderSwissBoard(stage3Board(stage3));
  } else {
    renderSwissBoard(stage2BoardWithOverrides());
  }
}

function teamModel(teamName) {
  const teams = appData?.model_state?.teams || [];
  const key = normalizeName(teamName);
  return teams.find((team) => normalizeName(team.team_name) === key || normalizeName(team.team_key) === key) || {
    elo: 1500,
    recent_win_rate_10: 0.5,
    vrs_points: 1200,
    vrs_rank: 80,
  };
}

function pairProbability(team1Name, team2Name) {
  const team1 = teamModel(team1Name);
  const team2 = teamModel(team2Name);
  const eloProbability = 1 / (1 + Math.pow(10, -((Number(team1.elo) - Number(team2.elo)) / 400)));
  const eloLogit = Math.log(Math.max(1e-6, Math.min(1 - 1e-6, eloProbability)) / Math.max(1e-6, 1 - eloProbability));
  const rankAdvantage = (Number(team2.vrs_rank) || 400) - (Number(team1.vrs_rank) || 400);
  const pointsDiff = (Number(team1.vrs_points) || 0) - (Number(team2.vrs_points) || 0);
  const recentDiff = (Number(team1.recent_win_rate_10) || 0.5) - (Number(team2.recent_win_rate_10) || 0.5);
  return 1 / (1 + Math.exp(-(eloLogit + 0.0115 * rankAdvantage + 0.00045 * pointsDiff + 0.35 * recentDiff)));
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

function stage2DeciderPick(match) {
  return matchPick(match.team1_name, match.team2_name, `stage2:${match.seed}`);
}

function stage2BoardWithOverrides() {
  const source = appData.major_projection.current_stage_board || { rounds: [], final_groups: [] };
  const board = JSON.parse(JSON.stringify(source));
  board.stage = "IEM Cologne Major 2026 Stage 2";
  board.rounds.forEach((round) => {
    round.groups.forEach((group) => {
      group.matches.forEach((match) => {
        if (match.status === "locked") return;
        const decider = (appData.major_projection.stage2_deciders || []).find(
          (row) => row.team1_name === match.team1_name && row.team2_name === match.team2_name,
        );
        const pick = decider ? stage2DeciderPick(decider) : matchPick(match.team1_name, match.team2_name, `stage2:${match.team1_name}:${match.team2_name}`);
        match.pick_key = pick.key;
        match.winner_name = pick.pickedWinner;
        match.status = pick.status;
        match.score_label = pick.status === "override" ? "pick" : `${Math.round(pick.confidence * 100)}%`;
      });
    });
  });
  board.final_groups = finalGroupsFromBoard(board, new Set((appData.major_projection.stage2_deciders || []).flatMap((row) => [row.team1_name, row.team2_name])));
  return board;
}

function finalGroupsFromBoard(board, projectedTeams) {
  const records = {};
  board.rounds.forEach((round) => {
    round.groups.forEach((group) => {
      group.matches.forEach((match) => {
        records[match.team1_name] ||= [0, 0];
        records[match.team2_name] ||= [0, 0];
        const winner = match.winner_name;
        const loser = winner === match.team1_name ? match.team2_name : match.team1_name;
        records[winner][0] += 1;
        records[loser][1] += 1;
      });
    });
  });
  return ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"].map((record) => ({
    record,
    teams: Object.entries(records)
      .filter(([, value]) => `${value[0]}-${value[1]}` === record)
      .map(([teamName]) => ({
        team_name: teamName,
        record,
        status: projectedTeams.has(teamName) ? "projected" : "locked",
      }))
      .sort((a, b) => a.team_name.localeCompare(b.team_name)),
  }));
}

function stage3Seeds() {
  const locked = (appData.major_projection.seed_rows || []).filter((row) => row.slot_status === "locked");
  const deciderSeeds = (appData.major_projection.stage2_deciders || []).map((match) => {
    const pick = stage2DeciderPick(match);
    return {
      seed: match.seed,
      team_name: pick.pickedWinner,
      slot_status: pick.status === "override" ? "override_from_stage2" : "projected_from_stage2",
    };
  });
  return [...locked, ...deciderSeeds].sort((a, b) => Number(a.seed) - Number(b.seed));
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
    const matches = [];
    for (const [team1, team2] of pairings) {
      const key = `stage3:${roundNumber}:${normalizeName(team1)}:${normalizeName(team2)}`;
      const pick = matchPick(team1, team2, key);
      const loser = pick.pickedWinner === team1 ? team2 : team1;
      records[pick.pickedWinner][0] += 1;
      records[loser][1] += 1;
      played[team1].add(team2);
      played[team2].add(team1);
      pathProbabilities.push(pick.pickedProbability);
      matches.push({
        pick_key: key,
        round: `Swiss round ${roundNumber}`,
        team1_name: team1,
        team2_name: team2,
        prob_team1: roundProb(pick.probability),
        confidence: roundProb(pick.confidence),
        predicted_winner: pick.modelWinner,
        winner_name: pick.pickedWinner,
        score_label: pick.status === "override" ? "pick" : `${Math.round(pick.confidence * 100)}%`,
        status: pick.status,
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
  const pick = matchPick(team1Name, team2Name, `playoff:${round}:${normalizeName(team1Name)}:${normalizeName(team2Name)}`);
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

function updatePickemMeter(stage3, playoff) {
  const overrides = pickOverrides.size;
  const chance = stage3.path_probability;
  setText(els.pickemChance, formatPercent(chance));
  setText(
    els.pickemSummary,
    overrides
      ? `${overrides} custom pick${overrides === 1 ? "" : "s"} applied. Stage 3 and playoffs are recalculated from your path.`
      : `Most likely model Pick'Em: ${names(stage3.buckets.three_zero)} 3-0, ${names(stage3.buckets.zero_three)} 0-3, ${playoff.rounds.at(-1)?.matches?.[0]?.winner_name || "TBD"} title lean.`,
  );
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
    els.eventsGrid.append(emptyNode("No event coverage queued.", "The updater will populate events when schedules arrive."));
    return;
  }
  events.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";
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
  image.addEventListener("error", () => image.replaceWith(fallback));
  return image;
}

function teamLogoHtml(teamName) {
  const asset = teamAssets[normalizeName(teamName)];
  if (!asset?.logo_url) {
    return '<span class="team-logo-fallback" aria-hidden="true"></span>';
  }
  return `<img class="team-logo" src="${escapeHtml(asset.logo_url)}" alt="" loading="lazy" decoding="async">`;
}

function normalizeName(teamName) {
  return String(teamName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function updateSummary(data) {
  const projection = data.major_projection;
  const threeZero = projection.buckets.three_zero || [];
  const zeroThree = projection.buckets.zero_three || [];

  setText(els.heroThreeZero, names(threeZero) || "--");
  setText(els.heroZeroThree, names(zeroThree) || "--");
  setText(els.preAccuracy, formatPercent(data.model?.best_pre_match?.accuracy));
  setText(els.postAccuracy, formatPercent(data.model?.best_post_veto?.accuracy));
  setText(els.modelPre, formatPercent(data.model?.best_pre_match?.accuracy));
  setText(els.modelPost, formatPercent(data.model?.best_post_veto?.accuracy));
  setText(els.eventMode, "Swiss");
  setText(els.readoutMode, projection.stage2_deciders?.length ? "Live" : "Ready");
  setText(els.generatedAt, formatDate(data.generated_at_utc));
  setText(els.updaterStatus, data.updater?.status?.replaceAll("_", " ") || "unknown");
  setText(els.freshnessLabel, `Generated ${formatDate(data.generated_at_utc)}`);
  setText(els.projectionMode, projection.format || "Stage 3 Swiss simulation");
}

function renderProjection(data) {
  appData = data;
  const projection = data.major_projection;
  renderEvents(data.event_coverage || []);
  renderDynamicMajor();
  renderDeciders(projection.stage2_deciders || []);
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

async function boot() {
  try {
    const data = window.location.protocol === "file:"
      ? window.__STRIKESIGNAL_DATA__
      : await fetchPredictionData();
    if (!data.major_projection) throw new Error("Major projection is missing from the snapshot.");
    teamAssets = data.team_assets || {};
    updateSummary(data);
    renderProjection(data);
  } catch (error) {
    document.body.classList.add("data-error");
    setText(els.freshnessLabel, "Projection failed to load");
    els.threeZeroList.append(emptyNode("Projection unavailable.", error.message));
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
  button.addEventListener("click", () => jumpMajorBoard(button.dataset.boardJump || "stage2"));
});

els.resetPicks?.addEventListener("click", () => {
  pickOverrides.clear();
  renderDynamicMajor();
});

async function fetchPredictionData() {
  if (window.location.protocol !== "file:" && window.location.hostname !== "localhost") {
    try {
      const liveResponse = await fetch(LIVE_DATA_URL, { cache: "no-store" });
      if (liveResponse.ok) return liveResponse.json();
    } catch (error) {
      console.warn("Live prediction endpoint unavailable; using bundled snapshot.", error);
    }
  }
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Prediction snapshot failed with ${response.status}`);
  return response.json();
}

boot();
