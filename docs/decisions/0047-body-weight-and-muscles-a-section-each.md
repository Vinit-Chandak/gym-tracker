# ADR 0047: Body weight and muscles, a section each

Date: 2026-10-08
Status: accepted; amends decision 11 of [ADR 0042](0042-one-graph-for-every-trend.md)

## Context

On 8 October 2026 the owner, looking at Progress → Body on their phone, asked for the body
weight graph to be parted from "Muscles this week", body weight becoming a section of its own in
the picker. Where the body map should go was left open. They had first wanted it on the tab's
landing, Overview, as the best-looking thing on Progress, but judged the month's calendar, and
its one tap into a day's sessions, the more essential, and asked which way to go.

Body put two clocks on one screen: the graph's span beside the picker ("9 Sept – 8 Oct 2026"),
and under the graph the map's own week ("5 Oct – 11 Oct 2026"), each with its own controls. The
map's heading said "this week" whichever week it showed, as did a muscle's line when tapped.

Shown the two sections, the owner kept them as named, kept the map off Overview (History joins
the month there, [ADR 0045](0045-the-latest-ten-under-the-month.md)), and asked that Muscles have
no date filter at all: week by week.

## Decisions

1. **Body weight is a section of its own,** in Body's place at the end of the picker, named
   "Body weight": the measurement, as its graph is named, while "bodyweight" stays the kind of
   set that carries no load. Its `?view=` stays `body`, so a link made before still opens it.
2. **Muscles is a section of its own, beside Strength.** The picker lists Overview, Strength,
   Muscles, Running, Food, Recovery and Body weight (History left it in ADR 0045). The map
   counts working sets from finished workouts, so it stands with the other lifting section.
3. **Overview stays the month,** with History's latest ten under it (ADR 0045): the way into a
   day's sessions keeps the first screen, and the map is not added under it.
4. **Muscles keeps its own week, and names it once.** It follows no span, so no dates stand
   beside the picker and there is no funnel: Custom dates would choose a span it does not draw.
   The week is named as a graph names one (`weekLabel`): "This week" while it runs, otherwise
   its days ("28 Sept – 4 Oct"). The heading says what is shaded, "Working sets", with its ⓘ; the
   picker already says "Muscles". The arrows stop at this week, since nothing is trained in a
   week still to come. A tapped muscle reads "Chest · 6 sets" (or "1 set", no longer "1 sets"),
   naming no week of its own to get wrong. Dates chosen by hand say nothing to it, not even a
   warning that they could not be read; a week that could not be read is said there alone.
   Overview, with no span since ADR 0045, no longer says a warning about dates either.

## Considered

- **The map on Overview, under the month's key.** It is the best-looking thing on Progress, and
  Overview is where the tab opens. Mocked against the audit account on a 402-pt phone in a full
  month (five rows), the map began at the foot of the first screen: it is reached by a scroll
  there, as the section is reached by a tap. It pushed whatever follows the month (the training
  totals then, History's latest ten since ADR 0045) a screen and a half down, and set the map's
  week, with arrows of its own, beside the month. It is also lifting alone on the one page about
  every sport, and mostly grey early in a week or in a week of runs.
- **The map in Strength,** under the group's volume. Strength is the lifting section, but the map
  would bring Body's two clocks back (Strength's span, the map's week), and its counting, per
  muscle with half for a secondary one, would stand beside the groups' (each set once, under its
  exercise's group, ADR 0043) without adding up to them.
- **This week's map on Overview as well,** without arrows, opening Muscles as the month opens the
  Calendar. Kept in reserve: the same map would be on two screens, and the landing would still
  grow by a map.

Also in this change: a graph measured its labels at the text size it was first drawn at, and
again only when its box changed size. Text made larger while a graph is on screen leaves the box
as it was (the plot is a fixed height, its column a fixed width), so at 200% the dates under
every graph were spaced for 100% and ran into each other, the last off the edge. A rem-wide probe
now tells the graph the text size changed, as one tells the workout screen. A page opened at 200%
was already right.

## How it was checked

`progress/progress-sections.test.tsx` (the picker's seven in order, Body weight keeping `body`),
`progress/progress-view.test.tsx` (Body weight with its span and funnel, Muscles with neither),
`progress/sections/muscles-section.test.tsx` (this week named and the last; an earlier week by
its days; the steps) and `components/ui/body-map.test.tsx`. Rendered against the audit account at
402 × 874 and 320 × 568, light and dark: both sections, an earlier week, the picker's rows
(eight before History left, none clipped at 320 × 568), and the Overview mock above. `audit:ui-controls`' large-text check
had measured only the body map's figures on Body (a graph's plot carries no role) and looked for
a list of values renamed in ADR 0042. It now measures the map on Muscles and the graph on Body
weight, opens the graph's values, and passes. `components/graph/graph.test.tsx` grows the text
under a drawn graph; in the browser, with the text doubled after the page loaded, the dates under
Body weight, Strength, Running, Food, Recovery, an exercise's page and the compare page stood
clear of each other (every other Monday over a month), and every Monday at 100%.
`audit:recovery` had been left on the old charts' markup; it now finds the measure control, the
graph, its values and a check-in's workout behind them. Every graph's figures are given to a
tenth, so a night of 7.25 h reads "7.3 h"; the owner kept the tenth, and the audit expects it.
Run whole, it also found Recovery saying "No check-ins in this range." over a span whose
check-ins had left that answer blank. It now says "Sleep not answered in this range." (or the
measure's name), as a mark's readout already said "Sleep not answered", and the audit passes.
