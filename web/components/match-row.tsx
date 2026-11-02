import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Team } from "./common";
import {
  dateLabel,
  timeLabel,
  matchState,
  isFinal,
  probability,
  percent,
  number,
  type DeskData,
  type Match,
} from "@/lib/data";
export function MatchRow({
  match: m,
  data,
  pickedTeam,
}: {
  match: Match;
  data: DeskData;
  pickedTeam?: string;
}) {
  const done = isFinal(m),
    p = probability(m);
  return (
    <Link
      className="match-row"
      data-state={done ? "result" : "fixture"}
      to={"/matches/" + encodeURIComponent(m.match_id)}
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
        {pickedTeam && <span>Your pick: {pickedTeam}</span>}
      </div>
      <ArrowRight className="row-arrow" />
    </Link>
  );
}
