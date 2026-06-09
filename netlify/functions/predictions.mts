import type { Context, Config } from "@netlify/functions";
import { jsonResponse, predictionStore, readStaticSnapshot } from "./lib/prediction-store.mjs";

export default async (req: Request, _context: Context) => {
  const stored = await predictionStore().get("latest", { type: "json" });
  if (stored) return jsonResponse(stored);

  try {
    return jsonResponse(await readStaticSnapshot(req));
  } catch (error) {
    return jsonResponse(
      {
        error: "Prediction snapshot unavailable",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
};

export const config: Config = {
  path: "/api/predictions",
};
