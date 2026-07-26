const keyOf = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const matchDateValue = (match) => new Date(`${match.match_date || "1970-01-01"}T12:00:00Z`).getTime();

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
