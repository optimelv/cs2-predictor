const keyOf = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const playerName = (player) => typeof player === "string"
  ? player
  : player?.nickname || player?.player_name || player?.name || "";

const rosterNames = (roster) => [...new Map((roster || [])
  .map(playerName)
  .filter(Boolean)
  .map((name) => [keyOf(name), name]))
  .values()]
  .slice(0, 5);

const matchTime = (match) => new Date(`${match?.match_date || "1970-01-01"}T12:00:00Z`).getTime();

const lineupFor = (match, teamName) => keyOf(match?.team1_name) === keyOf(teamName)
  ? match?.lineups?.team1 || []
  : match?.lineups?.team2 || [];

const overlap = (left, right) => {
  const rightKeys = new Set(rosterNames(right).map(keyOf));
  return rosterNames(left).filter((name) => rightKeys.has(keyOf(name)));
};

const difference = (left, right) => {
  const rightKeys = new Set(rosterNames(right).map(keyOf));
  return rosterNames(left).filter((name) => !rightKeys.has(keyOf(name)));
};

function labelFor({ known, shared, eraMatches }) {
  if (!known) return { status: "unknown", label: "History pending" };
  if (shared === 5 && eraMatches >= 5) return { status: "locked", label: "Locked five" };
  if (shared >= 4 && eraMatches >= 3) return { status: "stable", label: "Stable core" };
  if (shared >= 3) return { status: "changed", label: "New shape" };
  return { status: "rebuild", label: "Roster rebuild" };
}

export function rosterHistoryForTeam(snapshot, teamName, { asOf } = {}) {
  const teamKey = keyOf(teamName);
  const cutoff = asOf ? new Date(asOf).getTime() : Number.POSITIVE_INFINITY;
  return (snapshot?.matches || [])
    .filter((match) => ["tier_1", "tier_2"].includes(match?.tier))
    .filter((match) => [match?.team1_name, match?.team2_name].some((name) => keyOf(name) === teamKey))
    .filter((match) => matchTime(match) <= cutoff)
    .map((match) => ({ ...match, team_lineup: rosterNames(lineupFor(match, teamName)) }))
    .filter((match) => match.team_lineup.length >= 3)
    .sort((left, right) => matchTime(right) - matchTime(left));
}

export function rosterSignal(snapshot, teamName, currentRoster = [], { asOf } = {}) {
  const history = rosterHistoryForTeam(snapshot, teamName, { asOf });
  const latest = history[0] || null;
  const roster = rosterNames(currentRoster).length >= 3 ? rosterNames(currentRoster) : latest?.team_lineup || [];
  if (!latest || roster.length < 3) {
    return {
      team_name: teamName,
      status: "unknown",
      label: "History pending",
      score: null,
      shared_players: [],
      added_players: [],
      removed_players: [],
      era_matches: 0,
      era_start: null,
      latest_match_date: latest?.match_date || null,
      source_matches: history.length,
    };
  }

  const sharedPlayers = overlap(roster, latest.team_lineup);
  const currentKeys = new Set(roster.map(keyOf));
  const era = [];
  for (const match of history) {
    const shared = match.team_lineup.filter((name) => currentKeys.has(keyOf(name))).length;
    if (shared < Math.min(4, roster.length)) break;
    era.push(match);
  }
  const latestDiffers = difference(latest.team_lineup, roster).length > 0;
  const comparison = latestDiffers
    ? latest
    : era.length < 5
      ? history.find((match) => difference(match.team_lineup, roster).length > 0) || null
      : null;
  const addedPlayers = comparison ? difference(roster, comparison.team_lineup) : [];
  const removedPlayers = comparison ? difference(comparison.team_lineup, roster) : [];
  const eraStart = era.at(-1)?.match_date || latest.match_date;
  const shared = sharedPlayers.length;
  const continuity = shared / Math.max(5, roster.length);
  const sampleWeight = Math.min(1, Math.log2(era.length + 1) / 3);
  const score = Math.round(100 * (0.72 * continuity + 0.28 * continuity * sampleWeight));
  const identity = labelFor({ known: true, shared, eraMatches: era.length });

  return {
    team_name: teamName,
    ...identity,
    score,
    current_roster: roster,
    latest_lineup: latest.team_lineup,
    shared_players: sharedPlayers,
    added_players: addedPlayers,
    removed_players: removedPlayers,
    era_matches: era.length,
    era_start: eraStart,
    latest_match_date: latest.match_date,
    source_matches: history.length,
  };
}

export function matchRosterRead(snapshot, match, team1Roster = [], team2Roster = []) {
  const options = { asOf: match?.starts_at || match?.match_date };
  const team1 = rosterSignal(snapshot, match?.team1_name, team1Roster, options);
  const team2 = rosterSignal(snapshot, match?.team2_name, team2Roster, options);
  const score1 = Number(team1.score);
  const score2 = Number(team2.score);
  const known = Number.isFinite(score1) && Number.isFinite(score2);
  const delta = known ? score1 - score2 : null;
  return {
    team1,
    team2,
    delta,
    leader: !known || Math.abs(delta) < 8 ? null : delta > 0 ? match.team1_name : match.team2_name,
    material: known && Math.abs(delta) >= 15,
  };
}
