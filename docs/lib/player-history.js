export function mergePlayerTimeline(existing = [], incoming = [], limit = 12) {
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
