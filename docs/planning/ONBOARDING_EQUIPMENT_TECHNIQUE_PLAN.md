# Onboarding equipment and exercise technique plan

Status: product direction approved; independently verified against the source and revised on 4 October 2026. Ready for implementation once the owner answers the [decisions to confirm](#decisions-to-confirm) or accepts their recommended defaults.
Date: 4 October 2026.
Branch: `codex/onboarding-equipment-technique-proposal`.
Base: `origin/main` at `422f6ecf3c8b4cf2799a0c1b2ec8fdaaa216436d`, still the tip of `main` when this plan was verified.

Beginners struggle to identify equipment by name, face a long catalogue before their first workout, and find little useful guidance in Technique. The owner also reported scrolling to reach Add actions and wants to add several exercises in one visit. This plan combines an optional illustrated starter selection, gradual confirmation of actual gym equipment, corrected reference data, exercise-specific instructions with curated demonstrations, and persistent picker actions.

The owner selected all five recommended options in the planning conversation. The planning and verification tasks authorise writing, reviewing, committing and pushing this plan. They do not authorise application implementation, running seeders or migrations, or deployment.

## Approved direction

| Area                | Decision                                                                                                    | First release boundary                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Onboarding          | Optional 8–12 illustrated equipment suggestions, then confirm additional equipment when needed in a workout | Full catalogue remains accessible; setup can be skipped                           |
| Machine recognition | Original vector illustrations matching the current app, with names, aliases and short descriptions          | Static illustrations first; optional personal gym photos later                    |
| Technique           | Reviewed written instructions plus curated YouTube demonstrations                                           | Show guidance in both the workout and library; custom exercise animations later   |
| Catalogue           | Reconcile existing seeds, correct mappings, then add missing common machines and exercises                  | No indiscriminate bulk import or arbitrary target of 500 machines                 |
| Picking             | Persistent action buttons and batch exercise selection                                                      | Add several exercises; substitution and gym fallback selection stay single-choice |

The 8–12 suggestions are a display limit and initial design hypothesis, not a claim about any particular gym's inventory. Exact presets, illustrations and technique examples are implementation deliverables to verify, not assets already produced.

Verification found three existing rules that the approved direction cannot work around. Each is a labelled scope change, explained where it arises and listed under [decisions to confirm](#decisions-to-confirm):

- **S1.** The coach only plans equipment that is confirmed or assumed at a gym, so a beginner who confirms few machines gets a programme with little or no machine work.
- **S2.** Home and outdoor locations treat unrecorded equipment as absent, an accepted decision in [ADR 0004](../decisions/0004-phase-3-library-and-availability.md), so nothing there can be "not sure".
- **S3.** Correcting the mappings needs a requirement model in the resolver and its consumers, not only seed edits.

## Baseline and evidence

The initial investigation used local `main` at `4e5e928`. Remote `main` was then fetched and the affected source inspected again at `422f6ec`. That version includes Form v2 and its pinned actions, which reached the onboarding and workout pickers on 3 October 2026 (`758a2be`, `66ec5c5`), after `4e5e928`; the owner's report of scrolling to reach Add probably comes from an older build. Earlier advice about copper accents, system fonts, boxed lists and adding sticky controls from scratch is superseded by the current source and design contracts.

An independent verification on the same day re-read every cited file, recounted the seed manifests with a read-only script that only imports them (no database, seeder or migration), rechecked the external sources and confirmed that `main` had not moved. Its corrections are folded into this document and summarised in the [verification record](#verification-record).

Read these first:

- [AGENTS.md](../../AGENTS.md) and the relevant installed Next.js guides under `node_modules/next/dist/docs/` before writing application code.
- [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md), the current product and visual contracts.
- [Overload UI skill](../../.claude/skills/overload-ui/SKILL.md), which resolves precedence among the repository's design, accessibility and motion skills.
- [Feature inventory](../ui-redesign/revamp/features.md): a workout's Technique tab and its options "when the machine is not settled" must survive.
- [ADR 0004](../decisions/0004-phase-3-library-and-availability.md) (availability statuses and explicit absence), [ADR 0025](../decisions/0025-two-ways-in-and-nothing-asked-twice.md) (the coach intake's location question), [ADR 0029](../decisions/0029-the-coach-looks-things-up.md) (finding exercises by the athlete's own words) and [ADR 0032](../decisions/0032-food-behind-a-switch.md) (retry receipts).
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

- Gyms, equipment instances, absences, preferred machines (user-owned instance-level options at rank 0), gym-specific fallbacks and custom exercises belong to one account under Row Level Security (`src/db/schema/gyms.ts`, `exercises.ts`, `programs.ts`). Naming a commercial gym selects no shared inventory.
- Machine history is keyed on the instance: equipment-specific and context-dependent exercises only compare on the same one (`src/domain/comparable-history.ts`). An instance used in a workout cannot be deleted, only archived (`setEquipmentActive`).
- Explicit absence already exists: `gym_absent_equipment_types`, `src/server/repositories/absent-equipment.ts`, the gym screen's list and the programme-fit screen's "No {type} here" buttons (`src/app/(app)/gyms/[gymId]/programme/page.tsx`). Nothing reconciles it with presence: `createEquipment` and the onboarding insert leave an absence row in place, `markEquipmentAbsent` ignores active instances, and the resolver lets an active instance win.
- The resolver returns `direct`, `fallback`, `unknown` or `unavailable` (`src/domain/equipment-resolution.ts`). It returns `unknown` only at `kind = gym`; at home and outdoors an equipment-requiring exercise with no registered instance is `unavailable`, as ADR 0004 decided ("Virtual locations never report unknown"). At a gym, barbell, dumbbell, bodyweight and mobility exercises resolve `direct` before the absence list is consulted, so marking barbells absent changes nothing.
- The same assumption is restated in `src/server/repositories/sessions.ts` (`UBIQUITOUS`, which picks the slots needing a decision), `src/app/(app)/workouts/[sessionId]/logger-model.ts` (`equipmentLine`) and onboarding (`ASSUMED`, and an info tip saying barbells, dumbbells and bodyweight "are assumed everywhere", which is untrue at home and outdoors).
- The coach and programme checks treat only `direct` as available: `libraryAtGym` (`coach-plans.ts`); the coach's lookups, which report a plain true or false (`coach-lookups.ts`); `validateDraftBlueprint`, which rejects a coach draft containing any exercise not available at its location, and `validateOpeningPlan`, which requires a registered machine for machine work (both in `program-drafts.ts`); and `startSavedRoutine`. The coach intake creates a "Gym" or "Home" location with no machines when the athlete has none of that kind (`coach-intakes.ts`, ADR 0025). Adopting the template checks nothing; its machine slots start unresolved.
- A workout already settles a missing machine: the Log tab's decision block offers "Use {machine}", the slot's fallbacks, "Add a fallback" and "Register machine". The last opens the full Add machine form and returns through `registerWorkoutEquipment`, which creates and attaches the machine in one transaction (`exercise-logger.tsx`, `workout-equipment.ts`). The workout offers no "Not here" or "Not sure".

### Mappings

- `exercise_equipment_options` is a flat ranked list: one active instance of any listed type satisfies the exercise, the first match becomes the session's machine, and `machinesByExerciseAtGym` offers every instance of every listed type as compatible. A heuristic scan finds 68 active exercises listing a bench, rack, plates, box, block, landmine or similar beside other equipment, and 91 whose alternatives span more than one equipment category. The classes:
  - Implements needed together, listed as alternatives: `smith-hip-thrust` (Smith machine, flat bench), `flat-db-press` (dumbbells, flat bench), `front-squat` (barbell, power rack), `landmine-press` (landmine, barbell), `db-floor-press` (dumbbells, "Bodyweight / floor"). A registered flat bench makes `smith-hip-thrust` available without a Smith machine, the picker offers the bench as its machine, and its context-dependent history is then keyed to the bench.
  - A different exercise listed as equipment, with different load semantics: `dip` and `chest-dip` list the assisted dip machine, on which `assisted-dip` logs assistance; `crunch` lists the ab crunch machine although `ab-crunch-machine` exists; `db-front-raise` lists the cable station although `cable-front-raise` exists; `glute-kickback-machine` and `cable-kickback` list each other's equipment.
  - A combination machine assumed: `assisted-dip` lists the assisted pull-up machine, as if every one were a dip and chin combination.
  - Implement or attachment: `reverse-cable-curl` and `cable-upright-row` list the EZ curl bar as an alternative to the cable.
  - Essentials hidden by gym assumptions: `barbell-bench-press` and `high-bar-squat` list only the barbell, which says nothing about a bench or rack at home.
- Naming: `captains_chair` is "Captain's chair / roman chair", while many gyms call a back-extension bench a Roman chair. `swiss_bar` and `dip_belt` map to no exercise. Sort orders 20 and 21 are each used twice.

### Onboarding

- The Machines step offers 72 of the 93 types (machine, cable, cardio and accessory; free weights and bodyweight are excluded) as name-only ticks searched by name, for every kind of location, outdoors included (`src/app/(onboarding)/welcome/equipment/`). "Select all machines" ticks all 72 even during a search, and `equipment-step-form.test.tsx` asserts that behaviour.
- The step starts empty on every visit. `addStarterEquipmentAction` creates one instance per tick, named after its type, and skips one whose `(gym, name)` already exists, so a renamed machine would be duplicated and an archived one silently not restored. Kilogram types take the athlete's unit.

### Pickers and adding exercises

- `PinnedActions` is fixed above the tab bar or the safe area, publishes its height as `--pinned-actions-height` for the content's padding and `scroll-padding-bottom`, and becomes sticky on short screens (`height < 30rem`) (`src/components/ui/pinned-actions.tsx`, `src/styles/form-v2/rows.css`, `src/app/globals.css`). Onboarding, Add exercise, Substitute and the gym fallback form use it. The gym Add machine form, which "Register machine" opens, does not, and chooses the type from a native select of all 93 names (`src/app/(app)/gyms/equipment-form.tsx`). Nothing moves pinned actions for the on-screen keyboard; the sheet, the info tip and the logger use `visualViewport` for their own layouts.
- `ExercisePicker` is single-choice (radio inputs) with two consumers: `PickExerciseForm`, used by Add (`add-exercise/page.tsx`) and Substitute (`exercises/[workoutExerciseId]/substitute/page.tsx`, with "Remember this as the fallback at this gym", which writes `program_exercise_fallbacks`), and `FallbackForm` (`gyms/[gymId]/programme/[exerciseId]/fallback/`). None of these, nor `PinnedActions`, has a component test.
- `addExerciseAction` parses one exercise with `parseForm`, whose `formValues` keeps only the last value of a repeated name, then calls `addExerciseToSession` (`src/server/actions/sessions.ts`, `src/server/repositories/sessions.ts`). Every write through `withUser` locks the athlete's profile row; `requireOpenSession` locks the session row `FOR UPDATE`; `requireWorkoutSelection` checks the exercise's visibility and the machine's compatibility, and accepts no machine for any exercise; the order index is `max + 1` under a unique `(session, order)` index. Nothing makes a retry safe: a retried submission inserts again. Food solved the same problem with `food_submission_receipts` and `submitFoodOnce` (ADR 0032).
- Search exists twice: the picker's ranking (`src/lib/exercise-search.ts`) and the coach's lookup by the athlete's own words (`src/domain/exercise-search.ts`, ADR 0029). Neither knows aliases.

### Technique

- The workout's Technique tab shows the programme's Cue, Target load and Progression, the substitution reason, or "No cues in the programme.", then a link to the library (`src/app/(app)/workouts/[sessionId]/exercise-logger.tsx`). `getSessionDetail` selects neither `form_notes` nor `form_url`, so an ad hoc exercise always shows the empty line. Seeding alone will not populate Technique.
- The library page shows `formNotes` and a "Form guide" link, and lists equipment as numbered alternatives, which would present "Smith machine, flat bench" as a choice (`src/app/(app)/exercises/[exerciseId]/page.tsx`).
- History is read when its tab opens (`readExerciseHistoryAction`), so logging a set never pays for it.
- There is one programme template: 37 slots using 34 distinct exercises, fallbacks included (`src/db/seed/data/program.ts`). Otherwise a beginner arrives with a coach-made programme drawn from the whole library, a manual programme or ad hoc logging; there is no separate beginner path.

Counts are repository facts, not a production database audit. Earlier live inspection used an existing local audit database and the older source. No claim is made that Form v2 has been tested on a physical phone in this planning task. The production catalogue version, specific missing items reported by friends, and real inventories of their gyms remain unverified.

## Experience to build

### Optional starter equipment

Keep the current account, profile, sports, gym and programme flow. Improve the equipment step without requiring a new tutorial or a full gym inventory.

1. Offer a starter preset for the kind of place being set up. The `gym`, `home` and `outdoor` kinds stay; a smaller commercial gym can use a smaller preset without inventing a new kind, and outdoors gets a short calisthenics preset or no step at all.
2. Show up to 8–12 recognisable equipment families. Each choice has a picture, a name and a short purpose. Suggestions start unchecked. Keep obvious ways to skip, review the selection and browse all equipment; at home, all equipment includes free weights.
3. When a family holds materially different types (a 45°, horizontal or vertical leg press; a seated, lying or standing leg curl; a selectorised, iso-lateral or incline chest press; a cable station, crossover or functional trainer), let the person identify the actual variant before registering it. "Not sure" registers nothing and does not force a guess.
4. On submission, in one transaction, create one instance for each confirmed type, named after it, with the existing unit rule. Identify existing equipment by gym and type, not by name: an active instance of the type means nothing is created, and an archived one is offered back as Restore rather than recreated or silently ignored. Delete an absence row for exactly the types confirmed. Submitting twice creates nothing more.
5. Revisiting the step shows the equipment the gym already has, as confirmed. Archiving stays on the gym screen, where history is kept.
6. Continue to the programme or first workout. Confirm further equipment as it becomes relevant.

Commercial-gym suggestions might cover the leg press, leg extension, leg curl, lat pulldown, seated row, a cable station, chest and shoulder presses, the pec deck, a Smith machine and an assisted pull-up and dip machine; most appear in the template, and the exact list comes from the curated catalogue and its programmes. Home suggestions must include dumbbells, a bench, bands, a pull-up bar and other appropriate basics. Do not assume a home has a barbell, and never ask anyone to register "Bodyweight / floor": an exercise that needs no equipment is available everywhere.

Remove the whole-catalogue "Select all machines" shortcut from beginner setup, and update the Form v2 Machines board and `equipment-step-form.test.tsx` to match. If a bulk selector remains in advanced inventory management, its scope must be explicit and limited to what is visibly being confirmed. A search must never select hidden equipment. Keep the selection in a compact review control instead of keeping every ticked tile in every search result. Rewrite the info tip so it is true for each kind of location.

### Gradual confirmation during workouts

Extend the Log tab's existing decision block rather than adding a modal before every workout. When an exercise needs unconfirmed equipment, show its identification picture and offer "Available", "Not here" and "Not sure", beside what the feature inventory requires: use a registered machine, use a fallback, add a fallback remembered for this gym, and register the machine with full details.

| Answer or state                           | Inventory effect                                                                                                                                                                                                                                        | Workout behaviour                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Suggested or untouched                    | No instance and no absence record                                                                                                                                                                                                                       | Availability stays unknown                                                                                             |
| Available                                 | Create the instance through the existing create-and-attach transaction, named after the type with the onboarding defaults, without leaving the workout, or restore an archived one of that type; delete that type's absence row in the same transaction | The exercise uses that instance, where its machine history continues or starts; details can be added on the gym screen |
| Not here                                  | Record the absence. If an active instance of the type exists, write nothing and ask whether that machine has gone (archive it, keeping its history) or is out of use today                                                                              | Offer the fallbacks, Add a fallback or Skip                                                                            |
| Not sure                                  | No inventory change                                                                                                                                                                                                                                     | Stays unknown; the person can inspect the picture, add a fallback, choose another exercise or skip                     |
| Known machine is occupied or broken today | No inventory change                                                                                                                                                                                                                                     | A substitute for this session through the existing Substitute flow, with "Remember" unticked                           |

If several instances of one type exist, keep their separate names, IDs and histories, and ask which one is in use; a preferred machine for the exercise still wins. Equipment absence, unknown availability, temporary occupancy and a skipped exercise are different states. Do not infer inventory from a chain name or another account's private data.

Centralise the gym assumption (the resolver, `sessions.ts`, `logger-model.ts` and onboarding) before changing it. Then let explicit absence override what a gym is assumed to have; with S2, report unknown rather than unavailable at home and outdoors for equipment nobody has answered, assuming nothing there except exercises that need no equipment; and with S1, let coach programmes include unknown equipment under the rule in [decisions to confirm](#decisions-to-confirm). Preserve real equipment-free availability everywhere.

### Discovery and recognition

Retain access to all exercises and all equipment. Put starter suggestions and confirmed equipment within easy reach without hiding the wider catalogue. Search should recognise canonical names, aliases and plain descriptions. Feed aliases to the picker's ranking, the coach's lookup and equipment search, and keep the existing muscle and equipment matching and ranking. When an alias names several things ("Roman chair"), show the candidates side by side with their pictures rather than guessing.

Create a small representative set of original SVG illustrations first: include visually confusable pairs, a cable station and free weights. Use a consistent viewpoint, scale and level of detail. Seats, pads, handles, cables and the loading arrangement should explain what to recognise. A generic gym glyph alone is insufficient. An enlarged view can explain distinguishing features and show exercises supported by that equipment.

These are functional identification illustrations. Pictures appear in starter tiles, the identification view and the workout's confirmation, never beside names in ordinary rows: names keep the one left edge, and exercise rows keep the equipment glyph at the head of their second line. Reuse current glyphs for navigation and modality. A chosen tick tile turns ink, so its picture must invert with it. Use ink only, never a sport pigment or print, to suggest a machine's identity or availability. Record the illustration treatment in `DESIGN.md` during implementation.

## Reference data and seed strategy

### Catalogue reconciliation and expansion

First produce a reproducible report: reference counts, missing or unexpected deployed slugs where an authorised read-only environment is available, duplicate and alias candidates, missing guidance, every mapping classified by the classes under [Mappings](#mappings), unused types and missing assets. Do not read production credentials or run database scripts merely to complete a planning review. If environment access is unavailable, clearly label the comparison as unverified.

Build the addition list from common gym equipment, coverage of the template and coach-made programmes, specific user reports and failed-search evidence if it exists. Do not invent analytics. Candidates worth checking include common combination machines (an assisted dip and chin machine, a lat pulldown and low row station, a leg extension and curl machine, a home multi-gym) and a selectorised seated row machine. Missing metadata, an unfamiliar synonym and a genuinely absent exercise require different fixes. A manufacturer or model usually belongs on an equipment instance, while a materially different movement or machine design can warrant a canonical variant.

Use the existing repeatable reference seeder with permanent slugs. Add curated reference rows and update metadata without replacing user-owned gyms, machines, exercises, programmes or historical records. Programme blueprints, load comparability, rep, time and distance measures, and existing exercise links must remain valid. New records do not justify merging historical exercises or machines.

Suggested authoring contract, to be finalised in the technical review:

| Record                | Content and ownership                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipment reference   | Permanent slug, canonical name, aliases, purpose, identification cues, family and variant relationship, illustration reference, and source and licence metadata            |
| Equipment requirement | Per exercise, ordered alternatives, each a group of required types with one primary type (see below); reference data that replaces the flat ranked options additively      |
| Starter preset        | Versioned list of family or type slugs per kind of location, ordered for discovery; reference data only                                                                    |
| Gym equipment         | Existing owner, gym, type and instance identity, units and model details; only confirmed choices create inventory                                                          |
| Exercise guide        | Exercise association by slug or ID, version, status, setup, movement steps, concise cues, common mistakes, a separate "How to log" note, sources, reviewer and review date |
| Media                 | Provider and video ID or local path, optional start time, title and channel, URL, usage basis and check date                                                               |

Prefer checked-in, validated authoring manifests that feed the normal seed pipeline. Persist canonical metadata where the existing server queries can read it, through a cached reader like those in `src/server/queries/reference.ts`; avoid making anyone wait on a third-party exercise API. Keep guides in their own tables rather than wide columns on `exercises`, which every library read loads in full. Preserve existing `formNotes` and `formUrl` consumers during the transition and avoid two independently edited sources of truth.

### Correct equipment requirements before relying on presets

This is scope change S3: correcting the mappings changes the resolver and every consumer, not only the seed.

Model each exercise's equipment as ordered alternatives. Each alternative is a group of required types with one primary type, the load-bearing equipment recorded on the workout exercise and keyed for history; the rest of the group must be available but is not recorded. For example, `smith-hip-thrust` needs a Smith machine (primary) and a flat bench; `flat-db-press` needs dumbbells (primary) and a flat bench; `dip` needs a dip station or gymnastic rings, and the assisted dip machine belongs to `assisted-dip` alone. A group is satisfied when each required type has an active instance at the location, or is assumed there and not explicitly absent; explicit absence of any required type rules the group out.

Replace the modality-based assumption with assumed equipment types per kind of location: at a commercial gym, the barbell, EZ bar, dumbbells, plates, benches and racks, but not specialty bars such as the safety squat or trap bar, which the modality rule assumes today. Otherwise making a bench required would turn every dumbbell press unknown at a gym. Nothing is assumed at home or outdoors.

Distinguish:

- Alternative compatible machines for the same movement.
- Additional required implements, such as a bench together with a Smith machine.
- An alternative exercise, such as a free-weight curl instead of a cable curl, which belongs in fallbacks or a separate exercise rather than in equipment.
- The primary machine whose load and history identify the logged performance.

Add canonical types for common combination machines, mapped as an alternative for the exercises they serve. Instances keep one type each; an instance with several types is deferred.

Update the consumers together: the resolver; `availability.ts` (`gymAvailability`, `exerciseAvailability`, `decide`); `machinesByExerciseAtGym`, which should offer only the primary equipment of a satisfiable group; `requireWorkoutSelection`; `startPlannedSession`; the unresolved filter in `getSessionDetail`; `equipmentLine`; `registerWorkoutEquipment`; `setPreferredMachine`; `addGymFallback`; `libraryAtGym`, the coach's lookups, `validateDraftBlueprint`, `validateOpeningPlan` and `startSavedRoutine`; `createCustomExercise`; the library page's equipment list; and onboarding.

Keep reading the flat options, or derive them from the groups, until every consumer has moved. User-owned instance options keep working as single-instance alternatives: a preferred machine (rank 0) and a custom exercise's machine. Do not change old sessions or reassign their history while correcting future availability.

### Seed safety

- Make the canonical rebuild atomic, for example by running the reference seed in one transaction, before restructuring requirements. Today a request reading between the delete and the insert sees no canonical options, and a failed insert leaves them missing until the next deploy.
- Never reference canonical option row IDs. Point new reference rows at exercises and equipment by slug, or by the ID of a row the seed upserts.
- Slugs are permanent. Equipment slugs use underscores and exercise slugs hyphens, and no seed slug may start with `custom-`.
- Extend the re-seed test to cover options and requirements, user-owned instance options, absences, sessions and sets, not only the exercise count. Tests that reseed call `resetReferenceCache`.

## Exercise technique and media

Technique belongs to the exercise variant. Generic machine identification answers what the object is; a guide answers how to perform a movement. Exact seat and pad settings vary by physical model and should not be presented as universal numbered settings.

Author each guide with a short setup, the movement's steps, two or three useful cues, common mistakes and reviewed sources. Keep logging conventions out of the movement: move the instructional part of today's `formNotes` into guides and the conventions ("Load is per dumbbell.", "Log added load only") into "How to log". Custom exercises keep showing the athlete's own notes. Add a curated demonstration when it matches the actual exercise and equipment variant. Record review status explicitly; AI-generated or imported drafts are not automatically published instruction, and only published guides reach athletes.

Write the text for Overload. wger's exercise data carries CC-BY-SA 3.0 as well as AGPL, with image licences listed per folder; free-exercise-db declares the Unlicense but derives from another dataset and does not say where its images came from. Use both as coverage checklists and cross-references, not as copy.

Start with the 34 exercises of the template and its fallbacks, the exercises the starter presets make available, and the movements coach-made beginner programmes use, confirmed against real coach drafts where available. A first authoring batch of roughly 40–60 guides is a sizing proposal, not a release quota: actual programme coverage decides the number. Expand through the remaining common catalogue in tracked batches. Each newly promoted beginner exercise must have a reviewed text guide. Less-used incomplete entries remain discoverable with an honest "Guide not available yet" state rather than fabricated instruction.

The workout must show the canonical guide for every exercise: planned, substituted by the coach or a fallback, ad hoc and custom. Choose between two paths by measurement: include the guide text in `getSessionDetail` from the cached reader (respecting `includeGuidance`), which also keeps Technique readable if the connection drops mid-session; or read it when the Technique tab opens, as History does, with a retry state. Measure the session page's payload for a typical eight-exercise session first. Show the same guide renderer in Technique and the library.

In Technique, keep the programme's Cue, Target load, Progression and Substitution rows first, since they belong to this session, then the guide's Setup, Steps, Cues, Common mistakes and How to log, then "Watch demonstration" and "Open in the exercise library", all as caption-over-text rows under hairlines like the current Technique board. Replace "No cues in the programme." with the guide or "Guide not available yet". Do not repeat a guide cue the programme already says. Targets and progression notes keep their labels and never masquerade as generic technique. Missing media must not leave the tab blank or remove useful text.

For the first version, use reviewed YouTube links that open YouTube. An on-demand embed may follow where testing shows it works in the installed app: the privacy-enhanced domain, `playsinline=1`, no autoplay, captions where available and a labelled frame, mounted only on request and never throughout long lists. Keep "Watch demonstration" as the external fallback. Practicalities rechecked on 4 October 2026:

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

The pinned footer carries the count and the action; machine questions move into the review view. Name the sole valid instance automatically and ask when several exist. An exercise whose machine is unknown or not registered is added as "Machine not chosen", which the workout's decision block then settles; it is never labelled "Not on a machine" when the exercise needs one, and a machine required for comparable history is never silently dropped. The batch itself never creates equipment. Optional equipment and portable exercises retain their logging semantics. The session's gym stays fixed.

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

Illustrations are original vector line art in one colour that inherits `currentColor`, so a picture inverts in a chosen tile, swaps in dark mode and survives forced colours. Keep a consistent viewpoint and scale and the glyphs' grammar: round caps and joins, and a stroke in proportion to the 24-unit grid's 2.0. Use no colour, no shading beyond tonal tokens and no raster images. Deliver them without growing the client bundle, as server-rendered inline SVG passed to the client form or as CSS masks over `currentColor`, and keep their vector sources for the native apps.

Apply current motion rules: button press feedback is 120 ms; sheets follow the documented 0.4-second response and 0.08 bounce with a 200 ms scrim, and fade with reduced motion. The old blanket 180 ms sheet and no-spring rule is retired. A changing count swaps in place (out in 80 ms, in over 120 ms). Selection and count changes clarify state without blocking input or moving controls under the thumb. No ambient machine animations in search lists.

Keep targets of at least 44 pt (48 dp on Android, by hit area), entered text of at least 16 px and labels of at least 12 px, visible focus, image-plus-text identification, and System, Light and Dark. A picture beside a visible name is decorative (`alt=""`); the identification view says the distinguishing features in text. A tile's details or enlarge control sits beside its label, never inside it. The selected count is a polite status, rows in batch mode are checkboxes, and after adding, a status line says what was added and focus lands sensibly in the workout.

Verify 320, 360, 375, 402 and 440 widths, larger screens and 200% text, where two-column tiles fold to one. Assess safe areas, keyboard and installed behaviour on physical iPhone and Android where available; record any unverified cases. Capture screens with `scripts/dev/audit-browser.mjs` where WebKit is installed, and let a reviewer with fresh context judge the pixels. Preserve the shared-shell and route JavaScript budget targets in the UI skill.

## Delivery sequence

Each phase should produce a reviewable increment after implementation is authorised. The existing sticky behaviour may be verified in parallel with the data work; new onboarding depends on trustworthy mappings, the requirement model and reference metadata.

| Phase                         | Deliverables                                                                                                                                     | Completion evidence                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0. Decide                     | The owner's answers to the decisions to confirm, or acceptance of their defaults; an amendment to ADR 0004 drafted if S2 is approved             | Each decision recorded in this plan or an ADR                                                                                        |
| 1. Reconcile and specify      | Recheck current main; the coverage and mapping report; curated missing-item list; requirement model and assumed types per kind; data additions   | Source and environment findings separated; no inferred inventory; permanent slugs; every mapping classified                          |
| 2. Repair and seed            | Atomic seed; requirement groups and corrected mappings; centralised assumptions; absence reconciliation; aliases; guide, media and preset tables | Repeated seed stable; user data and history unchanged; combination, assumption and absence cases correct in every consumer           |
| 3. Pickers                    | Pinned actions verified on the deployed build and added to the Add machine form; batch addition with receipts                                    | Long-list and keyboard actions reachable; batch atomic and retry-safe; Substitute and gym fallback unchanged                         |
| 4. Onboarding and recognition | Pilot illustrations; presets; revisit-safe starter step; Available, Not here and Not sure in the workout; the coach rule from S1                 | Beginners identify confusable machines; only confirmed equipment becomes inventory; home basics work; coach drafts behave as decided |
| 5. Technique                  | Reviewed coverage, curated demonstrations and a shared guide renderer in the library and workout                                                 | Planned, substituted, ad hoc and custom Technique populated; variants match; text survives media failure                             |
| 6. Review and release         | Independent source and pixel review, targeted regression suite, content review and an isolated deployment rehearsal                              | Acceptance cases pass; production state verified before any authorised deployment; limitations recorded                              |

Phases 2, 4 and 5 include content authoring, not just UI code. Do not ship empty guide or illustration placeholders as completed coverage. Review the pilot artwork and first guide batch early so content work does not become a hidden dependency at the end.

## Acceptance and verification

| Area                     | Required checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference seeds          | Permanent unique slugs, none starting with `custom-`; valid aliases, preset references, requirement groups (each with one primary type) and assets; valid measures; unused types flagged; seeding twice changes no exercise or equipment type ID, user-owned option, absence, session or set; the option rebuild is atomic                                                                                                                                                                                    |
| Availability             | Confirmed, unknown and absent stay distinct; explicit absence overrides gym assumptions; a Smith machine plus bench cannot resolve from the bench alone, and the picker never offers the bench as its machine; a plain dip no longer resolves on the assisted dip machine; a substitute exercise is not an interchangeable machine; home and outdoor follow the S2 decision; conflicting presence and absence are reconciled with the person; archived machines never resolve; a preferred machine still wins |
| Onboarding               | Short default view even with a 500-item test catalogue; skip and browse-all work; nothing saved until confirmed; revisiting shows existing equipment; resubmitting, renaming or archiving never duplicates an instance; "Not sure" registers nothing; home and outdoor get their own presets; the false global select-all and the "assumed everywhere" copy are gone                                                                                                                                          |
| Recognition              | Representative novices distinguish visually similar equipment using picture and text; names and aliases find the same canonical item, and an ambiguous alias shows its candidates; pictures stay legible in dark mode, in a chosen tile, in forced colours and at 200% text                                                                                                                                                                                                                                   |
| Coach                    | Drafts and opening plans follow the S1 decision; equipment marked absent is never planned; tests cover a location with no confirmed machines                                                                                                                                                                                                                                                                                                                                                                  |
| Batch addition           | Multiple choices across searches; stable append order; per-item machines; an invalid, cross-user or cross-gym item rejects the whole batch; concurrent additions keep unique, contiguous order; a lost-response retry inserts once; the same key with another payload is refused; a later intentional repeat remains possible; a machine-requiring exercise without a machine reads "Machine not chosen"                                                                                                      |
| Existing workflows       | Substitute stays single-choice and "Remember" still writes the gym fallback; the gym fallback form is unchanged; an unsettled machine still offers use, fallback, add a fallback and register; prior sets, drafts, history, load comparisons, supersets, programme identity and the session's gym remain intact                                                                                                                                                                                               |
| Technique                | The same reviewed guide in library and workout; planned, substituted, ad hoc and custom exercises have guidance or an honest gap; programme rows retained; logging conventions under How to log; custom notes kept; demonstration matches the variant; a missing or blocked video leaves readable instructions                                                                                                                                                                                                |
| Mobile and accessibility | Pinned actions and the last result visible with safe areas and 200% text; the keyboard rule above holds on iPhone and Android; one pinned footer per page; names wrap; focus not covered; batch rows are checkboxes; useful announcements; reduced motion; screen-reader labels; both themes; 44 pt and 48 dp targets                                                                                                                                                                                         |
| Performance              | No per-row player mounts or external API dependency; guide payload measured; illustrations outside the client bundle; one compatibility read per batch; bundle budget changes documented                                                                                                                                                                                                                                                                                                                      |

During implementation, extend the tests that exercise these contracts: `src/db/seed/seed.test.ts` and the re-seed test in `src/db/db.test.ts`; `src/domain/equipment-resolution.test.ts`, `src/server/repositories/availability.test.ts` and `workout-equipment.test.ts`; `sessions.test.ts` and the session actions; the coach's draft and plan tests (`coach-plans.test.ts`, `coach-program-requests.test.ts`); both search tests (`src/lib/exercise-search.test.ts`, `src/domain/exercise-search.test.ts`); `equipment-step-form.test.tsx`, whose select-all assertion must change; and `exercise-logger.test.tsx` and `view-model.test.ts`. Add the missing component tests for `ExercisePicker` in both modes, the Add and Substitute forms, `FallbackForm` and `PinnedActions`. Use isolated local fixtures for mutations. Follow the UI skill's required checks and the repository's `npm run check`; run relevant browser audits and build checks for actual application changes. A documentation-only commit does not establish application correctness.

Pilot the flow with a few beginners using actual gym equipment before expanding artwork. Observe whether they can recognise a machine, reach their first workout without inventorying the whole gym, find its guide, and add several exercises without scrolling to the page bottom. Treat recognition rate and time-to-first-workout as measurements to collect, not invented success figures.

## Decisions to confirm

| ID  | Decision                                            | Recommended default                                                                                                                                                                                                                                       | Why it matters                                                                                                                                                          |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | How coach programmes treat unconfirmed equipment    | Allow an exercise whose equipment is unknown, never one explicitly absent, only when its slot has a fallback available now; the opening plan may leave that machine unchosen, the first workout confirms it, and "Not here" falls through to the fallback | Today a coach draft containing any unconfirmed machine is rejected, so a beginner who skips the starter step gets free-weight plans at a gym and almost nothing at home |
| S2  | Unknown at home and outdoors                        | Equipment nobody has answered is unknown at every kind of location; only gyms assume free weights, plates, benches and racks; explicit absence overrides any assumption. Record it as an amendment to ADR 0004                                            | Without it, "Available", "Not here" and "Not sure" cannot appear at home, where everything unregistered is unavailable                                                  |
| S3  | Requirement groups and assumed types                | Approve them as the way to correct the mappings                                                                                                                                                                                                           | The change touches the resolver and about twenty consumers, not only seed data                                                                                          |
| D1  | Who reviews and publishes guides and demonstrations | The owner signs off each guide, with a qualified coach or trainer where possible; the reviewer is recorded per guide                                                                                                                                      | "Reviewed" needs a named standard before anything is published                                                                                                          |
| D2  | Who draws the illustrations                         | A pilot of six to eight drawings, made as SVG to the glyph grammar, reviewed by the owner in light, dark and chosen states and tried with two or three beginners before the rest                                                                          | Artwork is the longest and riskiest content task                                                                                                                        |
| D3  | Starter preset contents                             | The candidates above, trimmed to 8–12 per kind of location after the pilot                                                                                                                                                                                | The display limit is approved; the contents are not                                                                                                                     |

The implementer may apply these without a decision unless the owner objects: canonical combination types instead of multi-type instances, link-first demonstrations, the guide data path chosen by measurement, and a batch cap of 20.

## Deferred scope and research basis

Deferred: shared verified gym directories, gym-owner administration, camera or AI machine recognition, personal photo uploads, equipment instances with several types, broad paid-media integration, custom movement animation libraries, automated content-maintenance services and unrelated redesigns. These remain options for later evidence, not prerequisites for the approved first release.

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
- The coach rejects programmes containing unconfirmed equipment and the coach intake creates machine-less locations, so gradual confirmation needs S1.
- "Unavailable" at home and outdoors is an accepted decision, so changing it is S2; explicit absence cannot override gym assumptions today; the assumption is stated in four places.
- Seeding rebuilds options non-atomically and option IDs are not stable; custom slugs, custom notes and the reference cache shape the data design.
- The onboarding step's exact scope, duplicate rule, copy and test; the Add machine form's missing pinned action; the missing keyboard handling.
- The picker's consumers named exactly; no picker or pinned-action tests exist.
- One template with 34 exercises instead of "beginner paths"; two search implementations; YouTube's referrer, branding and colour-imagery constraints; licence details.

Not verified: the deployed catalogue and seed state; Form v2's pinned actions on a physical phone, and whether the owner's report came from an older build; the items friends reported missing and their gyms' inventories.
