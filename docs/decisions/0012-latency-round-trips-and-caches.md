# Latency: fewer round trips, warm connections and small caches

Updated from remote default branch commit `16e0f32` before implementation.

## Where the wait came from

Every tap was measured as a chain of database round trips rather than as slow statements. A replay of each screen and action against an in-process Postgres with a simulated 30 ms round trip showed the pattern: each protected read opens a transaction (`BEGIN`, the claims statement, `COMMIT` are round trips of their own) and then runs its repository calls one after another, most of which were themselves two to four dependent statements. The profile gate in the shared layout added a four-hop transaction to every screen. The database itself was not the bottleneck: every filter and join path is covered by the indexes in migrations 0000–0006, and the row shape needs no change.

Three things outside the request path added to it:

- The project's Supabase logs showed `/auth/v1/.well-known/jwks.json` fetched in clusters of up to four within 200 ms, every few minutes. The project signs sessions with an asymmetric key, so `getClaims()` verifies locally, but each fresh server instance first fetches the key set. The clusters are the signature of cold starts on the hosting free tier: every new instance paid a Supabase round trip before it could answer at all.
- The pooled connections were closed after 20 s idle. The pause between two taps is usually longer than that, so the next tap paid TCP, TLS and SCRAM again before its first statement.
- Server actions and pages that needed the profile read it in a fresh transaction each time.

## Changes

**Signing keys travel with the deploy.** `SUPABASE_JWKS` holds the project's public JWKS document. `proxy.ts` and `getSessionUser` pass it to `getClaims()`, so a cold instance verifies its first session without a network call. A key id that is not in the document still falls back to fetching, so a rotation degrades to the old behaviour rather than breaking sign-in. The variable is optional; `SETUP.md` explains where to copy it from.

**Connections stay warm and recover once.** `idle_timeout` is 300 s with a 30 s TCP keep-alive. A connection the pooler closes while idle is dropped silently by the driver; one that dies mid-flight surfaces as a connection error. `withUser` retries such an error exactly once, and only when it happened before the caller's work started (on `BEGIN` or the claims statement), so no user statement is ever repeated.

**The profile is cached for a minute.** `getRequestProfile` keeps onboarded profiles in server memory for 60 s per instance. Anything that changes the profile calls `profileChanged`, which drops the entry and stamps a cookie with the time of the change; a cached profile read before that stamp is discarded, so the writer's own next request always sees the new row. Profiles without `onboardedAt` are never cached, so the onboarding redirect is always decided from the database. The accepted trade-off: another device of the same account can see profile settings up to a minute old.

**Reference rows are cached for ten minutes.** Equipment types, warm-up protocols and the shared exercise library (`user_id is null`) change only by migration or seed. `reference.ts` remembers them per instance; programme adoption re-reads them once if a blueprint names a slug it does not know. A user's own exercises are still read live and merged by name.

**Repositories read in one round trip where the data allows it.**

- The active schedule is one statement: programme columns plus its days and slot events as JSON aggregates.
- Availability (`gymAvailability`, `exerciseAvailability`, the machine decisions on the workout screen and when a planned session starts) sends every statement of a lookup in one batch; the earlier chains of id lookups are subqueries now.
- Comparable history returns each performance with its sets, instead of a second statement for the sets.
- Session detail reads slots, sets, rest-timer preference, warm-up and the previous check-in together, then history and machine decisions together. Starting a planned session inserts the session while the day is resolved; finishing one returns the day index with the update.
- Pages and actions that needed several independent reads issue them with `Promise.all` inside the same transaction; the driver pipelines them on the one connection.
- Adopting a programme inserts its days, exercises, fallbacks and runs as four batched statements instead of one per row.

Row-level security is unchanged: every read and write still runs inside `withUser`, and logging a set keeps its lock-then-read order on purpose.

## What is not code

Cold starts are a hosting property. `SETUP.md` now says to set `SUPABASE_JWKS`, to check that the function region matches the Supabase project's and that Fluid Compute is enabled, and that on a free tier an occasional request keeps an instance warm. The interface feedback from decision 0011 still covers the waits that remain.

## Validation

- `npm run check`: lint, formatting, TypeScript and 205 tests pass, including new tests for the retry rule, the profile cache, the JWKS parsing and the reference cache.
- Production build passes.
- Replay against an in-process Postgres with a simulated 30 ms round trip. "Sequential" counts the round trips that had to wait for one another, `BEGIN` and `COMMIT` included; the real cost per hop depends on where the app runs relative to the database.

| Screen or action                      | Before (statements / sequential) | After  |
| ------------------------------------- | -------------------------------- | ------ |
| Profile gate on every screen          | 4 / 4                            | cached |
| Today                                 | 9 / 7                            | 7 / 5  |
| Runs                                  | 8 / 8                            | 6 / 5  |
| History                               | 9 / 7                            | 9 / 6  |
| Progress                              | 12 / 6                           | 10 / 5 |
| Gym detail                            | 15 / 9                           | 13 / 5 |
| Gym programme fit                     | 11 / 8                           | 10 / 4 |
| Settings                              | 7 / 7                            | 7 / 4  |
| Exercise detail                       | 17 / 13                          | 13 / 5 |
| Workout (open session, with guidance) | 16 / 13                          | 12 / 6 |
| Workout finish screen                 | 8 / 8                            | 7 / 5  |
| Start planned session (whole action)  | 19 / 17                          | 15 / 8 |

The profile gate row is the cache hit within 60 s; a miss still costs its four hops. Logging a set stays at three sequential statements after the transaction opens: the lock, the read that must follow it, and the write.
