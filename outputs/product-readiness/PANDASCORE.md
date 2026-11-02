# PandaScore Fixtures channel

The user authorized the free PandaScore setup on 2 November 2026. The account
was created and authenticated by the user. No paid subscription was selected.
Authenticated REST checks returned HTTP 200 for upcoming, running and past CS2
matches, and for the tournament catalog. The API showed 1,000 requests/hour.

The collector uses the existing Oracle service and its cache API. The key stays
in a private server EnvironmentFile; GitHub and Vercel need no PandaScore key.
Select `FIXTURE_PROVIDER=pandascore`, supply `PANDASCORE_TOKEN`, and keep a polling
interval of at least 300 seconds. There is no fallback to direct HLTV requests.
PandaScore mode starts no HLTV profile or historical-backfill tasks. Existing
profile data, source pauses and the historical database are preserved.

The new provider has a separate persistent `source_retry_pandascore_utc` value.
HTTP 401/403/429 stops the attempt, retains the last successful snapshot and
honours Retry-After. Pagination is bounded and incomplete schedule/catalog
responses fail instead of claiming complete coverage. The past-results overlap
is the latest 100 results across the selected tournaments; no historical sweep
is performed. The tournament discovery window is 60 days either side of today.

Only source S/A/B main tournaments passing the existing product curation are
included. Unknown opponents remain unconfirmed. Match results are oriented by
provider team ID. Upcoming zero counters do not become played scores. Paid map
statistics, HLTV-specific ratings/traits and image downloads are not requested.
The existing profile cache keeps its original evidence dates.

Provider match IDs remain recorded separately. A legacy fixture ID is reused
only for one matching event, ordered team pair, series format and scheduled time
within five minutes; ambiguous cases keep the provider ID. The active provider
owns the current board, while historical data remains separate.

`pandascore_started_utc` is written once. Only results starting after that
activation enter the observed-result archive, online model updates and new
history promotion. This prevents legacy HLTV results being replayed as new
PandaScore results. Importing earlier provider history would require a reviewed
cross-provider result reconciliation first.

Sources checked: https://developers.pandascore.co/docs/plan-reference,
https://developers.pandascore.co/docs/matches-lifecycle,
https://www.pandascore.co/pricing. Betting-related use is outside the standard
stats-plan offer. This integration does not add wagering or a paid data product.
