import aliases from "../docs/lib/event-aliases.json" with { type: "json" };

const key = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const canonical = (id) => aliases[id] || id;
const day = (m) => String(m.starts_at || m.match_date || "").slice(0, 10);
const numeric = (v) =>
  v !== null &&
  v !== undefined &&
  typeof v !== "boolean" &&
  String(v).trim() !== "" &&
  Number.isFinite(Number(v));

// Join only reviewed event identities; a similar tournament name is not evidence.
export function collectEventResults(event, events, history, current) {
  const related = events.filter(
    (e) =>
      canonical(e.id) === canonical(event.id) ||
      key(e.name) === key(event.name),
  );
  const names = new Set([event, ...related].map((e) => key(e.name)));
  const belongs = (m) =>
    (m.event_id && canonical(m.event_id) === canonical(event.id)) ||
    names.has(key(m.event_name));
  const result = new Map();
  for (const m of [
    ...history.filter(belongs),
    ...related.flatMap((e) => e.matches || []),
    ...(event.matches || []),
    ...(event.bracket?.rounds || []).flatMap((r) => r.matches || []),
    ...current.filter(belongs),
  ]) {
    if (!m.match_id) continue;
    const old = result.get(m.match_id);
    const scores = [m.score1, m.score2].every(numeric);
    const finished =
      /^(finished|completed|ended|final|locked)$/.test(m.status || "") ||
      (!m.status && scores && Number(m.score1) !== Number(m.score2));
    if (old?.status === "finished" && !finished) continue;
    result.set(m.match_id, {
      ...old,
      ...m,
      status: finished ? "finished" : m.status || old?.status || "upcoming",
      starts_at: m.starts_at || old?.starts_at || null,
      match_date: m.match_date || old?.match_date || null,
      series_format:
        m.series_format || (m.best_of ? `bo${m.best_of}` : old?.series_format),
      round_name: m.round_name || old?.round_name || "",
      stage_name: m.stage_name || old?.stage_name || "",
    });
  }
  return uniqueEventResults([...result.values()]).sort(
    (a, b) =>
      day(a).localeCompare(day(b)) ||
      String(a.match_id).localeCompare(String(b.match_id)),
  );
}

// Collapse only a one-to-one cross-provider match with the same day, teams and per-team scores.
export function uniqueEventResults(matches) {
  const signature = (m) => {
    if (
      !day(m) ||
      ![m.score1, m.score2].every(numeric) ||
      Number(m.score1) === Number(m.score2)
    )
      return null;
    return (
      day(m) +
      ":" +
      [
        [key(m.team1_name), Number(m.score1)],
        [key(m.team2_name), Number(m.score2)],
      ]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((t) => t.join("="))
        .join("|")
    );
  };
  const buckets = new Map();
  for (const m of matches) {
    const k = signature(m);
    if (k) buckets.set(k, [...(buckets.get(k) || []), m]);
  }
  const removed = new Set(),
    aliases = new Map();
  for (const rows of buckets.values()) {
    const old = rows.filter((m) => String(m.match_id).startsWith("hltv:"));
    const live = rows.filter((m) =>
      String(m.match_id).startsWith("pandascore:"),
    );
    if (rows.length === 2 && old.length === 1 && live.length === 1) {
      removed.add(old[0].match_id);
      aliases.set(live[0].match_id, [old[0].match_id]);
    }
  }
  return matches
    .filter((m) => !removed.has(m.match_id))
    .map((m) =>
      aliases.has(m.match_id)
        ? { ...m, alternate_match_ids: aliases.get(m.match_id) }
        : m,
    );
}

// Reconstruct only a complete, provable knockout field; mixed/group formats stay unassigned.
export function completeKnockoutRounds(event, matches) {
  if (event.format?.type !== "single_elimination" || matches.length < 3)
    return null;
  const teams = new Set(matches.flatMap((m) => [m.team1_name, m.team2_name]));
  if (
    teams.has("TBD") ||
    teams.size !== matches.length + 1 ||
    teams.size & (teams.size - 1)
  )
    return null;
  const losses = new Set();
  const winner = (m) => {
    if (!/^(finished|completed|ended|final|locked)$/.test(m.status || ""))
      return null;
    if (
      ![m.score1, m.score2].every(numeric) ||
      Number(m.score1) === Number(m.score2)
    )
      return null;
    return Number(m.score1) > Number(m.score2) ? m.team1_name : m.team2_name;
  };
  for (const m of matches) {
    const w = winner(m);
    if (!w) return null;
    const loser = w === m.team1_name ? m.team2_name : m.team1_name;
    if (losses.has(loser)) return null;
    losses.add(loser);
  }
  const champions = [...teams].filter((t) => !losses.has(t));
  if (champions.length !== 1) return null;
  const wins = new Map(
    [...teams].map((t) => [t, matches.filter((m) => winner(m) === t).length]),
  );
  const finals = matches.filter(
    (m) =>
      winner(m) === champions[0] &&
      !matches.some(
        (n) =>
          n !== m &&
          [n.team1_name, n.team2_name].includes(m.team1_name) &&
          [n.team1_name, n.team2_name].includes(m.team2_name),
      ),
  );
  const publishedFinalIds = new Set(
    (event.bracket?.rounds || [])
      .filter((r) => /^(grand )?final$/i.test(r.name || r.label || ""))
      .flatMap((r) => (r.matches || []).map((m) => m.match_id)),
  );
  const final = finals.filter(
    (m) =>
      publishedFinalIds.has(m.match_id) ||
      m.alternate_match_ids?.some((id) => publishedFinalIds.has(id)),
  );
  if (final.length !== 1) return null;
  const levels = [[final[0]]],
    used = new Set([final[0].match_id]);
  while (levels.at(-1).length < teams.size / 2) {
    const next = [];
    for (const parent of levels.at(-1))
      for (const team of [parent.team1_name, parent.team2_name]) {
        // In a complete balanced knockout, the defeated opponent proves the preceding round.
        const priorWins = Math.log2(teams.size) - levels.length - 1;
        const prior = matches.filter(
          (m) =>
            !used.has(m.match_id) &&
            winner(m) === team &&
            wins.get(m.team1_name === team ? m.team2_name : m.team1_name) ===
              priorWins,
        );
        if (prior.length !== 1) return null;
        used.add(prior[0].match_id);
        next.push(prior[0]);
      }
    levels.push(next);
  }
  if (used.size !== matches.length) return null;
  return levels
    .reverse()
    .map((rows, i, all) => ({
      id: `reconstructed:${i}`,
      label:
        rows.length === 1
          ? "Grand final"
          : rows.length === 2
            ? "Semifinals"
            : rows.length === 4
              ? "Quarterfinals"
              : `Round of ${rows.length * 2}`,
      order: i + 1,
      matches: rows.map((m) => ({
        ...m,
        feeds_from: i
          ? all[i - 1]
              .filter((n) => [m.team1_name, m.team2_name].includes(winner(n)))
              .map((n) => n.match_id)
          : [],
      })),
    }));
}
