import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Team } from "@/components/common";
import {
  dateLabel,
  matchState,
  isFinal,
  type Match,
  type DeskData,
} from "@/lib/data";

export function Series({
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
  const done = !formatGuide && isFinal(match);
  const winner =
    done && match.score1 != null && match.score2 != null
      ? match.score1 > match.score2
        ? first
        : match.score2 > match.score1
          ? second
          : ""
      : "";
  return (
    <article
      className="series"
      data-match-id={match.match_id}
      data-slot-id={match.slot_id}
    >
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
      <div className="series-team" data-winner={winner === first || undefined}>
        <Team name={first} data={data} />
        <span className="score">
          {done && match.score1 != null ? match.score1 : "—"}
        </span>
      </div>
      <div className="series-team" data-winner={winner === second || undefined}>
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
              : match.match_date
                ? dateLabel(match.match_date) + " · Time not recorded"
                : "Start time unavailable"}
          </p>
          <p>
            {done
              ? "Published result"
              : "A scheduled time alone does not establish a result."}
          </p>
          <Link
            to={
              (done ? "/history/" : "/matches/") +
              encodeURIComponent(match.match_id)
            }
          >
            {done ? "Open stored result" : "Open match analysis"}{" "}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      )}
    </article>
  );
}
