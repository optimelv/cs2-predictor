const card = document.querySelector("#embedCard");
const params = new URLSearchParams(window.location.search);
const matchId = params.get("match") || "";
const assets = window.__STRIKESIGNAL_TEAM_ASSETS__ || {};

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const percentFormatter = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });
const percent = (value) => percentFormatter.format(Number(value));

function teamLogo(name) {
  const asset = assets[normalize(name)];
  if (!asset?.logo_url) return `<span class="team-fallback">${escapeHtml(String(name || "?").slice(0, 2).toUpperCase())}</span>`;
  return `<img src="${escapeHtml(asset.logo_url)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
}

function statusLabel(match) {
  const status = String(match.status || "upcoming").toLowerCase();
  if (/finished|completed|final|ended/.test(status)) return "Final";
  if (/live|playing|progress/.test(status)) return "Live";
  return match.starts_at ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(match.starts_at)) : "Upcoming";
}

function renderError(title, detail) {
  card.className = "embed-card is-error";
  card.innerHTML = `<section><span>StrikeSignal</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><a href="../#matches">Open match desk <b>↗</b></a></section>`;
}

function renderMatch(match) {
  const probability = Number(match.prob_team1);
  const hasPrediction = Number.isFinite(probability) && probability > 0 && probability < 1;
  const team1Share = hasPrediction ? probability : 0.5;
  const team2Share = 1 - team1Share;
  const winner = hasPrediction ? match.predicted_winner || (team1Share >= 0.5 ? match.team1_name : match.team2_name) : "Model read pending";
  const confidence = hasPrediction ? Math.max(team1Share, team2Share) : null;
  const maps = (match.maps || []).map((map) => map.map_name || map).filter(Boolean).slice(0, 3);
  const roomUrl = new URL("../", window.location.href);
  roomUrl.searchParams.set("match", match.match_id || matchId);
  roomUrl.hash = "matches";
  card.className = `embed-card is-ready is-${String(match.status || "upcoming").toLowerCase()}`;
  card.innerHTML = `
    <header><a class="brand" href="../"><i></i><strong>StrikeSignal</strong></a><span>${escapeHtml(statusLabel(match))}</span></header>
    <section class="event-line"><span>${escapeHtml(match.event_name || "CS2 circuit")}</span><b>${escapeHtml(String(match.series_format || "bo3").toUpperCase())} · ${escapeHtml(match.stage_name || "Series")}</b></section>
    <section class="matchup">
      <article>${teamLogo(match.team1_name)}<strong>${escapeHtml(match.team1_name)}</strong><b>${hasPrediction ? percent(team1Share) : "--"}</b></article>
      <div><span>Model pick</span><strong>${escapeHtml(winner)}</strong><b>${confidence == null ? "Awaiting verified inputs" : `${percent(confidence)} confidence`}</b></div>
      <article>${teamLogo(match.team2_name)}<strong>${escapeHtml(match.team2_name)}</strong><b>${hasPrediction ? percent(team2Share) : "--"}</b></article>
    </section>
    <div class="probability-track" style="--team-one:${Math.round(team1Share * 100)}%"><i></i></div>
    <footer><span>${maps.length ? maps.map((map) => `<b>${escapeHtml(map)}</b>`).join("") : "Maps update with the veto"}</span><a href="${escapeHtml(roomUrl.toString())}">Full match room <b>↗</b></a></footer>`;
  window.parent?.postMessage({ type: "strikesignal:resize", height: Math.ceil(card.getBoundingClientRect().height) }, "*");
}

async function boot() {
  if (!matchId) return renderError("Choose a match", "Add ?match=<stable-match-id> to this embed URL.");
  try {
    const response = await fetch(`/api/catalog?resource=matches&id=${encodeURIComponent(matchId)}&detail=full`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.data?.[0]) throw new Error(payload.error || "Match not found");
    renderMatch(payload.data[0]);
  } catch (error) {
    renderError("Match unavailable", error.message || "The verified match feed is temporarily unavailable.");
  }
}

boot();
