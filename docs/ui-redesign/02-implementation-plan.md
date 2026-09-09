# Implementation and delivery plan

Implement Form with light/dark appearance in small, reviewable phases. The current app is the behavioural baseline. The mockup informs hierarchy and visual treatment; its fixture store and DOM renderer are not an implementation starting point.

This is a plan, not approval to perform its future code changes in the planning commit.

## 1. Current code and intended responsibility

Paths are relative to the repository root. The baseline is `c61024b` on `main`; recheck the relevant source before each implementation phase, including the installed Next.js guides required by `AGENTS.md`.

| Existing source                                                                                                         | What to preserve / planned change                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`, `src/app/globals.css`                                                                             | Server-rendered document, safe areas, zoom support and system fonts; replace the fixed dark appearance with Form tokens and consistent first-paint mode |
| `src/app/(app)/layout.tsx`                                                                                              | Streaming shell and account gate; introduce a small session-status boundary without moving authenticated data outside the gate                          |
| `src/components/shell/bottom-nav.tsx`, `navigation-feedback.tsx`, `src/components/ui/app-link.tsx`                      | Six destinations, active/pending state and typed Next links; restyle without removing loading feedback or creating duplicate progress overlays          |
| `src/components/ui/`                                                                                                    | Existing buttons, fields, sheets, lists, segmented controls, charts and body map; adapt shared primitives before individual screens                     |
| `src/app/(app)/today/`                                                                                                  | Suggested day, location, alternate days, rest/no-programme/complete states, check-in/start/resume/skip flows                                            |
| `src/app/(app)/workouts/[sessionId]/page.tsx`, `view-model.ts`                                                          | Session data preparation, guidance, availability and read-only history; keep a concise serializable view model                                          |
| `src/app/(app)/workouts/[sessionId]/session-view.tsx`                                                                   | Split the large client view into overview, logger, set row and contextual views while preserving existing row/save/draft semantics                      |
| `src/components/ui/number-field.tsx`, `src/domain/sets.ts`                                                              | Sanitisation, limits, ghost values, equipment step sizes; introduce compact inline numeric presentation plus full editing/steppers in set options       |
| `src/lib/workout-drafts.ts`, `src/components/use-session-drafts.ts`                                                     | Account/session/exercise/equipment-scoped drafts, cross-tab notices and changed-elsewhere safeguards                                                    |
| `src/app/(app)/workouts/[sessionId]/rest-timer.tsx`                                                                     | Deadline-based timer and user preference; mount one session-aware timer in the authenticated shell so it can appear across destinations                 |
| `src/server/actions/sessions.ts`                                                                                        | Authoritative start/log/edit/delete/complete/skip/finish checks, validation and save ordering; no optimistic success before acknowledgement             |
| `src/db/schema/workouts.ts`, `programs.ts`                                                                              | Per-set actual values already exist; session-only supersets need an additive persistence design because grouping currently lives on programme exercises |
| `src/app/(app)/workouts/[sessionId]/add-exercise/`, `exercises/[workoutExerciseId]/substitute/`, `check-in/`, `finish/` | Preserve every support flow while simplifying placement and return paths                                                                                |
| `src/app/(app)/runs/`, `history/`                                                                                       | Existing create/edit/delete, planned-run linkage, merged history and filters                                                                            |
| `src/app/(app)/progress/page.tsx`, `progress-view.tsx`                                                                  | Server aggregates/series and five tabs; improve exercise/machine selection, isolate chart rendering and theme the plots                                 |
| `src/app/(app)/gyms/`, `exercises/`                                                                                     | Catalogue search, detailed fields, lifecycle actions, preferences, substitutions and programme fit                                                      |
| `src/app/(app)/settings/`, `src/components/profile-fields.tsx`                                                          | Profile, programme, rest preference, coach access and account workflows; add appearance settings                                                        |
| `src/app/(auth)/`, `src/app/(onboarding)/welcome/`, `src/app/auth/confirm/`                                             | Preserve authentication, confirmation and onboarding behaviour, including validation and redirects                                                      |
| `src/components/shell/connectivity.tsx`, `public/sw.js`, `public/offline.html`                                          | Offline guidance and immutable-asset caching; do not imply that private server data or mutations are fully available offline                            |
| `src/app/manifest.ts`, `src/lib/app.ts`                                                                                 | PWA launch and browser chrome; remove assumptions that every app surface is always dark                                                                 |

The recent latency work in [decision 0012](../decisions/0012-latency-round-trips-and-caches.md) is part of the starting point. Preserve its request/profile/reference caches, invalidation, batched reads and database ordering. Do not add another profile or session fetch per leaf component merely to populate a redesigned header.

## 2. Component boundaries

Keep routes/layouts as Server Components by default. Fetch protected data in the existing server layer. Pass only the required view model to interactive boundaries. The installed [Server and Client Components guide](../../node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md) explains why a broad client boundary pulls imported modules into the browser bundle; do not convert the root layout to a client component for appearance.

Proposed responsibilities, with names illustrative rather than a mandatory new folder hierarchy:

| Boundary                | Responsibility                                                                    | Explicit exclusions                                         |
| ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Form theme tokens       | Colour, typography, density, radii, motion values                                 | No data, routes or JavaScript styling runtime               |
| Appearance control      | Apply System/Light/Dark, persist small preference and update browser theme colour | No fetch, route refresh or workout remount                  |
| Active-session status   | Session identity, resume target and timer deadline                                | No entire exercise catalogue/history payload in every route |
| Workout overview        | Full exercise list, grouping and status                                           | No permanently mounted logger for every exercise            |
| Exercise logger         | One selected exercise, Log/Technique/History and context                          | No programme-wide data copied into each row                 |
| Set row                 | Independent numeric draft, pending/error/saved state                              | No exercise-wide load or RIR state                          |
| Set options             | Type, full numeric editing/steppers, delete                                       | No silently applied changes to other sets                   |
| Exercise picker         | Search and decision flow scoped to its caller                                     | No catalogue bundle on initial workout load                 |
| Progress controls       | Date/tab/exercise/machine/metric selection                                        | No chart re-render on a rest-timer tick                     |
| Progress plot/body view | Selected visualization and accessible values                                      | No simultaneous mounting of all five tabs                   |

Reuse the current Lucide icon library through explicit imports. Keep labels for primary destinations. Reuse domain calculations for pace, progression, availability and muscle volume; a redesign must not fork them into UI-only versions.

## 3. State ownership and navigation

| State                                       | Owner / lifetime                                           | Navigation requirement                                                             |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Saved workouts, sets, runs and account data | Server, user-scoped                                        | Server remains authoritative after return/refresh                                  |
| Active session identity                     | Server plus small authenticated-shell client snapshot      | One active session across tabs; refresh on known mutation or explicit revalidation |
| In-progress set values                      | Row-local memory, backed by existing scoped draft storage  | Restore after exercise/tab navigation or refresh; no keystroke network writes      |
| Selected exercise/view                      | Session route/search state, not set array index alone      | Back/deep link returns to a valid session exercise; preserve list position         |
| Rest deadline                               | Session-scoped store and small local persistence           | Continue through tab switches/backgrounding; compute from current time             |
| History/Progress filters                    | URL where useful, with local transient edit state          | Back restores selection; changing filters does not lose a workout draft            |
| Sheet visibility                            | Local UI state                                             | Close restores focus to invoker                                                    |
| Form appearance                             | Document attribute plus small validated browser preference | Persist before reload; mode changes never key/remount content                      |

A compact active-session store is proposed only for continuity that crosses routes. Do not move every page's server data or every controlled input into global context. Use stable identifiers; a rendered row index is not a record identity.

### Drafts and saves

Keep a local string while a number is being edited, including partial decimal input. Validate and resolve any accepted row-specific ghost at the save boundary. Track untouched suggestions separately from explicitly cleared values; a deliberate clear of an optional field must remain null rather than silently restoring its suggestion. Preserve the current server limits: maximum load 2000, reps 1000, RIR 10 and duration 36,000 seconds, with the current nullability, zero and integer/decimal rules. If product rules change, make that a separate reviewed domain change.

Persist only the affected draft entry. Measure synchronous storage work; coalesce writes when it causes typing delays, with a bounded flush on blur/navigation/page hide and visible handling of storage failure. Do not move personal drafts into a shared HTTP or service-worker cache.

A save has a submitted snapshot, not a moving reference to whatever the user is currently typing. On acknowledgement, clear only the draft matching that snapshot. Preserve a newer edit made while the request was in flight. On failure, retain values and allow retry; report a conflict when the saved base changed elsewhere. Keep existing draft guards for substitution, exercise completion and session finish.

### Session-only supersets

This requested addition is more than visual rearrangement. The reviewed schema has `program_exercises.supersetGroup`; workout exercises do not yet have a session-local equivalent. The implementation phase must establish an additive workout-level grouping representation.

Proposed contract: an unfinished workout owns group identifiers and ordered member exercise IDs. Initialise from planned groupings at session creation or through a compatible read fallback for existing sessions. Any edited grouping overrides only that workout. A group has at least two distinct members; a member belongs to that workout and at most one group. Removing a group removes membership, not exercises or sets. Substitution keeps the workout-exercise identity or explicitly remaps membership in the same transaction. Completed history must retain the grouping that applied to the session.

Use the existing account/RLS and session-locking discipline. Repeated grouping requests must not duplicate groups. The storage and migration design is an implementation dependency, not a migration included in this documentation commit. No feature may be labelled “session-only” while actually writing programme templates.

## 4. Delivery phases

### Phase 0 — establish a baseline and feature checklist

Record production-build timings and bundle sizes on the agreed phone/browser matrix before changes. Inventory each route, validation path and draft rule against the layout specification. Capture current screenshots, active-session navigation, a successful/failed set save and offline return. Confirm supported devices, session-group persistence and device-local appearance semantics.

Exit: every existing feature maps to a destination; baseline measurements are stored with build/device/network details. Choosing Form and rejecting shared set values are already settled decisions.

### Phase 1 — themes and shared primitives

Integrate the supplied tokens behind a development/rollout gate. Map the existing Tailwind semantic names to the Form variables, then restyle Button, Input, Select, Sheet, LinkRow, PageHeader and navigation. Add System/Light/Dark with first-paint mode handling. Theme errors, loading, offline, focus, native form controls, browser chrome, charts and body-map states as well as the happy path.

Exit: both modes load correctly before hydration, toggle without reload or layout shift, and pass token contrast and control-size checks. The old and new appearances must not mix randomly on unconverted routes.

### Phase 2 — shell, Today and session continuity

Introduce the single resume strip and shell timer. Preserve the streaming account gate and typed navigation feedback. Rework Today and check-in using the approved hierarchy. Keep active-session lookup compact and avoid duplicating its backend round trips on every navigation.

Exit: start/resume, choose another day, ad hoc, rest, no-programme and completed-programme states work. Visiting every destination preserves the same active session. Refresh and second-tab start attempts respect the existing server invariant.

### Phase 3 — workout overview and per-set logging

Build the full exercise list and focused logger. Replace oversized numeric groups with the compact row while retaining domain sanitisation and full editing/steppers. Carry over all set types, timed/bodyweight/machine units, suggestions, complete/reopen/skip and draft conflict handling. Add session-level superset storage/actions/UI as a separately reviewable dependency within this phase.

Exit: mixed loads, reps and RIR across sets survive save/edit/reload. Shared values do not exist. Users can open any exercise, create/remove a superset without changing the programme, and browse other tabs without losing drafts. Saved/failed/pending states remain honest under delayed and reordered responses.

### Phase 4 — support flows and finish

Convert exercise search, equipment decision, substitution, register-machine return, warm-up, check-in edit, finish review and completed-workout detail. Keep session context out of repeated row chrome. Preserve the existing permission and draft rules for each action.

Exit: an entire planned or ad hoc workout can be completed without leaving the redesign. No hidden old UI is required to recover from unavailable equipment or a draft conflict.

### Phase 5 — Runs, History and Progress

Convert run logging/edit/delete and merged history. Implement explicit exercise/machine selection while preserving series IDs and comparable-unit rules. Split visual code by selected Progress section, theme chart/body-map states, preserve filters and render missing observations accurately.

Exit: all five Progress tabs are reachable, body map and table both work, filters change real results, a run can be logged while lifting remains active, and history shows the exact saved per-set values.

### Phase 6 — administration and account surfaces

Convert gyms/equipment, programme fit/fallbacks, exercise library/preferences, settings/profile/programme/coach access, authentication and onboarding. Keep archive/restore/delete distinctions and existing sensitive-action confirmations. Remove prototype-only controls and fixture assumptions.

Exit: the route inventory has no uncovered feature or inert action. Appearance remains consistent on login, offline and error screens as well as authenticated pages.

### Phase 7 — performance and release

Run the matrix in the performance document on a production build. Fix measured regressions, especially input latency, navigation, first-paint mode, chart mounting and keyboard occlusion. Use a temporary development/rollout flag that does not duplicate the app's whole client tree. Remove dead styling only after coverage is complete.

Release criteria: feature parity, accessibility, both colour modes, migration compatibility and performance targets all pass. Roll back the visual gate if needed while keeping additive session-group data readable. Do not revert the backend latency work as part of a visual rollback.

## 5. Verification scenarios that matter

| Scenario                | Required evidence                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Independent values      | Set 1 `60/5/2`, set 2 `62.5/4/1`, edit only set 2; set 1 remains exact before and after reload                                            |
| Identical actual values | Four equal rows still show four independently editable records; one header carries labels/units                                           |
| Numeric edge cases      | Decimal load/RIR, blank optional RIR, zero external load, highest allowed values, pasted comma decimals, timed sets and invalid entries   |
| Delayed save            | Pending feedback is immediate, other rows/navigation work, newer edits survive the earlier acknowledgement                                |
| Draft restoration       | Refresh, tab switch, offline error, account change, equipment change and changed-elsewhere conflict preserve the correct scope            |
| Navigation              | All six destinations plus historical workouts remain usable during one active workout; Resume restores the right session                  |
| Supersets               | Create/edit/remove, substitution, completed member, invalid cross-session membership, concurrent request and unchanged programme template |
| Responsive layout       | 320/360/390/430/480 px, long names, maximum numbers, 200% text, landscape fallback, keyboard and safe areas                               |
| Theme                   | System/manual overrides, reload, slow hydration, storage failure, OS change, PWA resume and no content remount                            |
| Feature inventory       | Every workflow in the layout specification, including empty/loading/offline/error states and the full Progress selector/body map          |

Use existing unit tests for domain rules. Add focused interaction/integration tests for new boundaries and real end-to-end flows for routing and hydration. A raw HTML/mockup click test is insufficient evidence that Next.js server HTML hydrates or that embedded review controls do not intercept clicks. Run the repository's required checks and production build for future application changes; this planning-only commit needs document and theme validation, not an unrelated application test rewrite.
