export default async function handler(request, response) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return response.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return response.status(200).json({
    ok: true,
    mode: "static-fallback",
    message:
      "Vercel cron is configured. To persist live refreshed predictions, set PREDICTIONS_SNAPSHOT_URL to a writable snapshot service or add Vercel Blob storage.",
  });
}
