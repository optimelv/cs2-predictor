import { useMemo, useState } from "react";
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
  teamKey,
  eventMatches,
  allMatches,
  matchState,
  type DeskData,
  type Event,
  type Match,
} from "@/lib/data";
import { Follow } from "@/components/follow";
import { eventIsProductEligible } from "../../docs/lib/snapshot.js";
import { compileBracketContract } from "../../server/bracket-contract.js";

type Tree = {
  source: string;
  lanes: {
    id: string;
    label: string;
    rounds: { id: string; label: string; matches: Match[] }[];
  }[];
};
const finished = (m: Match) =>
  /^(finished|completed|ended|final)$/.test(m.status || "");
function State({ title, description }: { title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
function Team({ name, data }: { name: string; data: DeskData }) {
  return (
    <span className="team">
      <Crest name={name} src={data.assets[teamKey(name)]?.logo_url} />
      <span>{name}</span>
    </span>
  );
}
function Series({
  match,
  data,
  formatGuide = false,
}: {
  match: Match;
  data: DeskData;
  formatGuide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const first =
      formatGuide && !(match as Match & { team1_source?: unknown }).team1_source
        ? "TBD"
        : match.team1_name,
    second =
      formatGuide && !(match as Match & { team2_source?: unknown }).team2_source
        ? "TBD"
        : match.team2_name;
  const done = !formatGuide && finished(match);
  return (
    <article className="series">
      <div className="series-meta">
        <span>
          {done
            ? "Final"
            : formatGuide
              ? "Draw not confirmed"
              : matchState(match)}
        </span>
        <span>{match.series_format?.toUpperCase() || "Format pending"}</span>
      </div>
      <div className="series-team">
        <Team name={first} data={data} />
        <span className="score">
          {done && match.score1 != null ? match.score1 : "—"}
        </span>
      </div>
      <div className="series-team">
        <Team name={second} data={data} />
        <span className="score">
          {done && match.score2 != null ? match.score2 : "—"}
        </span>
      </div>
      {!formatGuide && (
        <Button
          variant="ghost"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Hide details" : "View series"}
        </Button>
      )}
      {open && (
        <div className="series-details">
          <p>
            {match.starts_at
              ? new Date(match.starts_at).toLocaleString("en-GB")
              : "Start time unavailable"}
          </p>
          <p>
            {done
              ? "Published result"
              : "A scheduled time alone does not establish a result."}
          </p>
          <Link to={"/matches/" + encodeURIComponent(match.match_id)}>
            Open match analysis <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      )}
    </article>
  );
}
function EventDetail({ event, data }: { event: Event; data: DeskData }) {
  const matches = eventMatches(event, data);
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
  }, [event, data]);
  const guide = tree.source === "format";
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
      <p className="subline">{event.format?.label || "Format pending"}</p>
      <Tabs defaultValue="tree">
        <TabsList aria-label="Event view">
          <TabsTrigger value="tree">Tournament path</TabsTrigger>
          <TabsTrigger value="matches">Matches ({matches.length})</TabsTrigger>
          <TabsTrigger value="teams">Teams ({participants.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="tree">
          <div className="section-heading">
            <h2>{guide ? "Format guide" : "Published rounds"}</h2>
            <p>
              {guide
                ? "Pairings will appear when the draw is confirmed."
                : "Results and scheduled matches, kept separate from projections."}
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
                  <section className="bracket-lane" key={l.id}>
                    <h3>{l.label}</h3>
                    <div className="bracket-rounds">
                      {l.rounds.map((r) => (
                        <section className="bracket-round" key={r.id}>
                          <h4>{r.label}</h4>
                          <div className="bracket-series">
                            {r.matches.map((m, i) => (
                              <Series
                                key={m.slot_id || m.match_id || i}
                                match={m}
                                data={data}
                                formatGuide={
                                  guide &&
                                  (!m.match_id ||
                                    m.match_id.startsWith("::slot:"))
                                }
                              />
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
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
  const [filter, setFilter] = useState("all");
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
        (filter === "all" ||
          (filter === "archive" &&
            (e.status === "finished" ||
              (!!e.end_date &&
                Date.parse(e.end_date + "T23:59:59Z") < Date.now()))) ||
          (filter === "upcoming" &&
            e.status !== "finished" &&
            (!e.end_date ||
              Date.parse(e.end_date + "T23:59:59Z") >= Date.now()) &&
            (!!e.start_date || e.fixture_provider === "pandascore"))),
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
  if (current) return <EventDetail event={current} data={data} />;
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
        <span className="count">{unique.length} events</span>
      </header>
      <div className="event-toolbar">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <TabsList aria-label="Filter events">
            <TabsTrigger value="all">All events</TabsTrigger>
            <TabsTrigger value="upcoming">Active & upcoming</TabsTrigger>
            <TabsTrigger value="archive">Archive</TabsTrigger>
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
          const past =
            e.end_date && Date.parse(e.end_date + "T23:59:59Z") < Date.now();
          return (
            <Link
              to={"/events/" + encodeURIComponent(e.id)}
              className="event-row"
              key={e.id}
            >
              <div className="event-date">
                <CalendarDays aria-hidden="true" />
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
                    ? "Past calendar entry"
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
              setFilter("all");
            }}
          >
            Reset filters
          </Button>
        </>
      )}
    </>
  );
}
