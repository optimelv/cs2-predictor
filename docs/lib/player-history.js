export function mergePlayerTimeline(existing = [], incoming = [], limit = 18) {
  const byMatch = new Map(existing.filter((row) => row?.match_id && row?.date).map((row) => [String(row.match_id), row]));
  incoming.forEach((row) => {
    if (!row?.match_id || !row?.date) return;
    byMatch.set(String(row.match_id), { ...(byMatch.get(String(row.match_id)) || {}), ...row });
  });
  return [...byMatch.values()]
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .slice(-limit);
}

export function summarizePlayerTimeline(timeline = []) {
  const rated = timeline.filter((row) => Number.isFinite(Number(row.rating)));
  const adrRows = timeline.filter((row) => Number.isFinite(Number(row.adr)));
  const recent = rated.slice(-3);
  const previous = rated.slice(-6, -3);
  const average = (rows, key) => rows.length ? rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length : null;
  const recentRating = average(recent, "rating");
  const previousRating = average(previous, "rating");
  const averageRating = average(rated, "rating");
  const averageAdr = average(adrRows, "adr");
  return {
    series: timeline.length,
    average_rating: averageRating === null ? null : Number(averageRating.toFixed(2)),
    average_adr: averageAdr === null ? null : Number(averageAdr.toFixed(1)),
    recent_rating: recentRating === null ? null : Number(recentRating.toFixed(2)),
    rating_delta: recentRating === null || previousRating === null ? null : Number((recentRating - previousRating).toFixed(2)),
  };
}

export function summarizePlayerMaps(mapProfile = []) {
  const rows = mapProfile.filter((row) => row?.map_name && Number(row.maps) > 0);
  const totalMaps = rows.reduce((sum, row) => sum + Number(row.maps), 0);
  const best = [...rows]
    .filter((row) => Number(row.maps) >= 3 && Number.isFinite(Number(row.average_rating)))
    .sort((left, right) => Number(right.average_rating) - Number(left.average_rating) || Number(right.maps) - Number(left.maps))[0] || null;
  return {
    maps: totalMaps,
    map_count: rows.length,
    best_map: best?.map_name || null,
    best_rating: best ? Number(best.average_rating) : null,
  };
}

export function summarizePlayerEvents(timeline = []) {
  const grouped = new Map();
  for (const row of timeline) {
    const name = String(row?.event_name || "CS2 event");
    const event = grouped.get(name) || { event_name: name, series: 0, wins: 0, losses: 0, ratings: [], adr: [], through_date: "" };
    event.series += 1;
    if (row.won === true) event.wins += 1;
    if (row.won === false) event.losses += 1;
    if (Number.isFinite(Number(row.rating))) event.ratings.push(Number(row.rating));
    if (Number.isFinite(Number(row.adr))) event.adr.push(Number(row.adr));
    if (String(row.date || "") > event.through_date) event.through_date = String(row.date || "");
    grouped.set(name, event);
  }
  return [...grouped.values()].map((event) => ({
    event_name: event.event_name,
    series: event.series,
    wins: event.wins,
    losses: event.losses,
    average_rating: event.ratings.length ? Number((event.ratings.reduce((sum, value) => sum + value, 0) / event.ratings.length).toFixed(2)) : null,
    average_adr: event.adr.length ? Number((event.adr.reduce((sum, value) => sum + value, 0) / event.adr.length).toFixed(1)) : null,
    through_date: event.through_date,
  })).sort((left, right) => right.through_date.localeCompare(left.through_date) || right.series - left.series);
}

export function summarizePlayerRosterEras(timeline = []) {
  const grouped = new Map();
  for (const row of timeline) {
    const name = String(row?.team_name || "Team pending");
    const era = grouped.get(name) || { team_name: name, rows: [] };
    era.rows.push(row);
    grouped.set(name, era);
  }
  return [...grouped.values()].map(({ team_name, rows }) => {
    const rated = rows.filter((row) => Number.isFinite(Number(row.rating)));
    const adr = rows.filter((row) => Number.isFinite(Number(row.adr)));
    const decided = rows.filter((row) => typeof row.won === "boolean");
    const wins = rows.filter((row) => row.won === true).length;
    return {
      team_name,
      from_date: rows.map((row) => String(row.date || "")).filter(Boolean).sort()[0] || "",
      through_date: rows.map((row) => String(row.date || "")).filter(Boolean).sort().at(-1) || "",
      series: rows.length,
      wins,
      losses: rows.filter((row) => row.won === false).length,
      win_rate: decided.length ? Number((wins / decided.length).toFixed(3)) : null,
      average_rating: rated.length ? Number((rated.reduce((sum, row) => sum + Number(row.rating), 0) / rated.length).toFixed(2)) : null,
      average_adr: adr.length ? Number((adr.reduce((sum, row) => sum + Number(row.adr), 0) / adr.length).toFixed(1)) : null,
    };
  }).sort((left, right) => right.through_date.localeCompare(left.through_date) || right.series - left.series);
}
