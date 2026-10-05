# Onboarding equipment and exercise technique plan

Status: product direction approved; verified against the source and revised on 4 October 2026, with the owner's decisions recorded the same day. Ready for implementation.
Date: 4 October 2026.
Branch: `codex/onboarding-equipment-technique-proposal`.
Base: `origin/main` at `422f6ecf3c8b4cf2799a0c1b2ec8fdaaa216436d`, still the tip of `main` when this plan was verified.

Beginners struggle to identify equipment by name, face a long catalogue before their first workout, and find little useful guidance in Technique. The owner also reported scrolling to reach Add actions and wants to add several exercises in one visit. This plan combines an optional illustrated starter selection, gradual confirmation of actual gym equipment, corrected reference data, exercise-specific instructions with curated demonstrations, and persistent picker actions.

The owner selected all five recommended options in the planning conversation, then answered the follow-up questions recorded under [owner decisions](#owner-decisions). The planning, verification and decision tasks authorise writing, reviewing, committing and pushing this plan. They do not authorise application implementation, running seeders or migrations, or deployment.

## Approved direction

| Area                | Decision                                                                                                    | First release boundary                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Onboarding          | Optional 8–12 illustrated equipment suggestions, then confirm additional equipment when needed in a workout | Full catalogue remains accessible; setup can be skipped                           |
| Machine recognition | Original vector illustrations matching the current app, with names, aliases and short descriptions          | Static illustrations first; optional personal gym photos later                    |
| Technique           | Reviewed written instructions plus curated YouTube demonstrations                                           | Show guidance in both the workout and library; custom exercise animations later   |
| Catalogue           | Reconcile existing seeds, correct mappings, then add missing common machines and exercises                  | No indiscriminate bulk import or arbitrary target of 500 machines                 |
| Picking             | Persistent action buttons and batch exercise selection                                                      | Add several exercises; substitution and gym fallback selection stay single-choice |

The 8–12 suggestions are a display limit and initial design hypothesis, not a claim about any particular gym's inventory. Exact presets, illustrations and technique examples are implementation deliverables to verify, not assets already produced.

Verification found three existing rules that the approved direction could not work around: the coach only planned confirmed equipment (S1), home and outdoor locations treated unrecorded equipment as absent under [ADR 0004](../decisions/0004-phase-3-library-and-availability.md) (S2), and correcting the mappings needed a requirement model rather than seed edits alone (S3). The owner's decisions below settle all three.

## Owner decisions

Recorded on 4 October 2026 from the owner's answers. Where earlier wording in this plan differs, these decisions win.

### Equipment and availability

- **Gym basics.** At a commercial gym (`kind = gym`) these are assumed present until someone says otherwise: the barbell, EZ bar, dumbbells, plates, benches and racks; a pull-up bar, a dip station and a back-extension bench; a cable station, a lat pulldown, a seated row, a leg press, a leg extension, a leg curl and a pec deck. The owner named the machines, benches, dumbbells and pull-up bar and asked for other near-universal stations to be added; the dip station and back-extension bench are that addition. Specialty bars are not basics.
- **Coach planning (S1).** The coach plans gym basics without a backup. Any other machine nobody has confirmed may be planned only when its slot has a backup that is available now. Equipment marked absent is never planned.
- **First use of a basic.** The first time an exercise whose history belongs to a machine uses an unconfirmed basic, one tap settles it: "Yes, it's here" registers the machine, and "Not here" records the absence and offers a substitute. Free weights, benches and bars need no confirmation.
- **Home and outdoors (S2).** Equipment nobody has answered is unknown everywhere and asked about when needed; nothing is assumed at home or outdoors. This amends ADR 0004.
- **Mappings (S3).** The "used together" requirement model, with assumed equipment types per kind of location, replaces the flat alternatives.
- **Combination machines.** One registered machine can have several types. Common combinations appear in the catalogue as their own illustrated items that register one machine with every type, and a machine's page gains "Also used for". This was deferred; it is now in scope.
- **Existing full inventories.** Gyms registered in full under the old "Select all" stay as they are. "Not here" on a registered machine offers to archive it, keeping its history.

### Onboarding

- **Who sees suggestions.** Only people who say they are new. The coach's "Which sounds like you?" question ("I'm new to this" or "I already train") moves to the first onboarding step and is saved on the profile; the coach reads it instead of asking again.
- **Beginners at a gym.** The basics as one collapsed line, "Usually here (N)", with Review to open them as picture tiles (a tap records one as not here), then 8–12 illustrated extras to tick.
- **Experienced people at a gym.** The same basics line, then every other type, grouped and searchable, with a picture on tap; nothing is pre-ticked.
- **Home and outdoors.** At home, a starter set for beginners and the full list, free weights included, for experienced people. Outdoors, a short calisthenics set (pull-up bar, parallel or dip bars, bench, box) for everyone.
- **Select all.** Removed.

### In the workout

- **Available.** For an unconfirmed machine that is not a basic, "Available" registers it at once with defaults and stays in the workout; details can be added later on the gym screen.
- **Adding several exercises.** A review appears only when a machine question needs answering; otherwise "Add 3" adds them in the order picked.
- **Today's targets.** When the coach planned the session, every number and note shown comes from the coach's plan, including the line under the exercise name, the workout list and rest. Without a coach plan, the workout shows the programme's sets, reps, RIR and rest with the app's own load suggestion, and none of the programme's written notes.
- **Technique.** The exercise's generic guide, then the programme's cue at the end ("Programme cue") when the slot has one. The programme's target-load and progression notes and the substitution reason leave the workout; the notes stay editable in the programme.
- **Beginner guidance.** The same for everyone: the guide sits in Technique, one tap from Log.

### Content and delivery

- **Guides.** A core set of about 40–60 in the first release. Claude drafts each from reputable sources and proposes demonstration videos; the owner approves before publication, and the reviewer is recorded per guide.
- **Videos.** "Watch demonstration" opens YouTube. An in-app player waits for testing on real phones and the owner's approval.
- **Illustrations.** Claude draws a pilot of six to eight single-colour line drawings in the glyph style; the owner reviews them in light, dark and selected states and tries them with two or three beginners before the rest are drawn.
- **Missing items.** Researched from both commercial chains and local independent gyms, where the owner's users train, with local names as aliases; the owner approves each addition.
- **Delivery.** Everything in this plan is in scope for the first implementation. The phases are an order for reviewable increments, not gates.

Implementation defaults the owner may still overrule: the draft list of extras under [onboarding flow](#onboarding-flow), the guide data path chosen by measurement, a batch maximum of 20, and a pilot set of confusable pairs, a cable station and free weights.

## Baseline and evidence

The initial investigation used local `main` at `4e5e928`. Remote `main` was then fetched and the affected source inspected again at `422f6ec`. That version includes Form v2 and its pinned actions, which reached the onboarding and workout pickers on 3 October 2026 (`758a2be`, `66ec5c5`), after `4e5e928`; the owner's report of scrolling to reach Add probably comes from an older build. Earlier advice about copper accents, system fonts, boxed lists and adding sticky controls from scratch is superseded by the current source and design contracts.

An independent verification on the same day re-read every cited file, recounted the seed manifests with a read-only script that only imports them (no database, seeder or migration), rechecked the external sources and confirmed that `main` had not moved. Its corrections are folded into this document and summarised in the [verification record](#verification-record).

Read these first:

- [AGENTS.md](../../AGENTS.md) and the relevant installed Next.js guides under `node_modules/next/dist/docs/` before writing application code.
- [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md), the current product and visual contracts.
- [Overload UI skill](../../.claude/skills/overload-ui/SKILL.md), which resolves precedence among the repository's design, accessibility and motion skills.
- [Feature inventory](../ui-redesign/revamp/features.md): a workout's options "when the machine is not settled" must survive; its Technique entry changes by owner decision.
- [ADR 0004](../decisions/0004-phase-3-library-and-availability.md) (availability statuses and explicit absence), [ADR 0025](../decisions/0025-two-ways-in-and-nothing-asked-twice.md) (the coach intake), [ADR 0028](../decisions/0028-steps-learned-from-the-stack.md) (load ladders per machine), [ADR 0029](../decisions/0029-the-coach-looks-things-up.md) (finding exercises by the athlete's own words) and [ADR 0032](../decisions/0032-food-behind-a-switch.md) (retry receipts).
- [Local audit setup](../audits/local-56-months.md).

### Reference data and seeding

- The manifests hold 93 equipment types, 276 exercises (none inactive) and 503 exercise-to-equipment mappings (`src/db/seed/data/equipment-types.ts`, `src/db/seed/data/exercises.ts`). Compare deployed data against them before attributing omissions to skipped seeds.
- 59 exercises have `formNotes`, 8 have `formUrl` (seven ACE and one NASM exercise-library page, not videos) and 212 have neither. About half of the notes are logging conventions only, such as `pull-up` ("Log added load only (belt, vest, weighted gloves). 0 = bodyweight.") and `flat-db-press` ("Load is per dumbbell."); most of the rest are a single cue. No exercise has a setup, steps and common mistakes, so field presence overstates instructional coverage.
- `seedReferenceData` upserts equipment types, exercises and warm-ups by slug (`src/db/seed/reference.ts`). Every production build runs it (`vercel.json` runs `db:deploy` before `build`); previews skip it unless `MIGRATE_ON_PREVIEW=1`, because they share the production database (`src/db/deploy.ts`). It deliberately creates no gyms or machines, so no skipped seeder exists to fill anyone's gym. Preserve the preview gate.
- Each run deletes and re-inserts every canonical `exercise_equipment_options` row, outside a transaction (`deploy.ts` and `run.ts` call the seed without one). Equipment type and exercise IDs are generated by the database and survive upserts but differ between databases; option row IDs change on every deploy.
- `exercises.slug` is unique across shared and user-owned rows. Custom exercises use `custom-<uuid>` slugs and keep the athlete's own notes in `formNotes` (`src/server/repositories/manual-training.ts`).
- Shared equipment types and exercises are read once per server instance, every column, for up to ten minutes (`src/server/queries/reference.ts`).
- The only test that seeds twice compares the exercise count alone (`src/db/db.test.ts`); `src/db/seed/seed.test.ts` validates the manifests statically.

### Inventory, absence and availability

- Gyms, equipment instances, absences, preferred machines (user-owned instance-level options at rank 0), gym-specific fallbacks and custom exercises belong to one account under Row Level Security (`src/db/schema/gyms.ts`, `exercises.ts`, `programs.ts`). Naming a commercial gym selects no shared inventory. Each instance has exactly one `equipment_type_id`.
- Machine history is keyed on the instance: equipment-specific and context-dependent exercises only compare on the same one (`src/domain/comparable-history.ts`). An instance used in a workout cannot be deleted, only archived (`setEquipmentActive`).
- Explicit absence already exists: `gym_absent_equipment_types`, `src/server/repositories/absent-equipment.ts`, the gym screen's list and the programme-fit screen's "No {type} here" buttons (`src/app/(app)/gyms/[gymId]/programme/page.tsx`). Nothing reconciles it with presence: `createEquipment` and the onboarding insert leave an absence row in place, `markEquipmentAbsent` ignores active instances, and the resolver lets an active instance win.
- The resolver returns `direct`, `fallback`, `unknown` or `unavailable` (`src/domain/equipment-resolution.ts`). It returns `unknown` only at `kind = gym`; at home and outdoors an equipment-requiring exercise with no registered instance is `unavailable`, as ADR 0004 decided ("Virtual locations never report unknown"). At a gym, barbell, dumbbell, bodyweight and mobility exercises resolve `direct` before the absence list is consulted, so marking barbells absent changes nothing, and barbell-modality exercises on specialty bars (`safety-bar-squat`, `trap-bar-deadlift`) are assumed too.
- The same assumption is restated in `src/server/repositories/sessions.ts` (`UBIQUITOUS`, which picks the slots needing a decision), `src/app/(app)/workouts/[sessionId]/logger-model.ts` (`equipmentLine`) and onboarding (`ASSUMED`, and an info tip saying barbells, dumbbells and bodyweight "are assumed everywhere", which is untrue at home and outdoors).
- The coach and programme checks treat only `direct` as available: `libraryAtGym` (`coach-plans.ts`); the coach's lookups, which report a plain true or false (`coach-lookups.ts`); `validateDraftBlueprint`, which rejects a coach draft containing any exercise not available at its location, and `validateOpeningPlan`, which requires a registered machine for machine work (both in `program-drafts.ts`); and `startSavedRoutine`. The coach intake creates a "Gym" or "Home" location with no machines when the athlete has none of that kind (`coach-intakes.ts`, ADR 0025). Adopting the template checks nothing; its machine slots start unresolved.
- A workout already settles a missing machine: the Log tab's decision block offers "Use {machine}", the slot's fallbacks, "Add a fallback" and "Register machine". The last opens the full Add machine form and returns through `registerWorkoutEquipment`, which creates and attaches the machine in one transaction (`exercise-logger.tsx`, `workout-equipment.ts`). The workout offers no "Not here" or "Not sure".

### Mappings

- `exercise_equipment_options` is a flat ranked list: one active instance of any listed type satisfies the exercise, the first match becomes the session's machine, and `machinesByExerciseAtGym` offers every instance of every listed type as compatible. A heuristic scan finds 68 active exercises listing a bench, rack, plates, box, block, landmine or similar beside other equipment, and 91 whose alternatives span more than one equipment category. The classes:
  - Implements needed together, listed as alternatives: `smith-hip-thrust` (Smith machine, flat bench), `flat-db-press` (dumbbells, flat bench), `front-squat` (barbell, power rack), `landmine-press` (landmine, barbell), `db-floor-press` (dumbbells, "Bodyweight / floor"). A registered flat bench makes `smith-hip-thrust` available without a Smith machine, the picker offers the bench as its machine, and its context-dependent history is then keyed to the bench.
  - A different exercise listed as equipment, with different load semantics: `dip` and `chest-dip` list the assisted dip machine, on which `assisted-dip` logs assistance; `crunch` lists the ab crunch machine although `ab-crunch-machine` exists; `db-front-raise` lists the cable station although `cable-front-raise` exists; `glute-kickback-machine` and `cable-kickback` list each other's equipment; `trap-bar-deadlift` lists a straight barbell.
  - A combination machine assumed: `assisted-dip` lists the assisted pull-up machine, as if every one were a dip and chin combination.
  - Implement or attachment: `reverse-cable-curl` and `cable-upright-row` list the EZ curl bar as an alternative to the cable.
  - Essentials hidden by gym assumptions: `barbell-bench-press` and `high-bar-squat` list only the barbell, which says nothing about a bench or rack at home.
- Naming: `captains_chair` is "Captain's chair / roman chair", while many gyms call a back-extension bench a Roman chair. `swiss_bar` and `dip_belt` map to no exercise. Sort orders 20 and 21 are each used twice.

### Onboarding

- The Machines step offers 72 of the 93 types (machine, cable, cardio and accessory; free weights and bodyweight are excluded) as name-only ticks searched by name, for every kind of location, outdoors included (`src/app/(onboarding)/welcome/equipment/`). "Select all machines" ticks all 72 even during a search, and `equipment-step-form.test.tsx` asserts that behaviour.
- The step starts empty on every visit. `addStarterEquipmentAction` creates one instance per tick, named after its type, and skips one whose `(gym, name)` already exists, so a renamed machine would be duplicated and an archived one silently not restored. Kilogram types take the athlete's unit.
- The "Which sounds like you?" question ("I'm new to this", "I already train") and a training-experience field exist only in the coach's setup, which the last onboarding step opens for people who choose the coach. They are saved with the coach intake (`track`, `experience`), not on the profile (`src/components/coaching/intake-form.tsx`, `src/domain/coaching-workflow.ts`).

### Pickers and adding exercises

- `PinnedActions` is fixed above the tab bar or the safe area, publishes its height as `--pinned-actions-height` for the content's padding and `scroll-padding-bottom`, and becomes sticky on short screens (`height < 30rem`) (`src/components/ui/pinned-actions.tsx`, `src/styles/form-v2/rows.css`, `src/app/globals.css`). Onboarding, Add exercise, Substitute and the gym fallback form use it. The gym Add machine form, which "Register machine" opens, does not, and chooses the type from a native select of all 93 names (`src/app/(app)/gyms/equipment-form.tsx`). Nothing moves pinned actions for the on-screen keyboard; the sheet, the info tip and the logger use `visualViewport` for their own layouts.
- `ExercisePicker` is single-choice (radio inputs) with two consumers: `PickExerciseForm`, used by Add (`add-exercise/page.tsx`) and Substitute (`exercises/[workoutExerciseId]/substitute/page.tsx`, with "Remember this as the fallback at this gym", which writes `program_exercise_fallbacks`), and `FallbackForm` (`gyms/[gymId]/programme/[exerciseId]/fallback/`). None of these, nor `PinnedActions`, has a component test.
- `addExerciseAction` parses one exercise with `parseForm`, whose `formValues` keeps only the last value of a repeated name, then calls `addExerciseToSession` (`src/server/actions/sessions.ts`, `src/server/repositories/sessions.ts`). Every write through `withUser` locks the athlete's profile row; `requireOpenSession` locks the session row `FOR UPDATE`; `requireWorkoutSelection` checks the exercise's visibility and the machine's compatibility, and accepts no machine for any exercise; the order index is `max + 1` under a unique `(session, order)` index. Nothing makes a retry safe: a retried submission inserts again. Food solved the same problem with `food_submission_receipts` and `submitFoodOnce` (ADR 0032).
- Search exists twice: the picker's ranking (`src/lib/exercise-search.ts`) and the coach's lookup by the athlete's own words (`src/domain/exercise-search.ts`, ADR 0029). Neither knows aliases.

### Technique and today's targets

- The workout's Technique tab shows the programme's Cue, Target load and Progression, the substitution reason, or "No cues in the programme.", then a link to the library (`src/app/(app)/workouts/[sessionId]/exercise-logger.tsx`). Those written notes appear nowhere else in the workout. `getSessionDetail` selects neither `form_notes` nor `form_url`, so an ad hoc exercise always shows the empty line. Seeding alone will not populate Technique.
- The Log tab already shows today's work without opening anything: the suggested weight and reps in the steppers, the set count, the RIR target and the suggestion's tag beside the set heading; the explanation sits behind the tag (Why). When the coach planned the session, the entry, the RIR target, the set count and the rest timer follow the coach's plan, but the line under the exercise name and the workout list still show the programme slot's fixed range and rest (`perSetLabel`, `prescriptionLabel` and `restText` in `logger-model.ts`; `workout-overview.tsx`), so the two can disagree.
- The library page shows `formNotes` and a "Form guide" link, and lists equipment as numbered alternatives, which would present "Smith machine, flat bench" as a choice (`src/app/(app)/exercises/[exerciseId]/page.tsx`).
- History is read when its tab opens (`readExerciseHistoryAction`), so logging a set never pays for it.
- There is one programme template: 37 slots using 34 distinct exercises, fallbacks included (`src/db/seed/data/program.ts`). Otherwise a beginner arrives with a coach-made programme drawn from the whole library, a manual programme or ad hoc logging; there is no separate beginner path.

Counts are repository facts, not a production database audit. Earlier live inspection used an existing local audit database and the older source. No claim is made that Form v2 has been tested on a physical phone in this planning task. The production catalogue version, specific missing items reported by friends, and real inventories of their gyms remain unverified.

## Experience to build

### Onboarding flow

1. Add "Which sounds like you?" ("I'm new to this" or "I already train") to the first step, beside the name and units, and save it on the profile. The coach's intake starts from that answer instead of asking again, and the answer can still be changed there. Accounts that never answered are asked by the coach as today.
2. Keep the sports and gym steps.
3. The machines step depends on the kind of location and the answer:
   - **Gym, new:** the basics as one collapsed line, "Usually here (N)", naming a few, with Review to open them as picture tiles; tapping one records it as not here. Then up to 8–12 illustrated extras, each with a picture, a name and a short purpose, unticked.
   - **Gym, experienced:** the same basics line, then every other type, grouped and searchable by name or alias, with a picture on tap; nothing is pre-ticked.
   - **Home:** beginners get a home starter set (dumbbells, an adjustable bench, bands, a pull-up bar, kettlebells and similar); experienced people get the full list, free weights included. Nothing is assumed at home. Never ask anyone to register "Bodyweight / floor": an exercise that needs no equipment is available everywhere.
   - **Outdoors:** a short calisthenics set for everyone (a pull-up bar, parallel or dip bars, a bench, a box), with Browse all.
   - Everyone can skip, review the selection and browse all equipment.
4. When a family holds materially different types (a 45°, horizontal or vertical leg press; a seated, lying or standing leg curl; a selectorised, iso-lateral or incline chest press; a cable station, crossover or functional trainer), let the person identify the variant. "Not sure" registers nothing and does not force a guess.
5. Common combinations ("Lat pulldown and low row", "Assisted dip and chin", "Leg extension and curl") appear as their own illustrated items; choosing one registers one machine with every type.
6. On submission, in one transaction, create one machine for each confirmed type or combination, named after it, with the existing unit rule. Identify existing equipment by gym and type, not by name: an active machine with the type means nothing is created, and an archived one is offered back as Restore rather than recreated or silently ignored. Delete absence rows for the types confirmed and record one for each basic marked not here. Submitting twice creates nothing more.
7. Revisiting the step shows what the gym already has. Archiving stays on the gym screen, where history is kept.
8. Continue to the programme or first workout; everything else is confirmed as it becomes relevant.

Draft extras for a commercial gym, to be trimmed to 8–12 after the pilot: chest press, shoulder press, Smith machine, assisted pull-up and dip, hip abduction and adduction, calf raise, hack squat, preacher curl, a chest-supported or T-bar row, an ab crunch machine and a hip thrust machine.

Remove "Select all machines", and update the Form v2 Machines board and `equipment-step-form.test.tsx` to match. A search must never select hidden equipment. Keep the selection in a compact review control instead of keeping every ticked tile in every search result. Rewrite the info tip so it is true for each kind of location.

### Gradual confirmation during workouts

Extend the Log tab's existing decision block rather than adding a modal before every workout, and keep what the feature inventory requires: use a registered machine, use a fallback, add a fallback remembered for this gym, and register the machine with full details.

An unconfirmed basic whose exercise keeps machine history gets a one-tap confirmation with its picture the first time it is used. "Yes, it's here" registers it, named after its type, and attaches it before the first set. "Not here" records the absence and offers the fallbacks or a substitute. For a family, "A different one" offers its other variants. Free weights, benches and bars need no confirmation.

Any other unconfirmed machine gets "Available", "Not here" and "Not sure":

| Answer or state                           | Inventory effect                                                                                                                                                                                                       | Workout behaviour                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Suggested or untouched                    | No instance and no absence record                                                                                                                                                                                      | Availability stays unknown                                                                             |
| Available                                 | Register the machine at once through the existing create-and-attach transaction, named after the type with the onboarding defaults, or restore an archived one; delete that type's absence row in the same transaction | The exercise uses that machine, where its history continues or starts; the person stays in the workout |
| Not here                                  | Record the absence. If an active machine with the type exists, write nothing and ask whether it has gone (archive it, keeping its history) or is out of use today                                                      | Offer the fallbacks, Add a fallback or Skip                                                            |
| Not sure                                  | No inventory change                                                                                                                                                                                                    | Stays unknown; the person can inspect the picture, add a fallback, choose another exercise or skip     |
| Known machine is occupied or broken today | No inventory change                                                                                                                                                                                                    | A substitute for this session through the existing Substitute flow, with "Remember" unticked           |

If several machines of one type exist, keep their separate names, IDs and histories, and ask which one is in use; a preferred machine for the exercise still wins. Equipment absence, unknown availability, temporary occupancy and a skipped exercise are different states. Do not infer inventory from a chain name or another account's private data. Gyms registered in full under the old "Select all" stay as they are: "Not here" on a registered machine offers to archive it.

Centralise the assumption (the resolver, `sessions.ts`, `logger-model.ts` and onboarding) before changing it. Assumed types come from reference data per kind of location, explicit absence overrides them, and at home and outdoors unanswered equipment is unknown rather than unavailable. Preserve real equipment-free availability everywhere.

### Coach planning

- Treat gym basics as available. Allow any other unconfirmed machine only when its slot has a fallback available now: a basic, free weights or confirmed equipment at a gym; bodyweight or confirmed equipment at home. The opening plan may leave such a machine unchosen for the first workout to settle. Never plan equipment marked absent.
- The coach's lookups report whether each exercise's equipment is confirmed, assumed, unknown or absent rather than true or false. `validateDraftBlueprint`, `validateOpeningPlan` and the coach's instructions enforce the rule. A saved routine may start when nothing in it is absent; unknown machines are settled in the workout.
- The coach reads the profile's "Which sounds like you?" answer.

### Discovery and recognition

Retain access to all exercises and all equipment. Put starter suggestions and confirmed equipment within easy reach without hiding the wider catalogue. Search should recognise canonical names, aliases (local names included) and plain descriptions. Feed aliases to the picker's ranking, the coach's lookup and equipment search, and keep the existing muscle and equipment matching and ranking. When an alias names several things ("Roman chair"), show the candidates side by side with their pictures rather than guessing.

Create a small representative set of original SVG illustrations first: include visually confusable pairs, a cable station and free weights. Use a consistent viewpoint, scale and level of detail. Seats, pads, handles, cables and the loading arrangement should explain what to recognise. A generic gym glyph alone is insufficient. An enlarged view can explain distinguishing features and show exercises supported by that equipment.

These are functional identification illustrations. Pictures appear in starter tiles, the basics' Review, the identification view and the workout's confirmation, never beside names in ordinary rows: names keep the one left edge, and exercise rows keep the equipment glyph at the head of their second line. Reuse current glyphs for navigation and modality. A chosen tick tile turns ink, so its picture must invert with it. Use ink only, never a sport pigment or print, to suggest a machine's identity or availability. Record the illustration treatment in `DESIGN.md` during implementation.

## Reference data and seed strategy

### Catalogue reconciliation and expansion

First produce a reproducible report: reference counts, missing or unexpected deployed slugs where an authorised read-only environment is available, duplicate and alias candidates, missing guidance, every mapping classified by the classes under [Mappings](#mappings), unused types and missing assets. Do not read production credentials or run database scripts merely to complete a planning review. If environment access is unavailable, clearly label the comparison as unverified.

Build the addition list from what commercial chains and local independent gyms commonly have, coverage of the template and coach-made programmes, specific user reports and failed-search evidence if it exists. Do not invent analytics. Candidates worth checking include the common combinations above and a selectorised seated row machine. Missing metadata, an unfamiliar synonym and a genuinely absent exercise require different fixes. A manufacturer or model usually belongs on an equipment instance, while a materially different movement or machine design can warrant a canonical variant. The owner approves each addition.

Use the existing repeatable reference seeder with permanent slugs. Add curated reference rows and update metadata without replacing user-owned gyms, machines, exercises, programmes or historical records. Programme blueprints, load comparability, rep, time and distance measures, and existing exercise links must remain valid. New records do not justify merging historical exercises or machines.

Suggested authoring contract, to be finalised in the technical review:

| Record                | Content and ownership                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipment reference   | Permanent slug, canonical name, aliases, purpose, identification cues, family and variant relationship, combination items, illustration reference, and source and licence metadata |
| Assumed equipment     | Per kind of location, the types assumed present (the gym basics); versioned reference data                                                                                         |
| Equipment requirement | Per exercise, ordered alternatives, each a group of required types with one primary type (see below); reference data that replaces the flat ranked options additively              |
| Starter preset        | Versioned list of family, combination or type slugs per kind of location and experience answer, ordered for discovery; reference data only                                         |
| Gym equipment         | Existing owner, gym, types and instance identity, units and model details; only confirmed choices create inventory                                                                 |
| Exercise guide        | Exercise association by slug or ID, version, status, setup, movement steps, concise cues, common mistakes, a separate "How to log" note, sources, reviewer and review date         |
| Media                 | Provider and video ID or local path, optional start time, title and channel, URL, usage basis and check date                                                                       |

Prefer checked-in, validated authoring manifests that feed the normal seed pipeline. Persist canonical metadata where the existing server queries can read it, through a cached reader like those in `src/server/queries/reference.ts`; avoid making anyone wait on a third-party exercise API. Keep guides in their own tables rather than wide columns on `exercises`, which every library read loads in full. Preserve existing `formNotes` and `formUrl` consumers during the transition and avoid two independently edited sources of truth.

### Correct equipment requirements before relying on presets

Model each exercise's equipment as ordered alternatives. Each alternative is a group of required types with one primary type, the load-bearing equipment recorded on the workout exercise and keyed for history; the rest of the group must be available but is not recorded. For example, `smith-hip-thrust` needs a Smith machine (primary) and a flat bench; `flat-db-press` needs dumbbells (primary) and a flat bench; `dip` needs a dip station or gymnastic rings, and the assisted dip machine belongs to `assisted-dip` alone. A group is satisfied when each required type is on an active machine at the location, or is assumed there and not explicitly absent; explicit absence of any required type rules the group out.

Replace the modality-based assumption with the gym basics as assumed types at a commercial gym. Otherwise making a bench required would turn every dumbbell press unknown at a gym. Specialty bars such as the safety squat or trap bar are not basics, although the modality rule assumes them today. Nothing is assumed at home or outdoors.

Distinguish:

- Alternative compatible machines for the same movement.
- Additional required implements, such as a bench together with a Smith machine.
- An alternative exercise, such as a free-weight curl instead of a cable curl, which belongs in fallbacks or a separate exercise rather than in equipment.
- The primary machine whose load and history identify the logged performance.

Update the consumers together, each reading a machine's full set of types: the resolver; `availability.ts` (`gymAvailability`, `exerciseAvailability`, `decide`); `machinesByExerciseAtGym`, which should offer only the primary equipment of a satisfiable group; `requireWorkoutSelection`; `startPlannedSession`; the unresolved filter in `getSessionDetail`; `equipmentLine`; `registerWorkoutEquipment`; `setPreferredMachine`; `addGymFallback`; `libraryAtGym`, the coach's lookups, `validateDraftBlueprint`, `validateOpeningPlan` and `startSavedRoutine`; `createCustomExercise`; the library page's equipment list; and onboarding.

Keep reading the flat options, or derive them from the groups, until every consumer has moved. User-owned instance options keep working as single-instance alternatives: a preferred machine (rank 0) and a custom exercise's machine. Do not change old sessions or reassign their history while correcting future availability.

### Machines with several types

- Add a table of each machine's types, backfilled with one row per existing machine from `equipment_type_id`, which stays as the machine's display type during the transition.
- A required type is satisfied by any active machine at the location that has it; compatibility and the pickers use the same rule.
- History stays per exercise and machine, so a combination machine never mixes two exercises' history. Its load ladder (ADR 0028) stays one per machine, which matches one shared stack.
- Catalogue combination items map to a set of types. "Also used for" adds or removes a type on a registered machine without touching its history.
- Presence and absence reconcile per type: marking a type absent while an active machine has it asks, as for any other conflict.

### Seed safety

- Make the canonical rebuild atomic, for example by running the reference seed in one transaction, before restructuring requirements. Today a request reading between the delete and the insert sees no canonical options, and a failed insert leaves them missing until the next deploy.
- Never reference canonical option row IDs. Point new reference rows at exercises and equipment by slug, or by the ID of a row the seed upserts.
- Slugs are permanent. Equipment slugs use underscores and exercise slugs hyphens, and no seed slug may start with `custom-`.
- Extend the re-seed test to cover options, requirements and assumed types, user-owned instance options, machine types, absences, sessions and sets, not only the exercise count. Tests that reseed call `resetReferenceCache`.

## Today's targets in the workout

Make every number shown in a workout come from one source:

- With a coach plan, take the line under the exercise name, the workout list's prescription and the rest from the coach's plan, summarised as `planLine` in `src/domain/session-plan.ts` already does, rather than from the programme slot; the entry, RIR target, set count and rest timer already follow it. Show the coach's note as today. An exercise the coach added shows the coach's numbers.
- Without a coach plan, show the programme's sets, reps, RIR and rest with the app's load suggestion, as today, and none of the programme's written notes.
- Ad hoc exercises keep showing the exercise's own defaults and the app's suggestion.

Extend `logger-model.test.ts`, `workout-overview.test.tsx` and `exercise-logger.test.tsx` for coach-planned, programme-only and ad hoc sessions.

## Exercise technique and media

Technique belongs to the exercise variant. Generic machine identification answers what the object is; a guide answers how to perform a movement. Exact seat and pad settings vary by physical model and should not be presented as universal numbered settings.

Author each guide with a short setup, the movement's steps, two or three useful cues, common mistakes and reviewed sources. Keep logging conventions out of the movement: move the instructional part of today's `formNotes` into guides and the conventions ("Load is per dumbbell.", "Log added load only") into "How to log". Custom exercises keep showing the athlete's own notes. Claude drafts each guide from reputable sources and proposes demonstrations that match the actual exercise and equipment variant; the owner approves before anything is published, and the reviewer and date are recorded. AI-generated or imported drafts are never published unapproved.

Write the text for Overload. wger's exercise data carries CC-BY-SA 3.0 as well as AGPL, with image licences listed per folder; free-exercise-db declares the Unlicense but derives from another dataset and does not say where its images came from. Use both as coverage checklists and cross-references, not as copy.

The first release covers a core set of about 40–60: the 34 exercises of the template and its fallbacks, the exercises the gym basics and starter extras make available, and the movements coach-made beginner programmes use, confirmed against real coach drafts where available. Expand through the remaining common catalogue in tracked batches. Each newly promoted beginner exercise must have a reviewed text guide. Less-used incomplete entries remain discoverable with an honest "Guide not available yet" state rather than fabricated instruction.

The workout must show the canonical guide for every exercise: planned, substituted by the coach or a fallback, ad hoc and custom. Choose between two paths by measurement: include the guide text in `getSessionDetail` from the cached reader (respecting `includeGuidance`), which also keeps Technique readable if the connection drops mid-session; or read it when the Technique tab opens, as History does, with a retry state. Measure the session page's payload for a typical eight-exercise session first. Show the same guide renderer in Technique and the library.

Technique shows the guide's Setup, Steps, Cues, Common mistakes and How to log, then "Programme cue" when the slot has one, then "Watch demonstration" and "Open in the exercise library", as caption-over-text rows under hairlines like the current Technique board. Replace "No cues in the programme." with the guide or "Guide not available yet". The programme's target-load and progression notes and the substitution reason leave Technique: the line under the exercise name already says "instead of …", the coach's note explains a coach's swap, and the notes stay editable in the programme and visible on the exercise page. Update the feature inventory's Technique entry with this owner decision when it ships. Guidance is the same for everyone, with no beginner-only prompts. Missing media must not leave the tab blank or remove useful text.

For the first release, "Watch demonstration" opens the reviewed video on YouTube. An in-app player may follow only after testing in the installed app on real phones and the owner's approval; it would use the privacy-enhanced domain, `playsinline=1`, no autoplay, captions where available and a labelled frame, mounted only on request and never throughout long lists. Practicalities rechecked on 4 October 2026, for that later step:

- The current `Referrer-Policy: strict-origin-when-cross-origin` in `next.config.ts` must stay: the embedded player fails with error 153 when the referrer is suppressed. There is no Content Security Policy to update, and `X-Frame-Options: DENY` does not stop Overload embedding others.
- `rel=0` only limits related videos to the same channel, `modestbranding` no longer has any effect, privacy-enhanced mode can still show non-personalised ads, owners can disable embedding, and age-restricted videos play only on YouTube. An unavailable, deleted or blocked video leaves the text usable.
- A thumbnail or player brings colour imagery into a black-and-white interface. Show none in lists, mount the player only on request, and record the exception in `DESIGN.md`. Do not download and rehost third-party videos or thumbnails without an appropriate usage basis.

Provide captions where available, accessible player labelling and reduced-motion or static alternatives to any later custom animation. Text rendering without a player does not imply a new offline content-sync feature. Store the source, reviewer and last check date; run link and content checks as part of content maintenance, without creating a scheduled service in this task.

No new animation dependency is needed for this first release. CSS and existing components handle interface feedback. Lottie can later play authored exercise demonstrations; Rive is justified only if teaching becomes interactive. Neither runtime provides accurate exercise content. If later adopted, record bundle cost and design rationale and review every movement before publication.

## Persistent actions and batch addition

### Reuse the current pinned action system

`PinnedActions` already covers onboarding, Add exercise, Substitute and the gym fallback form. Before changing it, reproduce the owner's report on the current deployed build on a physical phone; it probably predates 3 October. Then extend the existing pattern rather than introduce a second footer system:

- Pin the actions of the gym Add machine form, which "Register machine" opens, and of any new review or identification view.
- Keep one `PinnedActions` per page: it publishes a single height variable.
- The primary action and selected count remain reachable while searching and scrolling. Content clears the footer, the safe area and any navigation or session strip, and what the keyboard focuses is scrolled clear of the footer. Error messages do not push the action outside the usable viewport.
- With the search focused, the field and the first results stay visible above the keyboard. Choosing a result moves focus off the field and closes the keyboard; from then on the count and the action are visible without scrolling. Riding above an open keyboard with `visualViewport`, as the sheet does, is optional and justified only if device testing shows people trying to add while typing.
- In tall-text or small-screen states, a compact selected summary opens a review view; never stack every selected exercise into an expanding fixed footer. Keep one main scroll region, visible focus, long names and accessible selection announcements.

### Add several exercises in one submission

Use multi-select only for adding exercises to the active workout. Substitute keeps `PickExerciseForm`'s single choice and its "Remember this as the fallback at this gym" option, and `FallbackForm` stays single-choice. Build a separate batch form or an explicit mode rather than silently changing every consumer; in batch mode, rows are checkboxes.

Selection survives searches and filters and has a review-and-remove control. Within one selection, each exercise appears once. Append in selection order; do not reorder existing workout exercises or introduce workout reordering. If the same exercise is already in the workout, make that visible and keep today's ability to add it again rather than treating it as a duplicate retry.

The pinned footer carries the count and the action. "Add 3" adds the selection straight away when no machine question remains; otherwise a short review asks only those questions. Name the sole valid machine automatically and ask when several exist. An exercise whose machine is unknown or not registered is added as "Machine not chosen", which the workout's decision block then settles; it is never labelled "Not on a machine" when the exercise needs one, and a machine required for comparable history is never silently dropped. The batch itself never creates equipment. Optional equipment and portable exercises retain their logging semantics. The session's gym stays fixed.

On the server, in a new batch action:

- Parse an ordered structured list, or ordered `FormData.getAll` lists; `parseForm` and `formValues` keep only the last value of a repeated name.
- In one `withUser` transaction, which keeps the athlete and session locks, validate the whole batch first: an open session the account owns; every exercise visible and active, in one query; no duplicates within the batch; a sensible maximum (proposal: 20); each machine owned, active, at the session's gym and compatible, from one `machinesByExerciseAtGym` read. Measures and units come from the exercise and machine, never the client, and the client's compatibility map is never trusted.
- Read the order once and insert contiguous order indexes in selection order in one statement. A failure leaves no partial batch.
- Reuse the food receipt pattern from ADR 0032: a submission key generated once per form, and a receipt keyed by user and key holding a digest of the session and ordered items, written in the same transaction. A matching retry is a no-op that still lands on the workout; the same key with a different payload is refused; a confirmed success starts a new key. Add a workout receipt table beside `food_submission_receipts` rather than renaming that one.
- Keep ordered selections and per-exercise machine choices in client state through validation and network errors; the echoed `values` cannot hold them. Keep `keepsFormOnDisconnect`'s message. Only announce success and leave the page after the server confirms, and do not imply that an offline request has been saved.
- Reuse the session's revalidation and redirect, and preserve set drafts, logged sets, supersets and the one-open-session rule. A single selection is a batch of one.

## Current design and motion requirements

Follow root `DESIGN.md` over historical Form v1 documents. Form v2 uses Jost for titles and figures, Atkinson Hyperlegible Next for read text, monochrome ink and ground controls, flat rows and hairlines, and custom glyphs. Colour belongs to the documented sports and prints, not a new accent for equipment selection. Do not copy the earlier planning conversation's copper palette or filled grouped-list direction.

Reuse current components, semantic tokens, onboarding layouts and sheets. The repository's `.claude/skills/` are usable guidance; read `overload-ui` first, then the relevant accessibility or motion skill when doing that work. Do not install or introduce a library just because a skill names one.

Illustrations are original line drawings in one colour that inherits `currentColor`, so a picture inverts in a chosen tile, swaps in dark mode and survives forced colours. Keep a consistent viewpoint and scale and the glyphs' grammar: round caps and joins, and a stroke in proportion to the 24-unit grid's 2.0. Use no colour, no shading beyond tonal tokens and no raster images. Deliver them without growing the client bundle, as server-rendered inline SVG passed to the client form or as CSS masks over `currentColor`, and keep their vector sources for the native apps.

Apply current motion rules: button press feedback is 120 ms; sheets follow the documented 0.4-second response and 0.08 bounce with a 200 ms scrim, and fade with reduced motion. The old blanket 180 ms sheet and no-spring rule is retired. A changing count swaps in place (out in 80 ms, in over 120 ms). Selection and count changes clarify state without blocking input or moving controls under the thumb. No ambient machine animations in search lists.

Keep targets of at least 44 pt (48 dp on Android, by hit area), entered text of at least 16 px and labels of at least 12 px, visible focus, image-plus-text identification, and System, Light and Dark. A picture beside a visible name is decorative (`alt=""`); the identification view says the distinguishing features in text. A tile's details or enlarge control sits beside its label, never inside it. The basics line's Review is a real control with an accessible name and count. The selected count is a polite status, rows in batch mode are checkboxes, and after adding, a status line says what was added and focus lands sensibly in the workout.

Verify 320, 360, 375, 402 and 440 widths, larger screens and 200% text, where two-column tiles fold to one. Assess safe areas, keyboard and installed behaviour on physical iPhone and Android where available; record any unverified cases. Capture screens with `scripts/dev/audit-browser.mjs` where WebKit is installed, and let a reviewer with fresh context judge the pixels. Preserve the shared-shell and route JavaScript budget targets in the UI skill.

## Delivery sequence

Everything here is in scope for the first implementation; the phases are an order for reviewable increments, not gates. Phase 3 depends on none of the others and can start alongside phase 1. New onboarding depends on trustworthy mappings, the requirement model and reference metadata.

| Phase                            | Deliverables                                                                                                                                                                                                                                                           | Completion evidence                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reconcile and specify         | Recheck current main; the coverage and mapping report; curated missing-item list from chains and local gyms; requirement model, assumed types and machine-type design; an amendment to ADR 0004 and a short ADR for gym basics, the coach rule and multi-type machines | Source and environment findings separated; no inferred inventory; permanent slugs; every mapping classified; the decisions recorded as ADRs                   |
| 2. Repair and seed               | Atomic seed; requirement groups and corrected mappings; assumed types; the machine-type table; centralised assumptions; absence reconciliation; aliases; guide, media and preset tables                                                                                | Repeated seed stable; user data and history unchanged; combination, assumption, absence and multi-type cases correct in every consumer                        |
| 3. Pickers                       | Pinned actions verified on the deployed build and added to the Add machine form; batch addition with receipts and an on-demand review                                                                                                                                  | Long-list and keyboard actions reachable; batch atomic and retry-safe; Substitute and gym fallback unchanged                                                  |
| 4. Onboarding and recognition    | The profile's experience question; beginner, experienced, home and outdoor machine steps; pilot illustrations and combination items; first-use confirmation and Available, Not here and Not sure; the coach rule                                                       | Beginners identify confusable machines; only confirmed equipment becomes inventory; basics plan without backups and others only with one; nothing asked twice |
| 5. Technique and today's targets | Reviewed core guides, demonstration links and the shared guide renderer; coach-planned numbers in the exercise header and workout list                                                                                                                                 | Technique shows the guide and programme cue only; every exercise has guidance or an honest gap; coach-planned sessions show only the coach's numbers          |
| 6. Review and release            | Independent source and pixel review, targeted regression suite, content review and an isolated deployment rehearsal                                                                                                                                                    | Acceptance cases pass; production state verified before any authorised deployment; limitations recorded                                                       |

Phases 2, 4 and 5 include content authoring, not just UI code. Do not ship empty guide or illustration placeholders as completed coverage. Review the pilot artwork and first guide batch early so content work does not become a hidden dependency at the end.

## Acceptance and verification

| Area                     | Required checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference seeds          | Permanent unique slugs, none starting with `custom-`; valid aliases, preset references, assumed types, requirement groups (each with one primary type) and assets; valid measures; unused types flagged; seeding twice changes no exercise or equipment type ID, user-owned option, machine type, absence, session or set; the option rebuild is atomic; every existing machine keeps its type after the machine-type migration                                                                                                                                                                       |
| Availability             | Confirmed, assumed, unknown and absent stay distinct; gym basics are assumed until marked absent and specialty bars are not; explicit absence overrides assumptions; a Smith machine plus bench cannot resolve from the bench alone, and the picker never offers the bench as its machine; a plain dip no longer resolves on the assisted dip machine; a combination machine satisfies each of its types; home and outdoor equipment nobody has answered is unknown; conflicting presence and absence are reconciled with the person; archived machines never resolve; a preferred machine still wins |
| Onboarding               | "Which sounds like you?" is asked once and the coach does not repeat it; beginners see the collapsed basics line and 8–12 extras even with a 500-item test catalogue; experienced people see the full searchable list; home and outdoors get their own sets; combination items register one machine; skip and browse-all work; nothing saved until confirmed; revisiting shows existing equipment; resubmitting, renaming or archiving never duplicates a machine; "Not sure" registers nothing; no Select all and no "assumed everywhere" copy                                                       |
| Recognition              | Representative novices distinguish visually similar equipment using picture and text; names and aliases, local names included, find the same canonical item, and an ambiguous alias shows its candidates; pictures stay legible in dark mode, in a chosen tile, in forced colours and at 200% text                                                                                                                                                                                                                                                                                                    |
| Coach                    | Plans gym basics without backups and any other unconfirmed machine only with a fallback available now; never plans absent equipment; drafts and opening plans validate the rule; a location with no confirmed machines still gets a varied plan; a saved routine with nothing absent starts                                                                                                                                                                                                                                                                                                           |
| Workout confirmation     | An unconfirmed basic with machine history asks once with one tap and registers before the first set; "A different one" offers the family's variants; "Available" registers without leaving the workout; "Not here" on a registered machine offers archive; the unsettled-machine options (use, fallback, add a fallback, register) remain                                                                                                                                                                                                                                                             |
| Today's targets          | A coach-planned session shows the coach's reps, RIR and rest in the exercise header, the workout list, the entry and the timer; a programme-only session shows the programme's numbers and no written notes; ad hoc exercises show their defaults                                                                                                                                                                                                                                                                                                                                                     |
| Batch addition           | Multiple choices across searches; stable append order; a review only when a machine question exists; per-item machines; an invalid, cross-user or cross-gym item rejects the whole batch; concurrent additions keep unique, contiguous order; a lost-response retry inserts once; the same key with another payload is refused; a later intentional repeat remains possible; a machine-requiring exercise without a machine reads "Machine not chosen"                                                                                                                                                |
| Existing workflows       | Substitute stays single-choice and "Remember" still writes the gym fallback; the gym fallback form is unchanged; prior sets, drafts, history, load comparisons, supersets, programme identity and the session's gym remain intact; gyms registered in full stay as they were                                                                                                                                                                                                                                                                                                                          |
| Technique                | The same reviewed guide in library and workout, followed only by the programme cue; no target-load, progression or substitution rows; planned, substituted, ad hoc and custom exercises have guidance or an honest gap; logging conventions under How to log; custom notes kept; demonstration links match the variant; a missing or blocked video leaves readable instructions                                                                                                                                                                                                                       |
| Mobile and accessibility | Pinned actions and the last result visible with safe areas and 200% text; the keyboard rule above holds on iPhone and Android; one pinned footer per page; names wrap; focus not covered; batch rows are checkboxes; the basics' Review is announced with its count; useful announcements; reduced motion; screen-reader labels; both themes; 44 pt and 48 dp targets                                                                                                                                                                                                                                 |
| Performance              | No per-row player mounts or external API dependency; guide payload measured; illustrations outside the client bundle; one compatibility read per batch; bundle budget changes documented                                                                                                                                                                                                                                                                                                                                                                                                              |

During implementation, extend the tests that exercise these contracts: `src/db/seed/seed.test.ts` and the re-seed test in `src/db/db.test.ts`, plus migration tests for the machine-type backfill; `src/domain/equipment-resolution.test.ts`, `src/server/repositories/availability.test.ts` and `workout-equipment.test.ts`; `sessions.test.ts` and the session actions; the coach's draft, plan and intake tests (`coach-plans.test.ts`, `coach-program-requests.test.ts` and the intake's tests); both search tests (`src/lib/exercise-search.test.ts`, `src/domain/exercise-search.test.ts`); `equipment-step-form.test.tsx`, whose select-all assertion must change; and `exercise-logger.test.tsx`, `logger-model.test.ts`, `workout-overview.test.tsx` and `view-model.test.ts`. Add the missing component tests for `ExercisePicker` in both modes, the Add and Substitute forms, `FallbackForm` and `PinnedActions`. Use isolated local fixtures for mutations. Follow the UI skill's required checks and the repository's `npm run check`; run relevant browser audits and build checks for actual application changes. A documentation-only commit does not establish application correctness.

Pilot the flow with a few beginners using actual gym equipment before expanding artwork. Observe whether they can recognise a machine, reach their first workout without inventorying the whole gym, find its guide, and add several exercises without scrolling to the page bottom. Treat recognition rate and time-to-first-workout as measurements to collect, not invented success figures.

## Deferred scope and research basis

Deferred: shared verified gym directories, gym-owner administration, camera or AI machine recognition, personal photo uploads, an in-app video player until it has been tested on phones and approved, broad paid-media integration, custom movement animation libraries, automated content-maintenance services and unrelated redesigns. These remain options for later evidence, not prerequisites for the approved first release.

Research reviewed on 4 October 2026 and rechecked the same day:

- [NN/g on recognition](https://www.nngroup.com/articles/recognition-and-recall/) and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) support recognisable choices and deferring detail. They do not establish the exact starter-list size or prove this app's conversion impact.
- [YouTube player parameters](https://developers.google.com/youtube/player_parameters) and [embedding help](https://support.google.com/youtube/answer/171780?hl=en): `rel=0` limits related videos to the same channel rather than removing them, `modestbranding` no longer has any effect, privacy-enhanced mode can still serve non-personalised ads, owners can disable embedding and age-restricted videos redirect to YouTube. [Error 153](https://til.simonwillison.net/youtube/fixing-153-embed) follows from suppressing the referrer. Recheck provider behaviour during implementation.
- [wger](https://wger.readthedocs.io/en/latest/) licenses its code under AGPL 3 or later and its initial exercise data additionally under CC-BY-SA 3.0, and lists image sources per folder. It is a candidate for curated reference work, not an approved wholesale import.
- [free-exercise-db](https://github.com/yuhonas/free-exercise-db) declares the Unlicense for 800+ exercises derived from another dataset, without documenting where its images came from. Review provenance before relying on any of it; normalise duplicates and variant names.
- [Motion configuration](https://motion.dev/docs/react-motion-config) illustrates reduced-motion support, but no new runtime is selected for this release. An animation player does not supply reviewed movement instruction.

## Verification record

Verified on 4 October 2026 against `origin/main` at `422f6ec`, the planning base, with no newer commits on `main`. Every cited file was read, the manifests were recounted by a read-only script that imports them, and the external sources were rechecked. No application code, seeder, migration, dependency or deployment was touched.

Confirmed: the five approved decisions; the 93, 276 and 503 counts and the 59, 8 and 212 guidance counts; per-account inventory; production-only seeding with the preview gate; the resolver's four statuses; pinned actions on the onboarding and workout pickers; single-choice picking; Technique's lack of canonical guidance; Form v2's type and motion rules.

Corrected or added:

- The mapping problem is systemic rather than two isolated entries: a heuristic scan finds 68 active exercises listing an implement beside other equipment, and some list another exercise's equipment with different load semantics. Correcting it needs a requirement model (S3).
- Explicit absence, mid-workout registration and an idempotent receipt pattern already exist and now form the basis of the plan.
- The coach rejects programmes containing unconfirmed equipment and the coach intake creates machine-less locations, so gradual confirmation needed S1.
- "Unavailable" at home and outdoors is an accepted decision, so changing it is S2; explicit absence cannot override gym assumptions today; the assumption is stated in four places.
- Seeding rebuilds options non-atomically and option IDs are not stable; custom slugs, custom notes and the reference cache shape the data design.
- The onboarding step's exact scope, duplicate rule, copy and test; the Add machine form's missing pinned action; the missing keyboard handling.
- The picker's consumers named exactly; no picker or pinned-action tests exist.
- One template with 34 exercises instead of "beginner paths"; two search implementations; YouTube's referrer, branding and colour-imagery constraints; licence details.
- The experience question lives only in the coach's setup, after the machines step; a coach-planned session's header and workout list show the programme's range and rest instead of the coach's.

The owner's answers to the follow-up questions, recorded the same day, are under [owner decisions](#owner-decisions); they settle S1–S3 and every other open question.

Not verified: the deployed catalogue and seed state; Form v2's pinned actions on a physical phone, and whether the owner's report came from an older build; the items friends reported missing and their gyms' inventories.
