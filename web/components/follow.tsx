import { createContext, useContext } from "react";
import { Star } from "lucide-react";
import { useStored } from "@/lib/storage";
import {
  normalizeWatchlist,
  toggleWatchlist,
  watchlistHas,
} from "../../docs/lib/watchlist.js";
import { Button } from "./ui/button";
type Kind = "teams" | "players" | "events";
interface Watches {
  version: number;
  teams: { id: string; name: string }[];
  players: { id: string; name: string }[];
  events: { id: string; name: string }[];
}
const Context = createContext<{
  value: Watches;
  toggle: (kind: Kind, id: string, name: string) => void;
  error: string;
} | null>(null);
export function FollowProvider({ children }: { children: React.ReactNode }) {
  const [stored, save, error] = useStored("strikesignal.watchlist.v1", {});
  const value = normalizeWatchlist(stored) as Watches;
  return (
    <Context.Provider
      value={{
        value,
        error,
        toggle: (kind, id, name) =>
          save(toggleWatchlist(value, kind, { id, name })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useFollowing() {
  return useContext(Context)!;
}
export function Follow({
  kind,
  id,
  name,
}: {
  kind: Kind;
  id: string;
  name: string;
}) {
  const { value, toggle, error } = useFollowing();
  const active = watchlistHas(value, kind, id);
  return (
    <>
      <Button
        variant="outline"
        aria-pressed={active}
        onClick={() => toggle(kind, id, name)}
      >
        <Star
          fill={active ? "currentColor" : "none"}
          data-icon="inline-start"
        />
        {active ? "Following" : "Follow"}
      </Button>
      {error && <p role="status">{error}</p>}
    </>
  );
}
