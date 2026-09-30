# Food, social, profile and coaching performance review — 30 September 2026

This review follows the current page data paths, including the existing performance decisions.
The findings below are demonstrated by source reads and local tests. They are not measurements
of the current production deployment, an authenticated production navigation, or a phone's
rendering time. The main audit owns production measurement, shared-shell work and the final
combined checks.

## Implemented behavior-preserving changes

| Route                                | Confirmed avoidable work                                                                                                                                                                           | Change and evidence                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/food/my-foods/meals/new`           | Read the complete food library and every saved meal, then discard the meals.                                                                                                                       | `src/server/repositories/nutrition.ts:316` factors the existing foods projection and ordering into `readFoods`; `src/app/(app)/food/my-foods/meals/new/page.tsx:17` uses it. Application reads fall from two statements to one.                                                                                                                             |
| `/food/my-foods/meals/[id]`          | Read the chosen saved meal, then read all saved meals again while obtaining foods.                                                                                                                 | `src/app/(app)/food/my-foods/meals/[id]/page.tsx:24` loads the chosen meal and foods only. Application reads fall from three statements to two. The selected meal's version token and not-found behavior remain.                                                                                                                                            |
| `/u/[username]/compare/[exerciseId]` | `loadHeadToHead` obtained the viewer's directory row; `loadCircle` fetched that row again within the same transaction.                                                                             | `src/server/queries/leaderboard.ts:26` accepts an already-read directory row; the comparison passes `head.me` at `src/app/(app)/u/[username]/compare/[exerciseId]/page.tsx:101`. One directory query is removed. Other callers retain their existing live read.                                                                                             |
| `/profile/programme`                 | Every open draft reconstructed its base programme to derive a fallback title, even when its stored headline already supplied the title. Several drafts could reconstruct the same base repeatedly. | `src/app/(app)/profile/programme/changes.tsx:108` keeps an in-flight base read per programme only for the lifetime of this loader. `:119` bypasses that display-only read for a draft with a headline. A normal base reconstruction uses five statements; one titled draft avoids all five, and untitled drafts share one reconstruction per distinct base. |

These changes do not alter cache lifetimes, privacy gates, follower ordering, food ordering,
stored food/meal snapshots, mutation receipts, revalidation, or programme activation checks.
The programme loader still filters drafts by owner, open status and non-null base. Untitled
drafts still call the existing owner-filtered, schema-validating blueprint reader and retain
the same missing-base fallback. A headline does not need a derived diff merely to display
that headline; draft review and activation validation remain separate and unchanged.

The counts above exclude `BEGIN`, claims setup, `COMMIT`, the profile gate and the session
strip. They describe removed SQL work, not promised milliseconds. The current application
uses `pg`, whose queries are explicitly serialized per connection in `src/db/client.ts`.
Moving the same reads into `Promise.all` within one transaction does not remove that work.

## Implemented after the user's freshness decision

The user selected **“Switch instantly using loaded lists”** for the People page's Following /
Followers control. `src/app/(app)/profile/friends/people/people-lists.tsx:33` now derives the
selected list directly from `useSearchParams` and replaces the URL with the native History API.
It displays the lists already sent by the page, avoiding a route request and its three list
queries for each toggle. The installed Next.js native-history guide documents that these
updates synchronize with `useSearchParams` without reloading the page.

The same history entry is replaced, as before; query parameters, the hash and the app's
previous-page marker survive. Deep links, reload, Back and Forward select the URL's list.
Missing, unknown or repeated `people` parameters still select Following. The redundant server
`initial` prop was removed so it cannot override a newer browser URL. Follow / unfollow /
accept / decline / remove actions retain their existing server-side revalidation; new server
list props are displayed without resetting the current selection. External changes no longer
refresh merely because the user switches these two already-loaded lists.

## Remaining concrete opportunities

Priorities rank the amount of avoidable work and scope of change, not measured production impact.

| Priority | Routes and source                                                                                                                                       | Finding                                                                                                                                                                                                                                                                                                                        | Next behavior-preserving implementation                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | `/profile/programme`; `src/app/(app)/profile/programme/page.tsx:82`, `src/app/(app)/profile/programme/changes.tsx:40`                                   | Cycle fetches the full Changes model even though it only consumes the waiting badge. Changes also fetches the full cycle and archived list although it does not render those lists. Both loaders independently read the active schedule.                                                                                       | Share one request's schedule between loaders. Introduce a waiting-count read for Cycle, and a programme-header projection for Changes. Assert waiting counts and both rendered views match existing behavior, including legacy proposals, questions, missing programmes and history. |
| P1       | `/profile/programme`, `/welcome/programme`, `/profile/ai-coach`; `src/components/coaching/saved-work.tsx:21`, `src/components/coaching/activity.tsx:22` | Nested async components start their own transactions after their parent has completed its own data work. Saved work reads a full latest intake, full draft blueprints and full jobs to show links; the AI coach card reads full jobs to find one latest failure.                                                               | Extract small read models, then load required models at page level so the second component does not add a serial transaction. Preserve the existing job reconciliation display and deferred cleanup; do not reintroduce writes during rendering.                                     |
| P2       | `/profile/friends`; `src/app/(app)/profile/friends/page.tsx:46`, `src/server/repositories/shared-stats.ts:973`                                          | Fetches and sorts every followed directory row only to obtain IDs for a feed that returns at most 20 rows.                                                                                                                                                                                                                     | Add a feed reader with an accepted-follow subquery/join. Keep the same timestamp/ID order, limit and shared-stat RLS. This removes one SQL statement and avoids transferring unrelated directory columns/counts.                                                                     |
| P2       | Exercise leaderboard and exercise comparison; `src/server/repositories/shared-stats.ts:611`                                                             | Reads every historical shared-stat row for the selected exercise and every account in the circle. It filters all rows once per account before reducing metrics. There is no enforced bound corresponding to the comment's “few hundred” rows.                                                                                  | Start with one-pass grouping in JavaScript; then consider SQL best-row projections with equivalence tests for null metrics, earliest-date ties and top-weight reps/sets tie-breaking. Do not replace all-time bests with a history limit.                                            |
| P2       | Person and overall comparison; `src/server/repositories/shared-stats.ts:572`, `:905`                                                                    | Muscle split transfers one JSON map per session, and Records transfers every candidate exercise row before reducing to at most ten records. Overall comparison runs the muscle-set read separately for each person.                                                                                                            | Aggregate muscle sets by user/muscle in SQL and batch both users. Project winning record rows in SQL while retaining primary-metric rules, ties, order, date boundaries and RLS.                                                                                                     |
| P2       | Programme builders and draft pages; `src/components/coaching/builder-page.tsx:31`, `src/components/coaching/draft-page.tsx:72`                          | Builder sends complete exercise rows across the server/client boundary although `ProgramBuilder` has an explicit smaller `LibraryEntry` contract. First-programme preview consumes only exercise slug/name. Change-detail loads machines and revision even though those outputs serve only the first-programme preview branch. | Project the exact builder fields; pass slug/name to preview. Scope branch-only reads after identifying the rendered view. Keep fields required by `assessProgramChange`; do not remove source-revision checks from mutation paths.                                                   |
| P3       | `/profile`, social identity reads; `src/app/(app)/profile/page.tsx:49`, `src/server/repositories/follows.ts:17`                                         | Directory reads often obtain join date, follow approval and two counts where only ID/name/handle or the counts are consumed. The directory view computes counts through correlated subqueries.                                                                                                                                 | Introduce narrow directory projections for each real consumer. Use `EXPLAIN` to establish whether unnecessary count expressions disappear; do not substitute a cached private profile for current public identity/count data without checking freshness semantics.                   |
| P3       | Sports selection; `src/server/actions/sport-preferences.ts:32`                                                                                          | Saving sports performs four upserts sequentially.                                                                                                                                                                                                                                                                              | Batch the four inserts/upserts, preserving defaults for missing rows and updating only `enabled` for existing rows; never reset units or sharing while batching.                                                                                                                     |

The installed database implementation and migrations were inspected to avoid proposing an old
transport change. The September 25 audit's switch to `pg`, read-only page transactions,
full main-tab prefetching and intent-prefetch list links already exist. They are not new
optimizations to claim again. The old audit's programme blueprint N+1 remained; the headline
and same-base changes above address a verified subset of it.

## Decisions that should remain explicit

- **Food/library and people-list growth:** food editors, My foods, followers and following load
  complete lists so local search and immediate switching work. Pagination, server search,
  retained client data or virtualization needs a decision about search behavior and freshness.
  Do not silently cap these lists or drop saved-meal items needed for matching/search.
- **New caches:** the existing one-minute main-tab/profile policy is documented and has
  invalidation rules. More route-data caching, fewer revalidations, longer auth tokens, or
  broader full prefetching can change freshness, privacy revocation visibility or background
  load. This review introduces none.
- **Streaming sections:** route `loading.tsx` files provide fallback coverage for the app pages.
  Splitting coaching sections into independent Suspense boundaries may improve time to useful
  content but changes how sections appear. Measure first and agree on that presentation.
- **Production:** historical logs in the September 25 report attribute large delays to cold
  starts, token refresh and prefetch bursts, with short DB RTT. Those are historical evidence,
  not proof of today's cause. Capture current authenticated route timings and cache state
  before selecting hosting, region, token or prefetch policy changes.

## Checks for this work

- `vitest run src/server/repositories/nutrition.test.ts src/server/repositories/shared-stats.test.ts --maxWorkers=1`: **61 passed**.
- `vitest run src/app/(app)/profile/programme/changes-loader.test.ts --maxWorkers=1`: **5 passed**.
- `vitest run src/app/(app)/profile/friends/people/people-lists.test.tsx src/lib/navigation-history.test.ts --maxWorkers=1`: **13 passed**.
- The new nutrition regression runs actual migrations/RLS in PGlite, asserts the exact
  foods-only projection, recency/name ordering, equivalence with `readLibrary().foods`, another
  account's inability to read the rows, and one logged SQL query with no saved-meal read.
- The comparison regression uses actual follows and training privacy. It asserts equality
  with the original circle, one follows query when the viewer is supplied, and that a friend
  who stopped sharing still has no readable training bests.
- The programme regression verifies no base read for a headline, one shared base read for two
  untitled drafts, distinct equivalent fallback titles, a fresh read on another loader call,
  and no other-account draft rows.
- People tests verify valid and invalid deep links, immediate switching with no router or
  mutation calls, preserved history length and previous-page marker, actual jsdom Back /
  Forward navigation, and refreshed list props while retaining the URL's selection. The
  `useSearchParams` mock models the framework's documented native-history subscription;
  this is not an authenticated browser end-to-end run.
- An independent read of the Training count helpers found their joins and conditions match
  `listTemplates().length` and `outstanding(standaloneSchedule().upcoming).length`. The review
  checked resolution semantics, date boundaries, missing current revisions, unique linked
  activities, archive filtering and the new RLS/equivalence tests. The primary data review
  owns those source changes and test results.
- Edited source/test files were formatted with the installed Prettier. Full typecheck, lint,
  build and combined tests are coordinated by the main audit, not claimed by this sub-review.
- No live database writes, migrations, account-setting changes or deployment were performed.

## Manual read coverage

The following page files were read in full, not merely found by a filename search:

```text
src/app/(app)/food/page.tsx
src/app/(app)/food/[meal]/page.tsx
src/app/(app)/food/my-foods/page.tsx
src/app/(app)/food/my-foods/meals/new/page.tsx
src/app/(app)/food/my-foods/meals/[id]/page.tsx
src/app/(app)/food/targets/page.tsx
src/app/(app)/profile/page.tsx
src/app/(app)/profile/edit/page.tsx
src/app/(app)/profile/privacy/page.tsx
src/app/(app)/profile/sports/page.tsx
src/app/(app)/profile/coach/page.tsx
src/app/(app)/profile/ai-coach/page.tsx
src/app/(app)/profile/routines/page.tsx
src/app/(app)/profile/delete-account/page.tsx
src/app/(app)/profile/password/page.tsx
src/app/(app)/profile/programme/page.tsx
src/app/(app)/profile/programme/history/page.tsx
src/app/(app)/profile/programme/create/page.tsx
src/app/(app)/profile/programme/manual/page.tsx
src/app/(app)/profile/programme/jobs/[id]/page.tsx
src/app/(app)/profile/programme/drafts/[id]/page.tsx
src/app/(app)/profile/programme/drafts/[id]/programme/page.tsx
src/app/(app)/profile/friends/page.tsx
src/app/(app)/profile/friends/people/page.tsx
src/app/(app)/profile/friends/find/page.tsx
src/app/(app)/profile/friends/compare/page.tsx
src/app/(app)/profile/friends/leaderboard/page.tsx
src/app/(app)/u/[username]/page.tsx
src/app/(app)/u/[username]/activities/[sharedStatId]/page.tsx
src/app/(app)/u/[username]/compare/page.tsx
src/app/(app)/u/[username]/compare/[exerciseId]/page.tsx
src/app/(onboarding)/layout.tsx
src/app/(onboarding)/welcome/page.tsx
src/app/(onboarding)/welcome/gym/page.tsx
src/app/(onboarding)/welcome/equipment/page.tsx
src/app/(onboarding)/welcome/sports/page.tsx
src/app/(onboarding)/welcome/programme/page.tsx
src/app/(onboarding)/welcome/programme/create/page.tsx
src/app/(onboarding)/welcome/programme/manual/page.tsx
src/app/(onboarding)/welcome/programme/jobs/[id]/page.tsx
src/app/(onboarding)/welcome/programme/drafts/[id]/page.tsx
```

Additional complete source reads for data dependencies and consumers:

```text
src/app/(app)/food/day-rollover.tsx
src/app/(app)/food/food-view.tsx
src/app/(app)/food/[meal]/meal-view.tsx
src/app/(app)/food/[meal]/meal-editor.tsx
src/app/(app)/food/my-foods/my-foods-view.tsx
src/app/(app)/food/my-foods/meals/meal-builder.tsx
src/app/(app)/profile/friends/activity-row.tsx
src/app/(app)/profile/friends/people/people-lists.tsx
src/app/(app)/profile/friends/people/request-row.tsx
src/app/(app)/profile/friends/people/people-lists.test.tsx
src/app/(app)/profile/friends/people-tabs.ts
src/app/(app)/profile/friends/leaderboard/leaderboard-controls.tsx
src/app/(app)/profile/programme/changes.tsx
src/components/food/food-days.tsx
src/components/coaching/activity.tsx
src/components/coaching/saved-work.tsx
src/components/coaching/creation-page.tsx
src/components/coaching/builder-page.tsx
src/components/coaching/program-builder.tsx
src/components/coaching/draft-page.tsx
src/components/coaching/draft-preview.tsx
src/components/coaching/job-page.tsx
src/components/coaching/job-status.tsx
src/components/coaching/routines.tsx
src/components/person-card.tsx
src/components/person-row.tsx
src/components/people-search.tsx
src/components/follow-button.tsx
src/components/compare-header.tsx
src/components/friends-board-card.tsx
src/components/confirm-sheet.tsx
src/components/ui/segmented-control.tsx
src/components/ui/sheet.tsx
src/components/ui/app-link.tsx
src/lib/navigation-history.ts
src/lib/navigation-history.test.ts
src/lib/offline-submit.ts
src/domain/occurrences.ts
src/server/repositories/occurrences.ts
src/server/repositories/nutrition.ts
src/server/repositories/follows.ts
src/server/repositories/people.ts
src/server/repositories/shared-stats.ts
src/server/repositories/sport-preferences.ts
src/server/repositories/coach-tokens.ts
src/server/repositories/coach-intakes.ts
src/server/repositories/coaching-state.ts
src/server/repositories/coach-attachments.ts
src/server/queries/leaderboard.ts
src/server/queries/head-to-head.ts
src/server/queries/request-profile.ts
src/server/queries/onboarding-entry.ts
src/server/actions/nutrition.ts
src/server/actions/follows.ts
src/server/actions/people.ts
src/server/actions/profile.ts
src/server/actions/privacy.ts
src/server/actions/sport-preferences.ts
src/server/actions/coach-tokens.ts
src/server/actions/onboarding.ts
src/server/coach-tidy.ts
src/db/client.ts
src/db/with-user.ts
src/db/types.ts
src/db/test/pglite.ts
src/db/schema/nutrition.ts
src/db/migrations/0019_usernames_and_privacy.sql
src/db/migrations/0020_follows.sql
src/db/migrations/0021_shared_stats.sql
src/db/migrations/0028_multisport_sharing.sql
src/server/repositories/nutrition.test.ts
src/app/(app)/profile/programme/changes-loader.test.ts
```

Focused reads, explicitly not a claim of complete review of these large modules:

- `src/server/repositories/programs.ts`: `readProgramBlueprint` and `getActiveProgram`.
- `src/server/repositories/schedule.ts`: `getProgramOverview` and its statement dependencies.
- `src/server/repositories/program-drafts.ts`: imports, copy/archive/validation paths,
  `getProgramDraft`, `listProgramDrafts`, and start of close path.
- `src/server/repositories/coaching-jobs.ts`: imports, `getCoachJob`, `listCoachJobs`, enqueue
  interface, `athleteReviewStatus` and request-review preconditions.
- `src/server/repositories/coach-proposals.ts`: open-proposal read and policy context.
- `src/server/actions/coaching-workflow.ts`: mutation wrapper, intake save/confirmation,
  questions, request review, waiting-job start, attachment removal, draft save/review/activation.
- `src/components/coaching/intake-form.tsx`: imports, state, autosave and action/network paths,
  step/track selection and first shared render helpers. The remaining question markup was
  not needed to establish any implemented fix.
- `src/server/repositories/shared-stats.test.ts`: setup, head-to-head and leaderboard test
  dependencies around the added same-transaction regression.
- `src/domain/program-diff.ts`, `src/domain/program-change-summary.ts`: summary contracts and
  comparison context; neither was changed by this sub-review.
- `src/app/(app)/exercises/[exerciseId]/page.tsx`: the other `loadCircle` consumer's data-loading
  portion; full exercise-route audit belongs to the primary-page review.
- `src/server/repositories/activity-templates.ts`: listing/count query and revision reader.
- `src/server/repositories/activity-templates.test.ts`, `src/server/repositories/occurrences.test.ts`:
  new count equivalence/RLS tests and fixtures; `src/db/schema/activities.ts`: occurrence uniqueness.
- `src/app/(app)/progress/progress-view.tsx`, `src/app/(app)/progress/history/history-view.tsx`,
  and `history-view.test.tsx`: existing native-history and URL-synchronized selection patterns.

References read for the current framework and existing decisions: installed Next.js 16.3.4
fetching-data, `loading.js`, lazy-loading and linking-and-navigating native-history guides;
ADRs 0012, 0030, 0032 (tabs before tap);
the September 11 performance audit; relevant sections of the September 25 DB round-trip audit;
and the September 25 Food audit. The old reports are contextual evidence, not current test runs.

## Limits

This sub-review covers the page entry points above and their relevant data-loading and interaction
paths. It is not a claim that every transitive UI primitive, every coaching worker write path,
every generated migration snapshot or every existing test was manually reviewed line by line.
The main audit covers shell, authentication, primary training pages and client bundle evidence.
No current-production query plans, live data volumes, deployed route p95s, browser waterfalls or
physical-device timings were available to this sub-review. No index is declared missing merely
from a query's appearance; verify plans and representative row counts before proposing one.
