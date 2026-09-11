# Navigation and performance audit — 11 September 2026

The confirmed code problems are unnecessary database reads, more data fetched than screens
use, repeated refreshes after saves, and an oversized AI coach settings bundle. The measurements
do not establish that Next.js or Supabase needs replacing.

The mobile navigation now sits inside a top-anchored `100dvh` frame. It has 16 px side gutters
and a bottom gap of `max(4px, safe-area-inset-bottom - 12px)`, following the requested spacing
adjustment. The navigation and resume strip share this frame and gap during viewport changes.
Local browser layout checks pass; the specific iPhone cold-launch behavior remains unverified.

## Scope and method

- Baseline: `5402072a820b1abf9416470a1d8502cfbd567224`.
- Inventoried all **468 tracked project files**, including routes, components, repositories,
  actions, domain helpers, tests, migrations, configuration, scripts, documentation and assets.
  [The file index](performance-audit-files.json) records the full-file structural scan. Manual
  review focused on runtime imports, request dependencies, query shapes, rendering, event
  handlers, caching and invalidation. The index is not a claim of a manual line-by-line review
  of every generated file or reference document.
- Read the installed Next.js 16.3.4 guides for prefetching, router caching and server-action
  refresh/revalidation before changing those paths. Inspected the installed Postgres.js and
  Drizzle transaction/query implementations.
- Ran production builds, the database and component test suites, browser layout checks and
  read-only measurements against the locally configured database. No live workouts, plans,
  settings or database schema were changed by the measurement scripts.
- `output/` already contained unrelated artifacts. They were preserved. Dependencies and
  generated `.next` files were inspected where relevant, rather than treated as application
  source that should be rewritten.

## Measured changes

These are three-sample medians from this computer to the configured Mumbai database, using
the account already selected by `SEED_USER_EMAIL`. Both implementations ran through `withUser`
with RLS and `prepare: false`. Statement counts include transaction setup and commit.
They are **repository timings, not iPhone or deployed tab-navigation timings**.

| Read                      | Before |  After | Statements | Result size             |
| ------------------------- | -----: | -----: | ---------- | ----------------------- |
| History data              | 383 ms | 265 ms | 8 → 6      | 40,530 → 4,458 bytes    |
| History's workout portion | 270 ms | 161 ms | 6 → 4      | 39,939 → 3,867 bytes    |
| Gym detail                | 626 ms | 473 ms | 13 → 10    | Unchanged: 45,471 bytes |

History's data read is about **31% faster** and returns **89% less serialized data** in these
samples. Gym detail is about **24% faster**. Result size means serialized repository output,
not the complete HTML or React Server Component response. Data sizes and savings will vary
with the account and date range.

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` of the new History workout query, under the account's
RLS context, reported **0.939 ms planning and 0.631 ms execution for three records**. This
supports the network-overhead diagnosis for this sample; it does not establish performance
for an account with years of training.

The AI coach settings route's entry JavaScript shrank from **134,799 to 47,550 gzip bytes**
(about **85 KiB removed**). These sums come from production client-reference manifests and
exclude the common framework bootstrap and non-JavaScript assets. The other main tabs did
not carry that Zod chunk; this was a settings-specific problem.

Reproduce the read measurements with:

```sh
node node_modules/tsx/dist/cli.mjs scripts/measure-performance.ts
```

The script prints durations, statement counts and output sizes, without printing the account's
training records or connection credentials. It requires the existing local database settings
and `SEED_USER_EMAIL`.

## What changed and why

| Area                     | Confirmed issue                                                                                                                                                            | Change                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile navigation        | Independently bottom-fixed chrome depends on viewport positioning during launch and scrolling. The screenshots show a changing offset, but do not prove its browser cause. | Use a top-anchored dynamic viewport frame and position the navigation/resume strip within it. Reduce the bottom gap and set 16 px side gutters; preserve the desktop rail. |
| History                  | Read complete workout prescriptions and every logged set just to display labels and counts.                                                                                | One SQL projection for completed workout summaries, exercise/machine labels and set counts; preserve date bounds, filters and RLS.                                         |
| Today                    | Waited for the active-session read before starting independent plan/gym work.                                                                                              | Start the reads together, retaining request-level session deduplication.                                                                                                   |
| Today coach state        | Separate reads for plan, gym name, pending request, quota and last outcome.                                                                                                | Join the plan's gym and combine the request information into one read. Expired requests still persist their failure state.                                                 |
| Gym and exercise details | Availability re-read rows already fetched by the page.                                                                                                                     | Reuse the same transaction's gym, machines, absent equipment and exercise. Keep the returned resolution shape identical.                                                   |
| Run entry                | Fetched the schedule again to find the coach's run.                                                                                                                        | Pass the schedule already read by the page, including a known missing schedule.                                                                                            |
| Workout detail           | Re-read the rest-timer setting after loading the page profile.                                                                                                             | Reuse the page's setting.                                                                                                                                                  |
| Save flows               | Client refresh followed server actions that already refreshed or revalidated the active page.                                                                              | Remove duplicate client refreshes for fallback, superset and coach-request actions.                                                                                        |
| Existing caches          | Concurrent misses repeated the same profile/reference query.                                                                                                               | Coalesce in-flight reads; retain current TTLs. Bound profile entries and prevent invalidated in-flight reads from repopulating the cache.                                  |
| Date formatting          | Reconstructed `Intl.DateTimeFormat` repeatedly across history, analytics and scheduling.                                                                                   | Reuse formatters in a bounded cache keyed by locale and options.                                                                                                           |
| Coach polling            | Requested full page refreshes while hidden/offline; stopped after 12 minutes despite a 15-minute server timeout.                                                           | Poll while visible and online, refresh on return, and perform a final timeout read.                                                                                        |
| AI coach settings bundle | A text limit imported the module that initializes the complete plan validator.                                                                                             | Move shared limits into a small module; keep the validator on the server.                                                                                                  |

## Remaining costs and decisions

1. **Revisiting a tab still fetches dynamic page data.** The app currently prefetches loading
   shells, and Next's dynamic router-cache stale time defaults to zero. A short cache for tab
   data could improve repeat switches, but would change how quickly another device or the
   coach's external writes appear. The 30-second freshness question is pending; no new page-data
   TTL or full-prefetch policy has been introduced. Existing profile/reference TTLs remain
   60 seconds/10 minutes. [Next.js router-cache documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes).

2. **Progress reloads more than the selection needs.** Changing an exercise series or body-map
   week changes the route and re-reads training, schedule, body volume and body weights, then
   rebuilds analytics. That combined path measured 529 ms and 11 statements. Separating the
   series/week reads would avoid unrelated work. Local metric/section switches already use
   client state. The existing aggregate body-map query is beneficial and was retained.

3. **Set saves still refresh the full workout on the server.** Returning only the saved set
   could reduce save latency further, but the workout overview, progress, completion state and
   restored drafts must then share authoritative client state. Simply removing that refresh
   would leave those views stale. Locks, conflict detection, retry identity and draft behavior
   were preserved; this change only removes confirmed duplicate client refreshes.

4. **Production auth/cold-start latency remains unmeasured.** `SUPABASE_JWKS` is absent locally;
   a cold verifier may need a signing-key fetch. Its presence in production was not verified.
   The repository requests Vercel `bom1`, and the configured database endpoint is in Mumbai;
   this does not prove the actual function region, instance warmth or phone network timing.
   A signed-in browser waterfall and deployed request timings are needed before attributing
   remaining seconds to those factors. The local browser is still at sign-in.

5. **Background and growth concerns.** The nightly due-user scan processes accounts sequentially
   and caps the list at 500. The service worker keeps content-hashed assets in a cache with a
   permanent name, so old builds can accumulate; `/icons/` paths also are not content-hashed.
   These are scaling/cache-maintenance concerns, not measured causes of the reported tab delay.
   No data-retention or nightly scheduling policy was changed.

The old performance decision incorrectly equated `Promise.all` with one database round trip.
A plain `SELECT 1` measured 25 ms; three parameterized selects in one RLS transaction measured
256 ms. The installed driver describes unprepared parameterized queries before binding them.
Reducing statements matters; rearranging awaits alone does not remove that network cost.
[Decision 0012](decisions/0012-latency-round-trips-and-caches.md) now records the correction.

## Navigation verification and limits

- At a requested 393 × 852 viewport, the frame measured 852 px high and the navigation stayed
  4 px above the bottom both at scroll position zero and after scrolling, with 16 px gutters
  on both sides of the content viewport.
- At 320 × 568, navigation remained 64 px tall with a 4 px gap, 16 px side gutters, no clipped
  tab labels and no horizontal overflow.
- At 1280 × 900, navigation remained the existing 192 px desktop rail.
- The bottom-gap formula yields 22 px on a device reporting a 34 px bottom safe-area inset,
  12 px less than before. That is a CSS calculation, not a physical-device measurement.
- The browser fixture reported no console errors or warnings during these checks. It uses the
  real components and synthetic data; it does not reproduce iOS safe areas or installed-app
  cold launches.

WebKit has documented fixed-position and installed-app viewport regressions, but those reports
do not identify which one affects these screenshots. The iOS version and whether this opens
from the Home Screen or Safari remain unanswered. See
[WebKit's fixed-position report](https://bugs.webkit.org/show_bug.cgi?id=301172) and
[Safari 26.1 viewport fixes](https://webkit.org/blog/17541/webkit-features-for-safari-26-1/).
The earlier screenshot-based diagnosis in
[decision 0022](decisions/0022-a-status-bar-at-the-bottom-of-the-screen.md) is now qualified.

## Checks

- 395 tests passed across 56 files, including actual PostgreSQL migrations/RLS in PGlite,
  projection equivalence, cache invalidation/concurrency, coach lifecycle, session behavior
  and browser polling.
- TypeScript and production build passed.
- ESLint passed for the project, excluding scratch `output/` artifacts.
- Changed source files pass Prettier. A repository-wide formatting check still reports
  existing formatting/line-ending differences and scratch artifacts; they were not broadly
  reformatted as part of this performance change.
- These checks ran locally before the requested merge to `main`. No schema migration was
  performed. Real iPhone launch verification and authenticated end-to-end navigation timing
  remain outstanding.
