# The tabs arrive before the tap

Production was measured with `PERF_LOG=1` on 25 September
([audit](../audits/2026-09-25-db-round-trips.md)). One round trip to the database takes about
2 ms, so a screen's database work is 10–50 ms. The waits the phone feels are elsewhere:

- React's loading screen, which it holds for at least 300 ms (ADR 0030);
- bursts of prefetches that compete with the tap;
- cold starts, and the hourly session refresh.

This decision takes the first two. The rest of the audit's plan to cut round trips is dropped,
because at 2 ms each it would not be felt.

## Decisions

1. **The five tabs are prefetched whole.**
   - The bottom navigation's links prefetch the full screen, data included, not just its loading
     screen. A tab switch then shows the screen at once, with no request and no loading screen.
   - Measured on a production build: 43–85 ms from tap to screen, where the loading screen alone
     used to take 300 ms.
   - `experimental.staleTimes.static` is 60 s, so a prefetched tab is never older than the
     minute a revisited tab may already be (ADR 0030).
   - After more than a minute without a navigation, the next tap loads as it always did, and the
     tabs are prefetched again behind it.
2. **Actions that change a tab still revalidate.**
   - `revalidatePath` discards every prefetched screen; `refresh()` keeps them. With data inside
     the prefetches, discarding is what keeps a tab from showing the state before the action.
   - So the actions keep `revalidatePath`, and the audit's proposal to swap it for `refresh()` is
     withdrawn.
3. **A screen older than a set is rendered again, and the prefetches go with it.**
   - `refreshScreenAction` (`FreshAfterSets`, ADR 0030) now revalidates instead of calling
     `refresh()`.
   - With `refresh()`, the render it asked for was answered from Today's prefetched copy, made
     before the set, so Today kept showing the old count. The browser check caught this; `main`
     did not have it.
   - The prefetches are fetched again once each time a screen is found older than a set, not
     once per set. A set itself still discards nothing.
4. **Rendering never takes the athlete lock.**
   - A prefetch runs the page, so every page read must be read-only; a write-transaction read
     would queue the prefetch behind a set being saved.
   - Every page load that used a write transaction is now read-only; most of them only read.
   - Today, AI coach, saved programme work, the coaching activity card and the job page wrote,
     but only to record that a coach request or job had timed out. They now show it as it will
     be recorded:
     - `asReconciledRequest` for requests;
     - `settleCoachJobs` and `asReconciledJob` for jobs.
   - Requests need nothing written sooner: a plan for an expired request is refused on its age,
     and asking again reconciles first.
   - Jobs do. Requesting a gym change or confirming an intake refuses while a job looks claimed.
     So a page that shows a lapsed job asks for it to be recorded after it has answered
     (`tidyCoachJobsLater`, using `after()`), off the tap's path.
   - The display rule and the write share one function, and a test checks that what a screen
     shows equals what reconciling then stores.
   - The two onboarding pages that read the profile through `ensureProfile`, under the lock, use
     the cached `getRequestProfile`, which writes only for a missing profile.
5. **Long lists prefetch on touch.**
   - Rows in the exercise library, a gym's equipment, History, friends and people lists, the
     leaderboard, programme occurrences and exercises in common prefetch when a finger or pointer
     lands on them (`AppLink`'s `prefetch="intent"`), not as they scroll into view.
   - Production logged about 90 requests in about 1.5 s on opening the exercise library, and the
     one slow read in the sample ran among them. The same screen now sends 3.

## Not changed

- **The transaction itself.** `withUser` still opens, sets claims and commits as before.
  Sending the setup with the first statement would save about 4 ms a screen, not worth the risk
  to row-level security.
- **Cold starts and session refresh.** These are settings on Vercel and Supabase:
  - Fluid Compute, and the function region;
  - an uptime check that keeps an instance warm;
  - the access token's lifetime, raised to three hours.
- **Every other screen** is read on each visit, as before.
