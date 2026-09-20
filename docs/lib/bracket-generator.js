const clean = (value) => String(value ?? "").trim();
const keyOf = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (value) => keyOf(value).replaceAll(" ", "-") || "stage";

const nextPowerOfTwo = (value) => {
  let size = 2;
  while (size < Math.max(2, Number(value) || 2)) size *= 2;
  return size;
};

const roundLabel = (size) => size === 2 ? "Grand final" : size === 4 ? "Semifinals" : size === 8 ? "Quarterfinals" : `Round of ${size}`;

const statusOf = (match) => {
  const status = keyOf(match?.status);
  if (/finished|completed|final|ended|locked/.test(status)) return "finished";
  if (/live|playing|progress/.test(status)) return "live";
  return match?.predicted_winner ? "projected" : "upcoming";
};

const winnerOf = (match) => {
  if (match?.winner_name || match?.winner) return clean(match.winner_name || match.winner);
  const score1 = Number(match?.score1);
  const score2 = Number(match?.score2);
  if (statusOf(match) === "finished" && Number.isFinite(score1) && Number.isFinite(score2) && score1 !== score2) {
    return score1 > score2 ? clean(match.team1_name) : clean(match.team2_name);
  }
  return clean(match?.predicted_winner);
};

const loserOf = (match) => {
  const winner = winnerOf(match);
  if (!winner || !match?.team1_name || !match?.team2_name) return "";
  return keyOf(winner) === keyOf(match.team1_name) ? clean(match.team2_name) : clean(match.team1_name);
};

const samePair = (match, team1, team2) => {
  const pair = [keyOf(match?.team1_name), keyOf(match?.team2_name)].sort().join("|");
  return team1 && team2 && pair === [keyOf(team1), keyOf(team2)].sort().join("|");
};

const roundMatches = (matches, label) => {
  const target = keyOf(label);
  return (matches || []).filter((match) => {
    const source = keyOf(`${match.round_name || ""} ${match.stage_name || ""} ${match.round || ""}`);
    return source && (source.includes(target) || target.includes(source));
  });
};

function slotMatch({ eventId, laneId, roundId, index, label, team1 = "", team2 = "", source1 = null, source2 = null }) {
  const slotId = `${eventId}:${laneId}:${roundId}:m${index + 1}`;
  return {
    match_id: `::slot:${slotId}`,
    slot_id: slotId,
    team1_name: clean(team1) || "TBD",
    team2_name: clean(team2) || "TBD",
    status: "upcoming",
    round_name: label,
    series_format: "bo3",
    feeds_from: [source1?.slot_id, source2?.slot_id].filter(Boolean),
    team1_source: source1 ? { slot_id: source1.slot_id, outcome: source1.outcome } : null,
    team2_source: source2 ? { slot_id: source2.slot_id, outcome: source2.outcome } : null,
  };
}

function hydrateSlot(slot, matches, used) {
  let candidate = (matches || []).find((match) => !used.has(match) && samePair(match, slot.team1_name, slot.team2_name));
  if (!candidate) {
    const candidates = roundMatches(matches, slot.round_name).filter((match) => !used.has(match));
    candidate = candidates.find((match) => samePair(match, slot.team1_name, slot.team2_name)) || candidates[0];
  }
  if (!candidate) return slot;
  used.add(candidate);
  return {
    ...slot,
    ...candidate,
    match_id: clean(candidate.match_id || candidate.hltv_match_id) || slot.match_id,
    slot_id: slot.slot_id,
    feeds_from: slot.feeds_from,
    team1_source: slot.team1_source,
    team2_source: slot.team2_source,
    status: statusOf(candidate),
    winner_name: winnerOf(candidate),
  };
}

const lane = (id, label, kind, rounds) => ({ id, label, kind, rounds });

function fieldSlots(field, count) {
  const size = Math.max(2, Number(count) || field.length || 2);
  return Array.from({ length: size }, (_, index) => clean(field[index]));
}

function openingPairs(field, size) {
  const slots = fieldSlots(field, size);
  return Array.from({ length: size / 2 }, (_, index) => [slots[index], slots[size - 1 - index]]);
}

function singleEliminationLane(event, matches, field, count, id = "playoffs", label = "Playoffs") {
  const size = nextPowerOfTwo(count || field.length);
  const pairs = openingPairs(field, size);
  const used = new Set();
  const rounds = [];
  let previous = [];
  let currentSize = size;
  while (currentSize >= 2) {
    const name = roundLabel(currentSize);
    const roundId = `r${rounds.length + 1}`;
    const matchCount = currentSize / 2;
    const rows = Array.from({ length: matchCount }, (_, index) => {
      const team1 = rounds.length ? winnerOf(previous[index * 2]) : pairs[index]?.[0];
      const team2 = rounds.length ? winnerOf(previous[index * 2 + 1]) : pairs[index]?.[1];
      const source1 = rounds.length ? { slot_id: previous[index * 2].slot_id, outcome: "winner" } : null;
      const source2 = rounds.length ? { slot_id: previous[index * 2 + 1].slot_id, outcome: "winner" } : null;
      return hydrateSlot(slotMatch({ eventId: event.id, laneId: id, roundId, index, label: name, team1, team2, source1, source2 }), matches, used);
    });
    rounds.push({ id: `${id}:${roundId}`, label: name, order: rounds.length + 1, groups: [], matches: rows });
    previous = rows;
    currentSize /= 2;
  }
  return lane(id, label, "single_elimination", rounds);
}

function doubleEliminationLanes(event, matches, field, count) {
  const size = nextPowerOfTwo(count || field.length);
  const used = new Set();
  const upperRounds = [];
  let previous = [];
  let currentSize = size;
  while (currentSize >= 2) {
    const roundIndex = upperRounds.length;
    const name = currentSize === 2 ? "Upper final" : `Upper round ${roundIndex + 1}`;
    const pairs = roundIndex ? [] : openingPairs(field, size);
    const rows = Array.from({ length: currentSize / 2 }, (_, index) => {
      const source1 = roundIndex ? { slot_id: previous[index * 2].slot_id, outcome: "winner" } : null;
      const source2 = roundIndex ? { slot_id: previous[index * 2 + 1].slot_id, outcome: "winner" } : null;
      return hydrateSlot(slotMatch({
        eventId: event.id, laneId: "upper", roundId: `r${roundIndex + 1}`, index, label: name,
        team1: roundIndex ? winnerOf(previous[index * 2]) : pairs[index]?.[0],
        team2: roundIndex ? winnerOf(previous[index * 2 + 1]) : pairs[index]?.[1], source1, source2,
      }), matches, used);
    });
    upperRounds.push({ id: `upper:r${roundIndex + 1}`, label: name, order: roundIndex + 1, groups: [], matches: rows });
    previous = rows;
    currentSize /= 2;
  }

  const lowerRounds = [];
  const addLower = (sources, label) => {
    const roundIndex = lowerRounds.length;
    const rows = [];
    for (let index = 0; index < sources.length; index += 2) {
      const first = sources[index];
      const second = sources[index + 1];
      rows.push(hydrateSlot(slotMatch({
        eventId: event.id, laneId: "lower", roundId: `r${roundIndex + 1}`, index: index / 2, label,
        team1: first?.team || "", team2: second?.team || "", source1: first?.source, source2: second?.source,
      }), matches, used));
    }
    lowerRounds.push({ id: `lower:r${roundIndex + 1}`, label, order: roundIndex + 1, groups: [], matches: rows });
    return rows;
  };

  let lower = addLower(upperRounds[0].matches.map((match) => ({ team: loserOf(match), source: { slot_id: match.slot_id, outcome: "loser" } })), "Lower round 1");
  for (let upperIndex = 1; upperIndex < upperRounds.length; upperIndex += 1) {
    const injection = [];
    const dropped = upperRounds[upperIndex].matches;
    for (let index = 0; index < dropped.length; index += 1) {
      const lowerMatch = lower[index];
      injection.push(
        { team: winnerOf(lowerMatch), source: { slot_id: lowerMatch.slot_id, outcome: "winner" } },
        { team: loserOf(dropped[index]), source: { slot_id: dropped[index].slot_id, outcome: "loser" } },
      );
    }
    lower = addLower(injection, upperIndex === upperRounds.length - 1 ? "Lower final" : `Lower round ${lowerRounds.length + 1}`);
    if (upperIndex < upperRounds.length - 1 && lower.length > 1) {
      const consolidation = lower.map((match) => ({ team: winnerOf(match), source: { slot_id: match.slot_id, outcome: "winner" } }));
      lower = addLower(consolidation, `Lower round ${lowerRounds.length + 1}`);
    }
  }

  const upperFinal = upperRounds.at(-1).matches[0];
  const lowerFinal = lowerRounds.at(-1)?.matches[0];
  const finalSlot = hydrateSlot(slotMatch({
    eventId: event.id, laneId: "final", roundId: "r1", index: 0, label: "Grand final",
    team1: winnerOf(upperFinal), team2: winnerOf(lowerFinal),
    source1: { slot_id: upperFinal.slot_id, outcome: "winner" },
    source2: lowerFinal ? { slot_id: lowerFinal.slot_id, outcome: "winner" } : null,
  }), matches, used);
  return [lane("upper", "Upper bracket", "upper", upperRounds), lane("lower", "Lower bracket", "lower", lowerRounds), lane("final", "Grand final", "final", [{ id: "final:r1", label: "Grand final", order: 1, groups: [], matches: [finalSlot] }])];
}

const SWISS_GROUPS = [
  [["0-0", 8]],
  [["1-0", 4], ["0-1", 4]],
  [["2-0", 2], ["1-1", 4], ["0-2", 2]],
  [["2-1", 3], ["1-2", 3]],
  [["2-2", 3]],
];

function swissLane(event, matches, stage, stageIndex, teams = []) {
  const laneId = `swiss-${stageIndex + 1}`;
  const used = new Set();
  const opening = openingPairs(teams, 16);
  const rounds = SWISS_GROUPS.map((groups, roundIndex) => {
    const normalizedGroups = groups.map(([record, count]) => ({
      label: record,
      matches: Array.from({ length: count }, (_, index) => {
        const pair = roundIndex === 0 ? opening[index] : [];
        const slot = slotMatch({ eventId: event.id, laneId, roundId: `r${roundIndex + 1}:${record}`, index, label: `Round ${roundIndex + 1}`, team1: pair?.[0], team2: pair?.[1] });
        const candidates = (matches || []).filter((match) => keyOf(`${match.stage_name} ${match.round_name}`).includes(`round ${roundIndex + 1}`));
        return hydrateSlot(slot, candidates, used);
      }),
    }));
    return { id: `${laneId}:r${roundIndex + 1}`, label: `Round ${roundIndex + 1}`, order: roundIndex + 1, groups: normalizedGroups, matches: normalizedGroups.flatMap((group) => group.matches) };
  });
  return lane(laneId, clean(stage.name) || `Swiss stage ${stageIndex + 1}`, "swiss", rounds);
}

function gslLane(event, matches, field, blueprint) {
  const settings = event?.format?.settings || {};
  const groupSize = Number(settings.group_size) || 4;
  const groupCount = Number(settings.group_count) || Math.max(1, Math.ceil((blueprint.field_size || field.length || 4) / groupSize));
  const groups = event.groups?.length ? event.groups : Array.from({ length: groupCount }, (_, index) => ({ name: `Group ${String.fromCharCode(65 + index)}`, teams: field.slice(index * groupSize, (index + 1) * groupSize) }));
  const used = new Set();
  const groupTrees = groups.map((group, groupIndex) => {
    const teams = fieldSlots(group.teams || [], 4);
    const groupId = `g${groupIndex + 1}`;
    const opening = [[teams[0], teams[3]], [teams[1], teams[2]]].map((pair, index) => hydrateSlot(slotMatch({
      eventId: event.id, laneId: "groups", roundId: `r1:${groupId}`, index, label: "Opening matches", team1: pair[0], team2: pair[1],
    }), matches, used));
    const winners = hydrateSlot(slotMatch({
      eventId: event.id, laneId: "groups", roundId: `r2:${groupId}`, index: 0, label: "Winners match",
      team1: winnerOf(opening[0]), team2: winnerOf(opening[1]),
      source1: { slot_id: opening[0].slot_id, outcome: "winner" }, source2: { slot_id: opening[1].slot_id, outcome: "winner" },
    }), matches, used);
    const elimination = hydrateSlot(slotMatch({
      eventId: event.id, laneId: "groups", roundId: `r3:${groupId}`, index: 0, label: "Elimination match",
      team1: loserOf(opening[0]), team2: loserOf(opening[1]),
      source1: { slot_id: opening[0].slot_id, outcome: "loser" }, source2: { slot_id: opening[1].slot_id, outcome: "loser" },
    }), matches, used);
    const decider = hydrateSlot(slotMatch({
      eventId: event.id, laneId: "groups", roundId: `r4:${groupId}`, index: 0, label: "Decider match",
      team1: winnerOf(elimination), team2: loserOf(winners),
      source1: { slot_id: elimination.slot_id, outcome: "winner" }, source2: { slot_id: winners.slot_id, outcome: "loser" },
    }), matches, used);
    return { label: clean(group.name) || `Group ${groupIndex + 1}`, rounds: [opening, [winners], [elimination], [decider]] };
  });
  const definitions = ["Opening matches", "Winners match", "Elimination match", "Decider match"];
  const rounds = definitions.map((label, roundIndex) => {
    const roundGroups = groupTrees.map((group) => ({ label: group.label, matches: group.rounds[roundIndex] }));
    return { id: `groups:r${roundIndex + 1}`, label, order: roundIndex + 1, groups: roundGroups, matches: roundGroups.flatMap((group) => group.matches) };
  });
  return lane("groups", "GSL groups", "gsl", rounds);
}

function roundRobinLane(event, field, blueprint) {
  const teams = fieldSlots(field, blueprint.field_size || field.length);
  if (teams.length % 2) teams.push("");
  const rotating = [...teams];
  const rounds = [];
  for (let roundIndex = 0; roundIndex < rotating.length - 1; roundIndex += 1) {
    const matches = [];
    for (let index = 0; index < rotating.length / 2; index += 1) {
      matches.push(slotMatch({ eventId: event.id, laneId: "league", roundId: `r${roundIndex + 1}`, index, label: `Matchday ${roundIndex + 1}`, team1: rotating[index], team2: rotating[rotating.length - 1 - index] }));
    }
    rounds.push({ id: `league:r${roundIndex + 1}`, label: `Matchday ${roundIndex + 1}`, order: roundIndex + 1, groups: [], matches });
    rotating.splice(1, 0, rotating.pop());
  }
  return lane("league", "League table", "round_robin", rounds);
}

export function generateFormatLanes(event, matches = [], blueprint = null, field = []) {
  const plan = blueprint || { stages: [], playoff_type: event?.format?.type, playoff_size: field.length, field_size: field.length };
  const type = clean(event?.format?.type);
  const count = Number(plan.field_size || event?.teams || field.length) || 0;
  if (type === "single_elimination") return [singleEliminationLane(event, matches, field, count, "main", "Main bracket")];
  if (type === "double_elimination") return doubleEliminationLanes(event, matches, field, count);
  if (type === "swiss") {
    const swissStages = (plan.stages || []).filter((stage) => stage.type === "swiss");
    const declared = swissStages.length ? swissStages : [{ name: "Swiss stage" }];
    const lanes = declared.map((stage, index) => {
      const stageMatches = declared.length > 1
        ? matches.filter((match) => keyOf(`${match.stage_name || ""} ${match.round_name || ""}`).includes(`stage ${index + 1}`))
        : matches;
      return swissLane(event, stageMatches, stage, index, declared.length === 1 ? field : []);
    });
    lanes.push(singleEliminationLane(event, matches, [], plan.playoff_size || 8, "playoffs", "Playoffs"));
    return lanes;
  }
  if (type === "gsl") return [gslLane(event, matches, field, plan), singleEliminationLane(event, matches, [], plan.playoff_size || 8, "playoffs", "Playoffs")];
  if (type === "round_robin") return [roundRobinLane(event, field, plan), singleEliminationLane(event, matches, [], plan.playoff_size || 8, "playoffs", "Playoffs")];
  return [];
}
