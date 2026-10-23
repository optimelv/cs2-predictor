export const playerStatNumber = (value) => ["number", "string"].includes(typeof value) && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;

export function mergePlayerProfile(existing = {}, incoming = {}) {
  const incomingTimeline = incoming.form_timeline || (incoming.timeline_entry ? [incoming.timeline_entry] : []);
  const timeline = mergePlayerTimeline(existing.form_timeline, incomingTimeline);
  const profile = {
    ...existing, ...incoming,
    traits: { ...(existing.traits || {}) },
    form_timeline: timeline,
    form_summary: summarizePlayerTimeline(timeline),
    roster_eras: incomingTimeline.length ? summarizePlayerRosterEras(timeline) : (existing.roster_eras || []),
    map_profile: incoming.map_profile?.length ? incoming.map_profile : (existing.map_profile || []),
  };
  const datedStats = (incoming.stats_window === "past_3_months" || /^\d{4}-\d{2}-\d{2}$/.test(incoming.stats_from_date || ""))
    && /^\d{4}-\d{2}-\d{2}$/.test(incoming.stats_through_date || "")
    && (!incoming.stats_from_date || incoming.stats_from_date <= incoming.stats_through_date)
    && incoming.stats_through_date <= new Date().toISOString().slice(0, 10)
    && incoming.stats_through_date >= (existing.stats_through_date || "");
  for (const key of ["rating_3_0", "maps_3m", "kd_ratio_3m", "stats_window", "stats_from_date", "stats_through_date", "stats_fetched_at_utc", "stats_source_url"]) {
    profile[key] = datedStats && Object.hasOwn(incoming, key) ? incoming[key] : existing[key] ?? null;
  }
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && value <= new Date().toISOString().slice(0, 10);
  const existingTraitsDate = existing.traits_through_date || existing.stats_through_date || null;
  const incomingTraitsDate = incoming.traits_through_date || (Object.keys(incoming.traits || {}).length ? incoming.stats_through_date : null);
  const completeTraits = Object.keys(incoming.traits || {}).length === 7
    && Object.values(incoming.traits).every((value) => Number.isInteger(value) && value >= 0 && value <= 100);
  if (completeTraits && validDate(incomingTraitsDate) && (!existingTraitsDate || incomingTraitsDate >= existingTraitsDate)) {
    profile.traits = { ...incoming.traits };
    profile.traits_through_date = incomingTraitsDate;
  } else {
    profile.traits = existing.traits || {};
    profile.traits_through_date = existingTraitsDate;
  }

  const existingSignalDate = existing.signal_index_through_date || existingTraitsDate;
  const incomingSignalDate = incoming.signal_index_through_date || (completeTraits ? incomingTraitsDate : null);
  if (Number.isFinite(incoming.signal_index) && validDate(incomingSignalDate) && (!existingSignalDate || incomingSignalDate >= existingSignalDate)) {
    profile.signal_index = incoming.signal_index;
    profile.signal_index_through_date = incomingSignalDate;
  } else {
    profile.signal_index = existing.signal_index ?? null;
    profile.signal_index_through_date = existingSignalDate;
  }

  // Match lineups are observations, while a fresh verified profile is the authority for the player's team.
  const trustedProfileUpdate = /^\d{4}-\d{2}-\d{2}T/.test(incoming.profile_fetched_at_utc || "") && typeof incoming.source_url === "string";
  if (!datedStats && !trustedProfileUpdate && existing.stats_through_date && existing.stats_through_date >= (incomingTimeline.map((row) => row.date || "").sort().at(-1) || "")) profile.team_name = existing.team_name;
  return profile;
}

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
  const rated = timeline.filter((row) => playerStatNumber(row.rating) !== null);
  const adrRows = timeline.filter((row) => playerStatNumber(row.adr) !== null);
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
    .filter((row) => Number(row.maps) >= 3 && playerStatNumber(row.average_rating) !== null)
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
    if (playerStatNumber(row.rating) !== null) event.ratings.push(Number(row.rating));
    if (playerStatNumber(row.adr) !== null) event.adr.push(Number(row.adr));
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
    const rated = rows.filter((row) => playerStatNumber(row.rating) !== null);
    const adr = rows.filter((row) => playerStatNumber(row.adr) !== null);
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
