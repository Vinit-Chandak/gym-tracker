# Today, and the programme behind it

A review on a phone found Today drawn almost entirely in lines: a rule under the folded
plan and another over it, a rule between every exercise, and a card whose only content when
folded was that stray row above the button. The exercise rows were ragged, because a name
and a prescription sharing one line wrap only on the long names, so the list was part
one-line rows and part two. The programme was four label/value rows behind a fold and went
nowhere, while Settings → Programme showed the name, the dates and a template picker —
never the sessions the programme actually asks for. Progress and History each opened with a
full-width date box above the content people came for.

## Rules

1. **One control for what narrows a screen, beside its tabs.** `FilterSheet` is a compact
   button at the trailing edge of the tab strip — the entry count's row on History, which
   has no tabs — carrying a count when filters are set. It opens the bottom sheet, which is
   anchored to the bottom edge, capped at 90dvh and scrolls its own content, so the panel is
   inside the screen on any device rather than hanging off the side of a narrow phone.
   Nothing inside it renders while it is closed. The date range moved into it, and the range
   itself moved to the page header's context line, where it costs no box.
2. **A card is the decision; its plan is the last row.** Every Today card is the name, the
   standing, one line of what it costs and its own action, then `Disclosure variant="footer"`
   — full bleed inside the padded box, one hairline above it, the box's bottom edge below.
   A closed card is a decision and nothing else; an open one adds the plan under the button
   rather than pushing it down the screen.
3. **A list of exercises has one rhythm.** `PlannedExerciseList` gives every exercise a
   two-line entry, the name over its prescription, so entries are the same height whatever
   the name's length and the prescriptions read down one column. There are no rules between
   them; a superset takes one tinted bracket around the whole group rather than a marker on
   each of its rows. Today, "Choose a day" and the programme all draw it.
4. **A tip gives back the height it takes.** The info tip's tap target is taller than the
   heading line it sits on, which was itself a source of uneven spacing: it now carries a
   negative block margin, so a card with a note is spaced exactly like one without.
5. **Everything that is not the day goes behind one control.** "Train another day", "Start
   an ad hoc session" and "Skip this session" are rows in one `More options` sheet, and
   skipping asks for its reason by replacing that sheet's contents rather than opening a
   second sheet on top of it.
6. **A summary that links to the whole.** Today ends with the programme's name, a meter and
   its position, as one tappable box that opens Settings → Programme.
7. **The programme page is the programme.** Settings → Programme now carries the dates, the
   meter, what one cycle asks for (weeks, days, lifting days, sets) and then every day of
   the cycle: its focus, its cost, its status this cycle, and — opened — its exercises, its
   run, its warm-up and its notes. Each day is a native `<details>` in its own box, so a
   seven-day cycle sends no JavaScript for it. Starting a new programme is folded beneath.

## Structure

`getProgramOverview` reads the whole programme in three statements — the schedule, then
every day's exercises and the cycle's runs together — with warm-up names taken from the
library already in memory, so a seven-day cycle costs what a one-day one would. `Today`
splits into `page.tsx` and `today-view.tsx`, as Progress and History already do, so the
screen can be rendered from fixture data. `ProgressBar` and `DetailList` are shared: the
meter is the same on Today, Progress and the programme, and label-over-value replaces the
two-column rows that squeezed a sentence into a third of the width.

## Not changed

No feature was removed. The gym switcher, ad hoc sessions, skipping, choosing another day,
the rest-day protocol, every History filter and every Progress trend reach the same places;
the schedule, progression and analytics are untouched.

## Validation

Lint, formatting, TypeScript and the 222 tests pass. Today (lifting, run and rest days),
the programme's whole cycle open and closed, History and Progress were rendered from the
programme template's own data against the production stylesheet and reviewed at 320 and
390 CSS px in both palettes; nothing overflows and no control falls under 44px. Field
measurements on real devices remain open, as in decisions 0013, 0014 and 0015.
