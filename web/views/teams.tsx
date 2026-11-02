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
  teamRating,
  number,
  matchState,
  type DeskData,
} from "@/lib/data";
export function Teams({ data }: { data: DeskData }) {
  const { "*": selected } = useParams();
  const [query, setQuery] = useState("");
  const official = data.snapshot.coverage.vrs;
  const ratings = data.snapshot.model_state?.teams || [];
  const names = [
    ...new Map(
      [
        ...data.players.map((p) => p.team_name || ""),
        ...allMatches(data).flatMap((m) => [m.team1_name, m.team2_name]),
        ...ratings.map((t) => t.team_name),
        ...(official?.teams || []).map((t) => t.team_name),
      ]
        .filter(Boolean)
        .map((name) => [teamKey(name), name]),
    ).values(),
  ];
  const name = names.find((n) => teamKey(n) === teamKey(selected || "")),
    rating = name ? teamRating(data, name) : undefined;
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
        <div className="profile-facts team-profile-facts">
          <div>
            <span>Official VRS rank</span>
            <strong>{number(rating?.vrs_rank) ?? "—"}</strong>
          </div>
          <div>
            <span>VRS points</span>
            <strong>{number(rating?.vrs_points) ?? "—"}</strong>
          </div>
          <div>
            <span>Predicted VRS rank</span>
            <strong aria-label="Unavailable">—</strong>
          </div>
          <div>
            <span>Model Elo</span>
            <strong>
              {number(
                ratings.find((t) => teamKey(t.team_name) === teamKey(name))
                  ?.elo,
              )?.toFixed(0) ?? "—"}
            </strong>
          </div>
        </div>
        <p className="profile-source subline">
          VRS forecast unavailable: the current feed does not include the
          complete roster and prize-allocation history needed to reproduce
          Valve’s standings. Model Elo is not a VRS forecast.
        </p>
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
        (teamRating(data, a)?.vrs_rank || 9999) -
          (teamRating(data, b)?.vrs_rank || 9999) || a.localeCompare(b),
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>The teams</h1>
          <p>
            Official Valve standings at their source date. Forecasts are listed
            separately.
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
      <p className="profile-source subline">
        Predicted VRS ranks are unavailable until complete roster and
        prize-allocation inputs can be verified. An Elo-based strength rank
        would measure something different.
      </p>
      <div className="data-table team-directory vrs-directory">
        <div className="data-row table-head">
          <span>Team</span>
          <span>Official VRS rank</span>
          <span>Predicted VRS rank</span>
          <span>Model Elo</span>
        </div>
        {rows.slice(0, 150).map((n) => {
          const r = teamRating(data, n);
          return (
            <Link
              className="data-row"
              key={n}
              to={"/teams/" + encodeURIComponent(n)}
            >
              <Team name={n} data={data} />
              <span>{number(r?.vrs_rank) ?? "—"}</span>
              <span aria-label="VRS forecast unavailable">—</span>
              <span>
                {number(
                  ratings.find((t) => teamKey(t.team_name) === teamKey(n))?.elo,
                )?.toFixed(0) ?? "—"}
              </span>
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
