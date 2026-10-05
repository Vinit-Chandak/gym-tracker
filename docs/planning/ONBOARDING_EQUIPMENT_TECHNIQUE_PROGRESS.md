# Onboarding, equipment and technique: implementation log

The working record of building [the plan](ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md), kept so another
session can resume. The plan and its owner decisions are the source of truth; this file says what
was built, the calls made where the plan left room, and what is next.

Branch: `claude/onboarding-equipment-technique`, cut from
`codex/onboarding-equipment-technique-proposal` with `main` (4f6a8b6) merged in on 4 October 2026.
Local only: Postgres 16 on 127.0.0.1 (`overload_audit`, seeded by `npm run audit:setup`;
`overload_audit_base` is an untouched copy of that baseline for migration rehearsals). Nothing here
has touched a hosted database, and nothing has been merged or deployed.

## Status

| Step | Scope                                                                                   | State       |
| ---- | --------------------------------------------------------------------------------------- | ----------- |
| 1    | Catalogue report, requirement model, basics, machine types, ADRs, atomic seed, tables   | done        |
| 2    | Resolver and every consumer, absence reconciliation, the coach's backup rule            | done        |
| 3    | Add several exercises (receipts) and pinned actions on Add machine                      | done        |
| 4    | Experience question, machine steps, combinations, workout confirmation                  | done        |
| 5    | Illustrations, guides, Technique, the coach's numbers in the header and list            | done        |
| 6    | Acceptance tests, screens, fresh review, draft PR                                       | done        |

## Calls made where the plan left room

- **Drafts.** Two gates, by kind of content:
  - Catalogue additions (new equipment types, exercises, combinations) carry `review: "draft"` in
    their manifest. `seedReferenceData(db, { drafts })` skips them (and anything pointing at them)
    unless `drafts` is true. The production deploy (`src/db/deploy.ts`) always passes `false`; the
    local seeder passes `true` only for a loopback database; tests pass `true`. A draft never
    reaches the production database, so no read path needs a filter.
  - Guides, demonstration links and illustrations carry a status in their own data, and are
    shown only where drafts are on: `next dev`, or `OVERLOAD_SHOW_DRAFTS=1` (a production build
    run against a local database). Draft guides and candidate links are also seeded only where
    catalogue drafts are (after the code review: signed-in clients can read those tables
    directly, so the app's filter alone left them readable in production). Drawings live in the
    code and are refused by their route. Approving one is a one-line change to its manifest
    entry (status, reviewer, date) and a deploy.
- **How to log** lives on the exercise (`exercises.log_note`), not in the guide: it is existing,
  already-shipped data that must show whether or not a reviewed guide exists. A guide's renderer
  shows it under "How to log".
- **Gym basics** (owner decision) as assumed types at `kind = gym`: barbell, EZ bar, dumbbells,
  plates, flat, adjustable and decline benches, the power rack, pull-up bar, dip station,
  back-extension bench, cable station, lat pulldown, seated cable row, 45° leg press, leg
  extension, seated leg curl and pec deck. Where a basic is a family ("a leg press", "a leg
  curl"), the variant the built-in programme uses is the assumed one; the others are offered
  through "A different one".
- **Requirement groups** are written in the exercise manifest's `equipment` list: a string is a
  one-type alternative, an array is a group used together whose first type is the primary
  (recorded on the workout and keyed for history). A corrected entry keeps its old list in
  `correction.was` with its class, which is what the catalogue report reads.

## Step 1: what landed

- Migration `0045_equipment_requirements_and_guides`: additive tables (`assumed_equipment_types`,
  `exercise_equipment_requirements`, `equipment_instance_types`, `equipment_combinations` and
  their types, `equipment_presets`, `exercise_guides`, `exercise_media`), new columns
  (`equipment_types.aliases|purpose|identification|family|illustration`,
  `exercises.aliases|log_note`, `profiles.training_experience`), the display-type trigger and the
  machine-types backfill. Rehearsed on a copy of the populated local audit database (286 machines,
  14,299 sets): every machine kept its type, no set changed.
- Manifests: `assumed-equipment.ts` (gym basics), `equipment-combinations.ts` (the plan's three),
  `equipment-presets.ts` (gym extras for beginners, home starter, outdoor set),
  `equipment-descriptions.ts` and `exercise-aliases.ts` (drafted by a subagent; "Gravitron"
  removed as a brand, "Multi-gym" removed as misleading), families in `equipment-types.ts`, and
  120 corrected requirement groups in `exercises.ts`, each with `correction.was` and its class.
- `seedReferenceData` runs in one transaction with the drafts gate; `scripts/catalogue-report.ts`
  writes `docs/planning/catalogue-report.md` (reproducible; deployed catalogue unverified).
- ADR 0004 amended; ADR 0041 records basics, the backup rule and machines with several types.

## Step 2: what landed

- **Resolver** (`src/domain/equipment-resolution.ts`): requirement groups, gym basics and machines
  with several types. Statuses stay `direct | fallback | unknown | unavailable`; a resolution now
  carries its `basis` (`confirmed`, `assumed` or `free`) and the assumed type ids, and
  `equipmentState` maps it to what the coach reads (`confirmed | assumed | unknown | absent |
  none`). Order: the preferred machine, then the planned exercise on confirmed equipment, then a
  gym-specific fallback the athlete added, then the planned exercise on assumed basics, then (only
  when the planned one is marked absent) the first available programme fallback, then unknown, then
  unavailable. `compatibleMachines` offers a machine only when one of its types is the primary of a
  group the gym can complete, so a bench is never a Smith hip thrust's machine and the assisted dip
  machine is no longer a plain dip's.
- **One context for every consumer** (`src/server/repositories/equipment-context.ts`): requirement
  groups, assumed types, combination types and each machine's types, read once from the reference
  cache. Gym availability, exercise availability, workout start and swaps
  (`sessions.ts`, `manual-training.ts`), the machine pickers (`machinesByExerciseAtGym`), the
  library and lookups the coach reads (`libraryAtGym`, `lookupExercises`), plan validation
  (`storePlan`, `validateBlueprintForAthlete`), the programme page, the gym page and the exercise
  page all resolve through it. The exercise page lists each way to do an exercise as types used
  together, and the library search matches aliases.
- **Absence reconciliation** (`absent-equipment.ts`, `equipment.ts`): registering a machine,
  restoring one or adding a type through Also used for clears that type's absence; marking a type
  missing while an active machine has it asks instead of recording (`AbsenceOutcome`).
- **Machines with several types**: `createEquipment(..., alsoTypeIds)` and
  `setMachineAlsoUsedFor`, which refuses to drop the machine's own type (`DisplayTypeError`).
- **The coach's backup rule** (ADR 0041) in `storePlan` and `backupRuleProblems` /
  `validateBlueprintForAthlete`: basics need no backup; an unconfirmed machine needs a slot backup
  available now; equipment marked not here is refused. `lookupExercises` and the library give the
  coach each exercise's equipment state, and `.claude/skills/coach/SKILL.md` states the rule.
- Tests: the resolver's unit tests rewritten for groups and basis, and
  `src/server/repositories/equipment-rules.test.ts` covers reconciliation, machine types,
  compatibility, the coach's states and the backup rule end to end on PGlite.

### Calls made in step 2

- Programme fallbacks no longer apply on their own for a machine nobody has confirmed: the workout
  asks (step 4) instead of silently swapping. They still apply when the planned equipment is marked
  not here. A fallback the athlete added for this gym answers for equipment that is unknown or
  marked not here, and never replaces an exercise that can be done, an assumed basic included (at
  first it won over an assumed basic; the first review reversed that, ADR 0004 point 6).
- The backup rule applies to every exercise a plan names, a kept programme slot included (at first
  a kept slot was exempt; the second review held that to the owner decision, which makes no
  exception, and `main` already refused a kept slot with targets on an unregistered machine).
- Custom free-weight exercises resolve by their modality (no user requirement rows are written).
- Home and outdoor locations assume nothing: an unanswered machine there is unknown (owner
  decision S2).

## Step 3: what landed

- **Add several exercises at once** (`add-exercise/add-exercises-form.tsx`, `addExercisesAction`,
  `addExercisesToSession`). The picker has a multiple mode whose rows are checkboxes (no name of
  their own); the selection lives in the form, in the order it was made, so it survives every
  search and every failed save. Each chosen row shows its place in the order. Pinned at the foot:
  "3 selected · Review", which opens the selection in a sheet to check or remove, and "Add 3".
  Add adds straight away unless several machines here can do an exercise and nobody has chosen;
  then a short sheet asks only those questions ("Which machine?"), each starting at "Machine not
  chosen". One machine is named, none is said ("Machine not chosen" or "No machine needed"), and
  the athlete's own "use this machine" choice is kept without asking. An exercise already in the
  workout says so and can still be added. Twenty at most.
- **Server**: the ordered lists are read with `getAll`; one `withUser` transaction holds the
  session lock, checks every exercise in one read and every machine against one compatibility
  read, and inserts contiguous places in one statement. One bad item refuses the batch. A single
  exercise is a batch of one (`addExerciseToSession` calls it).
- **Receipts**: migration `0046_workout_submission_receipts` (additive, re-runnable; rehearsed
  twice on the local copy) and `submitWorkoutOnce`, the food pattern of ADR 0032. A retry with the
  same key and payload adds nothing and still lands on the workout; the same key with another
  selection is refused; the key is minted once per visit.
- **After adding**: the workout lands with `?added=N`, says "Added Leg press and Leg curl." in a
  status line under the list (filled a tick after mounting, so it is announced), moves focus to the
  first added row, and drops the parameter from the address.
- **Add machine** pins its action (`EquipmentForm`, so Save changes on a machine's page too).
- **Forms keep their state after an action** (`useKeptForm`). React resets a form after its action
  while committing, with its own events off, so the `onReset={preventDefault}` pattern never ran:
  a failed save put controlled selects, radios and checkboxes back to their defaults on screen and
  in the next submit. Add exercise, Choose a fallback, the gym fallback form and Add machine now
  cancel the reset with a listener on the element. The profile and targets forms carry the same
  dead `onReset` and are left for a follow-up (outside this plan).
- Tests: the action end to end on PGlite (`add-exercises.test.ts`: order, machines, replay,
  conflict, intentional repeat, cross-gym machine, another account's exercise, duplicates, the
  limit, concurrent additions), and component tests for the picker in both modes, Add, Substitute,
  the gym fallback form, PinnedActions, Add machine and the added line.

### Calls made in step 3

- Substitute keeps its single choice; its empty machine option now reads "Machine not chosen" for
  an exercise that needs a machine instead of "Not on a machine" (copy only).
- The Add machine form keeps its native type select for now; the searchable, illustrated chooser
  comes with the machines step (step 4).
- Not verified: the owner's scrolling report on the deployed build on a physical phone, and the
  keyboard behaviour on iPhone and Android.

## Step 4: what landed

- **"Which sounds like you?"** on the first onboarding step ("I'm new to this", "I already
  train"), required and saved as `profiles.training_experience`. The coach's setup starts from it
  (the route is prefilled; Back still offers both), confirming the setup writes the chosen route
  back to the profile, and both coach contexts carry `athlete.experience`; the coach skill says not
  to ask again.
- **The machines step** (`welcome/equipment`), built from one pure function
  (`src/lib/machines-step.ts`) that the page, its preview and its tests share:
  - at a gym, the basics as one ruled line, "Usually here (18)" naming a few, whose Review opens
    them as picture tiles; unticking one records it as not here;
  - for somebody new, the preset's extras (12 today) as picture tiles with name and purpose,
    unticked; a family asks "Which chest press?" with its variants as pictures, and "Not sure"
    registers nothing; combinations ("Assisted dip and chin") are their own tiles;
  - for somebody who already trains, every other type and the combinations, grouped and searchable
    by name, local name or purpose, with ⓘ for the picture and the words that tell it apart; a
    shared name ("Roman chair") shows both candidates side by side;
  - at home, the starter set for beginners and the full list (free weights included) for everyone
    else; outdoors, the four-item calisthenics set for everyone; Browse all everywhere;
  - no Select all; a search never selects anything; the selection lives in a pinned "N chosen ·
    Review" row; revisiting shows what the place has, offers archived machines back as Restore,
    and says what is marked not here.
- **Saving the step** (`confirmStarterEquipment`, one transaction): equipment is identified by gym
  and type, never by name; an archived machine is restored; a combination is one machine with every
  type; confirmed types lose their absences; basics marked not here are recorded and the rest
  cleared; presence wins over a stale absence; resubmitting creates nothing.
- **In the workout** (`machine-decision.tsx`, `workout-confirmation.ts`): the Log tab's decision
  block now asks with the machine's picture. A gym basic nobody has confirmed: "Yes, it's here"
  (registered, named after its type, and put on the exercise before the first set), "Not here"
  (recorded; the fallbacks follow) and, for a family, "A different one" (the variant is registered,
  the assumed one marked not here, and the exercise moves to the same movement on it: a 45° leg
  press becomes the horizontal leg press). Any other unknown machine: "Available" (registered at
  once, the athlete stays), "Not here" and "Not sure" (no change; the picture and the options
  stay). "Not here" against a registered machine asks whether it has gone (archive it, history
  kept) or is out of use today (Substitute with Remember unticked); an exercise on a machine has
  "{Machine} not here" in More for the same. Several machines of one kind are each offered by name.
  Use a fallback, Add a fallback and Register with details remain.
- **"Also used for"** on a machine's page: its other types, each removable, and a picker to add
  one; adding clears that type's absence; the machine's own type cannot be removed there.
- **Drawings**: the pilot set is served as masks from a gated route (drafts only where drafts are
  shown); `DESIGN.md` records the illustration treatment and the tile and multi-select patterns;
  the Form v2 Machines and Welcome boards are regenerated without Select all.
- Tests: the step builder (including a 500-item catalogue), the step's component and repository
  tests, the decision block and its database flow, the experience question, the coach's prefill
  and copy back.

### Calls made in step 4

- The experience question is required on the first step, so the machines step and the coach can
  branch on it; an account that never answered (existing accounts) is treated as experienced by
  the machines step and asked by the coach as before.
- In the basics' Review, a ticked tile means "here" (the tick semantics the step already uses), so
  "a tap records one as not here" is an untick.
- "A different one" marks the assumed variant as not here: saying the one here is different is
  saying the assumed one is not. The exercise moves to the matching movement on the new variant
  only while nothing is logged.
- "Register machine" in the decision block reads "Register with details", since "Yes, it's here"
  and "Available" now register too.

## Step 5: what landed

- **Drawings.** After the pilot, set A (21 machines) and set C (38 free weights, bars, benches,
  racks and small equipment) were drawn to the pilot's spec by subagents, checked by
  `drawings.test.ts`, and registered in `EQUIPMENT_ART` as drafts. The leg press's sled and
  footplate and the hack squat's carriage and footplate lost the upholstery tone, which the spec
  keeps for pads. Set B (44: the remaining machines and cables, cardio, the draft types and the
  draft combinations) followed, drawn by four subagents in parallel. All 111 (every type but
  bodyweight, and every combination) are drafts; the drafters' doubts are listed under
  "Verification" below for the owner.
- **Guides.** 58 drafted guides in three batches (`src/db/seed/data/guides/batch-{a,b,c}.ts`),
  written for Overload and checked against ACE, NASM, ExRx, clinical and journal sources, each with a
  candidate YouTube demonstration (59 links: the pec deck fly has two) confirmed to exist through
  YouTube's oEmbed but not watched. They cover all 34 template exercises and fallbacks, the
  machines people meet first and the movements beginner programmes use. Every one is a draft and
  every video a candidate; the seed lays them down everywhere and only screens where drafts are
  shown display them. The catalogue report counts 58 drafts, 0 published and 218 honest gaps.
- **The data path**, chosen by measurement: the guide text comes with the workout page from the
  cached reader (`guidanceByExercise`), respecting `includeGuidance`, so Technique reads even if
  the connection drops mid-session. Measured on the local audit database with drafts shown:
  the template's Lower A (seven exercises, six with guides) is 20.5 KB of session data (5.7 KB
  gzipped), of which the guidance is 8.1 KB (2.7 KB gzipped); eight guides from the manifests
  come to 9.8 KB (3.2 KB gzipped). Reading on tab open would save that at the cost of a request
  and a retry state on a gym's connection, so the guide comes with the page.
- **One renderer** (`src/components/exercise-guide.tsx`, data from `src/lib/guidance.ts`) in the
  workout's Technique tab and on the library page: Setup, Steps, Cues, Common mistakes, How to
  log, then "Programme cue" in the workout, then "Watch demonstration" (opens YouTube) and "Open
  in the exercise library". "Guide not available yet." where there is none; a custom exercise
  shows "Your notes". The programme's target-load and progression notes and the substitution
  reason left Technique. The library page's "How to do it" adds where the guide was checked.
- **Today's targets.** `perSetLabel`, `prescriptionLabel`, `restText` and the new
  `restSecondsOf` and `countTargetLabel` (`logger-model.ts`) take every figure from one source:
  the coach's sets and rest when the coach planned the session (an exercise the coach added
  included), else the programme's, else the exercise's own defaults for an exercise added on the
  spot (now carried as `exercise.defaults`). The header, the workout list, the superset's "Then
  …" line, the entry's target hint and the rest timer all read them.
- Docs: the feature inventory's Technique entry, `DESIGN.md` (Guides; one source for figures).
- Tests: the renderer and `guidanceOf`, the session's guidance end to end with drafts on and off,
  the header helpers for coach-planned, programme-only and ad hoc exercises, the workout list,
  and the logger's header and Technique tab.

### Calls made in step 5

- A shared exercise's old form note and form link stay visible ("Notes", "Read a form guide")
  while no guide is shown for it, so production loses nothing it shows today while every guide
  waits for review; once a guide is visible it replaces them.
- Sources are listed in the library, not in the workout's Technique, which stays short.
- A draft guide or candidate video carries "Draft for review" wherever drafts are shown, so the
  owner can tell what awaits approval.
- The coach's per-side override is not yet carried into the workout, as before; per side still
  follows the slot.

## Verification (step 6)

- **The app, run locally**: Postgres on 127.0.0.1 (`overload_audit`, migrated and seeded by
  `node scripts/dev/audit.mjs setup`), the auth stub and `next dev`. Fixture accounts for the
  screens (`verify@local.test`: a gym with nothing confirmed and an ad hoc session; and
  `coached@local.test`: a coach-planned Lower A) were made by a scratch script through the
  repositories. Every new or changed screen was captured at 320, 360, 375, 402 and 440 px, light
  and dark, 100% and 200% text, with forced colours for the drawings' screens.
- **Found and fixed from the screens**:
  - the workout's machine question showed its picture full width (the session sheet's 6rem lost
    to the drawing's own rule, which loads later), pushing "Not here" under the entry: now 96 px
    beside the question, down to 320 pt and at 200% text;
  - a header fact wider than the line (a long prescription at 200% text on 320 pt) was cut off:
    it now wraps beside its glyph;
  - the coach's 200-second rest read "3.3 min": a rest off the half-minute now keeps its seconds
    ("3 min 20 s");
  - forced colours: ink surfaces (primary buttons, chosen tiles, picker picks, badges, the
    session strip) lost their text to the browser's backplate, and a drawing vanished on a chosen
    tile; those surfaces now keep their system colours and drawings follow the text colour.
- **Production build** (`node scripts/dev/audit.mjs build`, then `start`; no migration or seed):
  drafts stay hidden. Technique shows "Guide not available yet." with the exercise's old note and
  How to log, no "Draft for review", the workout's question has no picture, a draft drawing's
  URL is 404 and `/preview` is 404. No drawing is in a client chunk.
- **Bundle and payload against `main`** (both production builds on the same local database,
  signed in, first load, uncompressed JavaScript): the workout +10.2 KB (723.6 against
  713.4), an open exercise +10.0 KB, Add exercise +4.5 KB, the library +0.3 KB, Add machine
  +0.9 KB, Today unchanged. The workout's HTML, with its data, grew 13 KB (machine questions,
  defaults and guidance; drafts hidden). `main`'s build served every route against the migrated
  database, so the migrations hold for code that predates them.
- **The repository's browser audit** (`scripts/dev/audit-browser.mjs`, axe, horizontal
  overflow, console errors, destinations) on the 29 routes this work touches (gyms, exercises,
  workouts, onboarding), on Pixel 7 and at 320 px, against the production build: clean. WebKit
  was not run (the container's WebKit does not match the installed Playwright).

## Fresh-context review (step 6)

Three reviews of the branch at b4dec2d, each from a fresh context: a code review (the
`/code-review` skill, each claim then reproduced with throwaway PGlite tests), an impeccable
critique of the captured screens, and an accessibility audit (WCAG 2.2, web-design-guidelines and
the motion rules, run in Chromium against the app). What they found, and what became of it:

- **Code review, fixed** (each with a test that fails on the old code):
  - A fallback remembered at a gym replaced lifts that `main` always kept: barbell, dumbbell and
    bodyweight work, and machine basics, since an assumed basic no longer resolved `direct` before
    fallbacks were read; and the coach's targets for the planned lift then landed on the
    substitute. `main`'s Substitute ticks "Remember" by default, so many accounts have such
    fallbacks. Now an exercise that can be done resolves `direct` (a basic is here until someone
    says otherwise); a gym's own fallback answers only for equipment that is unknown or marked
    not here, the programme's only once it is marked not here. A machine basic is confirmed in the
    workout, and its Not here offers the fallbacks (recorded as point 6 of ADR 0004's amendment).
    `startPlannedSession` keeps a slot the coach
    kept with targets, never carries a machine named for one exercise onto another, and the
    coach's targets apply only while the row does the exercise they were written for.
  - A row already doing its slot's fallback resolved as a fallback to itself, so its decision
    block never cleared (and a machine basic reached that way was never asked about). The resolver
    now skips a fallback naming the exercise being resolved and no machine.
  - The opening plan's job check had lost `main`'s rule that machine work on a registered machine
    names it, while approving the plan still insisted (`storePlan` with `strict`): the job now
    refuses it, while the coach can still answer.
  - Migration 0045 let a signed-in client add requirement rows beside the shared ones, under the
    same unique keys, which the next seed would collide with and stop the deploy; and a machine's
    type rows checked only their own owner. Migration 0047 (additive) leaves the table to the
    seed and ties type rows to the machine's owner with a composite foreign key.
  - "Yes, it's here" after "It's gone: archive it" brought the gone machine back: the workout
    now never restores an archived machine (the gym screen does); one found there is a new machine
    with its own history.
  - Enter in a search box inside a form (a phone's Search key) submitted what had been picked so
    far: it now ends the typing, and puts the keyboard away on a touch screen.
  - Minor: a routine whose exercise left the library said its equipment was marked not here; it
    now says the exercise is gone. Draft guides and candidate links were readable through the
    Data API in production, though the app hid them: they are now seeded only where catalogue
    drafts are (a local database, tests), so production holds none.
- **Found while fixing**: the Save gate added for the critique's first finding (below) made the
  machine question's answers wait on a typed set while Save waited on the answer, a dead end. The
  answers now never wait on unsaved sets. And re-capturing the changed screens showed the sheet
  fix for unmounting (below) closing every sheet that mounts open under React's development
  double mount: the browser fires the close event later, as a task, after the sheet is back.
  The sheet now ignores the event of a close it made itself (a test runs it under StrictMode
  with the event delivered late; production never double mounts).
- **Critique and accessibility audit, fixed**: the machine question is one labelled group whose
  new question takes the focus, with what an answer did said aloud; Save waits on an open machine
  question before the first set and points at it; sheets that unmount return focus; Remove in a
  review sheet keeps the focus in the list (or on the search or Continue when it empties); counts
  are said inside open sheets; ticks are drawn only in ticked tiles (forced colours); Skip shows
  only when there is something to discard; a basic's About goes back to the basics' Review and
  can mark it not here; "chosen" became "selected"; aliases are lower case; variant tiles say how
  to tell them apart; "Is a hack squat available here?"; text buttons sit on the block's edge;
  search boxes say their result counts, end their placeholders in an ellipsis and switch off
  autocomplete and spell-check; numbered picks say their order; the 20-item limit is shown as
  well as said; external links say they leave the app; the library's guide has a caption head;
  the "Added …" announcement follows the focus move; the header's glyph names its kind; the
  "Also used for" tip sits beside its heading; Add waits, saying why, with nothing picked;
  "Register with details" opens on the type asked about; the pinned actions' ground runs under the
  session strip; a library default of 1.5 RIR reads "1–2 RIR"; headings no longer jump from h1 to
  h3 (the picker's groups, the experienced list); curly apostrophes.
- **Left for the owner**: the basics' Review sheet is a wall of ink tiles (a DESIGN.md amendment);
  rest notation mixes "2.5 min" with "3 min 20 s" (off the half-minute) and seconds for such
  ranges; the pinned stack takes about half of a 320-pt screen at 200% text; the drawings' own
  issues (in the PR). **Deferred**: the More button's name lists four of its five options
  (predates the branch; renaming it touches every logger test); "Also used for" Remove still drops
  the focus and has no undo (a server-action form; re-adding is one select away); disabled
  "Not possible here" options can't be reached with Tab (as on `main`); the full lists render
  unvirtualised (about 100 types, 289 exercises).

## Second review (step 6, after the draft PR)

A fresh review by another model of `4f6a8b6...8c2b2d0`, each finding reproduced with throwaway
tests on its side. All nine held up against the code and are fixed, each with a test here that
fails on the old code:

1. **A set typed before answering the machine question was stranded** (P1). Answering moved the
   exercise onto a machine, which changes where its unsaved rows are kept; the typed values
   vanished, and Finish then reported a draft nothing could reach. The answers now say where they
   put the exercise, its unsaved rows move there before the old key goes, and the exercise picks
   them up when they land, as the rows they were (no "restored" warning). "A different one" that
   changes the exercise carries them too: they were typed for the machine in front of the athlete.
2. **A chosen machine skipped the rest of its alternative.** A preferred or tied Smith machine
   made the Smith hip thrust available with the bench marked absent, and a fallback naming a
   barbell stayed usable with the rack absent. A chosen, tied or named machine (or a fallback's
   type) now leads its alternative, whose other types must still be there; a machine that leads
   none of an exercise's alternatives (an athlete's own tie, a custom exercise) is still taken on
   trust.
3. **An exercise already on its machine was never asked about the rest.** At home, a Smith machine
   on the exercise and nobody having said whether there is a bench left nothing to settle. Before
   the first set, an exercise on a machine is now resolved on that machine, and the workout asks
   about what its alternative still needs; Save does not wait on that question, which changes
   nothing recorded.
4. **The coach's backup check read only the fallback's exercise.** A fallback naming an archived
   machine, or a type marked absent, counted as a backup because its exercise was available some
   other way. Programme drafts, opening plans and session plans now judge each backup by the rule
   the workout's "Use" follows (`backupsAvailableAt`).
5. **A kept slot was exempt from the backup rule.** Held to the owner decision (see step 2's calls).
6. **Archiving in the workout left loose ends.** Another exercise of the open workout stayed on the
   archived machine and accepted sets on it; and "It's gone" on the only machine of its kind left
   that kind assumed, so the workout asked the same question again. Archiving now takes the
   machine off every exercise of the open workout with nothing logged on it (from the gym screen
   too), and "It's gone" records the kind the exercise is done on as not here when nothing else
   there has it, so the fallbacks follow, as the plan's Not here row says. A machine found there
   later is registered as a new one, which clears that absence.
7. **The coach's rest and note followed the slot after a swap.** They now apply only while the
   exercise is the one the coach wrote them for, as the targets already did.
8. **The coach's per-side setting was ignored** (it predated this work). Today's labels now take
   the coach's per-side for the session, else the programme's.
9. **Removing the last machine question left an empty review open.** It closes, and the focus goes
   to Add (or the search when nothing is picked).

**The template's machines without a backup** (owner decision, 5 October 2026). With kept slots held
to the rule, three of the template's slots needed a machine beyond a gym's basics and had no
fallback, so the coach could not keep them with targets at a gym nobody had answered for. The owner
chose their backups:

- **Preacher curl**: the incline bench preacher curl, then the EZ-bar curl. The first is the same
  curl over the top of an incline bench, a catalogue addition awaiting approval (also found as
  "Dumbbell preacher curl"; "Preacher curl" already covers dumbbells on a preacher bench).
- **Horizontal leg press**: the 45° leg press. The owner offered replacing the slot instead; a
  fallback keeps Lower B's horizontal press where there is one.
- **Hip abduction**: cable hip abduction. The owner's gym does abduction and adduction on one
  machine, which is the draft combination "Hip abduction and adduction"; neither is a basic.

Programmes are written with every fallback a blueprint names, so a fallback naming an exercise
still awaiting approval is now left out wherever drafts are not seeded: production adopts the
preacher curl with the EZ-bar curl alone until the new exercise is approved, and anything else a
database lacks still fails the write. Programmes already adopted keep the fallbacks they were
written with. A seed test holds every template slot the basics cannot do to a published fallback
they can.

## Next

The draft PR waits on the owner: the drafts listed there (drawings, guides and links, catalogue
additions) to approve one by one in their manifests, and the pilot with two or three beginners
before the rest of the drawings are approved. Nothing is merged or deployed from here.
