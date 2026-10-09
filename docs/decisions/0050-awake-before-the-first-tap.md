# ADR 0050: Awake before the first tap

Date: 2026-10-09
Status: accepted; the scheduler in decision 2 is a setting on the Supabase project
([SETUP.md, Keeping the app awake](../../SETUP.md#keeping-the-app-awake))

## Context

On 9 October 2026 the owner asked what could be done about the wait on the first tap after
nobody had used the app for a while, and about latency in general, with native iOS and Android
apps coming. The [audit of the same day](../audits/2026-10-09-latency-and-cold-starts.md)
measured production and the local stack. What it found:

- **Vercel's Hobby plan stops an idle instance after five to seven minutes.** Production answered
  as fast as ever after one, two, three and five minutes without a request, and slowly after
  seven. Keeping one instance running ("scale to one") is a Pro and Enterprise feature; Hobby
  gets none, and its cron jobs run at most once a day.
- **The wait has two cold starts in it, one after the other.** The proxy (`proxy.ts`) is a
  function of its own, deployed in every region and run in the one nearest the phone; the pages
  are another, in Mumbai (`bom1`). After seven idle minutes the proxy alone took about a second
  instead of 0.2 s, and a page behind a warm proxy took another second instead of 0.3 s.
- **A new instance then loads each screen's code on its first request.** On the local
  production build, a new server answered its first `/today` in 427 ms against 60–73 ms warm, on
  top of about 0.9 s to start the process.
- **Every page is in one function, every route handler in another.** Vercel's build output for
  this app has five functions: pages, route handlers (`/api/*`), static and ISR pages, icons and
  the manifest, and the proxy. A ping to an `/api` route would wake the wrong one.
- **The database is not the wait.** One round trip from the function to Supabase is about 2 ms
  (September 25), and the open-workout read every screen makes runs in 0.4 ms over 1,580
  sessions. Changing the schema or the shape of what pages read would save milliseconds.

## Decisions

1. **`/warm` keeps an instance ready for the next tap.** It is a page, because the next tap is
   served by the pages' function; public, because a scheduler has no session; and rendered on
   every request, so no cached copy answers for it. Each request:
   - opens three pooled database connections with `select 1`, as many as a cold tab opens at
     once, at most once every 30 seconds per instance (`server/keep-warm.ts`), so a burst of
     requests to a public page costs the database nothing more;
   - loads the five tab pages and the workout without rendering them, so their modules are in
     memory before anyone opens them;
   - reads nothing of anyone's, and answers 200 even if a screen fails to load.

   On the local production build, a new server that has answered `/warm` answers its first
   `/today` in 183 ms (60 ms to the first byte), against 427 ms (309 ms) with no warm-up and
   347 ms (212 ms) after the sign-in page, which `SETUP.md` used to suggest pinging. Progress:
   232 ms against 492 ms. A warm request to `/warm` takes about 10 ms.

2. **Supabase Cron asks for `/warm` every minute, from Mumbai.** `pg_cron` and `pg_net` come with
   every Supabase project, the Free plan included. The request leaves from the database's region,
   so it reaches Vercel's Mumbai edge as a phone in India does, and keeps that region's proxy
   instance warm along with the pages' function. A scheduler elsewhere keeps only the function:
   its requests run the proxy in its own region. A minute is well inside the five that stop an
   instance; UptimeRobot's free five-minute interval is not. A month of it is about 43,000
   requests to each of the two functions, under a tenth of Hobby's million, a few percent of its
   active CPU and less of its memory, which is billed only while a request runs. The proxy lets `/warm`
   through without a session, after its usual check (`NEUTRAL_PATHS`).

3. **The app warms itself when it is shown again.** A phone keeps the installed app's page in
   memory, so reopening it after a break shows the last screen at once and the first tap is the
   first request. `WarmOnResume` (in the tab shell) sends `HEAD /warm` when the app is shown after
   two minutes or more out of sight, or when the connection returns, at most once a minute. The
   request carries the session's cookies, so the proxy also renews an access token that expired
   during the break (the 805 ms refresh measured on September 25) while the athlete is still
   looking at the screen. HEAD brings back headers only.

4. **The service worker no longer stands in front of every request.** A browser stops an idle
   worker after about thirty seconds, and between sets that is most taps. Opening the app now
   asks for the page while the worker starts (navigation preload), and requests the worker only
   passed on, such as screens the router fetches, prefetches and saving a set, are declared
   network-only, so Chrome does not start the worker for them at all (static routing). Checked
   in Chromium: with the worker stopped, a router-style fetch and a server action's POST went to
   the network without starting it; a navigation started it and was answered from the preload;
   offline, a navigation still showed the offline screen. Safari has navigation preload but not
   static routing, and keeps its old behaviour for the rest.

5. **Resume opens the workout at once.** The way back to an open workout, Today's Resume and the
   strip's on every other tab, now prefetches the whole workout, data included, as the tabs'
   links do (ADR 0032). It used to show the workout's loading screen, and React holds one for at
   least 300 ms. A copy older than the latest set is corrected by the browser, which lays the sets
   it has saved since over it (ADR 0030); every other change to the workout revalidates, which
   discards the copy. The strip is hidden on the workout's own screens, so the workout is only
   rendered in the background while the athlete is elsewhere. On the local build, emulating a
   Pixel 7, Resume took 71–95 ms against 384–408 ms with the prefetch blocked, with no loading
   screen; and a check that saved a set after the copy was made, went Back to Food and resumed
   from that older copy showed every set.

## Considered

- **The sign-in page as the ping.** It is in the pages' function, so it wakes the instance, but
  it reads nothing from the database and loads none of the tabs: the first `/today` after it
  still took 347 ms on the local build.
- **An `/api/warm` route handler.** Route handlers are a separate function on Vercel; pinging one
  would leave the pages cold. The native apps' API will be route handlers, so once they have
  traffic, the scheduler should ping one of those as well.
- **Edge middleware.** The Edge runtime starts in milliseconds, but Next.js 16 runs `proxy.ts` on
  Node.js only and keeps Edge for the deprecated `middleware.ts`. The proxy in Mumbai stays warm
  through decision 2 instead.
- **Vercel Pro.** Scale to one keeps an instance running for production at $20 a month. It is
  the fallback if pinging proves not enough.
- **A partial index for the open workout**, as the September 25 audit proposed. At 0.4 ms there
  is nothing yet to save; it is worth adding when an account's sessions number in the thousands.
- **Fewer round trips through new tables or wider reads.** Withdrawn in ADR 0032 at 2 ms a round
  trip, and nothing measured since changes that for the web. The native apps change where the
  round trips are; the audit's section on them says what that means for their API.

## Not changed

- **The access token's lifetime.** One hour is Supabase's default; the first request after it
  lapses waits for a refresh. Raising it (Supabase → Authentication → Sessions, or JWT settings)
  saves that wait at the cost of a revoked session staying usable on the server until its token
  expires. It is the owner's setting; decision 3 hides the wait when the app is resumed.
- **Freshness.** Tabs keep their minute (ADR 0030, 0032), and the workout reached by Resume is a
  prefetched copy of up to the same minute (decision 5); every other screen is still read on each
  visit.
