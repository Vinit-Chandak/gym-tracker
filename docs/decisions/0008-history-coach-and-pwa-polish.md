# 0008 — History, coach access and PWA performance

Status: accepted, 2026-09-08.

## Context

The user reported long waits after taps and requested phases 7–9 together, following phase 6.
They confirmed coach tokens and endpoints only, with external connection/automation later,
and browser set drafts with manual retry. No background synchronization was requested.

## Decisions

- Share bounded batched training reads between History, Progress and the coach API. Date ranges
  default to 84 days and are limited to 366 days. Interactive history filters and chart choices
  use the already-loaded data locally. SVG charts and accessible value tables avoid adding a
  charting runtime. Preserve machine identities, units and missing measurements.
- Calculate sequence adherence across the whole active lifting programme. Rest slots do not
  count as missed workouts; pending work remains pending when sessions shift.
- Store only hashes of revocable, expiring opaque coach tokens. Credential lookup is the sole
  owner-connection read used to establish the token principal. All training reads then run under
  RLS in a read-only transaction. Details and pagination semantics are in `docs/coach-api.md`.
- Add loading boundaries for every protected page so Next can prefetch route shells, plus
  pending-link feedback, pending form buttons, actionable errors and connectivity guidance.
- Batch comparable history and availability reads across exercises/gyms. Keep history guidance
  off check-in, finish and substitution pages that do not need it. Memoize authentication only
  within the request, avoid redundant profile writes, and avoid refreshing all guidance after
  toggling a warm-up. Place Vercel functions in `bom1`, matching the database's Mumbai region.
- Set saves immediately expose the next row and begin the optional rest timer, but show success
  only after the server confirms. Save failures retain exact inputs in localStorage, scoped to
  account, session, exercise slot, exercise and machine. Keep only unsaved rows; remove each after
  acknowledgement or a verified match to server values after a lost response.
- Manual retries use the prior save timestamp and exercise/machine identity to reject stale
  updates. Session row locks serialize set mutations with finishing/substitution. Read existing
  sets after acquiring the lock so a request that waited sees the preceding commit.
- Block completion, skipping and substitution while local entries need saving/removal. Keep
  drafts visible for review if a workout was finished elsewhere. Storage failures warn users to
  keep the page open. Drafts are bounded to 50 rows / 50 KB per exercise slot; saved workouts are
  not retained in browser storage.
- Cache only public offline guidance and its icon. Never service-worker-cache authenticated
  HTML, RSC, server actions or coach responses. An already-open session can retain set drafts
  offline; reopening the actual workout requires a connection. There is no automatic replay,
  conflict merging, or persistence for other forms such as runs and check-ins.

## Validation

PGlite tests apply every migration and verify account isolation, token expiry/revocation,
read-only transactions, endpoint responses, date boundaries, machine grouping, adherence,
batch-history equivalence and idempotent/stale saves. Client tests cover failed saves,
remount/retry, lost acknowledgements, next-row feedback and non-contiguous set indices.

The read-only benchmark (`npx tsx scripts/measure-performance.ts`, configured with
`SEED_USER_EMAIL`) reduced exercise availability from 21 to 13 database commands. On the
development connection this measured approximately 1174 ms before and 675 ms after. These
are diagnostic samples, not a mobile latency guarantee; region placement needs deployment.
