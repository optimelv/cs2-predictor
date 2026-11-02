import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Sun, RefreshCw } from "lucide-react";
import {
  loadDesk,
  refreshFeed,
  mergeDesk,
  sourceAge,
  type DeskData,
} from "@/lib/data";
import { readLocal } from "@/lib/storage";
import { FollowProvider } from "@/components/follow";
import "./styles.css";
const EventList = lazy(() =>
  import("@/views/events").then((m) => ({ default: m.EventList })),
);
const Matches = lazy(() =>
  import("@/views/matches").then((m) => ({ default: m.Matches })),
);
const Players = lazy(() =>
  import("@/views/players").then((m) => ({ default: m.Players })),
);
const Teams = lazy(() =>
  import("@/views/teams").then((m) => ({ default: m.Teams })),
);
const History = lazy(() =>
  import("@/views/history").then((m) => ({ default: m.History })),
);
const Evidence = lazy(() =>
  import("@/views/evidence").then((m) => ({ default: m.Evidence })),
);
const Showcase = lazy(() =>
  import("@/showcase").then((m) => ({ default: m.Showcase })),
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="canvas">
        <Alert>
          <AlertTitle>This view could not be displayed</AlertTitle>
          <AlertDescription>
            Your saved picks are still on this device. Reload to try again.
          </AlertDescription>
        </Alert>
        <Button onClick={() => location.reload()}>Reload page</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `StrikeSignal — ${pathname.includes("events") ? "Events" : pathname.includes("players") ? "Players" : pathname.includes("teams") ? "Teams" : pathname.includes("system") ? "Interface system" : "Match desk"}`;
    window.scrollTo(0, 0);
    const main = document.getElementById("main-content");
    const observer = new MutationObserver(focusHeading);
    function focusHeading() {
      const heading = main?.querySelector<HTMLElement>("h1");
      if (heading && heading.getClientRects().length) {
        heading.focus({ preventScroll: true });
        observer.disconnect();
        return true;
      }
      return false;
    }
    if (!focusHeading() && main)
      observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
function App() {
  const [dark, setDark] = useState(
    () => readLocal<string>("strikesignal.next.theme", "dark") !== "light",
  );
  const [data, setData] = useState<DeskData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef<DeskData | null>(null);
  const [clock, setClock] = useState(Date.now());
  async function refresh() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 20_000);
    setLoading(true);
    try {
      let incoming = mergeDesk(loaded.current, await loadDesk(request.signal));
      if (request.signal.aborted) return;
      loaded.current = incoming;
      setData(incoming);
      incoming = await refreshFeed(incoming, request.signal);
      if (request.signal.aborted) return;
      setData((old) => {
        const a = Date.parse(old?.snapshot.coverage.last_verified_utc || "");
        const b = Date.parse(
          incoming.snapshot.coverage.last_verified_utc || "",
        );
        if (Number.isFinite(a) && Number.isFinite(b) && b < a) return old;
        loaded.current = incoming;
        return incoming;
      });
      setError("");
    } catch {
      if (controller.current === request) {
        if (loaded.current) {
          loaded.current = { ...loaded.current, feedUnavailable: true };
          setData(loaded.current);
        }
        setError(
          "Unable to refresh. The last loaded data stays available. Check your connection and try again.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    refresh();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) refresh();
    }, data?.pollAfterMs || 180_000);
    const wake = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [data?.pollAfterMs]);
  useEffect(() => {
    document.documentElement.classList.add("theme-switching");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(
        "strikesignal.next.theme",
        JSON.stringify(dark ? "dark" : "light"),
      );
    } catch {}
    void document.body.offsetHeight;
    requestAnimationFrame(() =>
      document.documentElement.classList.remove("theme-switching"),
    );
  }, [dark]);
  const stamp = data?.snapshot.coverage.last_verified_utc;
  const age = sourceAge(stamp, clock);
  const stale = age === null || age > 12 * 3_600_000 || data?.feedUnavailable;
  return (
    <TooltipProvider>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="#/matches">
            <span className="signal-mark" aria-hidden="true">
              ↗
            </span>
            StrikeSignal<span className="brand-dot">.</span>
          </a>
          <nav aria-label="Main navigation">
            <NavLink to="/matches">Matches</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/players">Players</NavLink>
            <NavLink to="/teams">Teams</NavLink>
            <NavLink to="/picks">My picks</NavLink>
          </nav>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              dark ? "Switch to light appearance" : "Switch to dark appearance"
            }
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <main className="canvas" id="main-content" tabIndex={-1}>
        <RouteFocus />
        <div className="freshness" role="status">
          <span>
            {data
              ? stale
                ? "Updates delayed"
                : "Verified snapshot"
              : "Loading published data"}
            {stamp && (
              <> · Source checked {new Date(stamp).toLocaleString("en-GB")}</>
            )}
          </span>
          <Button
            variant="ghost"
            aria-busy={loading}
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw data-icon="inline-start" />
            {loading ? "Checking…" : "Refresh"}
          </Button>
        </div>
        {data && stale && (
          <Alert className="source-notice">
            <AlertTitle>Showing the last verified data</AlertTitle>
            <AlertDescription>
              New picks are paused until the match source is current.{" "}
              <NavLink to="/evidence">View data coverage</NavLink>
            </AlertDescription>
          </Alert>
        )}
        {data?.warnings.map((w) => (
          <Alert key={w}>
            <AlertTitle>Some data is unavailable</AlertTitle>
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}
        {error && (
          <Alert role="alert">
            <AlertTitle>Refresh unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!data && !error && (
          <div
            className="loading-layout"
            role="status"
            aria-label="Loading match desk"
            aria-busy="true"
          >
            <Skeleton className="h-8 w-48" />
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-28 w-full" />
            ))}
          </div>
        )}
        <Suspense fallback={<Skeleton className="h-28 w-full" />}>
          <Routes>
            <Route path="/system" element={<Showcase />} />
            <Route path="/history/*" element={<History />} />
            <Route
              path="/events/*"
              element={data ? <EventList data={data} /> : null}
            />
            <Route
              path="/players/*"
              element={data ? <Players data={data} /> : null}
            />
            <Route
              path="/teams/*"
              element={data ? <Teams data={data} /> : null}
            />
            <Route
              path="/evidence"
              element={data ? <Evidence data={data} /> : null}
            />
            <Route
              path="/picks"
              element={data ? <Matches data={data} picksOnly /> : null}
            />
            <Route
              path="/matches/*"
              element={data ? <Matches data={data} /> : null}
            />
            <Route path="*" element={data ? <Matches data={data} /> : null} />
          </Routes>
        </Suspense>
        <footer className="site-footer">
          <span>CS2, with the evidence in view.</span>
          <NavLink to="/evidence">Data & model</NavLink>
          <NavLink to="/history">Results archive</NavLink>
          <NavLink to="/system">Interface system</NavLink>
          <a href="/legacy.html#featured">
            Tournament simulator & classic tools
          </a>
        </footer>
      </main>
    </TooltipProvider>
  );
}
const params = new URLSearchParams(location.search);
if (!location.hash.startsWith("#/")) {
  const kind = ["match", "player", "team", "event"].find((k) => params.has(k));
  if (params.has("pickem") || params.has("desk")) {
    location.replace("/legacy.html" + location.search + location.hash);
  } else if (params.has("compare")) {
    history.replaceState(
      null,
      "",
      "/#/players?compare=" + encodeURIComponent(params.get("compare")!),
    );
  } else if (kind) {
    const paths: Record<string, string> = {
      match: "matches",
      player: "players",
      team: "teams",
      event: "events",
    };
    history.replaceState(
      null,
      "",
      "/#/" + paths[kind] + "/" + encodeURIComponent(params.get(kind)!),
    );
  } else {
    const old = location.hash.slice(1);
    history.replaceState(
      null,
      "",
      "/#/" +
        ({
          rankings: "teams",
          featured: "events",
          model: "evidence",
          desk: "picks",
        }[old] || (old === "players" || old === "events" ? old : "matches")),
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HashRouter>
      <FollowProvider>
        <App />
      </FollowProvider>
    </HashRouter>
  </ErrorBoundary>,
);
