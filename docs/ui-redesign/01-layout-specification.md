# Layout and interaction specification

This specification applies to the selected Form design, in light and dark mode. It records the user's latest correction: all actual set values are independent. The approved visual direction is retained while the logging layout changes.

## 1. Information hierarchy

A screen has one title, one context line when useful, a clear primary action and the content needed for the current task. Use dividers and alignment to group ordinary rows. Reserve filled panels for a distinct decision, summary or form section; do not put a card around every label and value.

Each fact has a primary home:

| Fact                                     | Primary location                                  | Elsewhere                                                                            |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Active gym                               | Workout overview context or session details       | Equipment picker can describe available machines; exercise logger omits the gym name |
| Programme, cycle and day                 | Today/plan context and workout overview           | Absent from ad hoc workout screens                                                   |
| Rep/duration prescription and target RIR | One exercise prescription line                    | Only a genuinely different per-set prescription is annotated locally                 |
| Actual load, reps/duration and RIR       | The corresponding set row                         | Historical values appear in History, not a duplicate current-set summary             |
| Machine and load unit                    | Exercise context and column heading respectively  | A machine change shows the decision where it is made                                 |
| Active session status                    | Resume strip on destinations outside that session | Omitted on the active workout overview and logger                                    |
| Validation or save failure               | Affected field/row/form                           | Do not repeat the same error in a toast and a banner                                 |
| Filter selection                         | Filter control or compact collapsed summary       | Do not list the same filter chips above and below the list                           |

Repeated values in different set records are necessary data. For example, four rows can each contain `60`, `5`, `2`; they must not be merged into shared exercise values. Remove repeated explanatory labels instead.

## 2. Responsive frame and spacing

The production app uses the actual browser width; the desktop phone outline and prototype direction/scene controls are not product UI.

| Constraint                      | Intended behaviour                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 320–359 CSS px                  | 12 px page gutters; small gaps; compact rows; no horizontal page scrolling                                                                                 |
| 360–429 CSS px                  | Gutters and gaps grow smoothly; inputs retain the same hierarchy                                                                                           |
| 430–480 CSS px                  | Cap routine gutters near 20 px; allow more breathing room rather than oversized numeric inputs                                                             |
| Larger windows                  | Centre the phone-oriented flow in a readable column; preserve useful existing wide-screen navigation without making the logger a stretched desktop table   |
| Long names                      | Wrap exercise, gym and machine names; keep trailing actions in a reserved column                                                                           |
| Text zoom / accessibility sizes | Permit additional row height and, when necessary, a labelled two-line set layout; never hide values, disable zoom or reduce font size to preserve one line |
| Keyboard open                   | Keep the active field and its error visible; navigation/timer must not cover it; avoid scripted scroll on every keystroke                                  |
| Safe areas                      | Use the actual top/bottom/side insets for installed mode and browser mode; reserve space for fixed chrome                                                  |

Use spacing tokens, not independently chosen margins per screen. Starting values are 4, 6, 8, 12, 16, 20 and 24 px, with fluid page/section spacing between those bounds. Normal controls have a minimum 44 px target. Numeric fields keep at least 16 px editable text, body copy approximately 14–16 px and supporting labels 12–14 px. Do not scale the whole interface with transforms. Do not reserve tall blank panels for collapsed content.

Lists have content-driven height. A collapsed disclosure occupies only its summary row. Opening a filter or exercise selector uses a short sheet when it fits; long catalogues and forms use a full-height view with one primary scroll region. No nested catalogue scrolling inside a scrolling sheet inside a page.

## 3. App shell and navigation

Keep Today, Runs, History, Progress, Gyms and Settings directly available. At 320 px, six equal destinations still allow about 53 px of width each. Keep the labels concise; do not hide Progress in a “More” menu to simplify the shell.

Use native links for route navigation and native buttons for local actions. The active route has one clear accent treatment. Pending navigation responds on the tapped destination; the old screen stays useful until the next shell/content is ready. Keyboard focus follows navigation deliberately and returns to the invoking control after a sheet closes.

An active workout appears in one compact resume strip when viewing another destination or a historical workout. It names the active workout and offers Resume. It does not expand into another exercise list or repeat gym/programme information. Hide it on that active workout's screens.

The workout remains active while browsing exercise history, editing gym equipment, logging a run or visiting Settings. Prevent a second active workout using the existing server rule, even across two browser tabs. Offer Resume when a start request meets that rule.

Keep one rest timer above the bottom navigation when enabled. It must not create a second resume bar. Reserve its actual height, including wrapped content at larger text sizes. Stop/+30 seconds remain available. The timer deadline belongs to the session and survives route changes; only the displayed seconds tick.

## 4. Today and starting a session

Order: page title, training location, today's plan or current workout, primary start/resume action, full planned exercise list, alternate actions. Programme details are a disclosure after the useful session content.

- Before starting, gym selection remains available. Once a session starts, show its fixed gym in that session's context.
- Starting a planned day leads to the existing optional check-in, then the full workout list. Skip check-in remains obvious.
- Choose another day shows every programme day with its status and prescription; it does not force the calendar suggestion.
- Ad hoc start uses the chosen gym and optional check-in. The new session starts with an empty exercise list and Add exercise as the primary action.
- Rest days show their mobility/recovery instructions and completion action; lifting and ad hoc options remain reachable.
- No programme means a useful ad hoc entry point plus programme adoption. Do not display blank cycle/day fields or a fabricated recommended workout.
- Programme completion gets its own next-step state. Keep history and ad hoc entry available.
- Keep planned-day skipping, reason entry, empty-session discard and mobility completion. A logged session must not inherit the empty-session discard action.

## 5. Check-in

Keep sleep hours, sleep quality, energy, fatigue, soreness, back pain and both shin readings. Optional means blank remains unknown, not zero. Use small grouped fields with labels; put the primary continue action after the fields and keep Skip visible.

Recovery guidance uses existing domain rules. A warning can explain why to hold loads and offer the current hold action; it must not become an unrequested new training recommendation engine. The saved check-in is reachable through session details without repeating all eight readings on the workout overview.

## 6. Workout overview

Order: workout name and one context line, session details/finish actions, compact warm-up disclosure, complete exercise list, Add exercise and Superset.

Each exercise row shows order, full name, a concise set-progress/state line and Start/Resume/Done/Skipped. Include a machine name only when it distinguishes the choice. One row can have a status and saved-set count; do not repeat those in additional badges. Show all exercises in document flow, including supersets and completed exercises.

Tapping any row opens its logger. Returning restores list position. No fixed exercise sequence, horizontal exercise carousel, “+ remaining exercises” panel or expansion that leaves an unused card-sized gap. The exercise detail offers All exercises as the direct return path.

Warm-up is a checklist of the existing drills, doses and cues with its completion action. The overview shows its state once. Session details holds notes, programme context, check-in and other session-level information. Finish opens a review; it is not a hidden destructive action.

### Supersets

Open Superset to select two or more exercises from this session. Show selected names and the explicit current-workout scope. Existing programme groups initialise the session's group presentation. Grouping adds a modest group label/rule around existing rows; it does not duplicate the rows in a separate superset panel.

Allow editing/removing the grouping while preserving every exercise and set. Completing one exercise does not force a jump to the next. A grouping change cannot silently reassign recorded sets, substitute an exercise or modify the programme. Validate that all members belong to the same unfinished workout and that group membership is unambiguous. The persistence dependency is described in the implementation plan.

## 7. Exercise logger: corrected set row

Order: All exercises, exercise title, Log/Technique/History tabs, one prescription line, relevant machine context, set grid, add/complete actions. Equipment problems appear before the grid if they prevent meaningful logging. Keep secondary progression explanations behind a disclosure.

The old “Shared values,” “Override any set,” exercise-wide load/RIR steppers and “Working sets · tap a set number for options” paragraph are removed. Set options remain discoverable through a visibly marked identity/options button with an accessible name.

Illustrative layout, with independently entered values:

| Set/options | Load · kg | Reps | RIR | Save  |
| ----------- | --------- | ---- | --- | ----- |
| 1 ···       | 60        | 5    | 2   | Saved |
| 2 ···       | 62.5      | 4    | 1   | Save  |
| 3 ···       | 60        | 5    | 2.5 | Save  |
| 4 ···       | 57.5      | 6    | —   | Save  |

The four main cells—load, reps, RIR and save—share one horizontal row with a compact leading set identity. The labels and unit appear once in the grid header, while every control has its own accessible name, such as “Set 2 load, kilograms.” A narrow rep field has comparable visual weight to the load/RIR fields; it never consumes the full row.

At a 320 px viewport with 12 px gutters, 296 px remain. A starting grid reserves 44 px for identity/options and 44 px for save, with four 6 px gaps; the remaining 184 px are shared between load, reps and RIR. Minimum widths of 64, 52 and 44 px fit without shrinking text. Grow those three fields with available space; cap the logging column rather than inflating it indefinitely. This is a layout budget to verify with actual fonts, not a licence to clip the maximum supported numbers.

### Field behaviour

- Load, reps/duration and RIR each update only that row. Editing one set must never change any sibling row, including rows with identical values.
- Retain the existing number sanitisation, decimal input, limits and equipment increments. RIR supports the current nullable decimal value. Do not replace it with an integer-only control.
- Preserve row-specific progression/history prefills. A ghost suggestion is visibly unconfirmed; save can resolve it using the current `effective` behaviour only if clearly presented as the value that will be saved. Never show a blank row as already recorded. If no valid rep/duration entry or suggestion exists, show a row-level error and retain input.
- Preserve both direct keypad entry and the current increase/decrease capability. Keep steppers in the set-edit sheet or a focused-field control area, not three permanent two-storey controls in each row. This retains the feature without oversized boxes.
- The set identity/options action opens set type, full-width numeric editing/steppers and deletion. Keep warm-up, working, backoff, drop, AMRAP and failure types. Non-default type is marked once beside the set identity.
- Duration exercises replace Reps with Seconds, not an additional column. Preserve the existing duration/reps validation and any per-side prescription.
- Bodyweight load means added external weight; zero is meaningful. Respect kg, lb, plate count, stack index and no-load units. Do not invent numeric conversion between machine units.
- Missing RIR remains unknown unless the user accepts a visible, row-specific suggestion. An explicitly cleared RIR must save as unknown, never zero or an automatically restored target. Zero load, zero reps and zero RIR follow the existing accepted domain rules rather than HTML truthiness checks.
- Saving immediately marks only that row as pending. The saved mark appears after server acknowledgement; a failed save retains its draft and an explicit retry. Other exercises and tabs stay usable.
- Saved rows show their exact values. An edit becomes dirty; cancelling restores the server-saved row. Double tapping Save must not create duplicate sets.
- Validate after a save attempt or a completed edit, not with an alarming message as soon as a blank row appears. Place an error below the affected row without shifting other columns out of alignment.

Keep add/save/edit/delete, complete/reopen/skip, skip reasons, comparable-history context, regression guidance, load-hold decisions, draft restoration and conflict review. Finishing remains blocked while applicable set drafts need resolution. A change of exercise or machine must use the existing draft-safety rules.

## 8. Exercise selection and substitution

Show search first, followed by grouped exercise results with concise muscle/equipment context. Search exercise name, muscle and equipment using the existing catalogue and user exercises; the prototype's seed count is not a production limit. Keep empty, loading, unavailable and no-match states distinct.

Selection leads to a machine decision only when needed. A single applicable machine need not create a redundant picker. Keep preferred machine, alternate available machine, register equipment, substitute, remember gym fallback and absent-equipment flows. Do not treat an unavailable exercise as excluded globally.

Returning from registration or substitution restores the requesting workout/exercise. A sheet closes on explicit selection/cancel and restores focus. Long catalogues use a full-height search view; do not pre-render the entire equipment catalogue in every set row.

## 9. Finish, history and active-session continuity

Finish review presents completed/logged and untouched exercises, unresolved drafts and optional session notes/body weight. Keep the existing validation and completion rules; completion is acknowledged by the server before showing success.

Completed workouts show read-only actual set rows, exercise context, notes and check-in. They are visually distinct from an active logger. A separate active workout's Resume strip remains available; viewing history never replaces the active-session identity.

History provides the merged workout/run/recovery timeline and existing date, activity, gym, exercise and dependent-machine filters. Put the date range in the header area and detailed filters in one disclosure/sheet. Keep clear/reset available. Preserve filter state and position after opening an entry. Use the same actual-set representation in workout history, without editable controls.

## 10. Runs

Runs begins with the current/prior week comparison and primary Log a run action, then programme targets and history. Keep existing workload/shin-pattern messages near the data that motivates them. Do not add decorative metrics beyond the current feature set.

The run form retains date/time, outdoor/treadmill mode, distance, minutes/seconds, calculated pace, optional planned-run link, RPE, six shin readings (left/right before/during/after) and notes. Keep units once per field/group. Optional detailed readings may be disclosed, but their labels and validation must remain reachable. A form error opens the section containing the invalid field.

Unplanned runs remain first-class when there is no programme or when the user selects Unplanned. Editing preserves an existing programme link; the current run's link is not treated as already taken. Keep view, edit, delete and confirmation behaviours. Run entry must not stop the active lifting workout.

## 11. Progress

One date range governs the current view where applicable; Body retains its weekly navigation. Always expose Overview, Strength, Running, Recovery and Body. At narrow widths, use wrapping equal-width tabs or two deliberate rows with stable order; do not clip tabs or shrink their labels to fit.

| Tab      | Required content and controls                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview | Workout/run/active-day counts, programme adherence where applicable, weekly lifting/running activity                                                                          |
| Strength | Explicit exercise selector; separate machine selector when multiple comparable series exist; load, reps, volume, RIR, e1RM; latest/change; muscle selection and weekly volume |
| Running  | Distance, duration, pace and distinct outdoor/treadmill pace context                                                                                                          |
| Recovery | Sleep, back, left-shin and right-shin observations with gaps for missing entries                                                                                              |
| Body     | Week navigation, front/back, muscle selection, weighted volume bands and accessible muscle table                                                                              |

Keep the real body-map component in implementation. A labelled placeholder was permitted for mockups, not removal of that app feature. Load its code only for Body, preserve the table alternative and selected-muscle state. Do not redraw a new anatomical asset for this planning task.

Keep existing analytics semantics, units and comparable-machine rules. Splitting the current grouped series selector into exercise and machine controls must preserve the underlying selected series ID. Avoid suggesting that loads from different machines are directly comparable. Date changes update both totals and plots. Empty data is not zero; a missing recovery observation breaks the line.

Charts fit their container, retain legible labels and provide View values. Colours are semantic theme tokens with labels/patterns, not the current hard-coded dark-only chart colours. Mount only the selected tab's expensive visual subtree; keep selected filters outside it.

## 12. Gyms, equipment, programme fit and library

| Workflow                    | Layout and feature requirements                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gym list/detail             | Active/default gym clearly identified; add/edit/archive/restore; gym/home/outdoor types; address and notes; equipment and programme fit reachable  |
| Equipment add/edit          | Catalogue type, resistance mode, unit, minimum increment, manufacturer/model, angle, pulley ratio and notes; defaults remain editable              |
| Equipment lifecycle         | Active/archived views, availability changes and removal behaviour; archived equipment is not silently selected for new logging                     |
| Programme fit               | Direct/fallback/unknown/unavailable counts and filters; day usage; matching machine; absent equipment and fallback add/remove                      |
| Exercise library            | Search/grouping, excluded exercises, details, cues/links, defaults, movement and muscle metadata, portability, programme usage, recent performance |
| Per-gym exercise preference | Availability, preferred machine and fallback choices in their gym context; do not duplicate the whole gym header inside every option               |

Use compact list rows for navigation and labelled forms for editing. Rare equipment metadata can use an Additional details disclosure. Existing values are visible in edit mode, and validation must not remain hidden inside a collapsed section. Restore draft selection/search when returning from a detail page.

## 13. Settings, account, onboarding and system states

Settings groups Profile, Training, Appearance, Access and App. Keep all existing profile/timezone/units/body-weight fields, programme adoption/replacement and start date, rest-timer preference, install guidance, password, sign-out and account-deletion flow. Appearance adds System/Light/Dark. Form is the product design, so there is no separate style selector.

Coach access retains token name/expiry, one-time secret display, copy/hide and revoke. Never place a secret in a persistent resume strip, URL or general preference store. Keep authentication and account-setup forms, password recovery and their errors. The app shell must not expose protected data before the account gate resolves.

Onboarding retains profile, gym, searchable equipment selection and programme choice; selected equipment remains selected after search/filter changes. Back navigation preserves entered values. Existing-account and incomplete-onboarding routes keep their current access rules.

Loading skeletons match the destination geometry, especially title, tabs and list rows. Delayed navigation exposes retry; a disabled control alone is not feedback. Offline guidance distinguishes local drafts from server-saved sets. Preserve restored drafts, changed-elsewhere conflicts, storage failure, generic error/retry and not-found states. Do not present a saved badge when a network request failed.

## 14. Visual and interaction acceptance

For Form in both colour modes: exercise rows do not expand into empty space; no clipped tab or set cell at 320/360/390/430/480 px; readable 200% text; no repeated session gym in the logger; independent per-set values; every main destination works during a workout; focus and drafts survive ordinary navigation; forms work using keyboard, touch and screen reader.

Verify the initial server-rendered screen becomes interactive after hydration. Test direct URL entry, in-app links and installed-PWA launch, not only client-side navigation. Design-review annotation controls must not intercept production interactions or appear in the shipped app.
