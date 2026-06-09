import { readFile } from "node:fs/promises";
import { join } from "node:path";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");

  if (process.env.PREDICTIONS_SNAPSHOT_URL) {
    try {
      const live = await fetch(process.env.PREDICTIONS_SNAPSHOT_URL, { cache: "no-store" });
      if (live.ok) {
        return response.status(200).json(await live.json());
      }
    } catch (error) {
      console.warn("Live prediction snapshot unavailable; using bundled fallback.", error);
    }
  }

  const file = await readFile(join(process.cwd(), "docs", "data", "predictions.json"), "utf8");
  return response.status(200).json(JSON.parse(file));
}
