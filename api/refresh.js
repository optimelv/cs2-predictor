export default async function handler(request, response) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return response.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return response.status(200).json({
    ok: true,
    mode: "static-fallback",
    scheduled: false,
    configured: Boolean(process.env.PREDICTIONS_SNAPSHOT_URL),
    message:
      "No Vercel cron is configured for this project. This route reports the static fallback; set PREDICTIONS_SNAPSHOT_URL to a writable snapshot service if you want this endpoint to persist refreshed predictions.",
  });
}
