import { useState } from "react";
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readLocal(key, fallback));
  const [error, setError] = useState("");
  function save(next: T) {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setError("");
    } catch {
      setError(
        "Browser storage is unavailable. Changes are kept for this session only.",
      );
    }
  }
  return [value, save, error] as const;
}
export interface Pick {
  match_id: string;
  team_name: string;
  opponent_name: string;
  event_name: string;
  starts_at?: string;
  probability: number;
  saved_at: string;
}
export const PICKS_KEY = "strikesignal.saved-picks.v1";
