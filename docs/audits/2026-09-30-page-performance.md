# Page performance audit — 30 September 2026

Branch: `codex/page-performance-audit`, created from local `main` at
`c5e0b36f4bcc7c29519cebb476f0b2507f6ba23c` (the local `origin/main` reference matched).
The user approved an audit plus behavior-preserving fixes, and subsequently approved using
already-loaded lists for instant Following/Followers switches. This audit was prepared on that
branch; production was inspected but not modified or deployed.

The strongest confirmed improvements are removing accidental validation code from Programme
screens, eliminating redundant refresh requests, and fetching only data the page uses.
Current production samples show database work in tens to low hundreds of milliseconds;
they do not support promising that SQL round-trip reductions alone will make every page instant.

## Current production evidence

Inspected the signed-in application and its existing Vercel logs at
`https://gym-tracker-fawn-omega.vercel.app/`. These are **before-change**, individual server
request samples, not browser tap-to-paint timings, percentiles, or cold/warm controlled trials.
The log details identify production deployment `dpl_GGfahxYRu31WEg56dzLnzXtLrRjD`, branch
`main`, receipt in Mumbai (`bom1`), and Fluid execution for middleware and functions.

| Route                          | Time (IST, 30 September) | Database transactions shown                  | Function execution | Middleware | Vercel response finished |
| ------------------------------ | ------------------------ | -------------------------------------------- | -----------------: | ---------: | -----------------------: |
| Today, after sign-in           | 01:36:54.69              | 62 ms / 4 statements; 18 ms / 4; 121 ms / 13 |             413 ms |      36 ms |                   479 ms |
| Progress, requested from Today | 01:36:55.45              | 89 ms / 14 statements                        |             119 ms |      12 ms |                   160 ms |
| Programme, from Profile        | 01:42:51.63              | 104 ms / 17 statements; then 37 ms / 6       |             177 ms |       7 ms |                   219 ms |

Other visible samples: Food 16–19 ms / 5 statements, Training 18–59 ms / 6,
Profile 11–26 ms / 5, and Progress 83–163 ms / 14. This is a selected log sample, not
a population range. Setup usually took 2–3 ms; Training sometimes spent 21–31 ms in
`begin`, which includes connection checkout and opening. It does not distinguish pool
queueing from connection establishment. Parallel transactions must not be added as if
they all ran sequentially on the request's critical path.

The profile visit around 01:42:30 also produced a cluster of shortcut and main-tab requests.
Some were shell prefetches. The logs alone do not identify which competed with navigation
or whether changing that prefetch policy would improve the phone experience.

`src/db/perf.ts` labels the process's first instrumented transaction `cold` and logs process
uptime. **That uptime is not a measurement of cold-start latency.** In this sample it was
115,878 ms, so the previous audit's interpretation of a small uptime as the request's
cold-start cost must not be repeated. No current expired-token refresh was observed.

The browser connector does not expose Performance Timing through its read-only page scope.
Authenticated pages were checked and server diagnostics read, but device/network waterfall,
LCP, INP, hydration/long-task timings, and controlled cold-start measurements remain unverified.

## Changes on this branch

| Area                                          | Change                                                                                                      | Confirmed reduction / preserved behavior                                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Programme, history, draft routes              | Import text constants and the exercise-target formatter without initializing Zod validators in the browser. | About 89–91 KB gzip smaller route entries in the local artifact comparison below. Server validation stays in place; the intake form still validates in the browser.                  |
| Programme actions and Today gym/coach actions | Remove client `router.refresh()` after actions already revalidate the displayed page.                       | Eliminates redundant refresh dispatch at five handler locations; keeps server invalidation, errors, coach polling and post-set freshness.                                            |
| Progress                                      | Request per-sport totals only; omit the unused daily-recovery read in the general training loader.          | Two application SQL statements removed. The complete independent recovery-history read still supplies the charts. Other training-loader consumers retain their defaults.             |
| Training                                      | Count active templates and outstanding standalone sessions in SQL.                                          | Same statement count, without reading full prescriptions, schedule history, or sorting/hydrating rows merely to count them. Owner/revision joins and outstanding semantics retained. |
| New/edit saved meals                          | Use foods-only library reader.                                                                              | One SQL statement removed from each route; avoids all saved-meal data the builder discards. Food order/projection, selected-meal version and RLS retained.                           |
| Exercise comparison                           | Reuse the viewer directory row already read in this transaction.                                            | One directory query removed; circle sorting, following and training-privacy checks retained.                                                                                         |
| Programme change titles                       | Skip base reconstruction for a stored headline; share each base read within one loader call.                | Five statements avoided per normally reconstructed titled base; untitled drafts sharing a base reconstruct it once. No cross-request cache.                                          |
| Onboarding resume                             | Keep dependent sports/gym reads in one read-only user transaction.                                          | Removes one `BEGIN`/claims/`COMMIT` sequence for strength accounts; non-strength accounts still skip the gym read entirely.                                                          |
| Following/Followers                           | Use already-loaded lists for local tab selection and URL updates.                                           | User-approved freshness choice: toggling no longer refetches both lists. Mutation invalidation and normal page navigation still refresh server data.                                 |

No schema migration, database transport replacement, authentication lifetime change, expanded
cache TTL, altered training-history limit, or hosting-setting change is included.

### Bundle evidence

The preexisting local audit build `KxjyYndR29Ohkf4LZf1t2` and the fresh build
`4vCG-1qwT77UUK0jK2iz2` were measured using the same deduplicated `entryJSFiles` manifest
method. The old artifact was not rebuilt at the base commit during this task, so these
numbers are an artifact comparison, not a controlled commit-to-commit benchmark.

| Route                                             | Earlier artifact gzip bytes | Fresh build gzip bytes |
| ------------------------------------------------- | --------------------------: | ---------------------: |
| Programme                                         |                     151,207 |                 62,019 |
| Programme history                                 |                     148,356 |                 59,168 |
| Programme draft                                   |                     153,350 |                 61,872 |
| Programme creation, still using intake validation |                     158,111 |                156,465 |

Main tab entries were unchanged apart from 30 bytes on Today. These figures exclude framework
bootstrap not listed in the manifests, CSS, HTML/RSC and delayed chunks. See the
[client review](2026-09-30-performance-client-review.md) for exact methodology and coverage.

## Prioritized remaining avenues

1. **Reduce library payloads.** The local exercise-library HTML response was 561,527 bytes
   uncompressed. Its client receives complete exercise rows. Project exactly the display/search
   fields before considering pagination. Programme builders and previews likewise receive
   more exercise fields than their client contracts consume. Search behavior must be retained.
2. **Scope expensive detail reads.** Exercise charts currently fetch other exercises and sets
   from matching workouts. Finish/substitute screens request a rich session model while using
   only a subset. Introduce narrow readers, with equivalence tests for histories, machine
   ladders, load units, warmups and personal/custom exercises.
3. **Separate Programme views and share the schedule.** Cycle loads full change details for a
   badge; Changes loads unused cycle/archive data. Saved work then starts another transaction.
   A badge projection and smaller view-specific reads can cut work without changing freshness.
4. **Reduce social history work.** Feed reads the entire following directory for IDs; bests and
   records reduce complete shared histories in JavaScript. Use owner/consent-aware joins and
   SQL projections, keeping all-time results, tie-breaking and sharing revocation correct.
5. **Isolate Progress control changes.** Changing series or body-map week reloads unrelated
   analytics. A narrower request boundary could avoid it. Decide how independent panels load
   and handle errors before changing the screen's rendering behavior.
6. **Measure mobile navigation before more caching/prefetch changes.** Collect cold entry,
   warm switch, switch after 60 seconds, and post-mutation traces on the affected device.
   Keep the existing one-minute policy until a different freshness/traffic tradeoff is agreed.
   Current logs already show Fluid execution and Mumbai receipt; simply recommending those
   settings again would not be a new finding.
7. **Profile background browser work.** Workout drafts rescan local storage on edits; idle
   timers tick; coach job polling reloads a whole route; the public-asset service-worker cache
   has no retention bound. These are concrete work paths, not demonstrated latency causes.
   Preserve draft durability, cross-tab behavior and update safety in any follow-up.

Details, exact source references and implementation boundaries are recorded in the
[data/page review](2026-09-30-performance-data-review.md),
[Food/social/coaching review](2026-09-30-performance-secondary-review.md), and
[client review](2026-09-30-performance-client-review.md).

## Validation and reproduction

Final checks against the completed source:

- Production build (`4vCG-1qwT77UUK0jK2iz2`) and TypeScript: passed.
- Full Vitest regression run: **1,872 tests passed across 230 files**, exit code 0.
- ESLint over all `src` and the new probe script: passed.
- Prettier over changed source, tests, new script and all four audit reports: passed.
- `git diff --check`: passed.
- Independent final review of every changed production-source diff: no actionable findings.

The suites cover real PostgreSQL semantics/RLS through PGlite, query counts, result equivalence,
food ordering, private training, draft title fallbacks, action-refresh behavior and native
history selection. The first full run overlapped the People test edit and encountered its
old navigation mock; the clean run above used the stable final source and passed in full.

The final build was also checked in the browser against local fixtures: switching to Followers
updated the displayed list and query string with no new server-log entries. Reload retained
Followers, navigating to Training then using browser Back restored Followers, and Forward
returned to Training. No browser errors or warnings were recorded. This checks
the actual Next router/history integration in addition to the unit tests. No follow mutation
was performed during this read-only check.

`scripts/dev/measure-page-responses.mjs` is a new loopback-only, authenticated, read-only HTML
probe using the existing audit auth service. It sends no production credentials and prints no
training records. Start the audit auth/app with the same local database, then run:

```powershell
$env:PAGE_RESPONSE_OUT = 'output/audit-20260930-performance-pages.json'
node scripts/dev/measure-page-responses.mjs
```

With the existing `overload_audit_56months` fixtures, three warm samples per route produced
full HTML response medians of Today 67 ms, Training 40 ms, Food 58 ms, Progress 69 ms, Profile
46 ms, History 52 ms, Programme 60 ms, Changes 57 ms, new saved meal 28 ms, exercise library
85 ms, Gyms 30 ms, Friends 119 ms, People 51 ms, leaderboard 35 ms. All returned HTTP 200
without the checked streamed error/redirect markers. These are local warm server responses,
not production measurements or browser-render verification. The full suite ran concurrently,
so they are smoke measurements, not a controlled benchmark. Local profile and shell reads
are included. No baseline-relative latency improvement is claimed.

## Coverage and limits

Review covered all 80 production page entry files (62 app, nine onboarding, four auth, four
legacy redirects and the root page), divided by route and their relevant data/client paths. The
linked reports distinguish whole-file manual reads from focused function reads and import
graph scans. Shared infrastructure reviewed in this audit includes `src/db/client.ts`,
`with-user.ts`, `perf.ts`, request authentication, proxy, Supabase client/JWKS setup,
profile/reference/request caches, onboarding entry, root/app/onboarding/auth/legacy layouts,
all auth and legacy page entries, auth actions/confirmation, attachment route boundaries,
Next config, deployment config, manifest, error/not-found pages and the local audit runners.

Development-only preview pages are disabled in production and are not optimization targets.
This is not a claim of reading every generated migration snapshot or every line of background
coaching logic. Full production timing coverage across every account state, history size,
device, route and auth-expiry state remains outside the measured samples. Existing untracked
design documentation and output artifacts were preserved.
