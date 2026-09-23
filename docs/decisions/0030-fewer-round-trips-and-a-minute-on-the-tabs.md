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
4. **A set refreshes; it does not revalidate.** `refresh()` still rebuilds the workout and
   still makes the browser drop its copies of Today, History and Progress, so their set counts
   are read again when next opened; it no longer throws the prefetched loading screens away.
   The rebuild itself stays: the tick appears when the write returns, before the rebuild, and
   the rebuild is what keeps the list and Back showing what the server holds.
5. **A minute on the tabs.** The five tabs export `unstable_dynamicStaleTime = 60`: coming back
   to one within a minute shows it at once, with no request, and without the loading screen's
   300 ms. Every other screen is still read on every visit. Any action that revalidates,
   refreshes or changes a cookie clears the browser's copies, and every action that changes
   what a tab shows does one of those; starting a workout from a saved routine did none and now
   revalidates Today and Training. What a minute can hide is a change made elsewhere: on
   another device, or by the coach between visits. Tapping the tab already open no longer
   forces a reload within that minute.
6. **Timing can be switched on in production.** With `PERF_LOG=1`, every transaction logs one
   `[perf] db` line and every session check in the proxy one `[perf] proxy` line. In a `db`
   line, `setup` is the claims statement, two round trips, so half of it is the app↔database
   round trip; `begin` includes opening a new connection; the first line an instance writes
   says how long ago it started, which separates a cold start from a slow query. A slow
   `proxy` line with `cookies-changed` is a session refresh; one without is a key fetch or,
   on a project still signing with the old shared secret, a call to Supabase Auth.

## Not changed

- **Offline logging.** The owner chose to reduce round trips first. Saving sets on the phone
  and uploading them in the background is possible in an installed app (its storage survives
  closing the app and restarting the phone), but only if it is made reliable enough to trust
  with every set; it needs its own decision.
- **The driver.** node-postgres sends a statement and its values together: the same
  transaction took 9 round trips instead of 17. It is the largest remaining saving, but the
  many `Promise.all` calls inside transactions would have to become sequential first
  (node-postgres deprecates concurrent queries on one client), and query results change
  shape. It is its own change, measured with the same script.
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
