const root = document.querySelector("#bracketEmbed");
const eventId = new URLSearchParams(window.location.search).get("event") || "";
const assets = window.__STRIKESIGNAL_TEAM_ASSETS__ || {};
let contract = null;
let activeLaneId = "";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const percent = (value) => new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 }).format(Number(value));

function teamLogo(name) {
  const asset = assets[normalize(name)];
  if (!asset?.logo_url) return `<span class="team-fallback">${escapeHtml(String(name || "?").slice(0, 2).toUpperCase())}</span>`;
  return `<img src="${escapeHtml(asset.logo_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function stateLabel(match) {
  if (match.status === "finished") return "Final";
  if (match.status === "live") return "Live";
  if (match.status === "projected") return "Model";
  if (match.status === "bye") return "Bye";
  return match.starts_at ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(match.starts_at)) : "TBD";
}

function teamRow(name, side, match) {
  const probability = side === 1 ? match.prob_team1 : match.prob_team1 == null ? null : 1 - match.prob_team1;
  const score = side === 1 ? match.score1 : match.score2;
  const winner = match.winner_name && normalize(match.winner_name) === normalize(name);
  const metric = match.status === "finished" && score != null ? score : probability == null ? "" : percent(probability);
  const known = name && name !== "TBD";
  return `<div class="bracket-team ${winner ? "is-winner" : ""} ${known ? "" : "is-tbd"}">${known ? teamLogo(name) : "<i></i>"}<strong>${escapeHtml(name || "TBD")}</strong><b>${escapeHtml(metric)}</b></div>`;
}

function matchCard(match) {
  const matchUrl = new URL("../../", window.location.href);
  if (match.match_id && !match.match_id.startsWith("::")) matchUrl.searchParams.set("match", match.match_id);
  matchUrl.hash = "matches";
  const content = `<span class="match-state is-${escapeHtml(match.status)}">${escapeHtml(stateLabel(match))}</span>${teamRow(match.team1_name, 1, match)}${teamRow(match.team2_name, 2, match)}`;
  return match.match_id && !match.match_id.startsWith("::")
    ? `<a class="bracket-match is-${escapeHtml(match.status)}" href="${escapeHtml(matchUrl.toString())}">${content}</a>`
    : `<article class="bracket-match is-${escapeHtml(match.status)}">${content}</article>`;
}

function roundColumn(round) {
  const groups = round.groups?.length ? round.groups : [{ label: "", matches: round.matches || [] }];
  return `<section class="bracket-round"><header><span>${String(round.order).padStart(2, "0")}</span><strong>${escapeHtml(round.label)}</strong><b>${round.matches.length || groups.reduce((sum, group) => sum + group.matches.length, 0)}</b></header><div>${groups.map((group) => `<div class="round-group">${group.label ? `<span>${escapeHtml(group.label)}</span>` : ""}${group.matches.length ? group.matches.map(matchCard).join("") : matchCard({ team1_name: "TBD", team2_name: "TBD", status: "upcoming", match_id: "" })}</div>`).join("")}</div></section>`;
}

function stageRail(blueprint) {
  return `<div class="stage-rail">${(blueprint.stages || []).map((stage, index) => `<article class="${index === 0 ? "is-active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(stage.name)}</strong><b>${stage.team_count || "--"} teams</b></article>`).join("")}</div>`;
}

function renderLane() {
  const lane = contract.lanes.find((row) => row.id === activeLaneId) || contract.lanes[0];
  const eventUrl = new URL("../../", window.location.href);
  eventUrl.searchParams.set("event", contract.event_id);
  eventUrl.searchParams.set("view", "bracket");
  eventUrl.hash = "featured";
  root.className = "bracket-embed is-ready";
  root.innerHTML = `<header class="embed-head"><a class="brand" href="../../"><i></i><strong>StrikeSignal</strong></a><span>${escapeHtml(contract.event_status || "Event")}</span></header>
    <section class="event-head"><div><span>${escapeHtml(contract.source === "projection" ? "Live tournament model" : "Event bracket")}</span><h1>${escapeHtml(contract.event_name)}</h1><p>${escapeHtml(contract.stage || contract.format?.label || "Tournament path")}</p></div><aside><b>${contract.field.length}</b><span>teams</span><strong>${contract.matches.length}</strong><span>series</span></aside></section>
    ${stageRail(contract.blueprint)}
    <nav class="lane-tabs" aria-label="Bracket views">${contract.lanes.map((row) => `<button type="button" class="${row.id === lane.id ? "is-active" : ""}" data-lane="${escapeHtml(row.id)}">${escapeHtml(row.label)}<b>${row.rounds.length}</b></button>`).join("")}</nav>
    <div class="bracket-viewport"><div class="bracket-tree" style="--rounds:${Math.max(1, lane.rounds.length)}">${lane.rounds.map(roundColumn).join("")}</div></div>
    <footer><span><i class="is-live"></i> Live <i class="is-final"></i> Final <i></i> Model / upcoming</span><a href="${escapeHtml(eventUrl.toString())}">Open event room <b>+</b></a></footer>`;
  window.parent?.postMessage({ type: "strikesignal:resize", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
}

function renderError(title, detail) {
  root.className = "bracket-embed is-error";
  root.innerHTML = `<section><span>StrikeSignal</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><a href="../../#events">Open event desk</a></section>`;
}

async function boot() {
  if (!eventId) return renderError("Choose an event", "Add ?event=<stable-event-id> to this embed URL.");
  try {
    const response = await fetch(`/api/catalog?resource=brackets&event=${encodeURIComponent(eventId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.data?.[0]) throw new Error(payload.error || "Event bracket not found");
    contract = payload.data[0];
    if (!contract.lanes?.length) throw new Error("The event feed has not published a bracket or match schedule yet.");
    const projectionComplete = contract.source === "projection" && /complete|playoff/i.test(`${contract.event_status} ${contract.stage}`);
    activeLaneId = projectionComplete && contract.lanes.some((lane) => lane.id === "playoffs") ? "playoffs" : contract.lanes[0].id;
    renderLane();
  } catch (error) {
    renderError("Bracket unavailable", error.message || "The verified event feed is temporarily unavailable.");
  }
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-lane]");
  if (!button) return;
  activeLaneId = button.dataset.lane;
  renderLane();
});

boot();
