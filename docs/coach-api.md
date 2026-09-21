# Coach read API

Create a token in **Profile → Coach access**. Give it a name and choose 30, 90 or 365 days.
Copy it when it appears; the database stores only a SHA-256 hash. Keep it in the external
client's secret storage. Revoke it from the same screen to stop subsequent requests immediately.
There can be up to 10 active tokens. No connection or scheduled automation is configured by the app.

Send the token as an HTTP header, never in the URL:

```http
GET /api/coach/workouts?from=2026-09-01&to=2026-09-30&page=0&limit=50
Authorization: Bearer <your-token>
Accept: application/json
```

Tokens grant read access to that account's training data only. Browser sign-in cookies do not
authenticate these endpoints. Training queries run under the account's RLS policies in a
Postgres read-only transaction. There are no mutation endpoints. All responses are private,
uncached JSON; TLS is provided by the deployment.

## Endpoints

| GET path                           | Payload                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/coach/summary`               | Finished-workout counts, active days, exercise and machine series, weekly muscle sets and run totals, pace, sleep and symptoms; whole-programme lifting adherence |
| `/api/coach/workouts`              | Sessions (including unfinished ones), gym, prescribed day, check-in, actual exercise slots, machine identity and raw sets                                         |
| `/api/coach/exercises/:id/history` | Exercise metadata and performances, session completion timestamp, gym, equipment and raw sets                                                                     |
| `/api/coach/running`               | Raw runs, distance, duration, derived pace, mode, RPE and symptoms                                                                                                |
| `/api/coach/recovery`              | Daily recovery and workout check-ins: sleep, quality, energy, fatigue and soreness                                                                                |
| `/api/coach/program/current`       | Current immutable programme version, days, exercise prescriptions, fallbacks, warm-ups and running targets; `null` when no programme is active                    |

Every response includes `version: 1`, `timeZone`, `from`, `to` and `generatedAt`. Dates are
`YYYY-MM-DD`, interpreted in the account's time zone, with both endpoints inclusive. Defaults
cover the most recent 84 days including today. The maximum range is 366 calendar days. Stored
timestamps are ISO strings; absent measurements remain `null`, not zero. The programme endpoint
always returns the whole current version, independent of the range.

`workouts`, `running`, `recovery` and exercise history accept zero-based `page` (default 0) and
`limit` (default 50, maximum 100). Read successive pages until `hasMore` is false. Workouts and
runs sort newest first, using the record ID to break timestamp ties. Exercise history pages by
matching workouts; one workout may contribute multiple performances. Optional
`equipmentInstanceId=<uuid>` selects exactly one machine. Extract exercise and machine IDs
from the programme or workout payloads.

For recovery, each page advances workout check-ins and runs separately; `hasMore` means either
stream has more records. The daily readings (at most one per date) are repeated on each page;
deduplicate them by ID. Pagination is an offset over live data: read a fixed past range or
deduplicate IDs if entries are being added during an export.

Summary data is capped at the newest 500 workouts and 500 runs within the range. If
`summary.truncated` is true, narrow the range or fetch the paginated raw endpoints before
drawing conclusions. Adherence covers the whole active programme, not just the requested dates;
its completion rate is completed / (completed + skipped), with pending and rest slots excluded
from the denominator.

## Version 2

Version 1 is unchanged and stays available. Version 2 is a separate surface for the sports
version 1 has no shape for; nothing has been added to a v1 payload, and no v1 response has
become a redirect.

| GET path                        | Payload                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/coach/v2/activities`      | Every sport, with the canonical discriminator, the typed detail for that sport, effort and its provenance, and the occurrence it answered |
| `/api/coach/v2/summary`         | Per-sport totals, distinct training days, per-sport adherence and comparable whole-session bests over the stated period                   |
| `/api/coach/v2/program/current` | The active programme's endurance occurrences, their prescriptions and what became of each                                                 |

Responses carry `version: 2`. `activities` pages by `cursor` rather than by `page`: read
`nextCursor` and pass it back until it is null. The cursor is a timestamp and an id together,
so two activities recorded at the same instant cannot straddle a page boundary; `limit`
defaults to 50 and may not exceed 100. `sport` takes a comma-separated list of `strength`,
`running`, `cycling` and `swimming` — an unknown name is a 400, not an empty list.

Each activity's `effort` carries `value`, `status` and the `scale` the value is written on:
`{ min: 1, max: 5 }`. It was `{ min: 1, max: 10 }` until migration 0033 rescaled every stored
value, so read the bounds rather than assuming the RPE out of ten that the strength sets still
use. `status` is `reported`, `unknown` or `legacy_unconfirmed`, and only `reported` is the
athlete's own word — `unknown` means they answered "Not sure", which is an answer and not a
missing one.

A prescription's `effort` — the session target and each step's — is written on the same five
steps, so what a plan asked for and what the athlete answered can be read against each other.
Zero is the exception and means nothing was asked, not an effort of none. A strength set's
`rpe` and `rir` are a different question and are still out of ten.

`summary` aggregates in SQL over the whole stated period and says so in `coverage`. Its
`period` is inclusive at both ends, defaults to the last 28 local days, and may not exceed
366 days per request; longer exports are paged. The totals carry `unknownDistances` and
`unknownDurations`: a ride with no distance is counted as a session and excluded from the
distance, and saying which is the point. Zero and unknown are different answers throughout.

`comparableBests` are whole-session longest distance and duration within a context that makes
them comparable — indoor and outdoor rides are separate, assisted and unassisted are
separate, and pools of different lengths are separate. A session whose context was not
recorded is counted in the totals and excluded from the bests. There are no segment records,
no estimated power and no stroke efficiency, because none of those were measured.

A v1 `/program/current` whose programme contains cycling or swimming returns `409` with
`error: "upgrade_required"` and the v2 path to read instead. It never returns a partial
programme: half a programme presented as the programme cannot be detected downstream. Every
v1 response carries `Deprecation: true`, a `Link` to this document, and
`X-Coach-Api-Supported-Sports: workout, run`. Version 1 is maintained for at least 180 days
after cutover; removal additionally requires known clients to have upgraded and 30 days with
no legitimate use, and then answers `410` rather than redirecting.

## Interpretation

- Preserve raw `unit`, `equipmentInstanceId` and exercise identity. Machine loads from different
  equipment instances are separate series. Only globally portable exercises compare across gyms,
  and different units remain separate. Missing machine IDs are not comparable.
- Warm-up sets are excluded from performance series and weekly working sets. Each other set
  counts once for each primary muscle and half for each secondary muscle. These are weighted
  set counts, not measured muscle stimulus.
- Chart weeks run Monday–Sunday in the account time zone; range-edge weeks may be partial.
  These calendar weeks are distinct from repeating programme cycles and scheduled coach reviews.
- Estimated 1RM uses Epley only for loaded barbell sets with 1–10 reps and kg/lb units. One rep
  uses the actual load. This is an estimate, not a tested maximum.
- Pace series distinguish outdoor and treadmill. Recovery source labels distinguish workout
  check-ins, daily readings and after-run symptoms. Missing values are retained as gaps.
- Workout/exercise raw endpoints include unfinished sessions; use `completedAt` or
  `sessionCompletedAt` when analysing finished training.

## Errors

`400`: invalid dates, IDs or pagination. `401`: missing, invalid, expired or revoked token.
`404`: unknown endpoint or exercise. Unsupported mutation methods return `405`.
`503`: temporary data-service failure; retry with backoff. Error bodies contain an `error`
message without database details. No API request is allowed to apply programme changes.

## House coach service

`/api/coach/service/…` is a separate surface for the AI house coach, authenticated with one
server-side service token rather than a per-user token, and is the only path that writes:
it stores the coach's plan for an athlete's next session. Every request names an athlete who
has switched the coach on from their profile and runs under that athlete's own policies. See
[`docs/coach-automation.md`](coach-automation.md) for the endpoints, setup and limits.
