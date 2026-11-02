import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Team, State } from "@/components/common";
import {
  allMatches,
  dateLabel,
  timeLabel,
  isFinal,
  probability,
  percent,
  matchPriority,
  matchState,
  number,
  type DeskData,
} from "@/lib/data";

export function Home({ data }: { data: DeskData | null }) {
  const [selected, setSelected] = useState("");
  const matches = data
    ? allMatches(data)
        .filter((m) => !["cancelled", "canceled"].includes(m.status || ""))
        .sort((a, b) => matchPriority(a) - matchPriority(b))
        .slice(0, 3)
    : [];
  const match = matches.find((m) => m.match_id === selected) || matches[0];
  const p = match ? probability(match) : null;
  const events =
    data?.snapshot.coverage.events
      .filter(
        (e) =>
          e.start_date &&
          (!e.end_date || e.end_date >= new Date().toISOString().slice(0, 10)),
      )
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))
      .slice(0, 2) || [];
  return (
    <div className="landing">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title" tabIndex={-1}>
            Read the
            <br />
            CS2 circuit
          </h1>
          <p>
            Follow Tier 1 and selected Tier 2 Counter-Strike. Explore match
            forecasts, tournament paths and the teams behind each result.
          </p>
          <div className="hero-actions">
            <Button render={<Link to="/matches" />}>
              Open match desk <ArrowRight />
            </Button>
            <Link to="/events">Explore events</Link>
          </div>
        </div>
        <div className="hero-board" data-ui>
          <div className="hero-board-heading">
            <span>From the match desk</span>
            <span>{match ? matchState(match) : "Published snapshot"}</span>
          </div>
          {data && match ? (
            <>
              <div className="hero-match">
                <h2>{match.event_name}</h2>
                <div className="hero-match-teams">
                  {[match.team1_name, match.team2_name].map((name, i) => (
                    <div key={i}>
                      <Team name={name} data={data} />
                      <strong>
                        {isFinal(match)
                          ? (number(i === 0 ? match.score1 : match.score2) ??
                            "—")
                          : p === null
                            ? "—"
                            : percent(i === 0 ? p : 1 - p)}
                      </strong>
                    </div>
                  ))}
                </div>
                {!isFinal(match) && p !== null && (
                  <div className="hero-split" aria-hidden="true">
                    <span style={{ width: `${p * 100}%` }} />
                  </div>
                )}
                <p>
                  {dateLabel(match.starts_at)} · {timeLabel(match.starts_at)} ·{" "}
                  {isFinal(match)
                    ? "Published result"
                    : p === null
                      ? "Forecast unavailable"
                      : "Model estimate"}
                </p>
                <Link
                  className="hero-match-link"
                  to={"/matches/" + encodeURIComponent(match.match_id)}
                >
                  Explore this match <ArrowUpRight />
                </Link>
              </div>
              {matches.length > 1 && (
                <div className="hero-switch" aria-label="Preview another match">
                  {matches.map((m, i) => (
                    <Button
                      key={m.match_id}
                      variant="ghost"
                      aria-pressed={m.match_id === match.match_id}
                      aria-label={`Preview ${m.team1_name} versus ${m.team2_name}`}
                      onClick={() => setSelected(m.match_id)}
                    >
                      Match {i + 1}
                    </Button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <State
              title={
                data ? "No matches published" : "Match preview unavailable"
              }
              description="The match desk shows the latest available snapshot, including source status."
            />
          )}
        </div>
      </section>
      <section className="home-section" aria-labelledby="circuit-title">
        <div className="home-section-heading">
          <div>
            <h2 id="circuit-title">Follow the whole event</h2>
            <p>
              Move from the schedule to completed series and the tournament
              path. Confirmed rounds stay distinct from reconstructed brackets.
            </p>
          </div>
          <Link to="/events">View the circuit</Link>
        </div>
        <div className="home-events" data-ui>
          {events.length ? (
            events.map((e) => (
              <Link
                className="home-event"
                key={e.id}
                to={"/events/" + encodeURIComponent(e.id)}
              >
                <span>{dateLabel(e.start_date)}</span>
                <h3>{e.name}</h3>
                <p>{e.format?.label || "Format details pending"}</p>
                <span>{e.location || "Location pending"}</span>
              </Link>
            ))
          ) : (
            <Link className="home-event" to="/events">
              <h3>Explore the event archive</h3>
              <p>
                Browse recorded results and the rounds available for each
                tournament.
              </p>
            </Link>
          )}
        </div>
      </section>
      <section
        className="home-section home-tools"
        aria-labelledby="tools-title"
      >
        <div>
          <h2 id="tools-title">Go beyond the score</h2>
          <p>
            Compare players, inspect the rankings or test a tournament scenario.
            Keep your own picks on this device.
          </p>
        </div>
        <div className="home-tool-list">
          <Link className="home-tool" to="/players">
            <strong>Player comparisons</strong>
            <span>Profiles, form and available map statistics.</span>
            <ArrowUpRight />
          </Link>
          <Link className="home-tool" to="/teams">
            <strong>Team rankings</strong>
            <span>Stored Valve standings, with their source date.</span>
            <ArrowUpRight />
          </Link>
          <Link className="home-tool" to="/picks">
            <strong>Your match picks</strong>
            <span>Save predictions and revisit finished series.</span>
            <ArrowUpRight />
          </Link>
          <a className="home-tool" href="/legacy.html#featured">
            <strong>Tournament simulator</strong>
            <span>Open the existing scenario tools in the classic view.</span>
            <ArrowUpRight />
          </a>
        </div>
      </section>
      <section className="home-coverage" aria-labelledby="coverage-title">
        <h2 id="coverage-title">
          Know what’s behind
          <br />
          the forecast
        </h2>
        <div>
          <p>
            Fixtures and results come from the connected match feed.
            Probabilities are model estimates. Older player data and gaps in
            tournament coverage are marked where they appear.
          </p>
          <Link to="/evidence">Read the data and model notes</Link>
        </div>
      </section>
    </div>
  );
}
