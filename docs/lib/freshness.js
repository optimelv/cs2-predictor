export const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;

export function snapshotFreshness(timestamp, now = Date.now()) {
  const time = typeof timestamp === 'string' && timestamp.trim() ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(time) || time > now) return { state: 'unknown', fresh: false, ageMs: null, timestamp: null };
  const ageMs = now - time;
  return { state: ageMs <= FRESH_WINDOW_MS ? 'fresh' : 'stale', fresh: ageMs <= FRESH_WINDOW_MS, ageMs, timestamp: new Date(time).toISOString() };
}

export function snapshotTimestamp(data) {
  // An explicit but malformed source time must not fall through to build time.
  return data?.coverage?.last_verified_utc ?? data?.fetched_at_utc ?? data?.generated_at_utc;
}

export function canApplySnapshot(incomingTime, currentTime, now = Date.now()) {
  const incoming = snapshotFreshness(incomingTime, now);
  const current = snapshotFreshness(currentTime, now);
  return incoming.state !== 'unknown' && (current.state === 'unknown' || Date.parse(incomingTime) >= Date.parse(currentTime));
}

export function pickEligibility(match, freshness, now = Date.now()) {
  if (!freshness.fresh) return { allowed: false, reason: 'Picks are paused until the source is current.' };
  if (!/^(upcoming|scheduled|pending)$/i.test(String(match?.status || 'upcoming'))) return { allowed: false, reason: 'Picks close when the series starts.' };
  const startsAt = Date.parse(match?.starts_at);
  if (!Number.isFinite(startsAt) || startsAt <= now) return { allowed: false, reason: 'A verified future start time is required.' };
  const probability = match?.prob_team1;
  if (probability == null || !Number.isFinite(Number(probability)) || Number(probability) <= 0 || Number(probability) >= 1 || match?.model_coverage === 'limited') return { allowed: false, reason: 'A verified forecast is required to save a pick.' };
  return { allowed: true, reason: 'Stored on this device. Picks lock at match start.' };
}
