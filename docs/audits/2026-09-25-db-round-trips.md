# Database round trips per screen — 25 September 2026

A review of every screen's data loading: how many screens there are, how many database round
trips each one makes, where they come from, and what it would take to cut them. No application
code was changed. The one addition is a measurement script,
[`scripts/dev/audit-db-screens.mjs`](../../scripts/dev/audit-db-screens.mjs)
(`npm run audit:db-screens`). It produced every "measured" number below, and it can be run
again after each change to show what the change bought.

## Summary

- **77 route files; 67 real screens.** 54 are in the tab shell, 9 in onboarding and 4 in sign-in.
  Of the rest, 5 are redirect-only aliases (`/`, `/runs`, `/runs/new`, `/runs/[id]`,
  `/runs/[id]/edit`) and 5 are development-only previews.
- **A tap costs 4 to 23 sequential round trips.** Postgres spends well under a millisecond per
  statement (ADR 0030); the time is spent waiting on the network.
  - The heaviest screens:

    | Screen              | Round trips |
    | ------------------- | ----------: |
    | Programme (Profile) |          23 |
    | Exercise detail     |          19 |
    | AI coach            |          16 |
    | Today               |          16 |
    | Workout             |       11–15 |
    | Progress            |          14 |

  - A typical detail screen costs 5.
- **Round trips per screen have three sources, all fixable:**
  1. **Fixed cost per transaction.** Each transaction pays 3 round trips before and after its
     own queries (4 for a write). Most screens are one transaction with 1–2 statements, so 60–80%
     of their round trips are this setup and teardown.
  2. **Independent statements are not merged.** Inside a transaction, `Promise.all` does not run
     queries at the same time; they still go one after another (`serializeQueries`,
     `src/db/client.ts:78`). Every independent `select` is one more round trip.
  3. **Screens take a write lock just to read.**
     - 18 screens load in a write transaction although they write nothing. Each pays one extra
       round trip for the athlete lock (`select … for update` on `profiles`).
     - Worse, the lock queues them behind any write in progress for the same athlete: a set being
       saved, or a coach callback.
     - Today and three coach screens also _write_ during a page load: they tidy up expired coach
       requests and jobs.
- **The realistic end state is 1–4 round trips on most screens and 4–8 on the heaviest,** with
  the screens looking exactly as they do now. Three kinds of change get there:
  1. Mechanical fixes with no change to any data shape.
  2. Merging each screen's statements into one or two statements that return JSON (the pattern
     `getSchedule` already uses).
  3. Changing `withUser` so the transaction setup shares a round trip with the work.
- **Production answer (25 September, `PERF_LOG=1`): the database is not the main source of
  latency.** One round trip from the Vercel function to Supabase takes about **2 ms**, so a
  whole screen's database work is 10–50 ms. The delays the logs do show are elsewhere:
  - a cold start of about 1.7 s;
  - an 805 ms session refresh;
  - bursts of up to about 90 prefetch requests at once, competing with the real tap.

  See [Production measurement](#production-measurement-25-september) and the revised
  [Suggested order](#suggested-order). Tier C is dropped, and tier B shrinks to the few changes
  that also cut database CPU or payload.

## How this was measured

- **Stack.** The repository's own audit stack: Postgres 16, the seeded audit database, the local
  auth stand-in and a production build (`npm run audit:*`).
- **Proxy.** It sits between the app and Postgres and logs every statement the app sends, with
  the connection it came on.
- **Browser.** A headless browser signs in as the seeded Vinit (29 workouts, 56 activities,
  active programme, AI coach on, `COACH_WORKFLOW_ENABLED=true`). It opens each screen by
  client-side navigation, the way a tap does.
  - It starts each screen from a screen that is not in the list, so a tab's one-minute browser
    copy never answers for it.
  - Prefetch requests are refused, so only the navigation itself is counted.
- **Cache state.** The profile cache is warm; a miss adds one read-only transaction (4 round
  trips), shown where it matters.
- **Counting.** node-postgres sends each statement and its values in one exchange, so **for
  this app, statements = round trips**. The counts include `BEGIN`, the claims statement, the
  athlete lock and `COMMIT`.
- **Critical path.** "Critical path" is the number of round trips that happen one after another.
  Two transactions that run at the same time on different connections count once, as the
  longer of the two.
- **Cross-checks.**
  - Every measured count was matched against a line-by-line trace of that screen's code, down to
    each Drizzle query. The two agree; where one statement differs, it is a reference cache
    expiring (warm-up protocols, shared exercises, equipment types: +1 statement inside the
    screen's transaction, once per 10 minutes per server instance).
  - Wall-clock times from this machine are not reported: with the database on the same machine
    they measure nothing useful.

## Where the round trips come from

### Cost model

| Piece                                  |                                                              Round trips | Where                                             |
| -------------------------------------- | -----------------------------------------------------------------------: | ------------------------------------------------- |
| Read-only transaction, fixed           |                                            3 (`BEGIN`, claims, `COMMIT`) | `src/db/with-user.ts:57`                          |
| Write transaction, fixed               |                          4 (adds `select id from profiles … for update`) | `with-user.ts:89-91`                              |
| Each statement inside a transaction    |                                             1, even inside `Promise.all` | `src/db/client.ts:78-92`                          |
| Separate transactions started together |                                          Overlap (pool of 5 connections) | `client.ts:121`                                   |
| Profile read on a cache miss           |                   +1 read-only transaction, usually on the critical path | `src/server/queries/request-profile.ts:133`       |
| Shell on a full page load              |                +1 read-only transaction (open-session read), in parallel | `src/components/shell/session-status.tsx:137-141` |
| Session check in the proxy             | 0 when `SUPABASE_JWKS` is set and the token is not within 90 s of expiry | `src/proxy.ts:69`                                 |

### What runs on every screen

- **Client-side navigation inside the tab shell.**
  - The `(app)` layout is shared, so it is not rendered again. Only the page's own reads run.
  - The proxy verifies the session locally: no network call when `SUPABASE_JWKS` is set, which
    ADR 0012 asks for. It refreshes the token through Supabase Auth only when the token is within
    90 seconds of expiring.
- **Full page load, `router.refresh()`, or a server action that refreshes or revalidates.** The
  layout renders again, and two more things happen:
  - **Account gate.** The profile read: 0 round trips on a cache hit, 4 on a miss.
  - **Resume strip.** `SessionStatus` reads the open workout: 4 round trips.
    - It waits for the gate before it starts (`session-status.tsx:137`). On a profile miss the two
      run one after the other: 8 round trips.
- **Page and gate run concurrently.** The page renders at the same time as the gate, not behind
  it: Next renders the page's element separately from the layout's `children`. So a page's own
  profile read and the gate's share one load.
  - This holds even though the pages call `getRequestProfile(id, email)` while the gate calls
    `getRequestProfile(id, email, displayName)`. React's `cache` keys on the number of arguments,
    so these are two entries. Only the process cache's in-flight sharing (`profile-cache.ts:51`)
    stops a second database read.
- **Measured: full load vs. tap.** A full load adds exactly that one transaction. History went from
  8 statements on a tap to 12 on a full load, Progress from 14 to 18, and Profile from 5 to 9.

### Patterns that add round trips

1. **Write transactions for reads.** These page loads use `withUser` without `readOnly` although
   they write nothing (measured: the lock appears in their SQL):
   - Today choose
   - Every gym screen that reads (7)
   - `/exercises` and exercise detail
   - Add exercise, check-in, substitute and finish
   - Profile → Coach
   - `/welcome`, `/welcome/equipment` and `/welcome/programme` (whose write is a second read of
     the same profile, `ensureProfile`)

   Today, AI coach, Programme (via `SavedProgrammeWork`) and the job page do write, but only to
   mark expired coach requests or jobs as failed or queued. The job page re-runs that write on
   every 5-second poll.

2. **Waterfalls from nested server components.** `SavedProgrammeWork` (Programme and
   `/welcome/programme`) and `CoachingActivity` (AI coach) start their own transaction only
   after the page's transaction has finished.
   - Measured: Programme runs its 23 statements on one connection, one after another; AI coach
     runs its 16 the same way.
3. **The profile is awaited before the page's transaction.**
   - Ten screens do this: Today, Today choose, Training, new activity, programme, occurrence,
     schedule, scheduled, activity view and activity edit.
   - The workout screen does it too, and it is re-rendered minutes apart, so it often misses the
     60-second profile cache. That puts 4 round trips in series before its own 11–15.
   - Onboarding is worse. A profile that has not finished onboarding is never cached, so every
     onboarding page pays that transaction first.
4. **Dependent chains that could be one statement.**
   - `getActivity`: the row, then the sport's detail row.
   - `readProgramBlueprint`: 5 statements, one after another. Programme runs it once for every
     change draft: +5 round trips per draft, up to 10 drafts.
   - `readWorkouts`: sessions, then their exercises and sets.
   - `exerciseAvailability` / `gymAvailability`: 4–7 independent statements, all keyed by the
     same user and gym.
   - `getSessionDetail`: three stages.
5. **Reads whose results are never shown** (verified in the page code):
   - Progress reads daily recovery twice, and the copy fed into `analytics.recovery` is never
     rendered.
   - Progress's overall activity totals are unused.
   - A finished workout still runs the 3–4 machine-decision queries, which only an open workout
     displays. The measured SQL shows them.
   - The fallback picker loads the exercise's equipment options and programme usage and renders
     only its name.
   - Social screens read "me" from the directory view to get fields the cached profile already
     has.
   - Programme reads the drafts list twice (once in each transaction).
6. **Whole rows and whole lists for a count or a label.**
   - Training fetches every activity template, and every standalone occurrence ever scheduled,
     to show three numbers.
   - `/exercises` and the fallback picker send about 276 exercises × 22 fields to the browser.
   - Other examples: `listGyms` with an equipment count per gym where a name is shown;
     `select *` on `session_plans`, on `coach_jobs` (including the coach's full output) and on
     `coach_change_records` (including a whole programme blueprint per record).
7. **One update per row.** `reconcileCoachJobs` updates each expired job in a loop
   (`coaching-jobs.ts:195-227`). The onboarding sports step saves four preferences with four
   upserts.

## Screen by screen

- **Columns.**
  - "Measured" is statements from the audit run (= round trips; transactions in brackets).
  - "Critical" is round trips on the critical path.
  - "Target" is the same screen after tiers A and B below, still using today's `withUser`.
  - Tier C (transport) then removes 2 more from every read-only transaction: a target of 4
    becomes 2, and a single-statement screen can become 1.
- **Which state.** Numbers are for Vinit's data with the profile cache warm. Where a screen's
  cost depends on state, the state is named.

### Tabs and the workout

| Screen                        |  Measured |                   Critical | Lock | Main causes                                                                                                                                                                                                                               | Target |
| ----------------------------- | --------: | -------------------------: | :--: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| `/today` (coach on, workflow) |    20 (2) |                         16 | yes  | Write transaction for coach tidy-up; schedule, gyms, day exercises, occurrences, coach intent/day/jobs/plan/requests as separate statements; the legacy coach reads run as well and their result is discarded (`coaching-today.ts:51-64`) |      4 |
| `/today` (coach off)          |         — |                          9 | yes  | Same, without the coach part                                                                                                                                                                                                              |      4 |
| `/training`                   |    10 (2) |                          6 |      | Templates and every standalone occurrence fetched to show counts                                                                                                                                                                          |      4 |
| `/history`                    |     8 (1) |                          8 |      | Two separate `activities` reads over the same window; full gym rows for names                                                                                                                                                             |      6 |
| `/progress`                   |    14 (1) |                         14 |      | Unused recovery read; duplicate session read in recovery history; unused overall totals; body-map volume recounted; `?series=` changes no database work (all series built every time)                                                     |      8 |
| `/profile`                    |     5 (1) |                          5 |      | Two count statements; finds "me" by cached username                                                                                                                                                                                       |      4 |
| `/workouts/[id]` open         | 11–12 (1) | 11–12 (+4 on profile miss) |      | Header, slots, sets, plan, coaching changes, histories, ladders (2), decisions (3–4) as separate statements; profile awaited first                                                                                                        |    6–7 |
| `/workouts/[id]` finished     |    15 (1) |                         15 |      | As above, plus decisions that are never displayed, plus two statements for records                                                                                                                                                        |      7 |
| `…/add-exercise`              |   8–9 (1) |                          8 | yes  | Write transaction; session read, then three picker reads                                                                                                                                                                                  |      6 |
| `…/check-in`                  |     5 (1) |                          5 | yes  | Write transaction for one read                                                                                                                                                                                                            |      4 |
| `…/exercises/[id]/substitute` |    13 (1) |                         13 | yes  | Reads the whole workout, including the profile and ladders, to get one exercise's name                                                                                                                                                    |      6 |
| `…/finish`                    |    10 (1) |                         10 | yes  | Whole workout reader, including a profile read the page already has and ladders it does not show                                                                                                                                          |      4 |
| Set saved (`logSetAction`)    |         7 |                          7 | yes  | Session lock, then identity read, then upsert; the first two can be one statement under the athlete lock                                                                                                                                  |      6 |

### Training

| Screen                                      | Measured | Critical | Lock | Main causes                                                                 | Target |
| ------------------------------------------- | -------: | -------: | :--: | --------------------------------------------------------------------------- | -----: |
| `/today/choose`                             |    8 (1) |        8 | yes  | Write transaction; day exercises read twice; full gym list for one id       |      4 |
| `/training/new?sport=`                      |    4 (1) |        4 |      | —                                                                           |      4 |
| `/training/new?occurrence=`                 |    8 (2) |        8 |      | Two transactions one after the other                                        |      4 |
| `/training/programme`                       |    5 (1) |        5 |      | The whole schedule JSON for a name and family id                            |      4 |
| `/training/programme/occurrences/[id]`      |    5 (1) |        5 |      | Two independent statements; whole coach plan row for one entry              |      4 |
| `/training/schedule`, `/training/scheduled` |    4 (1) |        4 |      | Minimal; `scheduled` grows without bound (every standalone occurrence ever) |      4 |
| `/training/templates`                       |    5 (1) |        5 |      | Routines with whole blueprints to show a name and a count                   |      4 |
| `/training/templates/new`                   |        0 |        0 |      | —                                                                           |      0 |
| `/training/templates/[id]/edit`             |    4 (1) |        4 |      | —                                                                           |      4 |
| `/training/activities/[id]` (and `/edit`)   |    5 (1) |        5 |      | Activity row, then detail row                                               |      4 |

### Gyms and exercises

| Screen                                         | Measured | Critical | Lock | Main causes                                                                                                                                                                                     | Target |
| ---------------------------------------------- | -------: | -------: | :--: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| `/gyms`                                        |    5 (1) |        5 | yes  | Write transaction                                                                                                                                                                               |      4 |
| `/gyms/new`                                    |        0 |        0 |      | —                                                                                                                                                                                               |      0 |
| `/gyms/[id]`                                   |   11 (1) |       11 | yes  | Write transaction; availability as 4 statements after 3                                                                                                                                         |      5 |
| `/gyms/[id]/edit`                              |    5 (1) |        5 | yes  | Write transaction                                                                                                                                                                               |      4 |
| `/gyms/[id]/equipment/new`, `…/equipment/[id]` |    5 (1) |        5 | yes  | Write transaction; profile awaited first                                                                                                                                                        |      4 |
| `/gyms/[id]/programme`                         |   11 (1) |       11 | yes  | Write transaction; 7 independent availability statements                                                                                                                                        |      5 |
| `/gyms/[id]/programme/[exerciseId]/fallback`   |   11 (1) |       11 | yes  | Write transaction; three unused reads (options, usage, gym machine list)                                                                                                                        |      5 |
| `/exercises`                                   |    5 (1) |        5 | yes  | Write transaction; ~276 × 22-field rows to the browser                                                                                                                                          |      4 |
| `/exercises/new`                               |    4 (1) |        4 |      | —                                                                                                                                                                                               |      4 |
| `/exercises/[id]` (comparable)                 |   19 (1) |       19 | yes  | Write transaction; every exercise and set of every session containing the exercise read for one series; recent and chart read separately; circle, bests and availability as separate statements |    6–7 |

### Profile, friends and people

| Screen                                                           | Measured |                     Critical | Lock | Main causes                                                                                                                                        | Target |
| ---------------------------------------------------------------- | -------: | ---------------------------: | :--: | -------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| `/profile/edit`, `/password`, `/delete-account`, `/friends/find` |        0 |                            0 |      | —                                                                                                                                                  |      0 |
| `/profile/privacy`, `/profile/sports`, `/friends/compare`        |    4 (1) |                            4 |      | —                                                                                                                                                  |      4 |
| `/profile/routines`                                              |    6 (1) |                            6 |      | Whole exercise library read to name routine entries                                                                                                |      4 |
| `/profile/coach`                                                 |    5 (1) |                            5 | yes  | Write transaction for one read                                                                                                                     |      4 |
| `/profile/ai-coach`                                              |   16 (2) | 16 (more with a filled memo) | yes  | Write transactions; memo evidence reads one per prefix; pending and training notes never shown; jobs read in a second transaction after the page's |     ~9 |
| `/profile/friends`                                               |    6 (1) |                            6 |      | Following list read only to get ids                                                                                                                |      5 |
| `/profile/friends/people`                                        |    6 (1) |                            6 |      | Three list statements; follower counts computed per person and not shown                                                                           |      4 |
| `/profile/friends/leaderboard`                                   |  6–8 (1) |                          6–8 |      | "Me" read again; bests reduced in JavaScript from every session row                                                                                |    5–6 |
| `/profile/programme` (no change drafts)                          |   23 (2) |                           23 | yes  | Write transactions; drafts read twice; second transaction waits for the first; **+5 per change draft** (`readProgramBlueprint` per draft)          |    ~12 |
| `/profile/programme/create`                                      |    7 (1) |                            7 |      | Four independent statements                                                                                                                        |      5 |
| `/profile/programme/manual`                                      |    5 (1) |                            5 |      | Whole exercise and warm-up rows to the browser                                                                                                     |      5 |
| `/profile/programme/drafts/[id]` (a change)                      |   13 (1) |                           13 |      | 5-statement blueprint chain                                                                                                                        |      9 |
| `/profile/programme/jobs/[id]`                                   |    7 (1) |            7, **every poll** | yes  | Write transaction on every 5 s poll; each poll also re-renders the shell                                                                           |      4 |
| `/u/[username]` (workout, visible)                               |    9 (1) |                            9 |      | Person, then relation and visibility, then totals and muscles from the same table                                                                  |      6 |
| `/u/[username]/compare`                                          |   11 (1) |                           11 |      | Two person reads; the muscle-set reads wait for the totals, which they don't depend on                                                             |      6 |
| `/u/[username]/compare/[exerciseId]`                             |   13 (1) |                           13 |      | "Me" read twice; exercise read from the database though it is in the reference cache                                                               |      9 |
| `/u/[username]/activities/[id]`                                  |    6 (1) |                            6 |      | Three dependent statements                                                                                                                         |      4 |

### Onboarding, sign-in and aliases

These screens are traced from code. The audit's seeded accounts have all finished onboarding.
Every onboarding page first pays an uncached profile transaction (4 round trips): a profile that
has not finished onboarding is never cached, by design (`profile-cache.ts:38`).

| Screen                                                               |                  Critical now | Main causes                                                                   |                          Target |
| -------------------------------------------------------------------- | ----------------------------: | ----------------------------------------------------------------------------- | ------------------------------: |
| `/welcome`                                                           |                             5 | `ensureProfile` in a write transaction instead of the cached read             |                               4 |
| `/welcome/sports`                                                    |                             4 | —                                                                             |                               4 |
| `/welcome/gym`                                                       |                             8 | Profile read (result unused), then gyms, one after the other                  |                               4 |
| `/welcome/equipment`                                                 |                          9–10 | Profile, then a write transaction for reads                                   |                             4–5 |
| `/welcome/programme`                                                 |                           ~17 | Profile, then a second profile read under the lock, then `SavedProgrammeWork` |                              ~4 |
| `/welcome/programme/create`, `/manual`, `/drafts/[id]`, `/jobs/[id]` |     Profile page's figure + 4 | Same components as the Profile versions, behind the profile read              |           Profile page's figure |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`           |                             0 | No database; session verified locally                                         |                               0 |
| `/`, `/runs`, `/runs/new`                                            | 0, plus a second full request | Redirect pages; on a full load the shell renders twice                        |     Config redirects: no render |
| `/runs/[id]`, `/runs/[id]/edit`                                      | 5, plus a second full request | Two dependent statements, then a redirect after the shell has streamed        | Route handler, one statement: 4 |

## Optimisations

Grouped by how intrusive they are. Each item says what changes, where, what happens to the data
shapes, and the risk. Tier A needs no change to any data shape.

### Tier A — non-intrusive fixes

**A1. Read-only transactions for every pure read.** −1 round trip, and no lock queueing.

- **Change.** Pass `{ readOnly: true }` on the 18 screens listed under
  [pattern 1](#patterns-that-add-round-trips). Their call graphs contain no writes.
- **Data shapes.** None.
- **Risk.** None. A write inside a read-only transaction is refused by Postgres, so a mistake
  fails loudly.
- **Also.** Removes lock contention. Today, a gym page opened while a set is saving waits for the
  save.

**A2. Stop writing during page loads.** ⚠ Needs a decision. This makes Today, AI coach,
Programme and the job page read-only.

- **Change.**
  - Stop running `reconcileExpiredCoachRequests` (`coach-plans.ts:1996`) and `reconcileCoachJobs`
    (`coaching-jobs.ts:195`) from renders.
  - Instead, compute the displayed status at read time: a `requested` request past its timeout is
    shown as failed; a `claimed` job past its lease is shown as queued or failed, by the same rule
    the update applies.
  - Keep the actual update on the paths that already call it: claim (`coaching-jobs.ts:230`), the
    dispatcher, and actions (`:430`, `:1187`). Add it to the nightly job if rows must be tidied
    even when nobody claims.
  - Separately, replace the per-row loop with one
    `update … set status = case when attempts < attempt_budget …` statement.
- **Data shapes.** None to the screens; the view models get a derived status.
- **Risk.**
  - Any other reader that assumes the rows are already tidy must apply the same rule. The claim
    and dispatch paths already tidy first.
  - Today's legacy-coach reads in workflow mode (whose result `todayWorkflowState` overwrites)
    can be dropped at the same time.

**A3. Don't wait for the profile before starting the page's transaction.**

- **Change.** `const [profile, data] = await Promise.all([getRequestProfile(…), withUser(…)])`
  on the ten screens under [pattern 3](#patterns-that-add-round-trips), plus the equipment pages.
  - Only Today needs the profile inside SQL. It can join the three columns it needs, or keep the
    await for the time zone only.
  - On the workout screen, join `rest_timer_enabled`, `time_zone` and `preferred_unit` into the
    header statement.
- **Also: one signature for `getRequestProfile`.** Use a single zero-argument cached
  `getCurrentProfile()` built on `getSessionUser()`, so React's `cache` dedupes it everywhere
  (today it is split by argument count).
- **Data shapes.** None.
- **Saves.** Up to 4 round trips on every profile-cache miss, which on the workout screen is
  most renders.

**A4. Break the component waterfalls.**

- **Change.**
  - Read `SavedProgrammeWork`'s and `CoachingActivity`'s data inside the page's transaction and
    pass it down as props. Alternatively, start their promise before the page's `await` and pass
    it down (`use()`).
  - Programme reads drafts once (limit 20) for both views.
  - `SessionStatus` should start the open-session read in parallel with the account gate, not
    after it.
- **Data shapes.** `SavedProgrammeWork` and `CoachingActivity` gain props.
- **Saves.** 3–4 round trips on Programme and AI coach; 4 on a full load with a profile miss.

**A5. Remove reads whose results are not shown** (list under
[pattern 5](#patterns-that-add-round-trips)).

- **Progress.**
  - Drop `readRecovery` from `readTrainingData`.
  - Give `readActivityTotals` a per-sport-only mode, or use `GROUPING SETS`.
  - Derive the body-map week from `analytics.weeks` when it lies inside the range.
  - Together: −3.
- **Workout.**
  - Skip machine decisions when the session is finished (`sessions.ts:534-542`): −3 to −4.
  - Build record exercise names from the detail already loaded: −1.
- **Fallback picker.** Take the exercise from the list it already loads; drop the
  equipment-list read: −3.
- **Social screens.**
  - Build "me" from the cached profile instead of `getDirectoryProfile`.
  - Look people up by id rather than cached username (a changed username currently shows zero
    counts or a 404 for up to a minute).
- **Programme.** Memoise `readProgramBlueprint` by programme id within the request: every change
  draft usually shares one base.
- **Data shapes.** None.

**A6. Indexes and one RLS policy** (from the schema review; confirm with `EXPLAIN` on
production's Postgres version before applying).

- **Add** `workout_sessions (user_id, started_at desc) where completed_at is null`. The open-session
  read runs on every full load and every Today and Training visit. With no open session it
  currently walks all of the athlete's sessions.
- **Add** `session_plans (user_id, program_id, cycle_index, day_index)`.
- **Add** `shared_session_stats (user_id, started_at desc, id desc)` for the friends feed.
- **Add** `activities (user_id, occurred_on)` if production runs Postgres ≤ 17, which cannot skip-scan the
  existing `(user_id, sport, occurred_on)` index for the all-sports totals.
- **Rewrite the RLS policy on the three shared-stats tables.** They call
  `can_view_training(user_id)`, a `security definer` function Postgres cannot inline, once per row
  scanned. Rewritten as `user_id = (select auth.uid()) or user_id in (select
public.training_visible_owners())`, a 4,000-row scan in PGlite went from 57 ms to 2.3 ms. The
  semantics are unchanged.
  - This is database CPU that grows with friends × history, not round trips.
- **Optional drops** (write cost only): `body_weight_logs_user_date_idx` and `gyms_user_idx`,
  which duplicate other indexes.

**A7. Navigation plumbing.**

- **Loading screens for Training.**
  - Add `loading.tsx` to the `training/*` subtree. It is the only part of the tab shell without
    one.
  - Without it, links into Training prefetch only route state, and a tap waits with no instant
    skeleton.
- **Config redirects.**
  - `/runs`, `/runs/new` without `?planned`, and `/` should become redirects in
    `next.config.ts`: no render at all.
  - `/runs/[id]` and `/runs/[id]/edit` should become route handlers doing one statement.
  - Remove the dead `/runs` entries from `revalidatePath` lists.
- **Polling.**
  - The job page and the coach actions poll with `router.refresh()`. That re-renders the whole
    shell and throws away every prefetched screen, every tick.
  - Poll a small server action returning `{ status, updatedAt }` instead, and call
    `refreshScreenAction` only when it changes.

### Tier B — fewer statements per screen (repository changes; screen data shapes mostly unchanged)

The pattern already exists in `getSchedule` (`schedule.ts:93-152`), `readHistoryWorkouts`
(`history.ts:23-62`) and `comparable.ts`: one statement whose select list holds correlated
`coalesce((select json_agg(json_build_object(…) order by …) …), '[]')` subqueries.

- **RLS.** Row-level security applies inside every subquery exactly as it does to a separate
  statement.
- **Type rules.** JSON returns timestamps as strings and numerics as numbers, so each merged
  reader needs a small parse step to keep today's types. `Date` fields must stay `Date`s.
  - Sets in particular must keep `sessionSetColumns`' keys and types, or the set-change overlay
    and the `expectedCompletedAt` conflict check (`sessions.ts:865-883`) break.

| Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Screens                                             |  Round trips saved | Shape change                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -----------------: | ----------------------------------------------------------------------------- |
| **B1. Today snapshot**: one read-only statement with active gyms (narrow), the programme with days (plus `recommendedGymId`), every lifting day's exercises, slot events, every family occurrence with its current version and activity, today's standalone occurrences, the slot's coach plan, and today's jobs and requests. The existing TypeScript (`getTodayPlan`, `suggestion()`, `todayCoachState`) runs on that data unchanged; the cycle is a few KB, so fetching all of it removes the "decide the slot, then fetch the slot" dependency. Needs A2. | Today                                               |             16 → 4 | Internal. `Schedule.days[]` gains `recommendedGymId`; gyms become `GymChoice` |
| **B2. `getSchedule` variants**: plus per-day exercises (Choose), or programme identity and occurrences only (Training → Programme)                                                                                                                                                                                                                                                                                                                                                                                                                            | Choose, Programme                                   |               4, 1 | Internal                                                                      |
| **B3. `trainingSummary`**: template count and outstanding upcoming/earlier counts in SQL, plus preferred sports                                                                                                                                                                                                                                                                                                                                                                                                                                               | Training                                            |        2 + payload | `{ templateCount, upcoming, earlier, preferred }`                             |
| **B4. `getActivity` as one statement** (left join the three detail tables)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Activity view and edit                              |             1 each | None                                                                          |
| **B5. `gymAvailability` / `exerciseAvailability` / `decisionContext` as one statement each** (a CTE for the active programme's slots)                                                                                                                                                                                                                                                                                                                                                                                                                         | Gym detail, gym programme, exercise detail, workout |                4–6 | None                                                                          |
| **B6. Exercise detail series**: one `union all` for recent performances and the chart window of _this exercise only_, instead of every exercise and set of every session containing it                                                                                                                                                                                                                                                                                                                                                                        | Exercise detail                                     | 3 + ~6× fewer rows | `performanceSeries` takes performances                                        |
| **B7. `getSessionDetail` in two statements**: header with the plan, coaching changes, profile columns and records folded in; then slots with sets nested, histories and ladders                                                                                                                                                                                                                                                                                                                                                                               | Workout (and every exercise-level refresh)          |                4–6 | None                                                                          |
| **B8. Narrow readers**: `getSlotForSubstitute`, `readFinishSummary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Substitute, finish                                  |               7, 6 | New small DTOs; update `set-change-pages.test.ts`                             |
| **B9. `readProgramBlueprint` as one statement**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Programme, drafts                                   |         4 per call | None                                                                          |
| **B10. Social**: `getPersonView` (person, relation and `can_view_training` in one), totals and muscle sets grouped by user, `loadCircle` as one statement                                                                                                                                                                                                                                                                                                                                                                                                     | `/u/*`, leaderboard                                 |           3–4 each | None                                                                          |
| **B11. Progress workouts**: slots with sets nested, only the columns the analytics use                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Progress                                            |      1–2 + payload | Internal                                                                      |
| **B12. Small merges**: profile follow counts; history's two activities reads (`union all`); occurrence plus plan preparation; new-activity occurrence plus units; templates plus routine summaries; `logSet`'s lock and identity read; the lock-then-read pair repeated in five workout mutations                                                                                                                                                                                                                                                             | Several                                             |             1 each | None                                                                          |

### Tier C — the transaction itself (`withUser`, `db/client.ts`)

These apply to every transaction in the app at once. The two claims they rest on were checked on
Postgres 16 through `pg` during this review:

- A message holding several statements runs them as one implicit transaction. Settings made with
  `set_config(…, true)` apply to the statements after them and are gone for the next message.
  Row-level security applied: 19 of Vinit's rows, not all 30.
- Switching the role _inside the same statement_ as the query applies no row-level security
  (all 30 rows across 4 users came back). **That variant must never be used.**

**C1. `BEGIN` and claims in one message.** −1 round trip per transaction (−2 for writes, with the
lock in the same message).

- **Change.** Send `begin; select set_config(…); [select … for update]` as one simple-protocol
  message.
  - Drizzle's `NodePgSession.transaction` sends its own `BEGIN`, so `releaseEveryTransaction`
    (`client.ts:182-212`) would construct Drizzle's exported `NodePgTransaction` directly.
  - Simple-protocol messages take no bind parameters. The user id (a validated UUID) and the
    claims JSON would be inlined with `escapeLiteral`.
  - The retry-on-dead-connection rule in `withUser` keeps working: the first message still fails
    before any user work.
- **Data shapes.** None.
- **Risk.** Moderate. It must be tested through Supabase's transaction pooler (Supavisor), not only
  local Postgres, including that claims never leak to the next transaction on the same server
  connection.

**C2. Don't wait for `COMMIT` on read-only transactions.**

- **Change.** Return the result, then commit and release in the background. A read-only commit has
  nothing to fail on.
- **Saves.** −1 round trip on every read.
- **Cost.** The connection stays checked out one round trip longer. The pool has 5 connections.

**C3. One message for a one-statement screen.**

- **Change.** After tier B, many screens are a single statement. Sent together with the claims
  (and `transaction_read_only`) as one implicit-transaction message, the whole screen is **1
  round trip**, with no `BEGIN` or `COMMIT`.
  - Under `read committed` the explicit transaction added no consistency for one statement.
- **Cost.**
  - Values must be inlined (`sql.inlineParams()`).
  - Results skip Drizzle's per-column parsing, so the reader parses its own JSON (tier B's
    readers already do).
- **Recommendation.** Worth it for the hottest screens (Today, Training, History, Profile) once
  tier B is in.

**Not safe, and not recommended:**

- **Setting claims once per connection.** The transaction pooler hands one server connection to
  different requests. A leftover role or claim would serve one athlete's request as another's.
- **Setting the role or claims inside the same statement as the query.** Shown above.

### Tier D — caching and navigation

**D1. Keep the shell's open-session read out of full loads.**

- **Change.** Keep it per instance for a short time, stamped by a `session-changed` cookie written
  on start, finish, discard and delete. This is the same scheme as the profile cache.
- **Saves.** 4 round trips on every full load and every refresh, which during a workout is every
  exercise-level action.
- **Trade-off.** Another device's newly started workout shows up to the TTL late.

**D2. Prime the profile cache on write.**

- **Change.** `profileChanged` currently drops the entry, so the render inside the action's own
  response always misses. Passing the row the action's `update … returning` produced lets that
  render hit.
- **Saves.** 4 round trips after every profile or onboarding step.

**D3. `refresh()` instead of `revalidatePath`.**

- **Why.** There are 85 `revalidatePath` calls, but no route in this app is cached on the server.
  Each call's only effect is to re-render from the root and **throw away every prefetched screen**
  in the browser.
  - After the call, every visible link prefetches again, and several paths in one list do nothing
    more than one would.
- **Change.** `refresh()` re-renders the same way but keeps prefetched screens.
- **Risk.** Low. It is behaviourally equivalent for dynamic pages (Next 16.3.4,
  `next/dist/server/web/spec-extension/revalidate.js`).

**D4. Wider use of `unstable_dynamicStaleTime`.**

- **Today.** Only the five tabs keep their screen for a minute.
- **Candidates.** Detail screens revisited often in a session: gym detail, exercise detail,
  `/u/[username]`, the friends screens.
- **Freshness.** Any action that refreshes or revalidates already clears these copies, so only
  changes made elsewhere can show late.
- **Why it matters.** This is the only change here that removes the 300 ms loading-screen floor
  on a repeat visit.

**D5. Progress re-renders after every set.**

- **Why.** `FreshAfterSets` re-renders Progress once for every set change. So every mid-workout
  visit to Progress shows the loading screen and re-runs its 14 round trips.
  - Nothing on Progress depends on the open workout's sets except the open workout's inclusion in
    `truncated`.
- **Change.** Counting finished workouts only would let Progress drop `FreshAfterSets`. This
  changes what Progress counts, so it is a product decision.

**Not recommended now: Cache Components (`cacheComponents`, `'use cache'`).**

- Its server cache is per instance, not shared across serverless instances unless
  `'use cache: remote'` is used. It would add nothing over the existing profile and reference
  caches.
- It needs `getSessionUser` and `lastProfileChange` reworked.
- It does not by itself remove a single round trip.
- The prerendered shell and per-session App Shell prefetch it offers are worth revisiting after
  tiers A–C.

### Tier E — a read model, only if needed later

- **What.** An owner-private `session_summaries` table: per finished workout, volume, sets,
  muscles and per-exercise bests.
- **How it would be maintained.** Like `shared_session_stats`: written in the finishing
  transaction, with a rebuild function and a versioned backfill in the `data_backfills` ledger.
- **What it buys.** Progress and History could skip set-level reads entirely.
- **When.** Only if their payload or CPU becomes a problem as history grows. Tiers A–C do not
  need it.
- **Why not reuse `shared_session_stats`.** It is a consent projection: cycling and swimming rows
  are deleted when sharing is off, and it has no machine-level series.

## What it adds up to

Written before the production measurement. At the measured 2 ms per round trip, each column
saves only about 2 ms per round trip removed; see [Suggested order](#suggested-order).

Critical-path round trips for the heaviest screens (profile cache warm):

| Screen                |                        Now | After A | After A + B | After A + B + C1 + C2 | With C3 |
| --------------------- | -------------------------: | ------: | ----------: | --------------------: | ------: |
| Today (coach on)      |                         16 |     ~12 |           4 |                     2 |       1 |
| Workout, open         | 11–12 (+4 on profile miss) |      11 |         6–7 |                   4–5 |       — |
| Progress              |                         14 |      11 |           8 |                     6 |       — |
| Exercise detail       |                         19 |      18 |         6–7 |                   4–5 |       — |
| Programme (Profile)   |   23 (+5 per change draft) |     ~15 |         ~12 |                   ~10 |       — |
| Gym detail            |                         11 |      10 |           5 |                     3 |       — |
| History               |                          8 |       8 |           6 |                     4 |     1–2 |
| Training              |                          6 |       6 |           4 |                     2 |       1 |
| Typical detail screen |                          5 |     4–5 |           4 |                     2 |       1 |

"—" means that screen stays more than one statement after tier B, so C3 does not apply to it.

## Production measurement, 25 September

About 45 minutes of use on the production deployment with `PERF_LOG=1`: 338 `[perf]` lines, 21
of them database transactions. The export is partial (a page of the log view), but it is enough
for the numbers below.

**The database round trip is about 2 ms.**

- `setup` (one round trip, almost no work) was 1–3 ms on every warm transaction; the median is
  2 ms. The single 12 ms reading came on a cold instance.
- Transaction totals match that:

  | Transaction         | Statements |     Time |
  | ------------------- | ---------: | -------: |
  | Set saves           |          7 | 12–20 ms |
  | Training            |          4 |     9 ms |
  | Templates           |          5 |    12 ms |
  | History             |          8 |    32 ms |
  | Profile → Programme |         17 | 35–48 ms |
  | Starting a workout  |         13 |    57 ms |

- So the function runs next to the database, and every round trip removed saves about 2 ms. A
  16-round-trip screen spends about 35 ms in the database.
- Tiers B and C would save tens of milliseconds per screen. That is not worth their risk or
  effort.

**What the logs show instead:**

1. **Cold starts: about 1.7 s.**
   - A transaction logged `cold uptime=1771ms`: the process started 1.8 s before its first
     query could run.
   - The first transactions on new instances also spent 32–41 ms opening a database connection.
   - Two instances started within the window.
   - A tap that lands on a cold instance waits longer than every round trip in the app added
     together.
2. **Session refresh: 805 ms.**
   - `proxy /today auth=805ms cookies-changed` is the proxy renewing an expiring access token
     through Supabase Auth, and the tap waits for it.
   - It happens on the first request within 90 s of the token's expiry (one hour by default).
     That makes it most likely when the app is opened after a break, which is also when a cold
     start is likely.
   - Every other session check took 1–2 ms (a few 14–36 ms on new instances), so `SUPABASE_JWKS`
     is doing its job.
3. **Prefetch bursts.**
   - Opening the exercise library produced about 90 `/exercises/[id]` requests within about 1.5 s:
     one prefetch per row as it enters the viewport. The equipment list and History's workout
     list do the same on a smaller scale.
   - Each is a function invocation that runs the proxy and renders a loading shell. They compete
     for the same instance's CPU and its pool of five database connections.
   - The one slow read in the sample, the workout screen at 158 ms for 11 statements (about 14 ms
     each, against 2 ms elsewhere), ran while ten prefetches arrived in the same 100 ms.
4. **Every action throws away the prefetched screens.**
   - After starting a workout (`POST /today`), all five tabs were prefetched again, twice each.
     That is `revalidatePath` evicting the browser's prefetch cache (D3).
5. **Not visible in these logs: React's 300 ms loading floor.**
   - React holds a loading screen for at least 300 ms once it has shown one (ADR 0030).
   - At 2 ms per round trip, this, not the database, is what a first visit to a tab feels like.
   - Only a screen already on the phone skips it: within the tabs' one-minute copy, or fully
     prefetched.

## Suggested order

Revised after the production measurement. Ordered by what a tap will feel.

Steps 1, 2 and 5's read-only changes are done: see
[ADR 0032](../decisions/0032-the-tabs-arrive-before-the-tap.md). Two changes from what is
written below:

- `revalidatePath` stays, because the prefetched tabs now carry data.
- The screen-older-than-a-set refresh now also discards the prefetched tabs.

1. **Stop the prefetch bursts.**
   - Set `prefetch={false}` on long lists: exercise library rows, equipment rows, History's
     workout rows, friends lists. They can prefetch on touch instead, as `LinkRow` already
     renders a link.
   - Change `revalidatePath` to `refresh()` (D3), so an action no longer discards the tabs'
     prefetched loading screens.
   - Mechanical, no product change, and it takes the contention off the tap.
2. **Put the five tabs on the phone before they are tapped.**
   - Give the bottom navigation's links `prefetch={true}` (full prefetch, data included). Set
     `experimental.staleTimes.static` to 60 s, so a prefetched tab is never older than today's
     one-minute copy.
   - A full prefetch runs the page's reads. At 2 ms per round trip that costs 10–50 ms of
     database time per tab, and it removes the loading screen and its 300 ms floor from every
     tab switch.
   - **Prerequisite: A1 and A2.** A prefetch must not take the athlete lock or write, so Today
     must become read-only first.
   - Needs checking on a production build: that full prefetches of dynamic pages are refetched
     when stale, and how many requests they add per screen.
3. **Cold starts.**
   - Check Vercel's **Settings → Functions**:
     - **Fluid Compute** should be on, so one warm instance serves many requests.
     - The function region should be `bom1`. The 2 ms `setup` suggests it is.
   - Keep an instance warm with an external uptime check hitting the site every few minutes.
     Vercel's free plan runs its own scheduled jobs only once a day.
   - Then measure what the server bundle loads at startup. Coach and validation code loaded
     lazily would shorten every cold start.
4. **Session refresh.**
   - Either raise the access-token lifetime in Supabase (**Authentication → Sessions / JWT
     expiry**), or refresh the token in the background before it expires.
   - A longer lifetime means fewer 800 ms waits. The cost: a signed-out or revoked session stays
     usable on the server until its token expires, because sessions are verified locally.
5. **Tier A, as hygiene.**
   - A1 (read-only), A2 (no writes during page loads) and A4 (waterfalls) remove lock queueing
     behind set saves, and are needed for step 2.
   - A5 (unused reads) and A6 (indexes, shared-stats policy) cut database CPU, which grows with
     history.
   - The round trips they save are worth only a few milliseconds each.
6. **Tier B only where it cuts work or payload, not round trips:**
   - exercise detail's over-read (B6)
   - Programme's blueprint N+1 (A5/B9)
   - the exercise library's payload
7. **Dropped: tier C (`withUser` transport) and the rest of tier B.** At 2 ms per round trip
   they would save 2–30 ms per screen, for real risk to the row-level security code.

## Decisions needed

1. **Coach tidy-up during page loads (A2).** Can Today, AI coach, Programme and the job page
   show an expired coach request or job as failed/queued without writing that to the database
   during the render? The write would stay on claim and dispatch. This is a prerequisite for
   step 2.
2. **Full prefetch of the five tabs (step 2).** It adds server and database work: each tab is
   read in the background about once a minute while the app is open. In return, tab switches
   become instant.
3. **Token lifetime (step 4).** Longer tokens mean fewer 800 ms refreshes. The cost is a longer
   window in which a revoked session still works.
4. **Freshness (D1, D4)** and **Progress and the open workout (D5)**, as before.

## Reproducing

```sh
npm run audit:setup   # once: creates, migrates and seeds overload_audit
npm run audit:build
npm run audit:auth    # terminal 1
AUDIT_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:6543/overload_audit \
  npm run audit:start # terminal 2
npm run audit:db-screens   # terminal 3; DB_SCREENS_OUT=out.json keeps every statement
```

- **Workout screens.** Start a workout first to measure the in-workout screens.
- **Chromium.** Where Playwright's own Chromium is not downloaded, point `AUDIT_CHROMIUM_PATH` at
  an installed one.
