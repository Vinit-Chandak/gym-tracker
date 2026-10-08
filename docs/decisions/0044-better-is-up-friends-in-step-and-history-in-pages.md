# ADR 0044: Better is up everywhere, friends' screens in step, History in pages

Date: 2026-10-08
Status: accepted; amends decision 2 of [ADR 0042](0042-one-graph-for-every-trend.md)

## Context

On 8 October 2026 the owner asked for three checks and two changes:

1. On every graph, does getting better mean moving up and to the right?
2. Was every change they had asked for made on the friends' comparison graphs too?
3. The spans as 1M, 3M, 6M, 12M and All.
4. History in pages of ten, not on the spans: a list is not a graph.

The audit found one graph the wrong way up and four places where the friends' screens had been
left behind.

## Decisions

1. **Better is up, fatigue and soreness included.** Every graph was read against the Better Is
   Up Rule. The x axis is time on all of them, newest at the right. Up is better for total
   volume, every measure of an exercise, distance, running time, pace (already drawn faster-up),
   protein, sleep and sleep quality. Fatigue (1 fresh, 5 wrecked) and soreness (1 none, 5
   severe) had 5 at the top, so a worse week climbed. Both are now drawn downward, 1 at the top,
   and say so in their ⓘ. The numbers are kept as answered, not turned into "freshness".
   Calories and body weight are left with up as more. Whether more is better depends on the
   goal and its target, which the graph draws as a rule (calories), and a weight axis drawn
   upside down for one goal would be misread by everyone else.
2. **The spans read 1M, 3M, 6M, 12M and All.** Only the labels change. The values kept in the
   cookie and the URL stay as they were, so a remembered span still holds.
3. **The head to head offers what an exercise's graph offers.** Estimated 1RM, Weight, Reps and
   Volume (the biggest set), with Time and Distance for holds and carries. Only the measures the
   movement is measured by appear, in the same order and with the same names as an exercise's
   own graph, and only those either of you has in the span. The shared rows already held every
   measure, and one read takes them all (`readExerciseTrends`).
4. **The muscle split stops counting a set more than once.** The radar summed each session's
   sets per muscle, so a squat set counted for quads, glutes and half for hamstrings and
   adductors: three sets of legs against a bench press's one of chest. That is the double
   counting the owner asked to be rid of. Each working set now counts once, under the group
   its exercise is filed under (ADR 0043: its first primary muscle's), read from the
   per-exercise shared rows (`readGroupSets`). A movement someone added themselves has no shared
   row, so it has no place in a friend's view of the split. That holds on a person's page and
   on the comparison.
5. **A friend's page and the comparison follow the shared span.** Both took the social screens'
   7, 30 or 90 days or 1 year. Now they use the same 1M to All as every graph, remembered with
   it, so the split, the numbers and the head to head under them cover one window. Opening the
   comparison keeps the sport; the span needs no carrying. The leaderboard keeps its periods: it
   ranks and has no graph.
6. **History is a list in pages, not a graph on a span.** History shows every entry, newest
   first, ten to a page (`HISTORY_PAGE_SIZE`), with the page tabs under the list. The tabs are
   drawn as the span tray was: a surface tray, each page a 44-pt target, the page being read in
   ink. They show every page up to five, then the first and the last and the page being read
   with its neighbours, with a gap mark between (`pageSlots`), so they keep their targets at
   320 pt. The page is kept in the URL, so Back from an entry returns to it. A filter starts
   again at page 1, and a new page is read from the top. Dates chosen by hand stay behind the
   funnel and narrow the list. Without them it reads back as far as its readers go: the newest
   500 workouts and 500 runs, as All did. Where a reader stops short, the list ends after the
   last whole day for every kind. Otherwise recovery check-ins, which have no cap, would run on
   alone over the later pages, the workouts of those weeks missing. The last page says where
   the list ends; the old notice no longer stands over every page. A day in another year is
   named with its year ("2 Jun 2023"), as a graph's readout names it. Pages turn on the phone,
   with no request: the filters already ran there, and they still do.

## How it was checked

`progress/sections/recovery-section.test.tsx` (the scale's order for each answer),
`components/graph/head-to-head-graph.test.tsx` and the comparison's `page.test.tsx` (every
measure read, offered and switched), `domain/muscle-split.test.ts` and
`server/repositories/shared-stats.test.ts` against the real migrations (a set once, under its
exercise's group, as a follower reads it), `u/[username]/social-sports.test.tsx` (the span in
place of the period), and `components/ui/page-tabs.test.tsx` with
`progress/history/history-view.test.tsx` (ten a page, the tabs, the page in the URL). Rendered
against the audit account.
