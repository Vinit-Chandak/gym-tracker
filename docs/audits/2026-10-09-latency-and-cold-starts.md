# Latency and cold starts — 9 October 2026

Branch: `claude/performance-latency-improvements-9fi3my`, from `main` at `3aa373e`.

The question: the first tap after the app has sat unused is slow, navigations and database reads
could be faster, and native iOS and Android apps are coming. What can be done, and is anything
worth changing in the schema, the shape of what screens read, or the hosting?

**Short answer.** The wait is cold starts, not the database. Vercel's free plan stops the server
five to seven minutes after its last request, and the next tap then waits for two cold starts
in a row, about a second and a half. This branch adds a keep-warm page and the app's own warm-up
on resume, and takes the service worker off the path of most taps. One setting on the Supabase
project, a once-a-minute job, makes the keep-warm work; it is free. The schema stays as it is.
For the native apps, the one rule that matters is one request per screen.

## Where the time goes

### Production, measured today

Requests from this audit's machine in the United States to the production deployment, signed
out (no account involved). Each figure is the time to the first byte less the TLS handshake. The
page's figures include the hop from Washington to Mumbai (about 0.2 s), which a phone in India
does not pay, and all of them pass through the audit environment's own network proxy; the
difference between warm and cold is what matters.

| Idle before the request | Proxy alone (`/today` → sign-in redirect) | Proxy and page (`/login`) |
| ----------------------- | ----------------------------------------: | ------------------------: |
| 0 (warm)                |                                    0.27 s |               0.31–0.38 s |
| 1 minute                |                                    0.23 s |               0.29–0.30 s |
| 2 minutes               |                                    0.25 s |               0.33–0.34 s |
| 3 minutes               |                                    0.24 s |                    0.32 s |
| 5 minutes               |                                    0.18 s |               0.30–0.38 s |
| **7 minutes**           |                                **1.02 s** |                **1.07 s** |
| **10 minutes**          |                                **0.91 s** |                **1.16 s** |

- **Instances stop between five and seven idle minutes.** At seven minutes the proxy took a
  second instead of a quarter, and the page, behind a proxy just woken, another second instead of
  a third. The very first request of the session showed the same, 1.72 s to the first byte against
  0.35–0.41 s right after.
- **The proxy runs where the phone is.** Vercel deploys `proxy.ts` to every region and runs it in
  the one nearest the request: the redirect came back in about 120 ms with only `iad1` in
  `x-vercel-id`, too quick for a round trip to Mumbai. The pages run only in Mumbai (`bom1`). A
  phone in India uses Mumbai's proxy instance, which only a request from India keeps warm.
- **Hobby gets no help here.** Vercel keeps one instance running for production ("scale to one")
  on Pro and Enterprise only, and Hobby's cron jobs run at most once a day.

### Vercel's build of this app

`vercel build` on this branch makes five functions: every dynamic page in one (sign-in, the tabs,
the workout and the rest, 174 routes), route handlers (`/api/*`) in a second, static and ISR
pages in a third, icons and the manifest in a fourth, and the proxy. The pages' function is 11 MB
on Node.js 24. A ping must hit a page to wake what a tap uses; a route handler wakes another
function.

### A new server, locally

The production build on the local audit stack (Postgres 16 on the same machine, the seeded
56-month accounts), each scenario on a freshly started server, medians of three:

| Before the first `/today`     | First `/today` | First byte | First transaction opening a connection |
| ----------------------------- | -------------: | ---------: | -------------------------------------: |
| Nothing (a new process)       |         427 ms |     309 ms |                               19–31 ms |
| The sign-in page              |         347 ms |     212 ms |                                 ~19 ms |
| **`/warm`**                   |     **183 ms** |  **60 ms** |                               **3 ms** |
| A warm server, for comparison |       57–73 ms |   26–30 ms |                                   3 ms |

Progress: 492 ms with no warm-up, 232 ms after `/warm`. Starting the process took a further 0.9 s
before any of these. In production the connection column is bigger: a new connection to
Supabase's pooler is a TLS handshake, 30–40 ms (September 25).

### The database

- One round trip from the function to Supabase is about 2 ms; a screen's database work is 10–50
  ms, and Today about 120 ms in one sample (September 25 and 30 audits).
- The read on every screen, the open workout, takes 0.4 ms against 1,580 sessions under the
  account's row-level security (`EXPLAIN ANALYZE`, local).
- The 300 ms after a loading screen is React's: Next's bundled React DOM shows what replaced a
  fallback no sooner than 300 ms after the fallback (`globalMostRecentFallbackTime + 300`). Only a
  screen already on the phone skips it.

## What this branch changes

[ADR 0049](../decisions/0049-awake-before-the-first-tap.md) records the decisions.

| Change                                                   | What it saves                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/warm`: opens three pooled connections, loads the tabs  | With a scheduler: the ~1.5 s of two cold starts, and 240 ms of the first `/today` after a new start |
| Supabase Cron every minute, from Mumbai (a setting)      | Keeps Mumbai's proxy instance and the pages' function warm all day, for free                        |
| `WarmOnResume`: `HEAD /warm` when the app is shown again | A resumed app's server and expired session are renewed while the athlete reads the screen           |
| Service worker: navigation preload                       | Opening the app no longer waits for the worker to start before asking for the page                  |
| Service worker: static routing (Chrome)                  | Router fetches, prefetches and set saves no longer start a stopped worker                           |
| Resume links prefetch the whole workout                  | Back to the workout in 71–95 ms instead of 384–408 ms (local, Pixel 7), with no loading screen      |

Checked: unit tests for each (the service worker is run as written against a stand-in for the
browser), the full suite, typecheck, lint and formatting; in Chromium against the local build,
the worker activates with navigation preload on, the preload header goes out with a navigation,
a stopped worker stays stopped for a router fetch and a server action and starts for a
navigation, and the offline screen still shows offline. Resume was timed with and without its
prefetch (three runs each), and a set saved after the workout was prefetched still showed when
resuming from that older copy (twice). WebKit was not available in the audit environment; Safari
has navigation preload and no static routing, so it keeps its previous behaviour for everything
else.

## What only the owner can do

1. **Create the keep-warm job** on the Supabase project: [SETUP.md, Keeping the app
   awake](../../SETUP.md#keeping-the-app-awake). Five minutes in the dashboard, or one paste in
   the SQL editor. Without it, `/warm` exists but nothing asks for it.
2. **Consider the access token's lifetime.** Supabase's default is an hour. The first request
   after it lapses renews it, 805 ms on September 25, on the critical path of a cold app. Raising
   it to a few hours or a day removes most of those waits; the cost is that a session revoked
   elsewhere stays usable on the server until its token expires. `WarmOnResume` hides the wait
   when the app is resumed from memory, not when the phone has closed it.
3. **Check `SUPABASE_JWKS` is set** on Vercel (SETUP.md step 7.4). Without it, every cold proxy
   and page fetches the signing keys before it can answer.

## Should the schema, or what screens read, change?

Not for the web app. Every round trip removed saves about 2 ms; the heaviest screen would gain
tens of milliseconds, against a second and a half of cold start and the 300 ms loading floor.
ADR 0032 reached the same verdict on September 25, and today's measurements agree.

Two things would change that verdict, and neither applies yet: an account with thousands of
sessions (then the open-workout read wants a partial index, `where completed_at is null`), or
clients that are far from the database, which is the native apps' case below.

## Should the hosting change?

No.

- **The database** answers in about 2 ms from the function and runs each statement in under a
  millisecond. Nothing to gain by moving it.
- **Free hosting that does not sleep** is not on offer in Mumbai. Render's free services sleep
  after 15 idle minutes and take 30–60 s to wake, which is worse; Fly.io no longer has a free
  plan for new organisations. A small always-on server would end cold starts, for a few dollars
  a month and the work of running it: deploys, TLS, updates, and no preview deployments.
- **Vercel Pro**, $20 a month, keeps one production instance running ("scale to one"). It is the
  fallback if the free job ever proves not enough.
- **Edge middleware** would start the proxy in milliseconds, but Next.js 16 keeps the Edge runtime
  only for the deprecated `middleware.ts`; `proxy.ts` is Node.js. With the job pinging from
  Mumbai, the proxy there stays warm anyway.

## The native apps

The owner chose SwiftUI and Jetpack Compose on 30 September
([revamp README](../ui-redesign/revamp/README.md)). Those apps cannot use server components or
server actions: they need an HTTP API, and its shape decides their speed.

1. **One request per screen.** A phone's round trip to Mumbai is tens to hundreds of milliseconds,
   against 2 ms between the function and the database. Each screen should be one call that
   returns everything the screen shows (Today's day, gyms, plan and coach state together; the
   workout with its slots, sets and histories), built on the server from the repositories the
   pages already use, inside `withUser`. Never one call per table, and never the phone querying
   Supabase's REST API directly: fifteen of those in sequence would cost seconds. This is where
   the screen-shaped data the question asked about belongs: in the API, not in the schema.
2. **Sign-in stays Supabase's.** The apps sign in with Supabase's Swift and Kotlin libraries and
   send the access token as a Bearer header; the API verifies it with the same embedded keys the
   proxy uses and runs every read as that user. The coach's routes (`/api/coach/*`) already show
   a token-checked route handler.
3. **Keep the API warm too.** Route handlers are their own function on Vercel. Once the apps have
   traffic, add a cheap route handler to the keep-warm job beside `/warm`.
4. **Cache on the device.** An app's storage is its own, so it can keep the last answer for each
   screen and show it the moment the screen opens, then replace it when the new answer comes. The
   web app does not do this, by design: its service worker stores nothing private. The same
   holds for logging sets offline and sending them later, which ADR 0030 left for a decision of
   its own.
5. **If the store versions come first as wrappers,** everything in this branch applies to them.
   Android can wrap the installed web app as a Trusted Web Activity, which runs it in Chrome. On
   iOS a web view of the live site risks App Store review (guideline 4.2, minimum functionality),
   and `WKWebView` runs service workers only for app-bound domains.

## Further options, not taken here

- **Cache Components and Partial Prefetching** (Next.js 16.3's "instant navigation"). A static
  shell for every screen and prefetched app shells for every link. A migration of every page,
  worth its own decision once the native apps' API is settled.
- **More screens kept for a minute** (`unstable_dynamicStaleTime`), such as an exercise or a gym
  revisited within a session. Each one is a freshness decision.
- **The open-workout partial index**, when accounts reach thousands of sessions.

## Reproducing

- Production timing: any HTTP client against `/login` and a signed-out `/today`, read
  `x-vercel-id` and the time to the first byte at growing idle gaps.
- Functions: `vercel build` with a local `.vercel/project.json` (no production credentials), then
  read `.vercel/output/functions`: routes that share a function are symbolic links to it.
- Local cold starts: `npm run audit:setup`, `npm run audit:build` and `npm run audit:auth`, then
  start `next start` fresh for each sample with the audit's environment and time the first
  signed-in `/today`, after nothing, `/login` or `/warm`.
