import { playerPortraitFor } from "../../docs/lib/player-portraits.js";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { State, Team } from "@/components/common";
import { Follow } from "@/components/follow";
import {
  dateLabel,
  number,
  teamKey,
  type DeskData,
  type Player,
} from "@/lib/data";
import {
  comparePlayerProfiles,
  parsePlayerCompare,
} from "../../docs/lib/player-compare.js";

const stat = (n: unknown, digits = 0) =>
  number(n) === null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(Number(n));
export function Portrait({ player }: { player: Player }) {
  return (
    <Avatar className="player-portrait">
      <AvatarImage
        src={playerPortraitFor(player)?.src}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
      />
      <AvatarFallback>
        {player.nickname.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
function PlayerDetail({ player, data }: { player: Player; data: DeskData }) {
  const traits = Object.entries(player.traits || {}).filter(
    ([, value]) => number(value) !== null,
  );
  const timeline = (player.form_timeline || [])
    .filter(
      (r) =>
        Number.isFinite(Date.parse(r.date)) &&
        number(r.rating ?? r.average_rating) !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <Link className="back-link" to="/players">
        <ArrowLeft />
        All players
      </Link>
      <header className="object-header">
        <div className="profile-heading">
          <Portrait player={player} />
          <div>
            <p className="subline">Player profile</p>
            <h1 tabIndex={-1}>{player.nickname}</h1>
            {player.team_name && (
              <Link
                to={"/teams/" + encodeURIComponent(player.team_name)}
                className="profile-team"
              >
                {player.team_name}
                <ArrowRight />
              </Link>
            )}
          </div>
        </div>
        <Follow kind="players" id={player.player_id} name={player.nickname} />
      </header>
      <div className="profile-facts">
        <div>
          <span>Rating 3.0</span>
          <strong>{stat(player.rating_3_0, 2)}</strong>
        </div>
        <div>
          <span>Maps in sample</span>
          <strong>{stat(player.maps_3m)}</strong>
        </div>
        <div>
          <span>Statistics through</span>
          <strong>{dateLabel(player.stats_through_date)}</strong>
        </div>
      </div>
      <p className="subline profile-source">
        Past three months at collection time. Values retain their original
        source date. A missing value is not zero.
      </p>
      {playerPortraitFor(player) && (
        <p className="subline">
          <a
            href={playerPortraitFor(player)!.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            HLTV profile and image source ↗
          </a>
        </p>
      )}
      <Tabs defaultValue="profile">
        <TabsList aria-label="Player view">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="form">
            Recorded form ({timeline.length})
          </TabsTrigger>
          <TabsTrigger value="maps">
            Maps ({player.map_profile?.length || 0})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <div className="section-heading">
            <h2>Playing style</h2>
            <p>
              Traits through {dateLabel(player.traits_through_date)}. Closing
              and clutching are separate source fields.
            </p>
          </div>
          {traits.length ? (
            <div className="traits">
              {traits.map(([name, value]) => (
                <div className="trait" key={name}>
                  <span>{name[0].toUpperCase() + name.slice(1)}</span>
                  <div className="trait-track">
                    <span
                      style={{
                        width: Math.min(100, Math.max(0, Number(value))) + "%",
                      }}
                    />
                  </div>
                  <strong>{stat(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <State
              title="Playing-style data is unavailable"
              description="The cache has no verified traits for this player. Try another profile from the player directory."
            />
          )}
        </TabsContent>
        <TabsContent value="form">
          <div className="section-heading">
            <h2>Recorded series</h2>
            <p>Only matches stored with a source date and rating are shown.</p>
          </div>
          {timeline.length ? (
            <div className="data-table">
              <div className="data-row table-head">
                <span>Date</span>
                <span>Opponent</span>
                <span>Rating</span>
              </div>
              {timeline
                .slice()
                .reverse()
                .map((row, i) => (
                  <div className="data-row" key={row.date + i}>
                    <span>{dateLabel(row.date)}</span>
                    <span>{row.opponent_name || "Opponent not recorded"}</span>
                    <strong>{stat(row.rating ?? row.average_rating, 2)}</strong>
                  </div>
                ))}
            </div>
          ) : (
            <State
              title="No verified form history"
              description="The profile values above remain available with their own source dates. Return to Profile to view them."
            />
          )}
        </TabsContent>
        <TabsContent value="maps">
          <div className="section-heading">
            <h2>Map profile</h2>
            <p>Ratings from the stored map sample.</p>
          </div>
          {player.map_profile?.length ? (
            <div className="data-table">
              <div className="data-row table-head">
                <span>Map</span>
                <span>Sample</span>
                <span>Rating</span>
              </div>
              {player.map_profile.map((row) => (
                <div className="data-row" key={row.map_name}>
                  <span>{row.map_name}</span>
                  <span>{stat(row.maps)} maps</span>
                  <strong>{stat(row.average_rating, 2)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <State
              title="No verified map splits"
              description="The source cache has no map-level records for this player. Return to Profile for the available statistics."
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
function Comparison({
  players,
  onRemove,
}: {
  players: Player[];
  onRemove: (id: string) => void;
}) {
  const read =
    players.length === 2 ? comparePlayerProfiles(players[0], players[1]) : null;
  return (
    <section className="comparison">
      <div className="section-heading">
        <h2>Compare players</h2>
        <p>Each side keeps its own statistics date and map sample.</p>
      </div>
      <div className="comparison-head">
        <span>Metric</span>
        {players.map((p) => (
          <div key={p.player_id}>
            <Portrait player={p} />
            <Link to={"/players/" + encodeURIComponent(p.player_id)}>
              {p.nickname}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label={"Remove " + p.nickname + " from comparison"}
              onClick={() => onRemove(p.player_id)}
            >
              <X />
            </Button>
            <span className="subline">{dateLabel(p.stats_through_date)}</span>
          </div>
        ))}
      </div>
      {read ? (
        <div className="data-table">
          {[...read.metrics, ...read.traits].map((row) => (
            <div className="data-row" key={row.key}>
              <span>{row.label}</span>
              <strong>{stat(row.left, row.digits)}</strong>
              <strong>{stat(row.right, row.digits)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="subline">Choose one more player from the directory.</p>
      )}
    </section>
  );
}
export function Players({ data }: { data: DeskData }) {
  const { "*": selected } = useParams(),
    [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(36);
  const current = data.players.find((p) => p.player_id === selected);
  const compare = parsePlayerCompare(
    params.get("compare"),
    data.players.map((p) => p.player_id),
  );
  const rows = data.players
    .filter((p) =>
      (p.nickname + " " + p.team_name)
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (number(b.rating_3_0) ?? -1) - (number(a.rating_3_0) ?? -1) ||
        a.nickname.localeCompare(b.nickname),
    );
  useEffect(() => setLimit(36), [query]);
  function toggleCompare(id: string) {
    const ids = compare.includes(id)
      ? compare.filter((x) => x !== id)
      : [...compare, id].slice(-2);
    const next = new URLSearchParams(params);
    ids.length ? next.set("compare", ids.join(",")) : next.delete("compare");
    setParams(next, { replace: true });
  }
  if (current)
    return (
      <PlayerDetail key={current.player_id} player={current} data={data} />
    );
  if (selected)
    return (
      <State
        title="Player not found"
        description="This profile is not part of the published player cache."
      >
        <Link className="back-link" to="/players">
          Return to player directory
        </Link>
      </State>
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>The players</h1>
          <p>Verified profiles, with the date behind every statistic.</p>
        </div>
        <span className="count">{data.players.length} cached profiles</span>
      </header>
      <Field className="player-search">
        <FieldLabel htmlFor="player-search">Find a player or team</FieldLabel>
        <div className="search-input">
          <Search />
          <Input
            id="player-search"
            placeholder="For example, ZywOo or Vitality"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Field>
      {compare.length > 0 && (
        <Comparison
          players={compare.map((id) =>
            data.players.find((p) => p.player_id === id)!,
          )}
          onRemove={toggleCompare}
        />
      )}
      <p className="results-count" role="status">
        {rows.length} profiles · Sorted by stored rating; samples and dates
        differ.
      </p>
      <div className="player-grid">
        {rows.slice(0, limit).map((player) => (
          <article className="player-card" key={player.player_id}>
            <Link
              className="player-profile-link"
              to={"/players/" + encodeURIComponent(player.player_id)}
            >
              <Portrait player={player} />
              <div>
                <h2>{player.nickname}</h2>
                <p>{player.team_name || "Team not confirmed"}</p>
              </div>
              <ArrowRight />
            </Link>
            <div className="player-card-stats">
              <div>
                <span>Rating 3.0</span>
                <strong>{stat(player.rating_3_0, 2)}</strong>
              </div>
              <div>
                <span>Maps</span>
                <strong>{stat(player.maps_3m)}</strong>
              </div>
            </div>
            <p className="subline">
              Statistics through {dateLabel(player.stats_through_date)}
            </p>
            <Button
              variant="ghost"
              aria-pressed={compare.includes(player.player_id)}
              onClick={() => toggleCompare(player.player_id)}
            >
              {compare.includes(player.player_id)
                ? "Remove from comparison"
                : "Compare player"}
            </Button>
          </article>
        ))}
      </div>
      {!rows.length && (
        <State
          title="No matching player profiles"
          description="Try a different nickname or team."
        >
          <Button variant="outline" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </State>
      )}
      {rows.length > limit && (
        <Button
          className="load-more"
          variant="outline"
          onClick={() => setLimit(limit + 36)}
        >
          Show more players ({rows.length - limit} remaining)
        </Button>
      )}
    </>
  );
}
