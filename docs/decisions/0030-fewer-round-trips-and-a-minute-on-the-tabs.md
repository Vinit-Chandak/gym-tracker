# Fewer round trips, and a minute on the tabs

Switching tabs on the phone took one to one and a half seconds. Before changing anything, the
production build was measured on the local audit stack (`npm run audit:latency`, below): a proxy
between the app and Postgres counted every statement and added a fixed delay to each round
trip, so each screen's cost could be read against the one number production decides, the
round trip between the app and the database.

## What the measurements showed

- **The queries are fast; there are many of them, one after another.** Across every main
  screen Postgres spent under a millisecond per statement on average (parse, plan and
  execute). A screen's server time instead grew with the round trip: Today waited for about 38
  round trips in sequence, Progress and the workout about 31, History 16.
- **Every parameterised statement is two round trips.** With `prepare: false`, which
  Supabase's transaction pooler requires, postgres.js sends a statement's text, waits to be
  told its parameter types, and only then sends the values. Drizzle sends every query through
  `unsafe()`, which turns prepared statements off per query, so `prepare: true` changes
  nothing (tried: the counts did not move). `Promise.all` inside one transaction does not
  overlap them either.
- **Reads queued behind each other on the athlete lock.** Every write transaction locks the
  profile row, and most page reads were write transactions. Today read the open session and
  its own data "in parallel", but the second waited for the first to commit.
- **Every set rebuilt the workout and then threw away every prefetched screen.**
  `revalidatePath` made the browser discard its prefetched loading screens, and on the
  workout screen it then made ten requests after each set to fetch the navigation's five
  again.
- **A tab can never switch faster than about 350 ms.** React holds a loading screen it has
  just shown for at least 300 ms before revealing what replaced it (the reveal throttle in
  react-dom). Profile's data arrived 65 ms after the tap and still appeared at 350 ms. Only
  data already on the phone skips the loading screen.
- **Not the cause:** the client. About 180 KB of compressed script on a cold load, cached by
  the service worker after that, and 60 to 130 ms of rendering per tab switch with the CPU
  slowed four times.

## Decisions

1. **Reads take no lock.** The open-session read on every screen, the workout screen, Progress
   and the profile read are read-only transactions. No select policy uses the server-write
   marker (checked against the live policies), so they see exactly the rows they saw before.
   The profile is read without the lock and only a missing profile, or an empty name the
   sign-in can fill, takes the write path.
2. **Read-only is set in the claims statement.** `withUser` sets `transaction_read_only`
   alongside the claims instead of issuing a separate `SET TRANSACTION`, one round trip fewer
   for every read. Going read-only is allowed at any point, and a write is still refused
   before any policy runs (tested against the real migrations).
3. **Nothing is read twice.** The workout screen passes the profile's time zone to the detail
   read, which stopped reading the profile again on every render and every set. Today hands
   the schedule and gyms it has read to the coach's job target instead of that reading both
   again.
4. **A set is saved without rendering the workout again.** Saving or deleting a set answers
   with the set alone; nothing the browser holds is thrown away. Rendering the whole workout
   was most of every save: the detail read's statements, and the session sent back, dozens of
   times a workout. What the render kept right is kept right this way instead:
   - The browser counts every set change it makes in a cookie, `overload-set-changes`, and
     keeps the changes themselves in memory (`lib/set-changes.ts`). Every render that shows
     the open workout's sets carries the count its request brought, so the browser knows
     exactly which of its own changes a copy already holds.
   - The workout lays the changes its render has not seen over it (`withSetChanges`): the
     list, a reopened exercise and the page brought back by Back all show them. After every
     save and delete the result is tested to equal what a new render would show, unit
     conversions and a stack's learned loads included. Applying a change a render already
     holds changes nothing, so a render that raced a save is still right. The one thing it
     cannot know is a load the render knew only from a set deleted here; that stop stays on
     the stack's ladder until the next render.
   - Today (its count of the open workout's sets, and the coach, who reads whether anything
     was lifted today), Progress (which counts the open workout) and the finish screen are
     rendered again when shown from a copy older than the latest set: once, through
     `refreshScreenAction`, a refresh like the one every set used to make, which drops the
     browser's copies of rendered screens but keeps its prefetched links. That also drops the
     copy of the workout, so going Back to it afterwards fetches it again.
   - Completing, skipping or substituting an exercise, the warm-up and supersets still render
     the workout again, as before.

   On the way, a row being typed into no longer shows "Unsaved draft restored" whenever another
   set of the exercise is saved: drafts are restored into rows that are not already showing
   them.

5. **A minute on the tabs.** The five tabs export `unstable_dynamicStaleTime = 60`: coming back
   to one within a minute shows it at once, with no request, and without the loading screen's
   300 ms. Every other screen is still read on every visit. Any action that revalidates,
   refreshes or changes a cookie clears the browser's copies, and every action that changes
   what a tab shows does one of those, except a saved set, whose screens catch up themselves
   (decision 4); starting a workout from a saved routine did none and now revalidates Today and
   Training. What a minute can hide is a change made elsewhere: on another device, or by the
   coach between visits. Tapping the tab already open no longer forces a reload within that
   minute.
6. **Timing can be switched on in production.** With `PERF_LOG=1`, every transaction logs one
   `[perf] db` line and every session check in the proxy one `[perf] proxy` line. In a `db`
   line, `setup` is the claims statement, one round trip and almost no work, so it is close to
   the app↔database round trip; `begin` includes opening a new connection; `queries` counts
   every statement, `BEGIN` and `COMMIT` included; the first line an instance writes says how
   long ago it started, which separates a cold start from a slow query. A slow
   `proxy` line with `cookies-changed` is a session refresh; one without is a key fetch or,
   on a project still signing with the old shared secret, a call to Supabase Auth.
7. **The app runs on node-postgres** (`db/client.ts`). pg sends a statement and its values
   together, one round trip each, where postgres.js with prepared statements off asked for the
   parameter types first. Statements stay unnamed, so nothing is prepared on a pooled server
   connection. The scripts keep postgres.js. Everything the change could have altered is held
   where it was:
   - The database URL is read field by field. pg lets a connection string override the options
     beside it and reads `sslmode=require` as full certificate verification; encryption stays
     required for anything but this machine and unverified, as with postgres.js.
   - Queries on one connection run one after another. Reads started together inside a
     transaction were queued by postgres.js; pg 8 queues them too but warns that it will stop.
   - A connection that fails while idle, or while checked out between two queries, no longer
     ends the process: pg reports both as error events, which are now handled.
   - Every transaction runs on a connection checked out for it and always released. Drizzle's
     own pool transaction sent `BEGIN` before the block that releases the connection, so each
     failure `withUser` retries would have leaked a pool slot. A connection left inside a
     transaction is closed rather than reused.
   - An error raised by `COMMIT` (a deferred constraint) reaches the caller as the server's
     error, as postgres.js and PGlite threw it, not wrapped as "Failed query: commit".
   - `withUser` recognises pg's lost-connection messages, so its one retry on a fresh
     connection still applies.

   Checked beyond the new unit tests: the whole test suite, run against a real Postgres 16
   through this client instead of PGlite; every read behind the tabs and the workout, for
   every seeded account and every session, compared value by value and type by type between
   the two drivers (259 reads, no difference); and a type-level pass over every `sql` template
   and comparison in app code for a value the two drivers bind differently (booleans, dates,
   arrays: none).

## Not changed

- **Offline logging.** The owner chose to reduce round trips first. Saving sets on the phone
  and uploading them in the background is possible in an installed app (its storage survives
  closing the app and restarting the phone), but only if it is made reliable enough to trust
  with every set; it needs its own decision.
- **The profile cache** still keeps a profile for a minute per server instance.
- **Production itself** was not measured here. Whether the function runs next to the
  database, how often instances start cold, and which key signs sessions decide how much of
  this the phone feels: the `x-vercel-id` response header names the regions a request passed
  through, `PERF_LOG=1` gives the rest, and the project's
  `/auth/v1/.well-known/jwks.json` lists keys only when sessions use the newer asymmetric
  signing.

## Measurements

Production build on the audit stack, Chromium emulating a Pixel 7, the seeded Vinit (18
workouts, 252 sets); medians of three to five samples, with 24 ms added to every round trip
between the app and Postgres. Server times are the tab switch's own request, profile already
cached; a profile read that misses the cache is also one statement shorter now.

| At 24 ms per round trip                       |       Before |      After |
| --------------------------------------------- | -----------: | ---------: |
| Today: server, statements                     |   982 ms, 23 | 797 ms, 20 |
| Workout (finished): server, statements        |   855 ms, 16 | 759 ms, 14 |
| Progress: server, statements                  |   794 ms, 15 | 776 ms, 14 |
| History: server, statements                   |    452 ms, 9 |  423 ms, 8 |
| Training: server, statements                  |   300 ms, 12 | 272 ms, 10 |
| Profile: server, statements                   |    245 ms, 6 |  220 ms, 5 |
| First visit to Today, tap to content          |     1,074 ms |     862 ms |
| First visit to Progress, tap to content       |       906 ms |     858 ms |
| Back to a tab within a minute, tap to content | 341–1,009 ms |   49–62 ms |
| Set saved: the tick                           |      ~365 ms |    ~375 ms |
| Set saved: the whole reply                    |      ~990 ms |    ~810 ms |
| Requests the browser made after each set      |           10 |          0 |

With 2 ms per round trip, roughly an app and database in one region, every first visit took
about 385 ms both before and after: the loading screen's 300 ms, not the server. So in
production, a tab that still takes a second or more on its first visit is spending it on the
round trip, a cold start or the phone's connection, which `PERF_LOG=1` and `x-vercel-id` tell
apart.

### node-postgres, and no render per set

The same stack and account, the build above against this one, measured one after the other.
Statements per screen did not change; round trips are what fell.

| At 24 ms per round trip                  |         Before |           After |
| ---------------------------------------- | -------------: | --------------: |
| Today: server, round trips               |     791 ms, 36 |      444 ms, 20 |
| Workout (finished): server, round trips  |     782 ms, 26 |      483 ms, 14 |
| Progress: server, round trips            |     779 ms, 26 |      468 ms, 14 |
| History: server, round trips             |     422 ms, 14 |       272 ms, 8 |
| Training: server, round trips            |     270 ms, 16 |      174 ms, 10 |
| Profile: server, round trips             |      221 ms, 8 |       146 ms, 5 |
| First visit to Today, tap to content     |         871 ms |          524 ms |
| First visit to Progress, tap to content  |         855 ms |          561 ms |
| First visit to History, tap to content   |         506 ms |          385 ms |
| Set saved: the tick                      |        ~380 ms |         ~235 ms |
| Set saved: the whole reply               | ~810 ms, 26 KB | ~240 ms, 0.4 KB |
| Set saved: statements, round trips       |         20, 34 |            7, 7 |
| Requests the browser made after each set |              0 |               0 |

At 2 ms per round trip every first visit still took 385 to 410 ms, the loading screen's floor.
Coming back to a tab within a minute still took about 55 ms with no request. The browser checks
of decision 4 ran against this build: a set in the list, in a reopened exercise, on Back and
Forward; Today, Progress and the finish screen each rendered again once when shown from an
older copy, and never again after.
