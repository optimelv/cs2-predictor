export function vetoTeamKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function vetoRules(bestOf, team1, team2, firstTeam = team1) {
  const format = Number(bestOf) === 1 ? 1 : Number(bestOf) === 5 ? 5 : 3;
  const first = firstTeam === team2 ? team2 : team1;
  const second = first === team1 ? team2 : team1;
  const sequences = {
    1: [[first, "ban"], [second, "ban"], [first, "ban"], [second, "ban"], [first, "ban"], [second, "ban"], ["system", "decider"]],
    3: [[first, "ban"], [second, "ban"], [first, "pick"], [second, "pick"], [first, "ban"], [second, "ban"], ["system", "decider"]],
    5: [[first, "ban"], [second, "ban"], [first, "pick"], [second, "pick"], [first, "pick"], [second, "pick"], ["system", "decider"]],
  };
  return sequences[format].map(([actor, action], index) => ({ index, actor, action }));
}

function settleForcedStep(state) {
  const next = state.steps[state.actions.length];
  if (next?.action !== "decider" || state.available.length !== 1) return state;
  const mapName = state.available[0];
  return {
    ...state,
    actions: [...state.actions, { ...next, map_name: mapName, automatic: true }],
    available: [],
    complete: true,
  };
}

export function createVetoState({ pool, team1, team2, bestOf = 3, firstTeam = team1 }) {
  const maps = [...new Set((pool || []).filter(Boolean))];
  if (maps.length < 7) throw new Error("A standard CS2 veto requires a seven-map pool.");
  return settleForcedStep({
    pool: maps,
    team1,
    team2,
    firstTeam: firstTeam === team2 ? team2 : team1,
    bestOf: Number(bestOf) === 1 ? 1 : Number(bestOf) === 5 ? 5 : 3,
    steps: vetoRules(bestOf, team1, team2, firstTeam),
    actions: [],
    available: maps,
    complete: false,
  });
}

export function applyVetoMap(state, mapName) {
  if (state.complete) throw new Error("The veto is already complete.");
  if (!state.available.includes(mapName)) throw new Error(`${mapName} is no longer available.`);
  const step = state.steps[state.actions.length];
  if (!step || step.action === "decider") throw new Error("The decider is selected automatically.");
  return settleForcedStep({
    ...state,
    actions: [...state.actions, { ...step, map_name: mapName, automatic: false }],
    available: state.available.filter((candidate) => candidate !== mapName),
  });
}

export function replayVeto(state, actions) {
  let next = createVetoState(state);
  for (const action of actions.filter((row) => !row.automatic)) next = applyVetoMap(next, action.map_name);
  return next;
}

function rateWithPrior(row, prior = 4) {
  const matches = Number(row?.matches) || 0;
  const wins = Number(row?.wins) || 0;
  return matches > 0 ? (wins + 0.5 * prior) / (matches + prior) : 0.5;
}

function teamProfiles(teamName, mapProfiles, vetoProfiles) {
  const key = vetoTeamKey(teamName);
  return {
    maps: mapProfiles?.[key] || {},
    veto: vetoProfiles?.[key] || { maps: {}, sample_matches: 0 },
  };
}

export function mapWinProbability({ baseProbability, mapName, team1, team2, mapProfiles }) {
  const first = teamProfiles(team1, mapProfiles, {}).maps[mapName] || {};
  const second = teamProfiles(team2, mapProfiles, {}).maps[mapName] || {};
  const rate1 = rateWithPrior(first);
  const rate2 = rateWithPrior(second);
  const evidence = (Number(first.matches) || 0) + (Number(second.matches) || 0);
  const weight = Math.min(1, evidence / 28);
  const base = Math.max(0.08, Math.min(0.92, Number(baseProbability) || 0.5));
  const logit = Math.log(base / (1 - base)) + weight * 1.85 * (rate1 - rate2);
  const probability = 1 / (1 + Math.exp(-logit));
  return {
    map_name: mapName,
    prob_team1: Math.max(0.08, Math.min(0.92, probability)),
    team1_rate: rate1,
    team2_rate: rate2,
    evidence_maps: evidence,
    evidence: evidence >= 28 ? "strong" : evidence >= 12 ? "usable" : "thin",
  };
}

function recommendationScore({ action, actor, opponent, mapName, mapProfiles, vetoProfiles }) {
  const actorProfiles = teamProfiles(actor, mapProfiles, vetoProfiles);
  const opponentProfiles = teamProfiles(opponent, mapProfiles, vetoProfiles);
  const actorMap = actorProfiles.maps[mapName] || {};
  const opponentMap = opponentProfiles.maps[mapName] || {};
  const actorVeto = actorProfiles.veto.maps?.[mapName] || {};
  const opponentVeto = opponentProfiles.veto.maps?.[mapName] || {};
  const actorRate = rateWithPrior(actorMap);
  const opponentRate = rateWithPrior(opponentMap);
  if (action === "ban") {
    return 2.3 * (Number(actorVeto.ban_share) || 0)
      + 1.25 * (0.5 - actorRate)
      + 0.45 * (Number(opponentVeto.pick_share) || 0)
      + (actorProfiles.veto.perma_ban === mapName ? 1.5 : 0);
  }
  return 1.35 * (Number(actorVeto.pick_share) || 0)
    + 1.8 * (actorRate - opponentRate)
    + 0.2 * actorRate
    - 0.25 * (Number(opponentVeto.ban_share) || 0)
    + (actorProfiles.veto.first_pick === mapName ? 0.45 : 0);
}

export function recommendedMap(state, mapProfiles, vetoProfiles) {
  const step = state.steps[state.actions.length];
  if (!step || step.action === "decider") return state.available[0] || null;
  const opponent = step.actor === state.team1 ? state.team2 : state.team1;
  return [...state.available]
    .map((mapName) => ({
      mapName,
      score: recommendationScore({ action: step.action, actor: step.actor, opponent, mapName, mapProfiles, vetoProfiles }),
    }))
    .sort((a, b) => b.score - a.score || a.mapName.localeCompare(b.mapName))[0]?.mapName || null;
}

export function buildRecommendedVeto(config, mapProfiles, vetoProfiles) {
  let state = createVetoState(config);
  while (!state.complete) {
    const mapName = recommendedMap(state, mapProfiles, vetoProfiles);
    if (!mapName) break;
    state = applyVetoMap(state, mapName);
  }
  return state;
}

function seriesWinProbability(mapProbabilities, winsNeeded) {
  let states = new Map([['0:0', 1]]);
  let won = 0;
  for (const probability of mapProbabilities) {
    const next = new Map();
    for (const [key, chance] of states) {
      const [wins, losses] = key.split(":").map(Number);
      if (wins >= winsNeeded) {
        won += chance;
        continue;
      }
      if (losses >= winsNeeded) continue;
      const winKey = `${wins + 1}:${losses}`;
      const lossKey = `${wins}:${losses + 1}`;
      next.set(winKey, (next.get(winKey) || 0) + chance * probability);
      next.set(lossKey, (next.get(lossKey) || 0) + chance * (1 - probability));
    }
    states = next;
  }
  for (const [key, chance] of states) if (Number(key.split(":")[0]) >= winsNeeded) won += chance;
  return won;
}

function impliedMapProbability(seriesProbability, bestOf) {
  const target = Math.max(0.08, Math.min(0.92, Number(seriesProbability) || 0.5));
  const winsNeeded = Math.floor(bestOf / 2) + 1;
  let low = 0.001;
  let high = 0.999;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    const value = seriesWinProbability(Array(bestOf).fill(middle), winsNeeded);
    if (value < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function vetoSeriesRead(state, { baseProbability, mapProfiles }) {
  const selected = state.actions.filter((row) => ["pick", "decider"].includes(row.action));
  const requiredMaps = state.bestOf;
  const mapBaseline = impliedMapProbability(baseProbability, requiredMaps);
  const rows = selected.map((row) => ({
    ...row,
    ...mapWinProbability({
      baseProbability: mapBaseline,
      mapName: row.map_name,
      team1: state.team1,
      team2: state.team2,
      mapProfiles,
    }),
  }));
  if (!rows.length) return { maps: [], prob_team1: Number(baseProbability) || 0.5, complete: state.complete };
  const probabilities = rows.map((row) => row.prob_team1);
  while (probabilities.length < requiredMaps) probabilities.push(mapBaseline);
  return {
    maps: rows,
    prob_team1: seriesWinProbability(probabilities.slice(0, requiredMaps), Math.floor(state.bestOf / 2) + 1),
    complete: state.complete,
  };
}
