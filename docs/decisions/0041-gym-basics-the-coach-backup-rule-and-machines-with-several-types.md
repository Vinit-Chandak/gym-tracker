# ADR 0041: Gym basics, the coach's backup rule and machines with several types

Date: 2026-10-04
Status: accepted

## Context

A beginner faced the whole catalogue before their first workout, and the coach would only plan
equipment somebody had registered, so a new account with an empty gym got a programme of
dumbbells and bodyweight. The availability rules behind both are in
[ADR 0004](0004-phase-3-library-and-availability.md): unrecorded equipment was absent at home
and outdoors, a gym was assumed to have anything a barbell or dumbbell exercise could be done
with, and each exercise listed equipment as flat alternatives, any one of which would do. The
[onboarding, equipment and technique plan](../planning/ONBOARDING_EQUIPMENT_TECHNIQUE_PLAN.md)
found three rules it could not work around (S1–S3); the owner settled them on 4 October 2026.

## Decisions

1. **Gym basics.** At a commercial gym (`kind = gym`) these are assumed present until someone
   says otherwise: the barbell, EZ bar, dumbbells and plates; flat, adjustable and decline
   benches and the power rack; a pull-up bar, a dip station and a back-extension bench; a cable
   station, a lat pulldown, a seated cable row, a 45° leg press, a leg extension, a seated leg
   curl and a pec deck. Specialty bars are not basics. They are reference data
   (`src/db/seed/data/assumed-equipment.ts`, seeded into `assumed_equipment_types`), so the
   list changes with a manifest edit rather than a code change. Where a basic is a family, the
   variant the built-in programme uses is the one assumed; "A different one" offers the rest.
2. **The coach's backup rule (S1).** The coach plans gym basics without a backup. Any other
   machine nobody has confirmed may be planned only when its slot has a backup available now: a
   basic, free weights or confirmed equipment at a gym; bodyweight or confirmed equipment at
   home. Equipment marked absent is never planned. This holds for every exercise a plan names,
   a programme slot it keeps included, and a backup counts only as the workout would use it, on
   the type or the machine it names. The programme validator, the opening-plan validator, the
   session-plan validator and the coach's instructions enforce it, and the coach's lookups say
   confirmed, assumed, unknown or absent instead of true or false. A saved routine starts when
   nothing in it is absent; anything unknown is settled in the workout.
3. **First use of a basic.** The first time an exercise that keeps machine history uses a
   basic machine nobody has confirmed, the workout asks once, with its picture: "Yes, it's
   here" registers the machine before the first set, "Not here" records the absence and offers
   a substitute, and for a family "A different one" offers its variants. Free weights, benches
   and bars are never asked about. Any other unconfirmed machine is offered "Available", "Not
   here" and "Not sure"; Available registers it at once and the athlete stays in the workout.
4. **Requirements are groups used together (S3).** `exercise_equipment_requirements` holds, per
   exercise, ordered alternatives; each is a group of types that must all be present, with one
   primary type, the load-bearing equipment a workout records and keys history on. A group is
   satisfied when each of its types is on an active machine at the location, or is assumed
   there and not marked absent; an explicit absence of any of its types rules it out. A machine
   chosen for an exercise (preferred, tied to it, named in a fallback, or already on it in a
   workout) leads its alternative, whose other types must still be there: the workout asks about
   what nobody has answered for. The flat `exercise_equipment_options` stay for the user's own
   instance-level rows (a preferred machine, a custom exercise's machine) and hold each
   alternative's primary type.
5. **A machine can have several types.** `equipment_instance_types` lists every type a machine
   is; a trigger keeps its display type (`equipment_instances.equipment_type_id`) there. A
   required type is satisfied by any active machine at the location that has it, so a lat
   pulldown with a low row serves both. History stays per exercise and machine, so a
   combination machine never mixes two exercises' records, and its load ladder
   ([ADR 0028](0028-steps-learned-from-the-stack.md)) stays one per machine, matching its one
   stack. Common combinations are catalogue items of their own that register one machine with
   every type; a machine's page gains "Also used for".
6. **Presence and absence are reconciled per type.** Registering or restoring a machine
   deletes its types' absence rows in the same transaction. Marking a type absent while an
   active machine has it asks whether the machine has gone (archive it, keeping its history)
   or is out of use today. Gone records that kind as not here when no other machine there has
   it, and an archived machine leaves the open workout's exercises that have nothing logged on
   it. Gyms registered in full under the old "Select all" stay as they are.
7. **The answer to "Which sounds like you?" lives on the profile** (`training_experience`):
   asked on the first step of setup, it decides the machines step's suggestions, and the
   coach's intake starts from it instead of asking again.

## Consequences

- A new account at a gym can be given a full programme on day one; its machines are confirmed
  one tap at a time as each is first used, and only confirmed or restored machines become
  inventory.
- The built-in programme backs every slot the basics cannot do with a fallback they can (owner,
  5 October 2026): the preacher curl, the horizontal leg press and hip abduction gained theirs,
  so the coach can keep them with targets at a gym nobody has answered for. A fallback naming an
  exercise still awaiting approval is left out of a programme wherever drafts are not seeded.
- The seed rebuilds requirement groups, options, assumptions, combinations' members and
  demonstrations in one transaction, so no request sees an exercise with no equipment.
- A gym whose athlete marks the barbell absent now really has no barbell work, which the modality
  rule never allowed.
- Machines registered before this change keep their single type and every set's history.
