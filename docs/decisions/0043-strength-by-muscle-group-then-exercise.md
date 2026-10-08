# ADR 0043: Strength by muscle group, then exercise

Date: 2026-10-08
Status: accepted; amends decisions 6 and 8 of [ADR 0042](0042-one-graph-for-every-trend.md)

## Context

On 8 October 2026 the owner, looking at Progress → Strength on their phone, asked what the
point was of its first graph: working sets per muscle group, a bar a day. They asked for it to
go, and for Strength to become two dropdowns instead: a muscle group, then an exercise in that
group, with the group's volume drawn while no exercise is chosen. They were unsure the idea was
sound and asked for help with it, pointing at the training log they use (FitNotes), where a
category or exercise filter comes first and the second dropdown offers what fits the first.

The idea holds up. It goes from broad to narrow, as the question does ("how are my legs doing?",
then "how is my squat?"). Each list stays short. The group graph comes free with the empty
second choice, and the Muscle groups / Exercise tray above both goes. Four things needed
deciding to make it work.

## Decisions

1. **Two selects, stacked.** The first is the muscle group: All muscle groups, then chest, back,
   legs, shoulders, arms and core (the radar's six). The second is the exercise: "All exercises",
   then every exercise ever logged under that group, by name. Choosing a group starts afresh
   with no exercise. Stacked rather than side by side, because at half a phone's width an
   exercise's name is cut ("Barbell Romanian dea…"), and the name is what the graph is about. All
   muscle groups with All exercises covers FitNotes's No filter, and All muscle groups with an
   exercise covers its Exercise filter, so no separate filter-type dropdown is needed.
2. **One group per exercise.** An exercise is filed under the group of its first primary muscle,
   as the exercise library already files it (`regionOf`), at the radar's six
   (`strengthGroupOf`). A deadlift is legs or back, never both, as each exercise has one
   category in a training log. So a group's volume is the volume of exercises listed under it,
   and the six add up to All. ADR 0042's half credit for supporting muscles answered "how many
   sets did each muscle get"; that question goes with the graph that asked it.
3. **Volume is load × reps.** "Volume" means what it means in the log the owner uses: the sum
   of weight × reps over working sets, in the account's unit. It counts only kg and lb sets,
   pounds converted to the hundredth of a kilogram, as a workout's shared volume is. A
   bodyweight, timed or stack-step set carries no load, so it adds nothing. It is still counted
   among the sets a bar's readout names ("6 sets, none loaded"), and a group that lifted nothing
   with a load says so and points to an exercise's graph (core work is mostly planks) rather
   than drawing an empty plot. The figure is "Total volume", not "Volume", because the exercise
   graph's Volume tab is the biggest single set, as the owner asked for in ADR 0042. The summary
   is the span's total with the weekly figure over the weeks trained ("158,639 kg · 31,728 kg a
   week · 24 workouts"). The span picks the bars: a day over a month, a week over a quarter or a
   half, a month over a year. That covers FitNotes's volume per workout, per week and per month
   without a graph-type list.
4. **No exercise until one is chosen.** Strength opens on All muscle groups' total volume.
   Choosing a group, or All exercises, changes the URL in place with no request: the volume
   of every group is already on the page. Choosing an exercise asks the server for that
   series' sets alone, as before. The free-weight lift done most often in the span is no longer
   opened by default on Progress, though an exercise's own page still uses that rule to pick a
   machine.

Also in this change: a line whose readings are all equal, such as four workouts of a dumbbell
shrug at 17.5 kg, stood between gridlines at 17.2, 17.6 and 18. That claimed a precision no
dumbbell has. One repeated reading now stands on a round middle line, a step of about a tenth
either side, one it is a whole number of where one is near: 15, 17.5 and 20.

## Considered

- **One select with groups as headings** (All legs, then the leg exercises, under each group).
  One control fewer, but one long list, and finding a group's own graph means scrolling through
  every exercise above it.
- **Keeping working sets beside volume** as a second measure for a group. Weekly hard sets are
  how hypertrophy research counts volume, but the owner found the graph pointless and asked for
  it gone. Sets stay in the readouts, not as a graph.

## How it was checked

`domain/progress-graphs.test.ts` (filing and volume by group, the weekly figure);
`server/repositories/graphs.test.ts` against the real migrations (volume per workout, pounds
converted, stack and bodyweight sets weighing nothing, each series' group);
`components/graph/geometry.test.ts` (the flat line); the section itself in
`progress/sections/strength-section.test.tsx`. Rendered against the audit account at 412 and
320 pt, light and dark, in a month and a quarter: each group, an exercise chosen and let go, and
core with nothing loaded.
