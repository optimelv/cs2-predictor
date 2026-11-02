import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { State } from "@/components/common";
import { dateLabel, number, record, type Match } from "@/lib/data";

type HistoricalMatch = Omit<Match, "maps"> & {
  match_date?: string;
  maps?: { map_name: string; score1?: number; score2?: number }[];
  map_results?: Match["map_results"];
};
export function History() {
  const { "*": id } = useParams();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState("");
  const [rows, setRows] = useState<HistoricalMatch[]>([]);
  const [loadedId, setLoadedId] = useState<string | undefined>(undefined);
  const displayed = loadedId === id ? rows : [];
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCursor("");
    setRows([]);
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      resource: "matches",
      history: "1",
      limit: "40",
      q: search,
    });
    if (cursor && !id) params.set("cursor", cursor);
    if (id) {
      params.set("id", id);
      params.set("detail", "full");
    }
    fetch("/api/catalog?" + params, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json();
      })
      .then((raw) => {
        if (
          !record(raw) ||
          raw.ok !== true ||
          !Array.isArray(raw.data) ||
          !record(raw.pagination)
        )
          throw Error();
        const incoming = raw.data.filter(
          (m): m is HistoricalMatch =>
            record(m) &&
            typeof m.match_id === "string" &&
            typeof m.team1_name === "string" &&
            typeof m.team2_name === "string",
        );
        setRows((previous) =>
          cursor && !id ? [...previous, ...incoming] : incoming,
        );
        setLoadedId(id);
        setTotal(Number(raw.pagination.total) || 0);
        setNext(
          typeof raw.pagination.next_cursor === "string"
            ? raw.pagination.next_cursor
            : null,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "The stored results could not be loaded. Retry to check again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, search, cursor]);
  return (
    <>
      <Link className="back-link" to={id ? "/history" : "/matches"}>
        ← {id ? "All stored results" : "Current match desk"}
      </Link>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>
            {id ? "Stored match result" : "Results archive"}
          </h1>
          <p>
            Preserved Tier 1 and selected Tier 2 results. No new historical
            collection.
          </p>
        </div>
        <span className="count">{total} series</span>
      </header>
      {!id && (
        <form
          className="component-row"
          onSubmit={(e) => {
            e.preventDefault();
            setRows([]);
            setCursor("");
            setSearch(query.trim());
          }}
        >
          <Field className="search-field">
            <FieldLabel htmlFor="history-search">Team or tournament</FieldLabel>
            <Input
              id="history-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stored results"
            />
          </Field>
          <Button type="submit" disabled={loading}>
            Search archive
          </Button>
        </form>
      )}
      {error && (
        <State title="Archive unavailable" description={error}>
          <Button variant="outline" onClick={() => location.reload()}>
            Retry archive
          </Button>
        </State>
      )}
      {loading && <p role="status">Loading stored results…</p>}
      {!loading && !error && !displayed.length && (
        <State
          title={
            id
              ? "Stored match not found"
              : "No stored results match this search"
          }
          description="Try another team or return to the full archive."
        />
      )}
      <div className="match-list">
        {displayed.map((m) =>
          id ? (
            <section className="evidence-section" key={m.match_id}>
              <h2>
                {m.team1_name} {number(m.score1) ?? "—"} :{" "}
                {number(m.score2) ?? "—"} {m.team2_name}
              </h2>
              <p>
                {m.event_name} · {dateLabel(m.match_date || m.starts_at)}
              </p>
              <p>Recorded winner: {m.winner_name || "Not recorded"}</p>
              {m.maps?.length ? (
                <div className="table-scroll">
                  <table>
                    <caption>Recorded maps</caption>
                    <thead>
                      <tr>
                        <th>Map</th>
                        <th>{m.team1_name}</th>
                        <th>{m.team2_name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.maps.map((map, i) => (
                        <tr key={map.map_name + i}>
                          <th>{map.map_name}</th>
                          <td>{number(map.score1) ?? "—"}</td>
                          <td>{number(map.score2) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="subline">
                Stored source result. No pre-match forecast is reconstructed
                here.
              </p>
              {Array.isArray(m.lineups?.team1) &&
                m.lineups.team1.length > 0 && (
                  <p>
                    {m.team1_name}:{" "}
                    {m.lineups.team1
                      .map((p) => (typeof p === "string" ? p : p.nickname))
                      .join(", ")}
                  </p>
                )}
              {Array.isArray(m.lineups?.team2) &&
                m.lineups.team2.length > 0 && (
                  <p>
                    {m.team2_name}:{" "}
                    {m.lineups.team2
                      .map((p) => (typeof p === "string" ? p : p.nickname))
                      .join(", ")}
                  </p>
                )}
            </section>
          ) : (
            <Link
              key={m.match_id}
              className="match-row"
              to={"/history/" + encodeURIComponent(m.match_id)}
            >
              <div className="match-time">
                <span>{dateLabel(m.match_date || m.starts_at)}</span>
                <strong>Recorded result</strong>
              </div>
              <div className="match-pair">
                <div>
                  <span>{m.team1_name}</span>
                  <strong>{number(m.score1) ?? "—"}</strong>
                </div>
                <div>
                  <span>{m.team2_name}</span>
                  <strong>{number(m.score2) ?? "—"}</strong>
                </div>
              </div>
              <div className="match-context">{m.event_name}</div>
            </Link>
          ),
        )}
      </div>
      {!id && next && (
        <Button
          className="load-more"
          variant="outline"
          disabled={loading}
          onClick={() => setCursor(next)}
        >
          Load more stored results
        </Button>
      )}
    </>
  );
}
