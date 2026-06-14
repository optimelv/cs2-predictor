const MATCHES_URL = "https://result-api.majors.im/scores/2606_cs2_cologne/merged_matches.json";
const SCORES_URL = "https://result-api.majors.im/scores/2606_cs2_cologne/merged_scores.json";
const ACTIVE_MAPS = ["Ancient", "Anubis", "Dust2", "Inferno", "Mirage", "Nuke", "Overpass"];

const TEAM_ALIASES = {
  vita: "Vitality",
  vitality: "Vitality",
  navi: "NAVI",
  spir: "Spirit",
  spirit: "Spirit",
  falc: "Falcons",
  falcons: "Falcons",
  mong: "The MongolZ",
  mongolz: "The MongolZ",
  pv: "PARIVISION",
  parivision: "PARIVISION",
  auro: "Aurora",
  aurora: "Aurora",
  furi: "FURIA",
  furia: "FURIA",
  mouz: "MOUZ",
  fut: "FUT",
  g2: "G2",
  betb: "BetBoom",
  betboom: "BetBoom",
  "9z": "9z",
  monte: "Monte",
  b8: "B8",
  lega: "Legacy",
  legacy: "Legacy",
  tdu: "Thunder dUnder",
  thunderdownunder: "Thunder dUnder",
  tylo: "TYLOO",
  tyloo: "TYLOO",
  gg: "Gaimin Gladiators",
  gaimingladiators: "Gaimin Gladiators",
  liqu: "Liquid",
  liquid: "Liquid",
  big: "BIG",
  hero: "HEROIC",
  heroic: "HEROIC",
  gl: "GamerLegion",
  gamerlegion: "GamerLegion",
  fly: "FlyQuest",
  flyquest: "FlyQuest",
  nrg: "NRG",
  lvg: "Lynn Vision",
  lynnvision: "Lynn Vision",
  shks: "Sharks",
  sharks: "Sharks",
  mibr: "MIBR",
  m80: "M80",
  sinn: "SINNERS",
  sinners: "SINNERS",
  astr: "Astralis",
  astralis: "Astralis",
  pain: "paiN",
};

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value !== "object") return null;
  return value.name ?? value.short ?? value.slug ?? value.code ?? value.id ?? null;
}

function normalizeTeam(value) {
  const nestedValue = value && typeof value === "object"
    ? firstValue(value, ["team", "participant", "opponent", "competitor", "value"])
    : null;
  const nested = nestedValue ?? value;
  const raw = String(scalar(nested) ?? "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return TEAM_ALIASES[key] || raw;
}

function knownTeam(value) {
  const raw = String(scalar(value) ?? "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return TEAM_ALIASES[key] || "";
}

function collectKnownTeams(value, output = [], depth = 0) {
  if (value === null || value === undefined || depth > 4) return output;
  if (typeof value === "string" || typeof value === "number") {
    const team = knownTeam(value);
    if (team && !output.includes(team)) output.push(team);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectKnownTeams(item, output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    Object.keys(value).forEach((key) => collectKnownTeams(key, output, depth + 1));
    Object.values(value).forEach((item) => collectKnownTeams(item, output, depth + 1));
  }
  return output;
}

function firstValue(object, keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
  }
  return null;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(scalar(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstArray(object, keys) {
  for (const key of keys) {
    if (Array.isArray(object?.[key]) && object[key].length >= 2) return object[key];
  }
  return null;
}

function matchupKey(path) {
  return [...path].reverse().find((part) => /^[a-z0-9]+-[a-z0-9]+$/i.test(part)) || "";
}

function teamPairFromLink(object) {
  const link = String(firstValue(object, ["link", "url", "href"]) ?? "");
  const match = link.match(/\/match\/\d+\/(.+?)-vs-(.+?)-iem-cologne-major-2026(?:-|$)/i);
  if (!match) return ["", ""];
  return [normalizeTeam(match[1]), normalizeTeam(match[2])];
}

function teamPair(object, path) {
  const direct1 = firstValue(object, ["team1", "teamA", "team_a", "home", "left", "firstTeam", "teamOne", "opponent1", "t1", "a"]);
  const direct2 = firstValue(object, ["team2", "teamB", "team_b", "away", "right", "secondTeam", "teamTwo", "opponent2", "t2", "b"]);
  if (direct1 !== null && direct2 !== null) return [normalizeTeam(direct1), normalizeTeam(direct2)];

  const sides = firstArray(object, ["teams", "participants", "opponents", "competitors", "sides"]);
  if (sides) return [normalizeTeam(sides[0]), normalizeTeam(sides[1])];

  const key = matchupKey(path);
  if (key) {
    const pair = key.split("-").map(knownTeam);
    if (pair.every(Boolean)) return pair;
  }

  const linked = teamPairFromLink(object);
  if (linked.every(Boolean)) return linked;

  const inferred = collectKnownTeams(object);
  return inferred.length >= 2 ? inferred.slice(0, 2) : ["", ""];
}

function scorePair(object) {
  const direct1 = numeric(firstValue(object, ["team1Score", "team1_score", "score1", "homeScore", "scoreA", "leftScore", "s1"]));
  const direct2 = numeric(firstValue(object, ["team2Score", "team2_score", "score2", "awayScore", "scoreB", "rightScore", "s2"]));
  if (direct1 !== null || direct2 !== null) return [direct1, direct2];

  const scores = firstArray(object, ["score", "scores", "result", "results"]);
  if (scores) return scorePair(scores);

  if (Array.isArray(object)) {
    const mapScores = object
      .filter((value) => Array.isArray(value) && value.length === 2)
      .map((value) => value.map(numeric))
      .filter((pair) => pair.every((score) => score !== null && score >= 0));
    if (mapScores.length === object.length && mapScores.every(([left, right]) => left !== right)) {
      return mapScores.reduce(
        ([leftWins, rightWins], [left, right]) => [leftWins + Number(left > right), rightWins + Number(right > left)],
        [0, 0],
      );
    }
    for (const value of object) {
      if (!Array.isArray(value) || value.length !== 2) continue;
      const pair = value.map(numeric);
      if (pair.every((score) => score !== null && score >= 0 && score <= 3)) return pair;
    }
    if (object.length === 2) {
      const pair = object.map(numeric);
      if (pair.every((score) => score !== null && score >= 0 && score <= 3)) return pair;
    }
  }

  const teamKeys = Object.keys(object || {}).filter((key) => knownTeam(key));
  if (teamKeys.length >= 2) {
    const pair = teamKeys.slice(0, 2).map((key) => numeric(object[key]));
    if (pair.some((score) => score !== null)) return pair;
  }
  return [null, null];
}

function mapsFromValue(value, output = new Set(), depth = 0) {
  if (value === null || value === undefined || depth > 5) return output;
  if (typeof value === "string") {
    const normalized = value.toLowerCase().replace(/dust\s*ii/g, "dust2");
    ACTIVE_MAPS
      .map((mapName) => ({ mapName, index: normalized.indexOf(mapName.toLowerCase()) }))
      .filter((row) => row.index >= 0)
      .sort((a, b) => a.index - b.index)
      .forEach((row) => output.add(row.mapName));
    return output;
  }
  if (typeof value === "number" || typeof value === "boolean") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => mapsFromValue(item, output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => mapsFromValue(item, output, depth + 1));
  }
  return output;
}

function extractMaps(object) {
  const output = new Set();
  Object.entries(object || {}).forEach(([key, value]) => {
    if (/map|veto|pick|decider/i.test(key)) mapsFromValue(value, output);
  });
  return [...output];
}

function walk(value, visit, path = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, visit, [...path, String(index)], seen));
    return;
  }
  Object.entries(value).forEach(([key, child]) => walk(child, visit, [...path, key], seen));
}

function candidateFromObject(object, path) {
  const [team1, team2] = teamPair(object, path);
  const key = matchupKey(path);
  const pathId = key || path.at(-1) || path.join(":");
  const id = String(firstValue(object, ["hltvMatchId", "matchId", "match_id", "id", "uid", "key"]) ?? pathId);
  const [score1, score2] = scorePair(object);
  const status = String(firstValue(object, ["status", "state", "phase", "matchStatus"]) ?? "");
  const round = numeric(firstValue(object, ["round", "roundNumber", "round_number"]));
  const stage = /^\d+$/.test(path[0] || "") ? Number(path[0]) : null;
  return { id, key, stage, team1, team2, score1, score2, status, round, maps: extractMaps(object) };
}

function normalizeMatches(matchPayload, scorePayload) {
  const scoreById = new Map();
  const scoreByPair = new Map();
  walk(scorePayload, (object, path) => {
    const candidate = candidateFromObject(object, path);
    if (candidate.score1 === null && candidate.score2 === null) return;
    scoreById.set(candidate.id, candidate);
    if (candidate.team1 && candidate.team2) {
      scoreByPair.set(`${candidate.stage}:${[candidate.team1, candidate.team2].sort().join(":")}`, candidate);
    }
  });

  const matches = [];
  const seenPairs = new Set();
  const collectMatch = (object, path) => {
    const candidate = candidateFromObject(object, path);
    if (!candidate.team1 || !candidate.team2 || candidate.team1 === candidate.team2) return;
    const pairKey = [candidate.team1, candidate.team2].sort().join(":");
    const score = scoreById.get(candidate.id) || scoreByPair.get(`${candidate.stage}:${pairKey}`);
    const scoreReversed = score && score.team1 === candidate.team2 && score.team2 === candidate.team1;
    const score1 = scoreReversed ? score?.score2 : score?.score1;
    const score2 = scoreReversed ? score?.score1 : score?.score2;
    const row = {
      ...candidate,
      score1: candidate.score1 ?? score1 ?? null,
      score2: candidate.score2 ?? score2 ?? null,
      status: candidate.status || score?.status || "",
      maps: [...new Set([...(candidate.maps || []), ...(score?.maps || [])])],
    };
    const matchKey = `${candidate.stage}:${pairKey}`;
    if (seenPairs.has(matchKey)) return;
    seenPairs.add(matchKey);
    if (row.score1 !== null && row.score2 !== null && Math.max(row.score1, row.score2) >= 2) {
      row.status = "completed";
      row.winner = row.score1 > row.score2 ? row.team1 : row.team2;
    }
    matches.push(row);
  };
  walk(matchPayload, collectMatch);
  walk(scorePayload, collectMatch);
  return matches;
}

function payloadShape(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 12) };
  return { type: typeof value };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=90");
  try {
    const [matchesResponse, scoresResponse] = await Promise.all([
      fetch(MATCHES_URL, { headers: { Accept: "application/json" } }),
      fetch(SCORES_URL, { headers: { Accept: "application/json" } }),
    ]);
    if (!matchesResponse.ok || !scoresResponse.ok) {
      throw new Error(`Live source returned ${matchesResponse.status}/${scoresResponse.status}`);
    }
    const [matchPayload, scorePayload] = await Promise.all([matchesResponse.json(), scoresResponse.json()]);
    const matches = normalizeMatches(matchPayload, scorePayload);
    if (!matches.length) {
      return response.status(502).json({
        ok: false,
        error: "Live source parsed no matches",
        source_shapes: {
          matches: payloadShape(matchPayload),
          scores: payloadShape(scorePayload),
        },
      });
    }
    return response.status(200).json({
      ok: true,
      event: "IEM Cologne Major 2026",
      fetched_at_utc: new Date().toISOString(),
      matches,
    });
  } catch (error) {
    return response.status(502).json({ ok: false, error: error.message });
  }
}

export { normalizeMatches };
