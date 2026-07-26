export function nextPowerOfTwo(count) {
  let size = 2;
  while (size < Math.max(2, count)) size *= 2;
  return size;
}

export function seededOpeningPairs(field) {
  const size = nextPowerOfTwo(field.length);
  const slots = Array.from({ length: size }, (_, index) => field[index] || null);
  return Array.from({ length: size / 2 }, (_, index) => [slots[index], slots[size - 1 - index]]);
}

function loserOf(match) {
  const winner = match.winner_name || match.predicted_winner;
  if (!winner || !match.team1_name || !match.team2_name || ["TBD", "BYE"].includes(match.team2_name)) return null;
  return winner === match.team1_name ? match.team2_name : match.team1_name;
}

export function buildDoubleEliminationTree({
  field,
  openingPairs = seededOpeningPairs(field),
  upperRoundNames = [],
  lowerRoundNames = [],
  grandFinalName = "Grand final",
  resolveMatch,
}) {
  if (typeof resolveMatch !== "function") throw new TypeError("resolveMatch is required");
  const upperRounds = [];
  let upperTeams = openingPairs.flat();
  let upperRoundIndex = 0;
  while (upperTeams.length >= 2) {
    const roundName = upperRoundNames[upperRoundIndex] || (upperTeams.length === 2 ? "Upper final" : `Upper round ${upperRoundIndex + 1}`);
    const matches = [];
    for (let index = 0; index < upperTeams.length; index += 2) {
      matches.push(resolveMatch(upperTeams[index], upperTeams[index + 1], roundName, index / 2));
    }
    upperRounds.push({ name: roundName, bracket: "upper", matches });
    upperTeams = matches.map((match) => match.winner_name || match.predicted_winner || null).filter(Boolean);
    upperRoundIndex += 1;
  }

  const lowerRounds = [];
  const addLowerRound = (teams, fallbackName) => {
    if (!teams.length) return [];
    const roundName = lowerRoundNames[lowerRounds.length] || fallbackName;
    const matches = [];
    for (let index = 0; index < teams.length; index += 2) {
      matches.push(resolveMatch(teams[index], teams[index + 1], roundName, index / 2));
    }
    lowerRounds.push({ name: roundName, bracket: "lower", matches });
    return matches.map((match) => match.winner_name || match.predicted_winner || null).filter(Boolean);
  };

  const openingLosers = (upperRounds[0]?.matches || []).map(loserOf).filter(Boolean);
  let lowerTeams = addLowerRound(openingLosers, "Lower round 1");
  for (let upperIndex = 1; upperIndex < upperRounds.length; upperIndex += 1) {
    const droppedTeams = upperRounds[upperIndex].matches.map(loserOf).filter(Boolean);
    const injection = [];
    const count = Math.max(lowerTeams.length, droppedTeams.length);
    for (let index = 0; index < count; index += 1) injection.push(lowerTeams[index] || null, droppedTeams[index] || null);
    lowerTeams = addLowerRound(injection, upperIndex === upperRounds.length - 1 ? "Lower final" : `Lower round ${lowerRounds.length + 1}`);
    if (upperIndex < upperRounds.length - 1 && lowerTeams.length > 1) {
      lowerTeams = addLowerRound(lowerTeams, `Lower round ${lowerRounds.length + 1}`);
    }
  }

  const upperWinner = upperRounds.at(-1)?.matches[0]?.winner_name || upperRounds.at(-1)?.matches[0]?.predicted_winner || null;
  const lowerWinner = lowerRounds.at(-1)?.matches[0]?.winner_name || lowerRounds.at(-1)?.matches[0]?.predicted_winner || null;
  const grandFinal = upperWinner && lowerWinner ? resolveMatch(upperWinner, lowerWinner, grandFinalName, 0) : null;
  return {
    field,
    upperRounds,
    lowerRounds,
    grandFinal,
    champion: grandFinal?.winner_name || grandFinal?.predicted_winner || upperWinner,
  };
}
