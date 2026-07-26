const keyOf = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const matchDateValue = (match) => new Date(`${match.match_date || "1970-01-01"}T12:00:00Z`).getTime();

const slugOf = (value) => keyOf(value).replaceAll(" ", "-") || "event";

const phaseLabel = (value) => {
  const normalized = String(value || "series").replaceAll("_", " ").trim();
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export function historyMatchesForTeam(snapshot, teamName) {
  const teamKey = keyOf(teamName);
  return (snapshot?.matches || [])
    .filter((match) => match?.tier === "tier_1" || match?.tier === "tier_2")
    .filter((match) => [match.team1_name, match.team2_name].some((name) => keyOf(name) === teamKey))
    .sort((a, b) => matchDateValue(b) - matchDateValue(a));
}

function opponentFor(match, teamName) {
  return keyOf(match.team1_name) === keyOf(teamName) ? match.team2_name : match.team1_name;
}

function teamWon(match, teamName) {
  return keyOf(match.winner_name) === keyOf(teamName);
}

function lineupFor(match, teamName) {
  return keyOf(match.team1_name) === keyOf(teamName) ? match.lineups?.team1 || [] : match.lineups?.team2 || [];
}

function lineupContinuity(match, teamName, currentRoster) {
  const current = new Set((currentRoster || []).map(keyOf).filter(Boolean));
  if (!current.size) return 0;
  return lineupFor(match, teamName).filter((player) => current.has(keyOf(player))).length;
}

export function historyOpponents(snapshot, teamName) {
  const rows = new Map();
  for (const match of historyMatchesForTeam(snapshot, teamName)) {
    const opponent = opponentFor(match, teamName);
    const key = keyOf(opponent);
    if (!key) continue;
    const row = rows.get(key) || { team_name: opponent, matches: 0, wins: 0, losses: 0, last_date: "" };
    row.matches += 1;
    if (teamWon(match, teamName)) row.wins += 1;
    else row.losses += 1;
    if (!row.last_date || String(match.match_date || "") > row.last_date) row.last_date = match.match_date || "";
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.matches - a.matches || b.last_date.localeCompare(a.last_date));
}

export function summarizeHeadToHead(snapshot, teamName, opponentName, currentRoster = []) {
  const opponentKey = keyOf(opponentName);
  const matches = historyMatchesForTeam(snapshot, teamName).filter((match) => keyOf(opponentFor(match, teamName)) === opponentKey);
  const threshold = currentRoster.length >= 3 ? 3 : currentRoster.length;
  const currentEraMatches = threshold
    ? matches.filter((match) => lineupContinuity(match, teamName, currentRoster) >= threshold)
    : [];
  const maps = new Map();
  for (const match of matches) {
    for (const map of match.maps || []) {
      const mapName = map.map_name || "Unknown";
      const row = maps.get(mapName) || { map_name: mapName, maps: 0, wins: 0, losses: 0, round_diff: 0 };
      row.maps += 1;
      const won = keyOf(map.winner_name) === keyOf(teamName);
      if (won) row.wins += 1;
      else row.losses += 1;
      const isTeam1 = keyOf(match.team1_name) === keyOf(teamName);
      const teamScore = Number(isTeam1 ? map.score1 : map.score2);
      const opponentScore = Number(isTeam1 ? map.score2 : map.score1);
      if (Number.isFinite(teamScore) && Number.isFinite(opponentScore)) row.round_diff += teamScore - opponentScore;
      maps.set(mapName, row);
    }
  }
  const wins = matches.filter((match) => teamWon(match, teamName)).length;
  const eraWins = currentEraMatches.filter((match) => teamWon(match, teamName)).length;
  return {
    team_name: teamName,
    opponent_name: opponentName,
    matches,
    wins,
    losses: matches.length - wins,
    win_rate: matches.length ? wins / matches.length : null,
    current_era_matches: currentEraMatches.length,
    current_era_wins: eraWins,
    current_era_win_rate: currentEraMatches.length ? eraWins / currentEraMatches.length : null,
    maps: [...maps.values()].map((row) => ({ ...row, win_rate: row.maps ? row.wins / row.maps : null })).sort((a, b) => b.maps - a.maps || a.map_name.localeCompare(b.map_name)),
  };
}

export function mergeHistoryMatches(snapshot, incomingMatches = []) {
  const base = snapshot && String(snapshot.contract_version || "").startsWith("1.")
    ? structuredClone(snapshot)
    : { contract_version: "1.0", generated_at_utc: null, through_date: null, scope: {}, matches: [] };
  const byId = new Map((base.matches || []).map((match) => [String(match.match_id), match]));
  for (const match of incomingMatches) {
    if (!match?.match_id || !["tier_1", "tier_2"].includes(match.tier)) continue;
    byId.set(String(match.match_id), { ...(byId.get(String(match.match_id)) || {}), ...match });
  }
  base.matches = [...byId.values()].sort((a, b) => matchDateValue(b) - matchDateValue(a));
  const dates = base.matches.map((match) => match.match_date).filter(Boolean).sort();
  base.through_date = dates.at(-1) || base.through_date;
  base.scope = {
    ...base.scope,
    tiers: ["tier_1", "tier_2"],
    matches: base.matches.length,
    maps: base.matches.reduce((sum, match) => sum + (match.maps || []).length, 0),
    lineup_rows: base.matches.reduce((sum, match) => sum + (match.lineups?.team1 || []).length + (match.lineups?.team2 || []).length, 0),
  };
  return base;
}

function archiveFormat(matches) {
  const phases = [...new Set(matches.map((match) => keyOf(`${match.phase} ${match.stage_name} ${match.round_name}`)).filter(Boolean))];
  const joined = phases.join(" ");
  const hasSwiss = joined.includes("swiss");
  const hasGroups = joined.includes("group");
  const hasPlayoffs = matches.some((match) => match.is_playoff) || /quarter|semi|final|playoff/.test(joined);
  const type = hasSwiss && hasPlayoffs
    ? "mixed"
    : hasSwiss
      ? "swiss"
      : hasGroups && hasPlayoffs
        ? "mixed"
        : hasGroups
          ? "gsl"
          : hasPlayoffs
            ? "single_elimination"
            : "mixed";
  const stages = [];
  if (hasGroups) stages.push({ id: "groups", name: "Group stage", type: "gsl", status: "finished", order: stages.length + 1 });
  if (hasSwiss) stages.push({ id: "swiss", name: "Swiss stage", type: "swiss", status: "finished", order: stages.length + 1 });
  if (hasPlayoffs) stages.push({ id: "playoffs", name: "Playoffs", type: "single_elimination", status: "finished", order: stages.length + 1 });
  if (!stages.length) stages.push({ id: "series", name: "Event series", type: "mixed", status: "finished", order: 1 });
  return {
    type,
    label: stages.map((stage) => stage.name).join(" + "),
    confidence: "verified_history",
    stages,
    settings: {},
  };
}

function archiveBracket(matches) {
  const playoffMatches = matches.filter((match) => match.is_playoff || [match.phase, match.stage_name, match.round_name].map(keyOf).some((label) => /quarter|semi|playoff/.test(label) || label === "final" || label === "grand final"));
  if (!playoffMatches.length) return null;
  const byDate = new Map();
  for (const match of playoffMatches) {
    const rows = byDate.get(match.match_date) || [];
    rows.push(match);
    byDate.set(match.match_date, rows);
  }
  const dates = [...byDate.keys()].sort();
  const classified = [];
  dates.forEach((date, dateIndex) => {
    const rows = byDate.get(date);
    const finalDayHasLongFinal = dateIndex === dates.length - 1 && rows.some((match) => Number(match.best_of) >= 5);
    rows.forEach((match, matchIndex) => {
      const declared = [match.round_name, match.stage_name, match.phase].map(keyOf).find((label) => label && !["playoffs", "unknown", "regular"].includes(label));
      let name;
      if (declared && /quarter/.test(declared)) name = "Quarterfinals";
      else if (declared && /semi/.test(declared)) name = "Semifinals";
      else if (declared === "final" || declared === "grand final") name = "Grand final";
      else if (dateIndex === dates.length - 1 && (rows.length === 1 || Number(match.best_of) >= 5)) name = "Grand final";
      else if (dateIndex === dates.length - 1 && finalDayHasLongFinal) name = "Third place";
      else if (rows.length >= 4) name = "Quarterfinals";
      else if (rows.length === 2) name = "Semifinals";
      else name = dateIndex === dates.length - 1 ? "Grand final" : "Playoff round";
      classified.push({ date, match, matchIndex, name });
    });
  });
  const roundNames = ["Playoff round", "Quarterfinals", "Semifinals", "Third place", "Grand final"];
  const rounds = [...new Set(classified.map((row) => row.name))]
    .sort((a, b) => roundNames.indexOf(a) - roundNames.indexOf(b))
    .map((name, index) => ({
      id: `archive:${slugOf(name)}`,
      name,
      order: index + 1,
      bracket: name === "Third place" ? "placement" : "main",
      matches: classified.filter((row) => row.name === name).map(({ date, match, matchIndex }) => ({ ...match, slot_id: `archive:${date}:${matchIndex + 1}`, round_name: name, feeds_from: [] })),
    }));
  return { type: "single_elimination", rounds };
}

function isDeclaredFinal(match) {
  return [match.phase, match.stage_name, match.round_name]
    .map(keyOf)
    .some((label) => label === "final" || label === "grand final");
}

export function historyEvents(snapshot) {
  const grouped = new Map();
  for (const match of (snapshot?.matches || []).filter((row) => ["tier_1", "tier_2"].includes(row.tier))) {
    const name = String(match.event_name || "Historical event").trim();
    if (/showmatch/i.test(name)) continue;
    const key = keyOf(name);
    const event = grouped.get(key) || { name, matches: [], participants: new Set(), tiers: new Set() };
    event.matches.push(match);
    event.participants.add(match.team1_name);
    event.participants.add(match.team2_name);
    event.tiers.add(match.tier);
    grouped.set(key, event);
  }
  return [...grouped.values()].map((row) => {
    const matches = [...row.matches].sort((a, b) => matchDateValue(a) - matchDateValue(b)).map((match) => ({
      ...match,
      starts_at: `${match.match_date}T12:00:00Z`,
      status: "finished",
      series_format: `bo${match.best_of || 3}`,
      stage_name: phaseLabel(match.stage_name || match.phase),
      round_name: phaseLabel(match.round_name || match.phase),
      map_results: match.maps || [],
    }));
    const format = archiveFormat(matches);
    const bracket = archiveBracket(matches);
    const finalMatch = matches.filter(isDeclaredFinal).at(-1)
      || bracket?.rounds.find((round) => round.name === "Grand final")?.matches.at(-1)
      || null;
    return {
      id: `archive:${slugOf(row.name)}`,
      name: row.name,
      archived: true,
      status: "finished",
      tier: row.tiers.has("tier_1") ? "tier_1" : "tier_2",
      event_type: /major/i.test(row.name) ? "Major" : /qualifier/i.test(row.name) ? "Qualifier" : "Event",
      location: "Verified archive",
      start_date: matches[0]?.match_date || null,
      end_date: matches.at(-1)?.match_date || null,
      participants: [...row.participants],
      teams: row.participants.size,
      matches,
      format,
      bracket,
      current_stage: "Completed",
      champion_name: finalMatch?.winner_name || null,
      final_match: finalMatch,
      source: "Tier 1/2 historical warehouse",
    };
  }).sort((a, b) => String(b.end_date || "").localeCompare(String(a.end_date || "")) || b.matches.length - a.matches.length);
}
