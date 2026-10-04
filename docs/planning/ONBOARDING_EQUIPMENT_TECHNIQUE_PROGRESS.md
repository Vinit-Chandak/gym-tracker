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
| 5    | Illustrations, guides, Technique, the coach's numbers in the header and list            | not started |
| 6    | Acceptance tests, screens, fresh review, draft PR                                       | not started |

## Calls made where the plan left room

- **Drafts.** Two gates, by kind of content:
  - Catalogue additions (new equipment types, exercises, combinations) carry `review: "draft"` in
    their manifest. `seedReferenceData(db, { drafts })` skips them (and anything pointing at them)
    unless `drafts` is true. The production deploy (`src/db/deploy.ts`) always passes `false`; the
    local seeder passes `true` only for a loopback database; tests pass `true`. A draft never
    reaches the production database, so no read path needs a filter.
  - Guides, demonstration links and illustrations carry a status in their own data. They reach
    every database but are shown only where drafts are on: `next dev`, or
    `OVERLOAD_SHOW_DRAFTS=1` (for a preview the owner reviews on a phone). Approving one is a
    one-line change to its manifest entry (status, reviewer, date) and a deploy.
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
  not here. A fallback the athlete added for this gym wins over an assumed basic, because it is
  something they said about this gym.
- A daily plan may keep the programme's own exercise in its slot even when its machine is unknown;
  the backup rule applies to new choices, not to the programme it is carrying.
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

## Next

See the status table; each step ends with `npm run check`, a commit and a push.
