import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Follow } from "@/components/follow";
import { State, Team } from "@/components/common";
import {
  dateLabel,
  allMatches,
  teamKey,
  number,
  matchState,
  type DeskData,
} from "@/lib/data";
export function Teams({ data }: { data: DeskData }) {
  const { "*": selected } = useParams();
  const [query, setQuery] = useState("");
  const ratings = data.snapshot.model_state?.teams || [];
  const names = [
    ...new Set([
      ...ratings.map((t) => t.team_name),
      ...allMatches(data).flatMap((m) => [m.team1_name, m.team2_name]),
      ...data.players.map((p) => p.team_name || ""),
    ]),
  ].filter(Boolean);
  const name = names.find((n) => teamKey(n) === teamKey(selected || "")),
    rating = ratings.find((t) => teamKey(t.team_name) === teamKey(name || ""));
  if (name) {
    const players = data.players.filter(
        (p) => teamKey(p.team_name || "") === teamKey(name),
      ),
      matches = allMatches(data)
        .filter((m) =>
          [teamKey(m.team1_name), teamKey(m.team2_name)].includes(
            teamKey(name),
          ),
        )
        .sort((a, b) => (b.starts_at || "").localeCompare(a.starts_at || ""));
    return (
      <>
        <Link className="back-link" to="/teams">
          <ArrowLeft />
          All teams
        </Link>
        <header className="object-header">
          <div>
            <p className="subline">Team profile</p>
            <h1 tabIndex={-1}>
              <Team name={name} data={data} />
            </h1>
            <p>
              Ranking date:{" "}
              {dateLabel(
                rating?.ranking_date || data.snapshot.coverage.vrs?.as_of,
              )}
            </p>
          </div>
          <Follow kind="teams" id={teamKey(name)} name={name} />
        </header>
        <div className="profile-facts">
          <div>
            <span>Stored VRS rank</span>
            <strong>{number(rating?.vrs_rank) ?? "—"}</strong>
          </div>
          <div>
            <span>VRS points</span>
            <strong>{number(rating?.vrs_points) ?? "—"}</strong>
          </div>
          <div>
            <span>Model Elo</span>
            <strong>{number(rating?.elo)?.toFixed(0) ?? "—"}</strong>
          </div>
        </div>
        <div className="section-heading">
          <h2>Cached player affiliations</h2>
          <p>
            Profiles may come from different dates. This is not a confirmed
            match lineup.
          </p>
        </div>
        <div className="team-grid">
          {players.map((p) => (
            <Link
              className="team-tile"
              to={"/players/" + encodeURIComponent(p.player_id)}
              key={p.player_id}
            >
              <span>{p.nickname}</span>
              <ArrowRight />
            </Link>
          ))}
        </div>
        {!players.length && (
          <p className="subline">No cached affiliations available.</p>
        )}
        <div className="section-heading">
          <h2>Matches in this snapshot</h2>
        </div>
        <div className="data-table">
          {matches.map((m) => (
            <Link
              className="data-row"
              key={m.match_id}
              to={"/matches/" + encodeURIComponent(m.match_id)}
            >
              <span>{dateLabel(m.starts_at)}</span>
              <span>
                {m.team1_name} vs {m.team2_name}
              </span>
              <span>
                {matchState(m)}
                <ArrowRight />
              </span>
            </Link>
          ))}
        </div>
        {!matches.length && (
          <State
            title="No matches loaded for this team"
            description="The current snapshot does not cover this team's fixtures. Return to the match desk to browse available series."
          />
        )}
      </>
    );
  }
  if (selected)
    return (
      <State
        title="Team not found"
        description="This team is not in the current directory."
      >
        <Link className="back-link" to="/teams">
          Return to all teams
        </Link>
      </State>
    );
  const rows = names
    .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        (ratings.find((t) => t.team_name === a)?.vrs_rank || 9999) -
          (ratings.find((t) => t.team_name === b)?.vrs_rank || 9999) ||
        a.localeCompare(b),
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>The teams</h1>
          <p>
            Rankings retain their source date. Model Elo is a separate estimate.
          </p>
        </div>
        <span className="count">{names.length} teams</span>
      </header>
      <Field className="player-search">
        <FieldLabel htmlFor="team-search">Find a team</FieldLabel>
        <Input
          id="team-search"
          placeholder="For example, Spirit"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      <div className="data-table team-directory">
        <div className="data-row table-head">
          <span>Team</span>
          <span>Stored VRS rank</span>
          <span>Model Elo</span>
        </div>
        {rows.slice(0, 150).map((n) => {
          const r = ratings.find((t) => t.team_name === n);
          return (
            <Link
              className="data-row"
              key={n}
              to={"/teams/" + encodeURIComponent(n)}
            >
              <Team name={n} data={data} />
              <span>{number(r?.vrs_rank) ?? "—"}</span>
              <span>{number(r?.elo)?.toFixed(0) ?? "—"}</span>
            </Link>
          );
        })}
      </div>
      {!rows.length && (
        <State
          title="No matching teams"
          description="Try another team name or clear the search."
        />
      )}
      <p className="subline results-count">
        Ranking source date: {dateLabel(data.snapshot.coverage.vrs?.as_of)}.
        Showing {Math.min(150, rows.length)} of {rows.length} matching teams.
      </p>
    </>
  );
}
