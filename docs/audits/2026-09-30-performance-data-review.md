# Page data performance review — 30 September 2026

This review covers Today, Progress/History, Training, workouts, exercises and gyms on
`codex/page-performance-audit`, created from `main`. It follows the current read paths rather
than treating the older audits as a description of the current code. Every one of the 31 page
entry files listed below was read completely. Helper coverage and remaining limits are
recorded separately; this is not a claim that every file in the repository was line-reviewed.

## Changes implemented

| Page     | Removed work                                                                                                     | Behavior preserved                                                                                                                                                        | Evidence                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Training | Loading and hydrating complete templates and all standalone occurrence history solely to display two counts      | Active templates with a readable current revision; standalone pending work on or after the account's local today, excluding logged work and programme work; no result cap | `src/app/(app)/training/page.tsx:45`; `src/server/repositories/activity-templates.ts:77`; `src/server/repositories/occurrences.ts:210` |
| Progress | A duplicate daily-recovery read whose derived recovery output the page did not consume                           | The page continues to display `readRecoveryHistory`, including its workout check-ins; other `readTrainingData` callers retain recovery by default                         | `src/app/(app)/progress/page.tsx:82`; `src/server/repositories/training-data.ts:335`                                                   |
| Progress | The overall distinct-day/activity-count query from `readActivityTotals` when only per-sport totals are displayed | Complete per-sport aggregation, inclusive date boundaries, unknown versus zero, and the existing full totals API for other callers                                        | `src/app/(app)/progress/page.tsx:86`; `src/server/repositories/activity-analytics.ts:118`, `:174`                                      |

The Progress changes remove two SQL statements from an uncached page read. The Training
changes reduce database result rows and transferred data, sorting and JavaScript hydration;
they do not reduce its statement count. No production latency percentage is claimed from
these code changes alone. Count queries still have to evaluate their matching rows in
Postgres; the benefit is avoiding the complete objects and all irrelevant history in the app.

The new count queries retain the list queries' owner joins and run through the existing RLS
transaction. In particular, a template or occurrence without a readable current revision is
excluded, and any linked activity resolves a standalone occurrence exactly as before. The
original list readers are unchanged for pages that need the rows.

Validation completed for this part of the change:

- Prettier passed for the ten changed source/test files.
- Four repository test files passed, 50 tests total, using the PGlite harness with real
  migrations and RLS. The focused Vitest run reported 83.19 seconds.
- Added regressions compare the new counts to the previous list-derived results; cover
  archived/missing-revision templates, past/today/future occurrences, logged/skipped/cancelled/
  legacy-completed work, programme exclusion and a different authenticated caller.
- Per-sport totals are compared with the full totals reader, including boundary dates,
  swimming distance derived from lengths, unknown distance and RLS.
- Omitting daily recovery is compared with the default training read and with all analytics
  fields Progress actually consumes. Default callers still receive their recovery data.

Focused command:

```text
node node_modules/vitest/vitest.mjs run src/server/repositories/activity-templates.test.ts src/server/repositories/occurrences.test.ts src/server/repositories/training-data.test.ts src/server/repositories/activity-analytics.test.ts --maxWorkers=2
```

The parent review coordinates the complete build and suite; those results are not asserted
by this focused report.

## Remaining avenues, ordered by expected relevance

The ranks below reflect concrete avoidable work and how it grows with history. They are not
measured production speedups. A two-millisecond trip and a large JSON result are different
costs; both statement counts and bytes/CPU should be measured.

### 1. Give the exercise chart a reader scoped to the selected exercise

**Routes:** `/exercises/[exerciseId]`.

The page asks `readWorkouts` for sessions containing the selected exercise
(`src/app/(app)/exercises/[exerciseId]/page.tsx:117`). In the reader, `exerciseId` restricts
which sessions match using `exists` (`training-data.ts:44`), but the following slot and set
queries retrieve every exercise and every set in each matching session (`:87`–`:132`).
`performanceSeries` then discards the other exercises in JavaScript
(`src/domain/analytics.ts:80`), after the database has returned them.

A chart-specific reader, or an explicit additional projection option, could retain the
current selection of at most 500 matching sessions and read only matching exercise slots and
their sets. This reduces transferred records as workouts acquire more exercises; it need not
change the visible chart or add a cache. Do not silently redefine the existing `exerciseId`
filter to mean a partial session: `readWorkouts` also serves whole-session calculations and
shared statistics.

Validate old/new chart values, machine and unit grouping, completion/date rules, empty
sessions, null equipment, set ordering and truncation before/at/after the existing 500-session
boundary. RLS must continue to protect both the parent session and its rows. Benchmark an
exercise present in many workouts containing many other exercises.

### 2. Stop rebuilding unrelated Progress sections for a week or series selection

**Routes:** `/progress?week=…`, `/progress?series=…`.

Stepping the body-map week or selecting an exercise series uses `router.replace`
(`src/app/(app)/progress/progress-view.tsx:139`–`:150`). Every such navigation repeats training,
muscle-volume, body-weight, sport-total and recovery reads, then recomputes the page analytics
(`progress/page.tsx:77`–`:103`). Only one series crosses the wire, but all series and their five
metric arrays are first built (`src/domain/analytics.ts:69`–`:124`, `progress/page.tsx:105`).

The first candidate is to compute the options list and selected exercise series separately,
so only the selected series receives full metric arrays. That can preserve the existing URL
and payload contract. A larger improvement is to give the body week and selected chart
independent data boundaries, so changing one reads only its data.

**Decision needed for the larger change:** whether the unchanged sections stay visible while
the changed section loads, and whether changing a selection should also refresh all other
Progress sections as it does today. Preserve Back/Forward, shareable URLs, invalid-selection
fallbacks and `FreshAfterSets` correctness. Sending every series to the browser would restore
the payload problem already fixed in the old audit and should be measured before considering
that tradeoff. Changing section and chart metric within the current view already uses local
state/history; those controls do not have this server-navigation issue. The body-map module is
already dynamically imported.

### 3. Use a narrower session reader for Finish and Substitute

**Routes:** `/workouts/[sessionId]/finish`,
`/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute`.

Both request `getSessionDetail` with `includeGuidance: false` (`finish/page.tsx:37`,
`substitute/page.tsx:30`). This suppresses guidance/history/coach work, but the reader still
reads a profile if options omit it, loads the day's warmup, reads load ladders, applies
progression rules and assembles full slots (`src/server/repositories/sessions.ts:465`, `:513`,
`:534`, `:584`, `:599`). `loadLadders` includes an all-history distinct-load query for the
selected equipment (`src/server/repositories/load-ladders.ts:19`–`:51`).

Finish needs completion state and the set summary, so its set read is legitimate. Substitute
needs the selected slot's identity and state, plus the exercise picker. Dedicated result
types for these two screens would make the unused work explicit. The add-exercise and check-in
pages already demonstrate the smaller `getSessionRecord` path.

Preserve the existing not-found/finished redirects, selected-slot ownership checks, Finish's
unit/body-weight display and set-change freshness. Tests should compare the values each
screen consumes and verify that unavailable guidance inputs cannot alter these screens. The
full logger still needs its ladders, rules and warmup; making those globally optional without
auditing consumers would be unsafe.

### 4. Trim the exercise library's client data

**Route:** `/exercises`.

The page passes `listExercises` to the client (`src/app/(app)/exercises/page.tsx:17`, `:25`).
`ExerciseListItem` includes default prescription ranges, rests, RIR and other defaults
(`src/server/repositories/exercises.ts:18`–`:67`). The library displays identity, name, muscle,
modality, portability and active status; its search also needs slug, category, movement
pattern and secondary muscles (`exercises/exercise-library.tsx`, `src/lib/exercise-search.ts`).
The default prescription fields are used by exercise pickers elsewhere, not by this library.

Introduce a library-specific projection while leaving picker data intact. Measure compressed
RSC bytes and parse/hydration cost using the complete shared library plus custom exercises.
The library already uses intent prefetching, so the old viewport-prefetch burst is not an
outstanding issue here. The shared/custom merge also uses repeated `findIndex`/`splice`
(`exercises.ts:79`–`:84`); optimize that only if large custom libraries make it measurable.

### 5. Remove small duplicate reads on Today and Choose a day

**Routes:** `/today`, `/today/choose`.

- Choose a day calls `getTodayPlan`, which reads suggested-day exercises, and then calls
  `listExercisesByDay` for every lifting day. It uses the latter and does not consume the
  first exercise list (`today/choose/page.tsx:34`–`:35`, `schedule.ts:560`). An explicit
  `includeSuggestedExercises` option, or a plan-metadata reader, could remove one statement
  when a suggested lifting day exists. Today itself consumes that list and must retain it.
- Today calls `withPreparedTargets` separately for standalone and programme occurrences
  (`today/page.tsx:99`–`:100`). Each nonempty group queries active plans
  (`coach-plans.ts:1781`, `:1809`). Preparing the combined list once and partitioning afterward
  can remove one statement when both groups are nonempty. Keep ordering and IDs intact.
- Today/Choose/History use only a subset of `listGyms`, while the common reader returns whole
  gym rows and a correlated equipment count (`gyms.ts:12`–`:26`). A lightweight picker reader
  avoids counts where unused. Gym list/detail pages that show them must keep them.
- In the newer coach-workflow path, Today replaces pending/failure/request-limit state from
  `todayCoachState` with job state after the former has already read legacy requests
  (`coaching-today.ts`, `coach-plans.ts:2234`). A plan-only reader could avoid that legacy work,
  but this overlaps the coaching review and needs a complete field-by-field contract check.

These are small per-render opportunities. At the historical same-region database round trip,
they are unlikely to explain a long visible wait individually. They do reduce repeated work
when complete tab prefetches are regenerated.

### 6. Bound growth on schedule/template pages without changing what counts

**Routes:** `/training/scheduled`, `/training/programme`, `/training/templates`.

`standaloneSchedule` reads all standalone occurrence history and full current prescriptions
(`occurrences.ts:198`), and the Scheduled page then drops earlier entries that were not logged
(`training/scheduled/page.tsx:75`). Pushing this already-existing visibility rule into a
page-specific query can avoid reading hidden earlier work. Upcoming items and visible history
remain unbounded; paginating those would require an interface decision.

The Programme page reads the full schedule to obtain its active family and programme name
(`training/programme/page.tsx:55`), then all occurrences for that family (`occurrences.ts:245`).
A small active-programme header reader would avoid unused day/event data. The full occurrence
list supports the page's whole-block view and adherence summaries; reducing it requires
separate complete aggregates and explicit pagination/filter semantics, not an arbitrary cap.

The Templates page loads complete saved routine JSON but displays only the name and exercise
count (`training/templates/page.tsx:35`, `:84`; `manual-training.ts:74`). A routine summary
query can avoid transferring those prescriptions. Endurance templates do use their
prescriptions to render the description, so merely dropping all prescription fields is not
equivalent.

**Decision needed for future pagination:** whether each screen should keep all visible history
and local filtering immediately available, or load additional pages on demand. Preserve
complete totals and clear truncation indicators in either design.

## Reads that are already improved, or need measurement before changing

- History already uses an aggregate workout reader instead of fetching every workout's raw
  sets (`src/server/repositories/history.ts:17`). Runs and workouts retain their existing
  500-record caps; cycling/swimming use a 100-item page and expose `nextCursor` as a truncation
  notice (`progress/history/page.tsx:70`, `:164`). Its filters operate on the loaded client
  records. Smaller caps would change visible history, and server filtering would change the
  immediate local-filter behavior. Neither is a behavior-preserving fix by itself.
- Today already reuses its schedule and gym data for coach targeting. `getSchedule` already
  folds its related schedule data into a single query. Recommending the older, already-fixed
  duplicated reads would be misleading.
- Gym detail supplies already-read gym/equipment/absence data to `gymAvailability`. Its
  server `GymDetails` component needs availability summaries; the complete availability
  result is not automatically a browser payload. More SQL consolidation here requires
  evidence that calculation, rather than another part of navigation, is material.
- The exercise page's bests/circle reads overlap the social-data review. Those functions were
  traced here, but changes and wider social-repository coverage belong to that review.
- `Promise.all` within `withUser` does not turn statements into parallel database round trips.
  The current pg client explicitly serializes queries on the transaction's connection
  (`src/db/client.ts:78`). Eliminating a query or reducing its rows is different from starting
  more promises. Moving reads to independent transactions adds setup work and changes the
  snapshot relationship; it needs a reason and concurrency/pool measurements.
- All reviewed page entries use read-only page transactions. The profile helper can still
  initialize a missing profile separately. Timed-out coach work is reconciled for display and
  tidied after the response. The old render-time athlete-lock problem is already addressed.
- These pages retain the tab prefetch and one-minute freshness decisions from ADR 0032. Do
  not exchange `revalidatePath` for `refresh()` on mutating actions without preserving the
  full-prefetch invalidation behavior that ADR documents.

## Measurement and acceptance plan

1. Measure the current branch and baseline with the same build mode, database fixture,
   authenticated account, region and device/network profile. Include empty, ordinary and
   large histories; templates plus substantial past standalone work; mixed-sport histories;
   and the 500-workout boundary. Keep account data private in output.
2. Record distinct scenarios: fresh navigation without a prefetched result, complete tab
   prefetch hit, navigation after a mutating action, post-set `FreshAfterSets`, and direct
   loads of detail/edit screens. Warm function and new-instance samples must be separate.
3. Capture page p50/p95 tap-to-content and TTFB, main/prefetch request counts, compressed RSC
   bytes, function time, database statement counts, database rows/bytes, query time and
   JavaScript aggregation/render time. Repeat enough samples to distinguish a few milliseconds
   from network noise. Existing `PERF_LOG` can help attribute transactions, but does not itself
   provide all of these metrics.
4. Use synthetic fixtures and read-only query plans for prospective SQL changes. Test RLS with
   another authenticated user; compare old/new page values, including null/unknown values,
   time zones, inclusive local-date ranges, machine units and truncation.
5. Verify browser transitions that preserve URL state and pending set data. Check tab changes,
   Back/Forward, saved sets, Finish, and selecting a different Progress week/series. A fast
   stale value is not a passing performance result.

The September 25 production audit is a historical sample, not proof of current route costs
for every account. Process uptime in a log is **not** measured cold-start duration. Attribute
an actual cold-start penalty using request/platform timing; do not subtract or relabel uptime
as latency. The parent review's current production measurements and complete build results
should accompany this report before assigning latency gains to the branch.

## Review coverage

### Complete page entry files

All entries below are relative to `src/app/(app)/`. No assigned page entry remains unread.

| Area      | Complete `page.tsx` files read                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today     | `today/page.tsx`; `today/choose/page.tsx`                                                                                                                                                                                                                                                                                                                                                                            |
| Progress  | `progress/page.tsx`; `progress/history/page.tsx`                                                                                                                                                                                                                                                                                                                                                                     |
| Training  | `training/page.tsx`; `training/new/page.tsx`; `training/schedule/page.tsx`; `training/scheduled/page.tsx`; `training/templates/page.tsx`; `training/templates/new/page.tsx`; `training/templates/[templateId]/edit/page.tsx`; `training/programme/page.tsx`; `training/programme/occurrences/[occurrenceId]/page.tsx`; `training/activities/[activityId]/page.tsx`; `training/activities/[activityId]/edit/page.tsx` |
| Workouts  | `workouts/[sessionId]/page.tsx`; `workouts/[sessionId]/finish/page.tsx`; `workouts/[sessionId]/check-in/page.tsx`; `workouts/[sessionId]/add-exercise/page.tsx`; `workouts/[sessionId]/exercises/[workoutExerciseId]/substitute/page.tsx`                                                                                                                                                                            |
| Exercises | `exercises/page.tsx`; `exercises/new/page.tsx`; `exercises/[exerciseId]/page.tsx`                                                                                                                                                                                                                                                                                                                                    |
| Gyms      | `gyms/page.tsx`; `gyms/new/page.tsx`; `gyms/[gymId]/page.tsx`; `gyms/[gymId]/edit/page.tsx`; `gyms/[gymId]/equipment/new/page.tsx`; `gyms/[gymId]/equipment/[equipmentId]/page.tsx`; `gyms/[gymId]/programme/page.tsx`; `gyms/[gymId]/programme/[exerciseId]/fallback/page.tsx`                                                                                                                                      |

### Complete supporting files read

- `src/server/repositories/`: `training-data.ts`, `history.ts`, `activity-analytics.ts`,
  `activity-templates.ts`, `muscle-volume.ts`, `recovery-history.ts`, `body-weight.ts`,
  `schedule.ts`, `exercises.ts`, `gyms.ts`, `equipment.ts`, `absent-equipment.ts`,
  `availability.ts`, `sport-preferences.ts`, `coaching-today.ts`, `load-ladders.ts`,
  `coaching-changes.ts`.
- `src/server/queries/`: `active-session.ts`, `reference.ts`, `request-profile.ts`,
  `comparable.ts`, `leaderboard.ts`.
- `src/server/coach-tidy.ts`; `src/server/validation/date-range.ts`.
- `src/db/client.ts`; `src/db/with-user.ts`; `src/db/test/pglite.ts`.
- `src/domain/analytics.ts`; `src/domain/occurrences.ts`; `src/lib/exercise-search.ts`.
- `src/app/(app)/progress/progress-view.tsx`;
  `src/app/(app)/progress/history/history-view.tsx`;
  `src/app/(app)/exercises/exercise-library.tsx`;
  `src/app/(app)/gyms/[gymId]/gym-details.tsx`.
- `package.json`; `AGENTS.md`.

### Targeted function/range review, not complete-file review

- `src/server/repositories/sessions.ts`: imports and session summaries; session detail types,
  `getSessionRecord` and the complete `getSessionDetail` implementation. Mutation bodies were
  not exhaustively reviewed in this data-loading pass.
- `src/server/repositories/occurrences.ts`: row shape/query/hydration and the direct occurrence,
  date, slot, standalone and programme read functions; `occurrencesById`; the new count helper.
  Mutation bodies were not exhaustively reviewed.
- `src/server/repositories/activities.ts`: `detailFor`, `toRecord`, `getActivity`, the detail
  path used by the assigned pages. The whole write/list repository was not reviewed.
- `src/server/repositories/coach-plans.ts`: `nextTrainingSlot`, `planningGym`,
  `activePlanForOccurrence`, `activePlansForOccurrences`, `withPreparedTargets`,
  `planForSession`, `startOfToday`, `todayCoachState`. Large planning/write sections are owned
  by the coaching review.
- `src/server/repositories/coaching-jobs.ts`: expiration/reconciliation display helpers,
  `settleCoachJobs`, and `sessionTarget`; not the complete lifecycle implementation.
- `src/server/repositories/manual-training.ts`: imports/types and `listSavedRoutines`.
- `src/server/repositories/shared-stats.ts`: `readSessionRecords`, `readExerciseBests` and
  their comparison helper; the social review owns the rest.
- `src/server/repositories/follows.ts`: imports and `listFollowing`;
  `src/server/repositories/people.ts`: imports and `getDirectoryProfile`.
- `src/db/schema/occurrences.ts`: schema relevant to revision joins and occurrence resolution.
- The four changed repository test files: relevant fixtures, existing nearby coverage and
  added regressions were read; the entire files were executed. Execution is not described
  as complete manual inspection of every test.

### Documentation consulted and limits

- Read `docs/performance-audit.md`,
  `docs/decisions/0030-fewer-round-trips-and-a-minute-on-the-tabs.md`, and
  `docs/decisions/0032-the-tabs-arrive-before-the-tap.md`. Consulted the relevant findings in
  `docs/audits/2026-09-25-db-round-trips.md`; the latter's entire long output was not all
  individually inspected.
- Before edits, consulted the installed Next documentation in
  `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`,
  `01-app/02-guides/prefetching.md`, and
  `01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`, using this installation's
  behavior rather than remembered defaults.
- Deep client-form/logger component review, shell/auth/network loading and other route areas
  are separate review scopes. This pass traced the server entry points and their direct read
  helpers; it does not claim exhaustive inspection of every transitive domain algorithm,
  mutation, migration, UI component, action or production query plan.
- No live database writes, production setting changes, deployment, or new cache policy were
  performed by this sub-review. No API credentials or account records are included here.

## Files changed by this sub-review

- `src/app/(app)/training/page.tsx`
- `src/app/(app)/progress/page.tsx`
- `src/server/repositories/activity-templates.ts`
- `src/server/repositories/activity-templates.test.ts`
- `src/server/repositories/occurrences.ts`
- `src/server/repositories/occurrences.test.ts`
- `src/server/repositories/training-data.ts`
- `src/server/repositories/training-data.test.ts`
- `src/server/repositories/activity-analytics.ts`
- `src/server/repositories/activity-analytics.test.ts`
- This report.
