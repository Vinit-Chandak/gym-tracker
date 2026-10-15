# ADR 0045: The latest ten under the month

Date: 2026-10-08
Status: accepted; amends decision 13 (Overview) of
[ADR 0042](0042-one-graph-for-every-trend.md) and decision 4 (History a section of Progress) of
[ADR 0034](0034-food-takes-the-history-tab.md)

## Context

On 8 October 2026 the owner asked for Overview's training totals to go. A total over a span said
little the month above it did not, and its time and distance could be said on the month. In
their place they asked for History, in History's format, the ten most recent activities.

At first they could not decide what the list should cover. The calendar is this month, so
ideally the list would hold every record the calendar does. By a month's end that can be a
hundred entries, which would need pages. At its start it can be three, or none, and a list of
the last three did not sit well with them. Both options were rendered from the app's own
components on 8 and 29 October and on 1 November, and the owner chose the latest ten. They also
asked for the list to be called History, and for History to stop being a separate section,
since Overview now leads to all of it.

## Decisions

1. **The month's key says how far and how long.** Each sport under the calendar keeps its icon
   and count, and under its name gives the month's distance (for the sports that measure one)
   and recorded time: Runs, 9.2 km, 1 h 9 min. A time adds up what was recorded and is left out
   where nothing was, as distance already was. Each figure keeps its unit, so a narrow column
   breaks between the hours and the minutes, never inside "26 min". Training totals, their spans
   and their ⓘ are gone (`readSportTotals` is no longer read for Overview), and so is Overview's
   funnel: nothing on Overview is drawn over dates. A span's counts are still in Strength's and
   Running's readouts.
2. **Under it, History: the latest ten.** The ten newest activities, newest first, in History's
   own rows under their day captions: one component (`HistoryList`) built by one set of functions
   (`history/history-items.ts`), so the list and the page behind it never word an entry
   differently. The head reads History, with All at its end, as the month's head has Calendar.
   The list is the calendar read back from today, not the calendar's month. Where the month holds
   fewer than ten, the list runs on into the months before, each named once over its first day,
   so it says where the calendar stops. Where the month holds more, it shows the newest ten, and
   All opens the rest. It lists what the calendar marks (workouts, runs, rides and swims), not
   recovery check-ins, which stay on History's page. Each sport is read ten deep
   (`readLatestActivities`), so however the sports mix, the newest ten are among the rows read.
   An account with nothing logged shows no list, since the month already says nothing is logged.
3. **History leaves the section picker; its page stays behind Overview.** Progress's picker lists
   Overview, Strength, Running, Food, Recovery and Body. `/progress/history` is no longer chosen
   from the picker. It is the page Overview's All opens, under Progress as the calendar is: a
   back link to Progress, History as its title, its range under it and its filters at the end of
   its bar. The page keeps every entry in pages of ten with its filters, and it is still where a
   graph's week opens and where a deleted activity lands. Taking it away as well would have left
   anything older than ten reachable only day by day through the calendar, and no way to filter
   by gym, exercise or machine.
4. **The month in pages, weighed and not taken.** Listing the calendar's month ten to a page
   would match every row to a mark above it, but it fails at both ends of the month. On the 1st
   the list is empty, saying "Nothing logged" a second time under a month that just said it,
   and the last week's training, the most useful thing to see then, is gone from the screen. By
   the month's end it is three pages or more, with page tabs at the foot of a screen meant to be
   read at a glance. And it repeats History's pages without History's filters. The latest ten is
   never short while there is anything to show and never longer than a page, and it names the
   month boundary it crosses.

## How it was checked

`progress/sections/overview-section.test.tsx` covers the key's count, distance and time, and the
list under its days, with the earlier month named once and All linked.
`server/repositories/history.test.ts` checks against the real migrations that the newest ten are
read across workouts, runs and rides, with an open session and another account's run left out.
`components/progress/calendar.test.ts` checks that the month's time adds up only what was
recorded, and `progress-sections.test.tsx` that the picker lists six sections and reads a
`?view=history` as Overview. History's own tests pass with its new header. The preview
(`/preview/progress`, with `?state=` early, late, first or new, and `?view=history` for the
page) was rendered against the owner's 8 October calendar (three lifts, three runs, 9.2 km) at
402 and 320 pt, in both themes.
