import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Search, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Crest } from "@/components/crest";
import {
  dateLabel,
  eventPhase,
  record,
  mergeMatches,
  teamKey,
  eventMatches,
  allMatches,
  matchState,
  type DeskData,
  type Event,
  type Match,
} from "@/lib/data";
import { Series } from "@/components/series";
import { State, Team } from "@/components/common";
import { BracketLane } from "@/components/bracket-lane";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Follow } from "@/components/follow";
import { eventIsProductEligible } from "../../docs/lib/snapshot.js";
import { uniqueEventResults } from "../../server/event-results.js";
import { compileBracketContract } from "../../server/bracket-contract.js";

export type Tree = {
  unassigned?: Match[];
  coverage?: {
    known_matches: number;
    placed_matches: number;
    unassigned_matches: number;
    complete: boolean;
  };
  source: string;
  lanes: {
    id: string;
    label: string;
    rounds: { id: string; label: string; matches: Match[] }[];
  }[];
};
function EventDetail({ event, data }: { event: Event; data: DeskData }) {
  const [archive, setArchive] = useState<{ id: string; rows: Match[] } | null>(
    null,
  );
  const [archiveError, setArchiveError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(12);
  useEffect(() => {
    const controller = new AbortController();
    setArchiveError(false);
    fetch("/api/catalog?resource=brackets&id=" + encodeURIComponent(event.id), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((raw) => {
        const rows = raw?.data?.[0]?.matches;
        if (!Array.isArray(rows)) throw Error();
        setArchive({
          id: event.id,
          rows: rows.filter(
            (m): m is Match =>
              record(m) &&
              typeof m.match_id === "string" &&
              typeof m.team1_name === "string" &&
              typeof m.team2_name === "string",
          ),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setArchiveError(true);
      });
    return () => controller.abort();
  }, [event.id, attempt]);
  const local = eventMatches(event, data);
  const matches: Match[] = uniqueEventResults(
    mergeMatches(archive?.id === event.id ? archive.rows : [], local),
  );
  const tree = useMemo(() => {
    const refreshed = {
      ...event,
      bracket: event.bracket
        ? {
            ...event.bracket,
            rounds: event.bracket.rounds?.map((r) => ({
              ...r,
              matches: r.matches?.map((m) => ({
                ...m,
                ...matches.find((n) => n.match_id === m.match_id),
                slot_id: m.slot_id,
              })),
            })),
          }
        : undefined,
    };
    return compileBracketContract(refreshed, matches, null) as Tree;
  }, [event, data, archive]);
  const guide = tree.source === "format";
  const unassigned = tree.unassigned || [];
  const participants = [
    ...new Set([
      ...(event.participants || []),
      ...matches.flatMap((m) => [m.team1_name, m.team2_name]),
    ]),
  ];
  return (
    <>
      <Link to="/events" className="back-link">
        <ArrowLeft aria-hidden="true" />
        All events
      </Link>
      <header className="object-header">
        <div>
          <p className="subline">
            {event.product_tier === "tier_2"
              ? "Tier 2 main event"
              : "Tier 1 main event"}
          </p>
          <h1 tabIndex={-1}>{event.name}</h1>
          <p>
            {dateLabel(event.start_date)}
            {event.location && <> · {event.location}</>}
          </p>
        </div>
        <Follow kind="events" id={event.id} name={event.name} />
      </header>
      <div className="event-summary" aria-label="Event coverage">
        <div>
          <strong>{matches.length}</strong>
          <span>Recorded series</span>
        </div>
        <div>
          <strong>{participants.length}</strong>
          <span>Known teams</span>
        </div>
        <div>
          <strong>
            {tree.source === "reconstructed"
              ? "Reconstructed"
              : guide
                ? "Format only"
                : unassigned.length
                  ? "Partial draw"
                  : "Published draw"}
          </strong>
          <span>
            {tree.source === "reconstructed"
              ? "From all stored knockout results"
              : "Source coverage, not a forecast"}
          </span>
        </div>
      </div>
      {archiveError ? (
        <Alert>
          <AlertTitle>Stored results could not be loaded</AlertTitle>
          <AlertDescription>
            The published snapshot remains visible.{" "}
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Retry stored results
            </Button>
          </AlertDescription>
        </Alert>
      ) : archive?.id !== event.id ? (
        <p className="subline" role="status">
          Checking stored event results…
        </p>
      ) : null}
      <Tabs defaultValue="tree">
        <TabsList aria-label="Event view">
          <TabsTrigger value="tree">Bracket</TabsTrigger>
          <TabsTrigger value="matches">Matches ({matches.length})</TabsTrigger>
          <TabsTrigger value="teams">Teams ({participants.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="tree">
          <div className="section-heading">
            <h2>
              {guide
                ? "Format guide"
                : tree.source === "reconstructed"
                  ? "Reconstructed tournament path"
                  : "Published rounds"}
            </h2>
            <p>
              {guide
                ? "Pairings will appear when the draw is confirmed."
                : tree.source === "reconstructed"
                  ? "Every connection follows a recorded winner. Round positions are reconstructed from the complete knockout results."
                  : "Only confirmed round assignments appear in the draw. Other stored results are listed below."}
            </p>
          </div>
          {!tree.lanes.length ? (
            <State
              title="The draw is not available yet"
              description="The event remains in the calendar. Verified pairings will appear here when published."
            />
          ) : (
            <>
              <p className="scroll-hint">
                Scroll across the rounds to follow the tournament →
              </p>
              <div
                className="bracket-viewport"
                role="region"
                aria-label="Tournament rounds"
                tabIndex={0}
              >
                {tree.lanes.map((l) => (
                  <BracketLane
                    key={l.id}
                    lane={l}
                    renderSeries={(m) => (
                      <Series
                        match={m}
                        data={data}
                        formatGuide={
                          guide &&
                          (!m.match_id || m.match_id.startsWith("::slot:"))
                        }
                      />
                    )}
                  />
                ))}
              </div>
            </>
          )}
          {!!unassigned.length && (
            <section className="unassigned-results">
              <div className="section-heading">
                <h2>{unassigned.length} results without a round assignment</h2>
                <p>
                  These matches are saved. The source did not preserve where
                  they belong in the draw, so they are not assigned to invented
                  rounds.
                </p>
              </div>
              <div className="match-grid">
                {unassigned.slice(0, limit).map((m) => (
                  <Series key={m.match_id} match={m} data={data} />
                ))}
              </div>
              {limit < unassigned.length && (
                <Button
                  className="load-more"
                  variant="outline"
                  onClick={() => setLimit((n) => n + 24)}
                >
                  Show more stored results
                </Button>
              )}
            </section>
          )}
        </TabsContent>
        <TabsContent value="matches">
          <div className="match-grid">
            {matches.length ? (
              matches.map((m) => (
                <Series key={m.match_id} match={m} data={data} />
              ))
            ) : (
              <State
                title="No published matches yet"
                description="The schedule has not been confirmed. Check back after the next verified update."
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="teams">
          <div className="team-grid">
            {participants.length ? (
              participants.map((n) => (
                <Link
                  key={n}
                  className="team-tile"
                  to={"/teams/" + encodeURIComponent(n)}
                >
                  <Team name={n} data={data} />
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              ))
            ) : (
              <State
                title="The field is not confirmed"
                description="Teams will appear after their participation is verified."
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
export function EventList({ data }: { data: DeskData }) {
  const { "*": selected } = useParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("current");
  const events = data.snapshot.coverage.events.filter((e) =>
    eventIsProductEligible(e),
  );
  const unique = events.filter(
    (e, i) => events.findIndex((x) => x.id === e.id) === i,
  );
  const current = unique.find((e) => e.id === selected);
  const rows = unique
    .filter(
      (e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) &&
        eventPhase(e) === filter,
    )
    .sort((a, b) => {
      const today = new Date().toISOString().slice(0, 10);
      const bucket = (e: Event) =>
        e.start_date && e.start_date >= today ? 0 : e.start_date ? 2 : 1;
      return (
        bucket(a) - bucket(b) ||
        (bucket(a) === 2
          ? (b.start_date || "").localeCompare(a.start_date || "")
          : (a.start_date || "").localeCompare(b.start_date || ""))
      );
    });
  if (current)
    return <EventDetail key={current.id} event={current} data={data} />;
  if (selected)
    return (
      <>
        <State
          title="Event not found"
          description="This event is not part of the supported calendar. Return to All events to choose another."
        />
        <Link className="back-link" to="/events">
          All events
        </Link>
      </>
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>The circuit</h1>
          <p>
            Tier 1 and selected Tier 2 main events. Every series in context.
          </p>
        </div>
        <span className="count">{rows.length} events</span>
      </header>
      <div className="event-toolbar">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <TabsList aria-label="Filter events">
            <TabsTrigger value="current">Current & upcoming</TabsTrigger>
            <TabsTrigger value="archive">Archive</TabsTrigger>
            {unique.some((e) => eventPhase(e) === "unscheduled") && (
              <TabsTrigger value="unscheduled">Dates pending</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <Field className="search-field">
          <FieldLabel className="sr-only" htmlFor="event-search">
            Search events
          </FieldLabel>
          <div className="search-input">
            <Search aria-hidden="true" />
            <Input
              id="event-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the circuit"
            />
          </div>
        </Field>
      </div>
      <div className="event-list">
        {rows.map((e) => {
          const field = e.participants || [];
          const past = eventPhase(e) === "archive";
          return (
            <Link
              to={"/events/" + encodeURIComponent(e.id)}
              className="event-row"
              key={e.id}
            >
              <div className="event-date">
                <strong>
                  {e.start_date
                    ? new Date(e.start_date).toLocaleDateString("en-GB", {
                        month: "short",
                      })
                    : past
                      ? "Past"
                      : "TBA"}
                </strong>
                <span>
                  {e.start_date ? dateLabel(e.start_date) : "Dates pending"}
                </span>
              </div>
              <div className="event-identity">
                <h2>{e.name}</h2>
                <p>{e.format?.label || "Format to be confirmed"}</p>
                <div className="field-preview">
                  {field.slice(0, 4).map((n) => (
                    <Crest
                      key={n}
                      name={n}
                      src={data.assets[teamKey(n)]?.logo_url}
                    />
                  ))}
                  <span>
                    {field.length ? `${field.length} teams` : "Field pending"}
                  </span>
                </div>
              </div>
              <div className="event-state">
                <span>
                  {past
                    ? "Archived event"
                    : e.status === "finished"
                      ? "Finished in source"
                      : e.start_date && Date.parse(e.start_date) > Date.now()
                        ? "Upcoming"
                        : "Status not confirmed"}
                </span>
                <span>{e.location || "Location pending"}</span>
              </div>
              <ArrowUpRight className="event-arrow" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
      {!rows.length && (
        <>
          <State
            title="No events match these filters"
            description="Try another tournament name or return to the full calendar."
          />
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setFilter("current");
            }}
          >
            Reset filters
          </Button>
        </>
      )}
    </>
  );
}
