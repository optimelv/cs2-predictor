import { completeKnockoutRounds } from "./event-results.js";
import { tournamentBlueprint } from "../docs/lib/tournaments.js";
import { generateFormatLanes } from "../docs/lib/bracket-generator.js";

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const clean = (value) => String(value ?? "").trim();
const finite = (value) =>
  value == null ||
  typeof value === "boolean" ||
  String(value).trim() === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);

function matchId(match) {
  return (
    clean(match.match_id || match.hltv_match_id) ||
    [
      normalize(match.team1_name),
      normalize(match.team2_name),
      clean(match.starts_at || match.round_name || match.stage_name),
    ].join(":")
  );
}

function matchStatus(match) {
  const status = normalize(match.status);
  if (/^(cancelled|canceled)$/.test(status)) return "cancelled";
  if (/^(postponed|delayed)$/.test(status)) return "postponed";
  if (
    ["locked", "finished", "completed", "final", "ended"].some((token) =>
      status.includes(token),
    )
  )
    return "finished";
  if (["live", "playing", "progress"].some((token) => status.includes(token)))
    return "live";
  if (status === "bye") return "bye";
  if (
    ["projected", "prediction", "model"].some((token) => status.includes(token))
  )
    return "projected";
  return "upcoming";
}

function winnerName(match) {
  if (matchStatus(match) !== "finished") return "";
  const declared = clean(match.winner_name || match.winner);
  const score1 = finite(match.score1);
  const score2 = finite(match.score2);
  if (score1 !== null && score2 !== null && score1 !== score2) {
    return score1 > score2 ? clean(match.team1_name) : clean(match.team2_name);
  }
  return [clean(match.team1_name), clean(match.team2_name)].includes(declared)
    ? declared
    : "";
}

function normalizeMatch(match, roundLabel, groupLabel = "") {
  const probability = finite(match.prob_team1);
  return {
    match_id: matchId(match),
    event_name: clean(match.event_name),
    alternate_match_ids: match.alternate_match_ids || [],
    team1_name: clean(match.team1_name) || "TBD",
    team2_name: clean(match.team2_name) || "TBD",
    status: matchStatus(match),
    starts_at: match.starts_at || null,
    match_date: match.match_date || null,
    series_format: clean(
      match.series_format || match.format || "bo3",
    ).toLowerCase(),
    round_name: clean(
      match.round_name || match.round || match.stage_name || roundLabel,
    ),
    group_label: clean(groupLabel),
    score1: finite(match.score1),
    score2: finite(match.score2),
    score_label: clean(match.score_label),
    winner_name: winnerName(match),
    predicted_winner: clean(match.predicted_winner),
    prob_team1:
      probability !== null && probability >= 0 && probability <= 1
        ? probability
        : null,
    slot_id: clean(match.slot_id || match.match_id || match.hltv_match_id),
    feeds_from: Array.isArray(match.feeds_from)
      ? match.feeds_from.map(clean).filter(Boolean)
      : [],
    team1_source: match.team1_source || null,
    team2_source: match.team2_source || null,
  };
}

function lane(id, label, rounds, kind = id) {
  return {
    id,
    label,
    kind,
    rounds: rounds.map((round, index) => ({
      id: clean(round.id) || `${id}:${index + 1}`,
      label: clean(round.label || round.name) || `Round ${index + 1}`,
      order: Number.isFinite(Number(round.order))
        ? Number(round.order)
        : index + 1,
      groups: Array.isArray(round.groups) ? round.groups : [],
      matches: (round.matches || []).map((match) =>
        normalizeMatch(match, round.label || round.name),
      ),
    })),
  };
}

function swissLane(board) {
  if (!Array.isArray(board?.rounds) || !board.rounds.length) return null;
  const rounds = board.rounds.map((round, index) => {
    const groups = (round.groups || []).map((group) => ({
      label: clean(group.record || group.label),
      matches: (group.matches || []).map((match) =>
        normalizeMatch(
          match,
          `Swiss round ${round.round || index + 1}`,
          group.record,
        ),
      ),
    }));
    return {
      id: `swiss:${round.round || index + 1}`,
      label: `Round ${round.round || index + 1}`,
      order: Number(round.round) || index + 1,
      groups,
      matches: groups.flatMap((group) => group.matches),
    };
  });
  return lane("swiss", "Swiss stage", rounds, "swiss");
}

const playoffKeys = [
  ["round_of_32", "Round of 32"],
  ["round_of_16", "Round of 16"],
  ["quarterfinals", "Quarterfinals"],
  ["semifinals", "Semifinals"],
  ["grand_final", "Grand final"],
  ["final", "Grand final"],
];

function playoffLane(playoff) {
  if (!playoff || typeof playoff !== "object") return null;
  const rounds = playoffKeys.flatMap(([key, label]) =>
    Array.isArray(playoff[key]) && playoff[key].length
      ? [{ id: `playoffs:${key}`, label, matches: playoff[key] }]
      : [],
  );
  if (!rounds.length) return null;
  const last = rounds.at(-1);
  const openingCount = rounds[0].matches.length;
  if (
    /quarterfinal/i.test(rounds[0].label) &&
    !rounds.some((round) => /semi/i.test(round.label))
  ) {
    rounds.push({
      id: "playoffs:semifinals",
      label: "Semifinals",
      matches: Array.from(
        { length: Math.max(1, openingCount / 2) },
        () => ({}),
      ),
    });
  }
  if (
    !/grand final/i.test(last.label) &&
    !rounds.some((round) => /grand final/i.test(round.label))
  ) {
    rounds.push({
      id: "playoffs:grand-final",
      label: "Grand final",
      matches: [{}],
    });
  }
  return lane("playoffs", "Playoffs", rounds, "single_elimination");
}

function roundOrder(round) {
  const name = clean(round.name || round.label).toLowerCase();
  if (/round of 32/.test(name)) return 10;
  if (/round of 16/.test(name)) return 20;
  if (/quarter/.test(name)) return 30;
  if (/semi/.test(name)) return 40;
  if (/3rd|third/.test(name)) return 60;
  if (/grand final|(?:^|\s)final$/.test(name)) return 50;
  if (/opening|\bvs\b/.test(name)) return 5;
  if (/winners/.test(name)) return 10;
  if (/elimination/.test(name)) return 10;
  if (/decider/.test(name)) return 15;
  const numbered = name.match(/(?:upper|lower|swiss)?\s*round (\d+)/);
  if (numbered) return Number(numbered[1]);
  return Number(round.order) || 0;
}
function publishedLanes(event) {
  const rounds = event?.bracket?.rounds;
  if (!Array.isArray(rounds) || !rounds.length) return [];
  const buckets = new Map();
  for (const round of rounds) {
    const label = clean(round.name || round.label);
    const group = label.match(/^(Group [A-Z]|Group Stage|Playoffs)\s*·/i);
    const branch = label
      .match(/\b(upper|lower) bracket\b/i)?.[1]
      ?.toLowerCase();
    const base = group
      ? group[1]
      : clean(round.bracket || "main").toLowerCase();
    const key = /3rd|third/i.test(label)
      ? `${base} · Placement`
      : branch
        ? `${base} · ${branch === "upper" ? "Upper" : "Lower"} bracket`
        : base;
    buckets.set(key, [
      ...(buckets.get(key) || []),
      group
        ? {
            ...round,
            name: label.slice(group[0].length).trim(),
            label: label.slice(group[0].length).trim(),
          }
        : round,
    ]);
  }
  const labels = {
    main: "Main bracket",
    upper: "Upper bracket",
    lower: "Lower bracket",
    swiss: "Swiss stage",
    groups: "Group stage",
  };
  return [...buckets.entries()].map(([id, laneRounds]) => {
    const merged = new Map();
    for (const round of laneRounds) {
      const raw = clean(round.name || round.label);
      const name = /\bvs\b/i.test(raw) ? "Round not specified" : raw;
      const roundKey = normalize(name)
        .replace(/quarterfinals?/, "quarterfinal")
        .replace(/semifinals?/, "semifinal");
      const old = merged.get(roundKey);
      if (old) old.matches.push(...(round.matches || []));
      else
        merged.set(roundKey, {
          ...round,
          name,
          label: name,
          matches: [...(round.matches || [])],
        });
    }
    const result = lane(
      id,
      labels[id] || id,
      [...merged.values()].sort((a, b) => roundOrder(a) - roundOrder(b)),
      id,
    );
    for (const round of result.rounds) {
      const preceding = { 50: 40, 40: 30, 30: 20 }[roundOrder(round)];
      const previous =
        preceding &&
        result.rounds
          .filter((r) => roundOrder(r) === preceding)
          .flatMap((r) => r.matches);
      if (!previous?.length) continue;
      for (const match of round.matches) {
        if (match.feeds_from.length) continue;
        for (const team of [match.team1_name, match.team2_name]) {
          const candidates = previous.filter((m) => winnerName(m) === team);
          if (candidates.length === 1)
            match.feeds_from.push(
              candidates[0].slot_id || candidates[0].match_id,
            );
        }
      }
    }
    return result;
  });
}

function derivedLane(matches) {
  if (!matches.length) return null;
  const buckets = new Map();
  for (const match of matches) {
    const label =
      clean(match.round_name || match.round || match.stage_name) ||
      "Published schedule";
    const key = normalize(label) || "schedule";
    if (!buckets.has(key))
      buckets.set(key, {
        id: `schedule:${key}`,
        label,
        matches: [],
        starts_at: match.starts_at || "",
      });
    buckets.get(key).matches.push(match);
  }
  const rounds = [...buckets.values()].sort((left, right) =>
    String(left.starts_at).localeCompare(String(right.starts_at)),
  );
  return lane(
    "schedule",
    rounds.length > 1 ? "Published rounds" : "Match schedule",
    rounds,
    "schedule",
  );
}

function uniqueField(event, projection, matches) {
  const rows = [
    ...(event.participants || []),
    ...(projection?.seed_rows || []).map((row) => row.team_name),
    ...matches.flatMap((match) => [match.team1_name, match.team2_name]),
  ]
    .map(clean)
    .filter((team) => team && team !== "TBD");
  return rows.filter(
    (team, index) =>
      rows.findIndex(
        (candidate) => normalize(candidate) === normalize(team),
      ) === index,
  );
}

export function compileBracketContract(event, matches = [], projection = null) {
  if (event.bracket?.rounds)
    event = {
      ...event,
      bracket: {
        ...event.bracket,
        rounds: event.bracket.rounds.map((r) => ({
          ...r,
          matches: (r.matches || []).map((m) => {
            const stored = matches.find(
              (n) =>
                n.match_id === m.match_id ||
                n.alternate_match_ids?.includes(m.match_id),
            );
            return {
              ...m,
              ...stored,
              slot_id: m.slot_id || stored?.slot_id,
              feeds_from: m.feeds_from || stored?.feeds_from,
            };
          }),
        })),
      },
    };
  const projectionOwned = Boolean(
    projection && String(projection.event_id || "") === String(event.id || ""),
  );
  const participants = uniqueField(
    event,
    projectionOwned ? projection : null,
    matches,
  );
  const blueprint = tournamentBlueprint({ ...event, participants });
  let lanes = [];
  let source = "schedule";
  if (projectionOwned) {
    lanes = [
      swissLane(projection.current_stage_board),
      playoffLane(projection.playoff_bracket),
    ].filter(Boolean);
    source = "projection";
  }
  const reconstructed = !projectionOwned
    ? completeKnockoutRounds(event, matches)
    : null;
  if (reconstructed) {
    lanes = [
      lane("knockout", "Knockout stage", reconstructed, "single_elimination"),
    ];
    source = "reconstructed";
  }
  if (!lanes.length) {
    lanes = publishedLanes(event);
    if (lanes.length) source = "published";
  }
  if (!lanes.length) {
    lanes = generateFormatLanes(event, matches, blueprint, participants);
    if (lanes.length) source = "format";
  }
  if (!lanes.length) lanes = [derivedLane(matches)].filter(Boolean);
  const placed = new Set(
    lanes.flatMap((l) =>
      l.rounds.flatMap((r) => r.matches.map((m) => m.match_id)),
    ),
  );
  const unassigned = matches.filter((m) => !placed.has(matchId(m)));
  return {
    coverage: {
      known_matches: matches.length,
      placed_matches: matches.length - unassigned.length,
      unassigned_matches: unassigned.length,
      complete: source === "reconstructed",
    },
    unassigned: unassigned.map((m) =>
      normalizeMatch(m, m.round_name || m.stage_name),
    ),
    contract_version: "1.0",
    event_id: clean(event.id),
    event_name: clean(event.name),
    event_status: clean(event.status || projection?.stage_status || "upcoming"),
    stage: clean(projectionOwned ? projection.stage : event.current_stage),
    source,
    format: event.format || projection?.format || null,
    blueprint,
    field: participants,
    lanes,
    final_records:
      projectionOwned && Array.isArray(projection.final_records)
        ? projection.final_records
        : [],
    matches: matches.map((match) =>
      normalizeMatch(match, match.round_name || match.stage_name),
    ),
  };
}
