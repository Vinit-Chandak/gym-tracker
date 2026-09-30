# Client and navigation performance review — 30 September 2026

This review covers shared browser code, navigation, loading, asset delivery and refreshes. It
complements the server/repository review. Confirmed unnecessary work was removed without
changing the one-minute tab freshness policy, server validation, offline drafts or action
invalidation. Production request measurements are recorded in the main audit; the bundle
measurements below compare existing local production output with this branch's fresh production
build, not a production browser trace.

## Confirmed issues addressed

### Programme screens imported validators just to render text

- `src/components/coaching/request-list.tsx:10` and
  `src/components/coaching/change-detail.tsx:13` imported `PLAN_LIMITS` through
  `domain/session-plan.ts`, which initializes Zod schemas. They now import the existing
  `domain/plan-limits.ts` directly. The constant itself is unchanged.
- `src/components/coaching/draft-preview.tsx:16` imported `exerciseTargets` from
  `domain/program-diff.ts`, which imports and initializes the programme blueprint validator.
  The unchanged formatter now lives in `src/domain/exercise-targets.ts`. `program-diff.ts`
  imports and reexports it, preserving existing callers and server validation.
- A TypeScript-transpiled runtime-import scan across all non-test `src/**/*.ts(x)` files
  followed local static imports/exports, omitted type-only imports and stopped at server
  action modules. Before the formatter extraction, the only remaining browser paths to Zod
  were DraftPreview through program-diff and CoachIntakeForm through coaching-workflow.
  Intake actually parses and validates its form in the browser, so that dependency stays.

Existing `.next-audit` build `KxjyYndR29Ohkf4LZf1t2` contained a shared validator chunk
`static/chunks/2gdfn-o9f259q.js`: **382,296 raw bytes; 87,641 gzip bytes**. It appeared in
Programme, Programme history, Programme drafts and creation, including the corresponding
onboarding routes. The five main tabs did not include that chunk. Removing the two accidental
imports is therefore targeted at specific secondary routes, not a claim that all pages lose
87 KB. Fresh build `4vCG-1qwT77UUK0jK2iz2` contains no Zod signature in the Programme, history
or draft route entry chunks; creation retains its validator. The reductions below include
changed chunk grouping as well as the removed dependency.

| Route entry                      | Existing artifact gzip bytes | Fresh build gzip bytes | Difference |
| -------------------------------- | ---------------------------: | ---------------------: | ---------: |
| `/profile/programme`             |                      151,207 |                 62,019 |    −89,188 |
| `/profile/programme/history`     |                      148,356 |                 59,168 |    −89,188 |
| `/profile/programme/drafts/[id]` |                      153,350 |                 61,872 |    −91,478 |
| `/profile/programme/create`      |                      158,111 |                156,465 |     −1,646 |
| `/today`                         |                       61,296 |                 61,266 |        −30 |
| `/progress`                      |                       68,378 |                 68,378 |          0 |
| `/training`                      |                       52,347 |                 52,347 |          0 |
| `/food`                          |                       60,461 |                 60,461 |          0 |
| `/profile`                       |                       55,878 |                 55,878 |          0 |

Method: execute each generated client-reference manifest in a fresh Node VM, deduplicate its
`entryJSFiles`, then sum local file sizes and individual gzip sizes. These are route entry
assets, including shared entries listed by the manifest. They exclude bootstrap files not in
the manifest, CSS, HTML/RSC, delayed chunks and HTTP headers. Shared files are counted once
within a route, but appear in more than one row. The existing build is a dated local baseline,
not proof of the current deployment's exact bytes. The baseline was already on disk when this
review started; it was not rebuilt from this branch's base commit during this turn, and no
available source-commit metadata was verified for it. Import-path inspection and removal of
the identifiable validator chunk independently support the cause, while the exact deltas are
artifact-to-artifact measurements. Its one compiled stylesheet is 58,070 raw bytes / 12,163
gzip bytes. No percentage reduction in production page latency is inferred from these bytes.

### Successful actions requested the page twice

Five client completion handlers called `router.refresh()` after a successful server action
had already called `revalidatePath` for the displayed route:

| Client handler                                                   | Server invalidation retained                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `components/coaching/programme-tools.tsx`, archive               | `actions/coaching-workflow.ts:231–232`, Today and Programme        |
| `components/coaching/request-list.tsx`, answer/withdraw          | `actions/coaching-workflow.ts:398–411`, AI coach and Programme     |
| `app/(app)/profile/programme/request-review.tsx`, request review | `actions/coaching-workflow.ts:179–180`, Programme and AI coach     |
| `app/(app)/today/coach-actions.tsx`, start waiting job           | `actions/coaching-workflow.ts:206–207`, Today and Programme        |
| `app/(app)/today/gym-switcher.tsx`, default/workflow gym change  | `actions/gyms.ts:13–17` and `actions/coach.ts:129`, Today included |

Only these redundant client refreshes were removed. Success still clears local forms/closes
the sheet where it did before; errors stay visible and unsuccessful answers remain editable.
The workflow gym switch's already-selected-gym path closes the sheet without a database write
or an otherwise pointless refresh. Programme copy still navigates to the copied draft.

The installed Next 16.3.4 `revalidatePath` reference says a server function immediately updates
the UI when the affected path is being viewed. The mutation response therefore supplies the
authoritative new render. The avoidable request is confirmed by caller/action code and framework
semantics; this sub-review has not measured its production millisecond savings.

## Existing protections worth retaining

- The app shell is synchronous and streams account checks and the active session behind
  separate Suspense boundaries (`src/app/(app)/layout.tsx`). The session strip can arrive after
  page content. Making the whole layout await the session would introduce a shared waterfall.
- Main navigation deliberately fully prefetches five destinations (`bottom-nav.tsx:64`), with
  `experimental.staleTimes.static = 60` (`next.config.ts:22`). ADR 0032 established that policy
  after measuring loading-boundary delay. Changing it requires current signed-in navigation
  evidence and an explicit freshness/traffic decision.
- `AppLink` intent mode disables viewport prefetch and warms on pointer/touch intent for long
  lists. Existing ADR evidence says this avoided a request burst. Do not indiscriminately
  replace these links with full viewport prefetch.
- `FreshAfterSets` deliberately revalidates copies older than the browser's saved set stamp.
  Removing it or weakening its invalidation would show obsolete counts/actions after a save.
- CoachPending already pauses refreshes while hidden/offline and refreshes on return. Food's
  rollover does so as well. Error retry and explicit status checks are user actions, not
  duplicate mutation refreshes.
- Progress switches its local views with browser history state and mounts only the selected
  section. Its body map already loads dynamically. The exercise-series and body-week controls
  still perform route requests; separating their server reads is a distinct server task.
- Today's plan/occurrence views render on the server and pass compact action props to client
  controls. The workout keeps exercise selection in `window.history`, so opening its logger
  does not fetch the session again. Set rows patch authoritative action results through
  `recordSetChange`; completion/fallback actions retain their server refresh behavior.
- The exercise library filters locally with `useMemo` and intent-prefetched rows. There is no
  request on each search keystroke. It renders all matching rows; profiling a large real
  catalogue should precede introducing virtualization or changing search semantics.
- Fonts are system fonts; this source has no external font download or remote-image waterfall.
  Icons use individual context-free Phosphor imports and pure factory annotations. This review
  found no basis for replacing the icon system or adding an image optimizer for page content.
- The service worker caches only public assets/offline help; private HTML, RSC and actions use
  the network. Stable icon URLs already refresh online, addressing the older audit's stale-icon
  concern. Adding private page caching would change freshness/offline/privacy behavior.

## Remaining opportunities, not established causes of production page latency

| Priority | Evidence                                                                                                                                                                                                  | Follow-up and decision boundary                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2       | `components/coaching/job-status.tsx:42–58` refreshes the whole job route at 5/10/20/40/60-second intervals. It checks visibility but not connectivity, and has no online/visibility-return event refresh. | Match CoachPending's offline/return handling with timer tests; measure whether a narrow status read would avoid meaningful route work. Replacing page refresh with an endpoint needs a response/state design. |
| P2       | Full tab prefetch reads several routes after startup and after global router invalidation. Whether this competes with a tap on today's production network is not measured here.                           | Capture authenticated mobile request waterfalls on cold load, warm tab switch, >60-second idle switch and one mutation. Preserve the accepted freshness window until evidence supports a different policy.    |
| P3       | `public/sw.js:7` retains a permanent `overload-assets-v3` cache, and immutable asset writes have no retention bound.                                                                                      | Old builds can accumulate; choose a retention strategy that preserves already-open old tabs before changing it. This is storage maintenance, not a measured latency root cause.                               |
| P3       | `components/shell/rest-timer.tsx:60` ticks and reads localStorage each second for every mounted timer, even when no countdown is visible.                                                                 | An event/deadline-based subscription could avoid idle work; no long-task or CPU profile demonstrates user-visible delay from it. Preserve cross-tab updates and blocked-storage fallback if changed.          |

Two additional browser CPU avenues need profiling. `use-set-rows.ts` persists every typed
draft immediately, which notifies `use-session-drafts.ts`; its snapshot calls
`lib/workout-drafts.ts:170`, enumerating storage keys and parsing this session's drafts. That
preserves unsaved input and must not be debounced blindly. A session-scoped cached draft count
could avoid repeated scans while keeping synchronous persistence and cross-tab invalidation.
`lib/exercise-search.ts:109` reparses the query and tokenizes exercise fields once per exercise
per keypress. Precomputed query/field tokens could reduce that CPU work while preserving ranks.
Neither has measured input latency in this review, so both remain lower-priority candidates.

No proposal in this review increases tab TTL, adds private server caching, changes how often
coach results appear, removes validation, changes the nav design or expands background traffic.
Those would need the user's decision rather than being described as behavior-preserving fixes.

## Verification

Eight targeted suites passed, **64 tests**: request-list, change-detail, program-diff-view,
coach-actions, refresh-scope, program-diff, program-change-summary and client-boundary. Existing
answer-key reuse and coach polling tests stay active. Added coverage confirms rejected answers
retain typed text, successful withdrawal clears the displayed error, and these completions do
not issue a second client refresh. ESLint passed for all eleven changed source/test files;
Prettier passed for the same files. The parent-coordinated production build passed, and the
entry-byte measurements above were repeated against that fresh build. Project-wide checks are
reported by the parent review.

## Read coverage and limits

Full manual reads for this sub-review:

- `AGENTS.md`, `package.json`, `next.config.ts`;
- prior `docs/performance-audit.md`, ADR 0030 and ADR 0032 (tabs);
- root and authenticated app layouts, `app/globals.css`, both `styles/form` stylesheets;
- shared shell `bottom-nav`, `back-link`, `session-status`, `session-chrome`, `rest-timer`,
  `pwa-provider`, `connectivity`, `navigation-feedback`, `appearance-sync`, `loading-page`;
- `components/ui/app-link.tsx`, `icons.tsx`, `sheet.tsx`, `components/fresh-after-sets.tsx`;
- `public/sw.js`, `app/(app)/food/day-rollover.tsx`, Progress view and section selector;
- Programme page, `request-review`, Today `gym-switcher` and `coach-actions`;
- Today `today-view`, `plan-actions`, `components/coach-plan`, `planned-exercises`, and
  `activities/today-activities`;
- workout `workout-view`, `workout-overview`, `exercise-logger`, `use-set-rows`,
  `session-details`, `components/use-session-drafts`, `components/set-changes`, and
  `lib/workout-drafts`;
- exercise-library view and `lib/exercise-search`;
- coaching `programme-tools`, `request-list`, `change-detail`, `draft-preview`, `job-status`,
  `client-action`;
- server action modules `coaching-workflow`, `gyms`, `coach`;
- `domain/program-diff.ts`, `domain/program-change-summary.ts`, `domain/plan-limits.ts`,
  `lib/labels.ts` and the newly extracted formatter;
- existing `request-list.test.tsx`, `coach-actions.test.tsx`, `refresh-scope.test.ts`,
  `client-boundary.test.ts` and Vitest configuration.

Targeted partial reads: IntakeForm's imports, initialization, draft/save behavior and beginning
of submit; program-diff-view's imports/render helpers; session-plan's imports/initial schema
definitions; coach-program-requests' answer/withdraw implementations; change-detail and
program-diff test fixtures. These are not claimed as whole-file manual reviews.

Structural scans covered source refresh/timer/prefetch/lazy-import/font/image patterns and
all static runtime import edges. Existing client manifests for all generated route entries
were inspected programmatically. A static import graph cannot prove bundle behavior for every
conditional/dynamic import, so generated bytes are reported separately.

Installed Next documentation consulted: app guides `prefetching`, `optimizing-prefetching`,
`lazy-loading`; references `loading`, `revalidatePath`, `staleTimes`. The optimizing-prefetching
guide assumes Cache Components/Partial Prefetching, which this project's config does not enable;
its default-shell behavior was not assumed for this app. No database, environment file or
private production record was read by this sub-review, and no browser benchmark is claimed.
