# Coach read API

Create a token in **Settings → Coach access**. Give it a name and choose 30, 90 or 365 days.
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
| `/api/coach/recovery`              | Daily recovery, workout check-ins and run shin scores before/during/after                                                                                         |
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

## Interpretation

- Preserve raw `unit`, `equipmentInstanceId` and exercise identity. Machine loads from different
  equipment instances are separate series. Only globally portable exercises compare across gyms,
  and different units remain separate. Missing machine IDs are not comparable.
- Warm-up sets are excluded from performance series and weekly working sets. Each other set
  counts once for each primary muscle. Secondary muscles are excluded.
- Weeks run Tuesday–Monday in the account time zone; range-edge weeks may be partial.
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
