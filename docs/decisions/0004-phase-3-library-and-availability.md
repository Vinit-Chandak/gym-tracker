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
