import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Check,
  Undo2,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Team, State } from "@/components/common";
import { useFollowing } from "@/components/follow";
import {
  allMatches,
  dateLabel,
  timeLabel,
  probability,
  percent,
  isFinal,
  matchState,
  matchPriority,
  winner,
  number,
  teamKey,
  type DeskData,
  type Match,
  record,
} from "@/lib/data";
import { PICKS_KEY, useStored, type Pick } from "@/lib/storage";
import {
  pickEligibility,
  snapshotFreshness,
} from "../../docs/lib/freshness.js";
import {
  createVetoState,
  applyVetoMap,
  replayVeto,
  resolveMapPool,
  vetoSeriesRead,
} from "../../docs/lib/veto.js";

function Veto({ match, data }: { match: Match; data: DeskData }) {
  const event = data.snapshot.coverage.events.find(
      (e) => e.id === match.event_id || e.name === match.event_name,
    ),
    pool = resolveMapPool(event?.map_pool, data.snapshot.model_state?.map_pool),
    bestOf = Number(match.series_format?.match(/^bo([135])$/i)?.[1]);
  const config = {
    pool,
    team1: match.team1_name,
    team2: match.team2_name,
    bestOf,
    firstTeam: match.team1_name,
  };
  const [actions, setActions] = useState<
      { map_name: string; automatic?: boolean }[]
    >([]),
    [selected, setSelected] = useState("");
  const usable = pool.length === 7 && [1, 3, 5].includes(bestOf);
  const state = useMemo(
    () => (usable ? replayVeto(createVetoState(config), actions) : null),
    [actions, match.match_id],
  );
  const read =
    state && probability(match) !== null
      ? vetoSeriesRead(state, {
          baseProbability: probability(match),
          mapProfiles: data.snapshot.model_state?.map_profiles || {},
        })
      : null;
  if (!state)
    return (
      <State
        title="Veto simulation unavailable"
        description="A confirmed series format and a stored seven-map pool are required. Return to match details."
      />
    );
  const step = state.steps[state.actions.length];
  function commit() {
    if (!selected) return;
    setActions(applyVetoMap(state, selected).actions);
    setSelected("");
  }
  function undo() {
    const manual = state.actions.filter(
      (a: { automatic?: boolean }) => !a.automatic,
    );
    setActions(manual.slice(0, -1));
    setSelected("");
  }
  return (
    <>
      <p className="subline">
        Scenario only ·{" "}
        {event?.map_pool?.length
          ? "Published event map pool"
          : "Stored model map pool; may differ from this event"}
      </p>
      <h3>
        {state.complete ? "Veto complete" : `${step.actor} to ${step.action}`}
      </h3>
      <div className="map-options">
        {pool.map((map: string) => {
          const action = state.actions.find(
            (a: { map_name: string }) => a.map_name === map,
          );
          return (
            <Button
              variant="outline"
              key={map}
              disabled={!!action || state.complete}
              aria-pressed={selected === map}
              onClick={() => setSelected(map)}
            >
              {map}
              {action && <span> · {action.action}</span>}
            </Button>
          );
        })}
      </div>
      <div className="component-row">
        <Button disabled={!selected || state.complete} onClick={commit}>
          Confirm {step?.action || "selection"}
        </Button>
        <Button variant="outline" disabled={!actions.length} onClick={undo}>
          <Undo2 />
          Undo
        </Button>
        <Button
          variant="ghost"
          disabled={!actions.length && !selected}
          onClick={() => {
            setActions([]);
            setSelected("");
          }}
        >
          Reset veto
        </Button>
      </div>
      <ol className="veto-log">
        {state.actions.map(
          (
            a: { map_name: string; action: string; actor: string },
            i: number,
          ) => (
            <li key={i}>
              {a.actor === "system" ? "Decider" : `${a.actor} ${a.action}`} ·{" "}
              {a.map_name}
            </li>
          ),
        )}
      </ol>
      {read && (
        <p className="subline">
          Scenario estimate: {match.team1_name} {percent(read.prob_team1)} ·
          Based on stored map history, not an official veto.
        </p>
      )}
    </>
  );
}
function MatchDetail({
  match,
  data,
  picks,
  save,
}: {
  match: Match;
  data: DeskData;
  picks: Record<string, Pick>;
  save: (p: Record<string, Pick>) => void;
}) {
  const [draft, setDraft] = useState(""),
    [message, setMessage] = useState("");
  const saved = picks[match.match_id],
    p = probability(match),
    done = isFinal(match),
    win = winner(match);
  const freshness = snapshotFreshness(data.snapshot.coverage.last_verified_utc);
  const eligibility = pickEligibility(match, {
    ...freshness,
    fresh: freshness.fresh && !data.feedUnavailable,
  });
  const event = data.snapshot.coverage.events.find(
    (e) =>
      e.id === match.event_id || teamKey(e.name) === teamKey(match.event_name),
  );
  function savePick() {
    if (!eligibility.allowed || !draft || p === null) return;
    save({
      ...picks,
      [match.match_id]: {
        match_id: match.match_id,
        team_name: draft,
        opponent_name:
          draft === match.team1_name ? match.team2_name : match.team1_name,
        event_name: match.event_name,
        starts_at: match.starts_at,
        probability: draft === match.team1_name ? p : 1 - p,
        saved_at: new Date().toISOString(),
      },
    });
    setMessage("Pick saved on this device.");
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setMessage("Match link copied.");
    } catch {
      setMessage("Copy the match link from your browser address bar.");
    }
  }
  return (
    <>
      <Link to="/matches" className="back-link">
        <ArrowLeft />
        All matches
      </Link>
      <header className="object-header">
        <div>
          <p className="subline">
            {event ? (
              <Link to={"/events/" + encodeURIComponent(event.id)}>
                {match.event_name}
              </Link>
            ) : (
              match.event_name
            )}
          </p>
          <h1 tabIndex={-1}>
            {match.team1_name} vs {match.team2_name}
          </h1>
          <p>
            {dateLabel(match.starts_at)} · {timeLabel(match.starts_at)} ·{" "}
            {match.series_format?.toUpperCase() || "Format pending"}
          </p>
        </div>
        <Button variant="outline" onClick={share}>
          <Share2 />
          Share match
        </Button>
      </header>
      <div className="match-layout">
        <section className="match-analysis">
          <div className="section-heading">
            <h2>{done ? "Published result" : matchState(match)}</h2>
            <p>{match.round_name || match.stage_name || "Series"}</p>
          </div>
          {[match.team1_name, match.team2_name].map((name, i) => (
            <div
              className={"match-side " + (win === name ? "is-winner" : "")}
              key={name}
            >
              <Team name={name} data={data} linked />
              <strong>
                {done
                  ? (number(i === 0 ? match.score1 : match.score2) ?? "—")
                  : p !== null
                    ? percent(i === 0 ? p : 1 - p)
                    : "—"}
              </strong>
            </div>
          ))}
          {!done && (
            <p className="subline">
              {p === null
                ? "A forecast is not available for this series."
                : (match.model_coverage === "partial"
                    ? "Limited-data estimate"
                    : "Model estimate") +
                  " · Evidence as of " +
                  dateLabel(data.snapshot.generated_at_utc) +
                  ". Probabilities are not guarantees."}
            </p>
          )}
          {match.map_results?.length ? (
            <>
              <div className="section-heading">
                <h3>Maps</h3>
              </div>
              <div className="data-table">
                <div className="data-row table-head">
                  <span>Map</span>
                  <span>{match.team1_name}</span>
                  <span>{match.team2_name}</span>
                </div>
                {match.map_results.map((m, i) => (
                  <div className="data-row" key={m.map_name + i}>
                    <span>{m.map_name}</span>
                    <span>{number(m.score1) ?? "—"}</span>
                    <span>{number(m.score2) ?? "—"}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="section-heading">
            <h3>Lineups</h3>
            <p>Only source-confirmed players are shown.</p>
          </div>
          <div className="sample-grid">
            {(["team1", "team2"] as const).map((side, i) => (
              <section key={side}>
                <h4>{i === 0 ? match.team1_name : match.team2_name}</h4>
                <ul className="lineup-list">
                  {match.lineups?.[side]?.length ? (
                    match.lineups[side]!.map((player, i) => {
                      const name =
                        typeof player === "string" ? player : player.nickname;
                      const profile = data.players.find(
                        (p) =>
                          (typeof player !== "string" &&
                            p.player_id === player.player_id) ||
                          teamKey(p.nickname) === teamKey(name),
                      );
                      return (
                        <li key={i}>
                          {profile ? (
                            <Link
                              to={
                                "/players/" +
                                encodeURIComponent(profile.player_id)
                              }
                            >
                              {name}
                              <ArrowRight />
                            </Link>
                          ) : (
                            name
                          )}
                        </li>
                      );
                    })
                  ) : (
                    <li className="subline">Lineup not confirmed</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              Simulate map veto
            </DialogTrigger>
            <DialogContent className="veto-dialog">
              <DialogTitle>
                Map veto ·{" "}
                {match.series_format?.toUpperCase() || "Format pending"}
              </DialogTitle>
              <DialogDescription>
                Explore a map scenario without changing the published series.
              </DialogDescription>
              <Veto key={match.match_id} match={match} data={data} />
            </DialogContent>
          </Dialog>
        </section>
        <aside className="pick-panel">
          <h2>Your pick</h2>
          <p className="subline">{eligibility.reason}</p>
          <div className="pick-options">
            {[match.team1_name, match.team2_name].map((name) => (
              <Button
                key={name}
                variant="outline"
                disabled={!eligibility.allowed}
                aria-pressed={(draft || saved?.team_name) === name}
                onClick={() => setDraft(name)}
              >
                {name}
                {(draft || saved?.team_name) === name && <Check />}
              </Button>
            ))}
          </div>
          <Button
            disabled={
              !eligibility.allowed || !draft || draft === saved?.team_name
            }
            onClick={savePick}
          >
            {saved?.team_name === draft ? "Saved" : "Save pick"}
          </Button>
          {saved && (
            <p className="saved-note">
              {win
                ? saved.team_name === win
                  ? "Correct call"
                  : "Missed call"
                : `Saved: ${saved.team_name}`}{" "}
              · {dateLabel(saved.saved_at)}
            </p>
          )}
          {saved && (
            <Button
              variant="ghost"
              onClick={() => {
                const next = { ...picks };
                delete next[match.match_id];
                save(next);
                setMessage("Pick removed.");
              }}
            >
              Remove pick
            </Button>
          )}
          <p role="status" className="subline">
            {message}
          </p>
        </aside>
      </div>
    </>
  );
}
export function Matches({
  data,
  picksOnly = false,
}: {
  data: DeskData;
  picksOnly?: boolean;
}) {
  const { "*": selected } = useParams();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(picksOnly ? "following" : "upcoming"),
    [limit, setLimit] = useState(40);
  const [raw, save, storageError] = useStored<Record<string, Pick>>(
      PICKS_KEY,
      {},
    ),
    picks = record(raw)
      ? (Object.fromEntries(
          Object.entries(raw).filter(
            ([, p]) =>
              record(p) &&
              typeof p.team_name === "string" &&
              typeof p.opponent_name === "string" &&
              typeof p.event_name === "string" &&
              number(p.probability) !== null,
          ),
        ) as Record<string, Pick>)
      : {};
  const { value: following } = useFollowing();
  const matches = allMatches(data);
  const current = matches.find((m) => m.match_id === selected);
  const rows = matches
    .filter(
      (m) =>
        (!picksOnly || picks[m.match_id]) &&
        `${m.team1_name} ${m.team2_name} ${m.event_name}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (picksOnly ||
          (filter === "results" && isFinal(m)) ||
          (filter === "cancelled" &&
            /cancelled|canceled|postponed/i.test(m.status || "")) ||
          (filter === "upcoming" &&
            !isFinal(m) &&
            !/cancelled|canceled|postponed/i.test(m.status || "")) ||
          (filter === "following" &&
            (following.teams.some(
              (t) =>
                teamKey(t.name) === teamKey(m.team1_name) ||
                teamKey(t.name) === teamKey(m.team2_name),
            ) ||
              following.events.some((e) => e.id === m.event_id)))),
    )
    .sort(
      (a, b) =>
        matchPriority(a) - matchPriority(b) ||
        (isFinal(a)
          ? Date.parse(b.starts_at || "0") - Date.parse(a.starts_at || "0")
          : Date.parse(a.starts_at || "0") - Date.parse(b.starts_at || "0")),
    );
  useEffect(() => setLimit(40), [query, filter]);
  if (current)
    return (
      <MatchDetail
        key={current.match_id}
        match={current}
        data={data}
        picks={picks}
        save={save}
      />
    );
  if (selected && !picksOnly)
    return (
      <State
        title="Match not found"
        description="This series is not present in the loaded snapshot."
      >
        <Link
          className="back-link"
          to={"/history/" + encodeURIComponent(selected)}
        >
          Look up the stored result
        </Link>
        <Link className="back-link" to="/matches">
          Return to all matches
        </Link>
      </State>
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>{picksOnly ? "Your picks" : "Match centre"}</h1>
          <p>
            {picksOnly
              ? "Saved calls and the teams you follow, kept on this device."
              : "Fixtures, verified results and model estimates. Tier 1 and selected Tier 2."}
          </p>
        </div>
        <span className="count">{rows.length} series in this snapshot</span>
      </header>
      {storageError && <p role="alert">{storageError}</p>}
      {picksOnly && (
        <section className="following-strip">
          <h2>Following</h2>
          <div className="component-row">
            {(["teams", "events", "players"] as const).flatMap((kind) =>
              following[kind].map((item) => (
                <Link
                  key={kind + item.id}
                  className="follow-link"
                  to={
                    "/" +
                    kind +
                    "/" +
                    encodeURIComponent(kind === "teams" ? item.name : item.id)
                  }
                >
                  {item.name}
                  <ArrowRight />
                </Link>
              )),
            )}
            {!following.teams.length &&
              !following.players.length &&
              !following.events.length && (
                <p className="subline">
                  Follow a team, player or event from its profile.
                </p>
              )}
          </div>
        </section>
      )}
      <div className="event-toolbar">
        {!picksOnly && (
          <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
            <TabsList aria-label="Filter matches">
              <TabsTrigger value="upcoming">Schedule</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="following">Following</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Field className="search-field">
          <FieldLabel className="sr-only" htmlFor="match-search">
            Search matches
          </FieldLabel>
          <div className="search-input">
            <Search />
            <Input
              id="match-search"
              placeholder="Team or tournament"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </Field>
      </div>
      <div className="match-list">
        {rows.slice(0, limit).map((m, index) => {
          const done = isFinal(m),
            p = probability(m);
          return (
            <Fragment key={m.match_id}>
              {(index === 0 ||
                dateLabel(rows[index - 1].starts_at) !==
                  dateLabel(m.starts_at)) && (
                <h2 className="match-day">{dateLabel(m.starts_at)}</h2>
              )}
              <Link
                className="match-row"
                data-state={done ? "result" : "fixture"}
                to={"/matches/" + encodeURIComponent(m.match_id)}
                key={m.match_id}
              >
                <div className="match-time">
                  <span>{dateLabel(m.starts_at)}</span>
                  <strong>{timeLabel(m.starts_at)}</strong>
                  <span>{matchState(m)}</span>
                </div>
                <div className="match-pair">
                  {[m.team1_name, m.team2_name].map((name, i) => (
                    <div key={name}>
                      <Team name={name} data={data} />
                      <strong>
                        {done
                          ? (number(i === 0 ? m.score1 : m.score2) ?? "—")
                          : p === null
                            ? "—"
                            : percent(i === 0 ? p : 1 - p)}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="match-context">
                  {!done && p !== null && (
                    <div className="match-edge" aria-hidden="true">
                      <span style={{ transform: `scaleX(${p})` }} />
                    </div>
                  )}
                  <span>{m.event_name}</span>
                  <span>
                    {m.series_format?.toUpperCase() || "Format pending"} ·{" "}
                    {done
                      ? "Published result"
                      : p === null
                        ? "Forecast unavailable"
                        : "Model estimate"}
                  </span>
                  {picks[m.match_id] && (
                    <span>Your pick: {picks[m.match_id].team_name}</span>
                  )}
                </div>
                <ArrowRight className="row-arrow" />
              </Link>
            </Fragment>
          );
        })}
      </div>
      {!rows.length && (
        <State
          title={
            picksOnly
              ? "No saved matches match these filters"
              : "No matches match these filters"
          }
          description="Clear the filters or search for another team."
        >
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setFilter("upcoming");
            }}
          >
            Clear filters
          </Button>
        </State>
      )}
      {rows.length > limit && (
        <Button
          className="load-more"
          variant="outline"
          onClick={() => setLimit(limit + 40)}
        >
          Show more matches ({rows.length - limit} remaining)
        </Button>
      )}
      {picksOnly &&
        Object.entries(picks).filter(
          ([id]) => !matches.some((m) => m.match_id === id),
        ).length > 0 && (
          <section className="following-strip">
            <h2>Saved outside this snapshot</h2>
            <p className="subline">
              These calls are preserved. Their results have not been loaded.
            </p>
            {Object.entries(picks)
              .filter(([id]) => !matches.some((m) => m.match_id === id))
              .map(([id, p]) => (
                <div className="saved-archive" key={id}>
                  <span>
                    {p.team_name} vs {p.opponent_name} · {p.event_name}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const next = { ...picks };
                      delete next[id];
                      save(next);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
          </section>
        )}
    </>
  );
}
