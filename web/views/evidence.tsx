import { Link } from "react-router-dom";
import {
  dateLabel,
  number,
  percent,
  allMatches,
  isFinal,
  type DeskData,
} from "@/lib/data";
export function Evidence({ data }: { data: DeskData }) {
  const registry = data.snapshot.model_registry,
    baseline = registry?.baseline,
    evaluation = registry?.monitoring?.champion_metrics || baseline?.metrics,
    slices = registry?.monitoring?.champion_slices || baseline?.slices,
    profiles = data.players.filter((p) => number(p.rating_3_0) !== null),
    portraits = data.players.filter((p) => p.portrait_url),
    matches = allMatches(data);
  return (
    <>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>Data, with its limits</h1>
          <p>
            What this release contains, when it was checked and what remains
            unverified.
          </p>
        </div>
      </header>
      <section className="evidence-section">
        <h2>Match coverage</h2>
        <p>
          {data.snapshot.coverage.fixture_provider === "pandascore"
            ? "PandaScore Fixtures supplies the current schedule, match status and series results. The Oracle cache checks the provider every five minutes; published model forecasts update separately."
            : "This view retains the previously published source snapshot."}
        </p>
        <p>
          Tier 1 and curated Tier 2 main events. Qualifiers, academy leagues and
          lower-tier regional cups are excluded by the shared product filter.
        </p>
        <dl className="evidence-list">
          <div>
            <dt>Last successful match-source check</dt>
            <dd>{dateLabel(data.snapshot.coverage.last_verified_utc)}</dd>
          </div>
          <div>
            <dt>Series in the loaded snapshot</dt>
            <dd>{matches.length}</dd>
          </div>
          <div>
            <dt>Source-confirmed finished series</dt>
            <dd>{matches.filter(isFinal).length}</dd>
          </div>
        </dl>
        <p>
          Refresh checks our cached feed. When the upstream source is blocked,
          the last verified data stays available with its original date. A
          passed start time does not prove a result. New picks require a current
          source check and a verified future start.
        </p>
        <Link className="back-link" to="/matches">
          Open match desk →
        </Link>
      </section>
      <section className="evidence-section">
        <h2>Player profiles and images</h2>
        <dl className="evidence-list">
          <div>
            <dt>Cached profiles</dt>
            <dd>{data.players.length}</dd>
          </div>
          <div>
            <dt>Profiles with stored Rating 3.0</dt>
            <dd>{profiles.length}</dd>
          </div>
          <div>
            <dt>Profiles with a stored portrait URL</dt>
            <dd>{portraits.length}</dd>
          </div>
        </dl>
        <p>
          Each statistic keeps its own collection date and sample. A portrait
          URL does not establish current image availability. If an image cannot
          load, initials keep the profile usable. Missing, source-confirmed
          absent and failed-to-fetch fields must not be treated as the same
          thing.
        </p>
        <p>
          Closing and clutching remain separate. A missing trait stays
          unavailable.
        </p>
      </section>
      <section className="evidence-section">
        <h2>Model evidence</h2>
        <p>
          Stored historical evaluation results describe this dataset. They do
          not establish future performance or betting returns. Historical
          estimates shown after a match are not pre-match predictions.
        </p>
        <dl className="evidence-list">
          <div>
            <dt>Current model: stored evaluation accuracy</dt>
            <dd>{percent(evaluation?.accuracy)}</dd>
          </div>
          <div>
            <dt>Brier score (lower is better)</dt>
            <dd>{number(evaluation?.brier)?.toFixed(3) ?? "Not published"}</dd>
          </div>
          <div>
            <dt>Evaluated held-out series</dt>
            <dd>
              {registry?.monitoring?.champion_test_rows ?? "Not published"}
            </dd>
          </div>
          <div>
            <dt>Model trained through</dt>
            <dd>{dateLabel(registry?.champion?.trained_through)}</dd>
          </div>
          <div>
            <dt>Registry generated</dt>
            <dd>{dateLabel(registry?.generated_at_utc)}</dd>
          </div>
        </dl>
        {slices
          ?.filter((s) => s.dimension === "tier")
          .map((s) => (
            <p key={s.key}>
              {s.key === "tier_1" ? "Tier 1" : "Tier 2"}:{" "}
              {percent(s.metrics.accuracy)} accuracy across {s.rows} evaluated
              series.
            </p>
          ))}
      </section>
      <section className="evidence-section">
        <h2>Privacy and saved picks</h2>
        <p>
          Following and picks are stored in this browser. They are not an
          account backup and will not transfer automatically to another device.
          Private browsing or blocked storage can prevent persistence.
        </p>
        <p>
          Match times use your browser's local time zone. Source dates are
          preserved during refreshes.
        </p>
      </section>
    </>
  );
}
