# Staged release data review — 20 September 2026

Scope: read-only review of the staged production responses captured at
`2026-09-20T04:55:46Z` (coverage/live/history) and `2026-09-20T04:56:04Z`
(predictions). This review does not establish that HLTV is correct; it tests
internal consistency and the consequences of the current frontend contracts.

## Release-blocking data-integrity finding

`data-coverage.json` declares `last_verified_utc: 2026-09-20T04:55:46Z`, but
retains eleven non-finished series from 12 July. Nine resolve to an eligible
Tier 1/2 event through the same `eventIsProductEligible` path used by
`dailyMatchCalls()`:

| State | Count | Examples |
| --- | ---: | --- |
| `live`, eligible | 8 | BESTIA–Keyd Stars (Thunderpick SA S2); six ESL Challenger League S52 Europe Cup 1 series; LPH–mellren (CCT Contenders Europe S6) |
| `scheduled`, eligible | 1 | LP–Imperial (Thunderpick SA S2) |
| non-eligible / excluded | 2 | FRAG St. Clair 2026 |

All 11 have no source match ID, no score and no winner. They are not zero-score
results: the fields are absent. The client preserves source status and does not
infer a result from elapsed time, which is the correct missing-result behavior.
However, the eligible nine pass the current-slate filter in `dailyMatchCalls()`
(product tier + parseable `starts_at`) and can be surfaced as live/scheduled
historical calls. This makes the source-check timestamp misleading as a claim
about the active schedule.

**Required resolution before calling this a live consumer release:** correct
the upstream snapshot or exclude/segregate elapsed, non-finished records from
current match and event surfaces. Do not relabel them as finished or invent a
winner/score. A genuine result is required for that transition.

Related event-state evidence: 8 eligible, non-archived events have end dates
before 20 September yet retain `ongoing` or `upcoming`; 55 more active-looking
eligible event records have no end date. `availableEvents()` renders
non-archived events whose status is not `finished`, so these can appear in the
active Events view. This is a data freshness gate, not merely a cosmetic date
issue.

## Checks that passed

- The 47 records in the captured live response all match records in staged
  coverage by `match_id`; compared team names, event ID/name, start, status,
  scores and winner have zero differences.
- The 133 finished coverage records that overlap `history.json` have zero
  differences on team names, event name, score and winner. Every finished
  coverage/live record has a winner or unequal finite series scores; no
  current record turns a missing result into `0:0`.
- All 24 `upcoming_predictions` match live/coverage series IDs. Each has a
  finite `prob_team1` strictly between 0 and 1 (range 0.3740–0.6425); the UI
  derives the opposing value as `1 - prob_team1`. `prob_team2` is not part of
  this payload contract, so its absence is not a defect.
- No prediction has an invalid start time, duplicate match ID, or a completed
  result. All 24 resolve to an eligible event through the coverage event join.
  Prediction rows omit `product_tier`, but the frontend obtains eligibility
  from the joined coverage event; this is functional for this capture.
- The current live response contains only Tier 2 series, consistent with the
  captured eligible current schedule. No C-/D-tier live series was exposed in
  that response.

## Identity and coverage limits

The coverage event list contains legacy/history and current event records with
the same name but different IDs (for example, CCT Europe Series 9 has
`hltv:9404` and `hltv:cct-2026-europe-series-9`). `availableEvents()` collapses
non-archive events by normalized name, while match joins allow either exact ID
or name. For the current CCT Series 9 the resulting event view still combines
the four staged upcoming calls, so no wrong opponent/result was observed. This
is nevertheless a fragile name-based fallback: a future same-name event with
different metadata could select the wrong format, map pool, or event state.

Player metadata is intentionally mixed-age:

- Player performance snapshot generated: `2026-06-08T00:08:00Z`.
- Player series/map history through: `2026-05-24`.
- Lineup metadata checked: `2026-09-20T04:55:46Z`.

The UI currently labels the player grid “stats through” the historical date,
so the stale performance facts are disclosed rather than silently presented as
fresh. Only 6 of the 48 teams in the 24-match prediction slate have player
profiles in this snapshot; 5 forecasts are explicitly `data_quality: partial`.
This review cannot establish that the other 19 `full` labels are analytically
well-supported, because they refer to the model-state contract rather than
player-profile availability. The model result timestamps and source inputs
would need separate benchmark/source validation.

## Reproduction

Run from the repository root; these commands read only the staged capture:

```sh
node - <<'NODE'
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('/private/tmp/strikesignal-release-evidence/data-coverage.json'));
const checked = Date.parse(c.last_verified_utc);
console.table(c.daily_matches.filter(m => Date.parse(m.starts_at) < checked && !/finished|completed|final|ended/i.test(m.status || '')).map(m => ({ event: m.event_name, teams: `${m.team1_name} vs ${m.team2_name}`, start: m.starts_at, status: m.status, id: m.match_id || '(absent)' })));
NODE
```

Contract/rendering locations reviewed: `docs/lib/snapshot.js` normalizes source
status without elapsed-time completion; `docs/app.js` `dailyMatchCalls()`
filters by event eligibility and date validity; `availableEvents()` selects
active cards by source status; `matchInsightHtml()` renders the second
probability as `1 - prob_team1`.

