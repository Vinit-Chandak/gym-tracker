# ADR 0004: Phase 3 exercise library and per-gym availability

Date: 2026-09-08
Status: accepted

## Context

Phase 3 makes the exercise library browsable and answers, per gym, whether each planned
exercise can be done there. The user asked for both a search box and grouping by muscle
group, and decided that a machine the gym has not registered should read as "unknown",
not "unavailable".

## Decisions

1. **Four availability statuses.** `direct` (the exercise on a registered machine, or a
   free-weight/bodyweight movement at a real gym), `fallback` (a configured alternative that
   resolves), `unknown` (a machine would be needed and the gym's inventory is silent about it),
   `unavailable` (every way of doing it needs equipment the gym is known not to have, or the
   location is Outdoor/Home). Virtual locations never report "unknown".

2. **Known-absent equipment is recorded explicitly** in `gym_absent_equipment_types`. The
   gym screen manages the list, and an "unknown" row on the programme-fit screen offers a
   one-tap "No X here" button per candidate equipment type. Anytime Fitness is seeded with the
   two absences from the planning notes (hip-thrust machine, calf machine).

3. **Availability is computed, never stored.** `src/domain/equipment-resolution.ts` is the
   single rule; `src/server/repositories/availability.ts` loads the programme, options,
   fallbacks, gym equipment and absences and runs it. One row per distinct exercise: the same
   exercise on several days shares a row that lists the days.

4. **Gym-specific settings are not programme edits.** A preferred machine per gym is a
   user-owned row in `exercise_equipment_options` (rank 0, instance-level). A gym-specific
   fallback is a `program_exercise_fallbacks` row with `gym_id`, added to every active-programme
   slot that uses the exercise. Neither changes sets, reps, RIR or exercise selection, so they
   are edited directly rather than through versioned proposals. Programme-level fallbacks from
   the plan (no gym) are shown but not editable here.

5. **Library grouping.** Exercises are filed under the body region of their first primary
   muscle (Chest, Back, Shoulders, Biceps, Triceps, Forearms, Quads, Hamstrings, Glutes, Hips,
   Calves, Core). Search filters on the phone across name, muscles, modality, category and
   movement pattern; every word typed must match. Inactive exercises (weighted hyperextension)
   sit in an "Excluded for now" group.

6. **Entry points.** The library lives under Settings (the bottom bar keeps its five tabs).
   Exercise detail links to each gym's programme-fit screen and vice versa.

## Consequences

- Phase 4 can call `gymAvailability` when a session starts to pre-resolve machines and offer
  fallbacks with their reason.
- Custom (user-created) exercises are visible in the library if added later, but no screen
  creates them yet.

## Amendment, 4 October 2026: unknown everywhere, and basics instead of modalities

Decided by the owner with the onboarding, equipment and technique plan
([plan](../planning/ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md), owner decisions S2 and S3;
[ADR 0041](0041-gym-basics-the-coach-backup-rule-and-machines-with-several-types.md)). It
replaces decision 1's last sentence and the modality rule behind `direct`; decisions 2 to 6
stand.

1. **Home and outdoors report unknown too.** Equipment nobody has answered for is unknown at
   every kind of location, and asked about when an exercise needs it. "Virtual locations never
   report unknown" is withdrawn: a home gym the athlete has not described is not one known to
   be empty. `unavailable` now means only that every way of doing the exercise needs equipment
   known to be absent.
2. **Assumed equipment comes from reference data, per kind of location.** The modality rule
   (any barbell, dumbbell, bodyweight or mobility exercise is `direct` at a gym) is replaced by
   `assumed_equipment_types`: at a gym, the gym basics; at home and outdoors, nothing. A
   specialty bar is no longer assumed because its exercise is a barbell exercise.
3. **Explicit absence overrides an assumption.** Marking barbells absent at a gym now makes
   barbell work unavailable there; before, the modality rule answered `direct` before the
   absence list was read.
4. **What an exercise needs is ordered alternatives of types used together**, each with one
   primary type ([ADR 0041](0041-gym-basics-the-coach-backup-rule-and-machines-with-several-types.md)),
   not a flat ranked list where any one type would do. A Smith hip thrust needs a Smith machine
   and a bench, and a bench alone no longer makes it available.
5. **The statuses stay four, with what lies behind a `direct` said.** A `direct` or
   `fallback` resolution carries its basis: `confirmed` (every type it needs is on a registered
   machine), `assumed` (some of it is a basic nobody has confirmed) or `free` (it needs nothing).
   The coach and the programme screens read confirmed, assumed, unknown and absent as four
   different things.
