# ADR 0042: One graph for every trend

Date: 2026-10-07
Status: accepted; decisions 6 and 8 amended by
[ADR 0043](0043-strength-by-muscle-group-then-exercise.md)

## Context

The owner asked on 7 October 2026 for the graphs to be rethought: one graph defined once and
drawn the same way across strength, running, food, body weight and recovery; the same spans on
every graph ("1m", "3m", "6m", "12m", "all"), a month by default and remembered from one section
to the next, with hand-chosen dates kept but put behind the filters; one useful summary per
graph and its values collapsed; bars for totals and lines for trends; a tap that says what a mark
is and opens the record behind it; fewer graphs, none that cannot answer a question; and no
average that counts a day with nothing logged as zero.

What there was: three generations of chart. `InkBars`, `InkLine` and `ChartValues`
(`components/ui/ink-chart.tsx`) drew Running, Recovery, Body and the exercise page's months;
`StrengthTrend` drew an exercise's five measures; `Chart` (`components/ui/chart.tsx`) drew the
compare page's two lines, under the social screens' 7-day to 1-year periods. Each section chose its own buckets, its own axis and its own ends: Recovery
stood its bars a reading apart, so three weeks without a check-in took no room at all; Overview
and Running drew weeks and stopped at the last one trained in. Strength opened on the first
exercise in the alphabet (an unrecorded machine with one session, on the audit account) and
offered average RIR and most reps as trends. Nothing could be tapped. The range was twelve weeks
behind the funnel, and every read stopped at 500 workouts or runs, so a long range was a sample.

## Decisions

1. **One component.** `Graph` (`src/components/graph/graph.tsx`) is every graph on Progress, on
   an exercise's page and on a friend's compare page, with one anatomy: the readout (the graph's one summary, or the mark
   being read, with the way into its record), the plot in ink on the ground with the scale's
   round values as hairlines and their labels in the left margin, the dates under it, the spans,
   and every value behind one row. Its geometry is pure (`geometry.ts`, `thin.ts`) and tested
   without a browser.
2. **One span for every graph.** 1m, 3m, 6m, 12m and All, a month by default
   (`domain/graph-range.ts`). Choosing one anywhere chooses it everywhere: a server action keeps
   it in a cookie (`overload-graph-range`), which also drops every page the browser was holding,
   so the next section is not drawn from a copy in the old span. Dates chosen by hand stay in the
   URL, behind the funnel (now "Custom dates"), and hold until a span is chosen. History follows
   the same span, so a section changed keeps its window.
3. **Buckets by span, and the axis is the span.** A month is drawn by day, a quarter and a half by
   week from a Monday, a year by month (twelve, this one so far), and All by whatever its length
   needs, from the graph's own first record. The axis always runs the whole span, so two graphs
   in one span share their dates, and a week off reads as one. The dates under the plot are the
   calendar's own boundaries: Mondays, months, New Years.
4. **Bars for totals, lines for trends.** Totals are bars: distance, running time, working sets,
   calories, protein and hours slept. A measurement that rises and falls is a line: estimated
   1RM, heaviest set, most reps, biggest set, pace, body weight and the 1–5 answers. A line's
   records stand on their own days; past about sixty, a phone draws them as a band of ink, so
   they are grouped by week or month: an exercise's best workout (which still opens), a run's
   pace over all its kilometres, body weight's mean.
5. **Reading a mark.** A tap, or a drag sideways, reads the nearest mark with something in it:
   the readout swaps to its day, week or month, its figure and what made it, with Open workout,
   Open run, Open day, Open week or Open food log. A tap on it again, anywhere outside the graph
   or Escape goes back to the summary; a finger that scrolls the page reads nothing. The plot
   takes focus and the arrow keys step through the marks; Enter opens the record.
6. **One summary each.** Strength's groups: working sets, with the weekly figure (now total
   volume, ADR 0043). An exercise:
   its best in the span and the set behind it. Distance and time: the total. Pace: the average,
   time over distance. Food: the average a day. Body weight: the latest and its change.
   Recovery: the average a night or a day.
7. **Averages over what was logged.** A food day counts once its foods add up to more than zero;
   a day logged in part counts as what was logged. A recovery answer counts on the days it was
   given, a day checked in twice is one day, and zero hours of sleep is an answer. Strength's
   weekly figure is taken over the weeks trained.
8. **Strength: the muscle groups, then one exercise.** (Superseded by ADR 0043: a muscle group
   and an exercise in it, chosen from two selects, and the group's volume while no exercise is
   chosen.) The groups are the radar's six. A working
   set counts once for each group it trains, in full where the group holds one of the exercise's
   primary muscles and half where it holds only secondary ones: a squat is one set of legs, not
   three and a half. An exercise is drawn by estimated 1RM, max weight, max reps and max volume
   (its best single set), with max time and max distance for holds and carries; only the
   measures it has data for are offered. Average RIR and total reps are gone. It opens on the
   free-weight lift done most often in the span, not on whatever sorts first.
9. **Running:** distance, pace and duration. Pace is drawn faster-up, so better is up on every
   graph, and outdoor and treadmill are never one line; the choice between them shows only when
   both were run. The list of runs moved behind View values.
10. **Food is a section of Progress:** calories and protein a day, today's target as a rule.
    Food's own writes now refresh Progress.
11. **Body weight** is the recorded weight; the body map stays under it, on its own week.
12. **Recovery,** besides the averages: a date axis, the four answers as one control like every
    other section's, the 1–5 answers drawn as lines on their whole scale (joined across days
    without a check-in, their points showing where the readings are), and the latest check-ins
    moved behind View values, each opening its workout.
13. **Overview** keeps the month and its totals; the weekly session bars are gone (each week's
    count is in Strength's and Running's readouts), and the training totals follow the span.
14. **The exercise page** shows the same exercise graph in place of its monthly heaviest-set bars
    and its separate trend card.
15. **Reads** take counts and bests per workout (`server/repositories/graphs.ts`) and the runs
    themselves, so All covers every year an account has, with no 500-record sample.
16. **Head to head.** A friend's compare page draws one movement's primary measure as two lines
    on the same `Graph` (`against`): yours in ink, theirs in grey (series 2, `control`, which
    forced colours turn into a colour of its own), each running straight across the other's
    training days. The readout reads both side by side, each figure under its name and its
    line's key: each person's best in the span, then a day either trained (past about sixty days,
    a week or month, both grouped alike), with your workout and their shared session to open.
    It follows the shared spans like every other graph, not the social screens' periods, and
    View values lists both in a column each. `Chart` and its period select there are gone.

## Not done

- Two calls were left to the owner, with screenshots of both: the spans under the plot or over
  the readout, and pace faster-up or lower-is-faster. Subtle gridlines were tried against none
  and kept: without them the scale's labels float and a value cannot be read across.

## How it was checked

`npm run check`; the domain, geometry and component tests in `domain/graph-range.test.ts`,
`domain/progress-graphs.test.ts`, `components/graph/*.test.ts(x)`, and the readers against the
real migrations in `server/repositories/graphs.test.ts` and `shared-stats.test.ts` (the head to
head's links, as a follower reads them); the compare page's wiring in its own `page.test.tsx`. Every section was rendered against the
56-month audit account at 402 and 320 pt, in light and dark, in every span, with marks tapped.
