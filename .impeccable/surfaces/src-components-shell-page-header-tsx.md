---
version: 1
slug: "src-components-shell-page-header-tsx"
primary_target: "src/components/shell/page-header.tsx"
related_targets: ["src/components/ui/section.tsx", "src/components/ui/card.tsx"]
---

# Headings and blocks: quiet signs

Scope: every screen's title, section headings, card titles and the blocks they head (Plan, a programme's page, Today and Profile first), as mock-ups on the Design canvas. Visitor mode: Operate. The owner's choice on 28 October 2026 (the art of Games, the overall design of the Coupon book, toned down with the category standard) was built as event tickets and rejected the same day: too many styles mixed, too much going on, and facts said twice (a calendar strip with sport colours above a list of the same sessions). The owner asked for each screen to be thought through, each fact said once, one seamless style, premium and not gimmicky.

## Direction contract

THESIS: One face, one surface, and colour only for sport. Each sport speaks through its Munich-grid sign, once per item; everything else is ink on white cards on a neutral ground, and every fact has one place. It refuses both the earlier mix of tickets, signage fields and ruled headings, and the category default of an icon chip on every row.

OWN-WORLD: Munich 1972 signage reduced to its signs: Aicher-grid pictograms (0, 45 and 90 degrees, one stroke, disc heads) in the app's own sport pigments (lifting #2b40c8, running #e5432a, riding #6b48c0, swimming #1d7a62, mobility #c8487a; dark #8796f5, #f2704f, #a08cf0, #45b593, #e07aa3), never on a tile. Host Grotesk alone, in five sizes (30, 20, 17, 15, 13) and four weights (450, 600, 650, 700), sentence case, nothing above a heading. A title is two tones: what the screen is (30/700 ink), then its one fact (20/600 ink 2). A section heading is 20/650 with its one action on the same line, and heads rows; a card that heads the screen (Today's task) takes 20/650 for its title, a row 17/600, a nested or settings row 17/450, meta 15/450, day names and tab labels 13/600. Ground #f1f1f3 (dark #111214), white cards (dark #1b1c20) at radius 20, no outlines and no shadows, rules only between rows inside a card. One ink primary per block, and a pair of buttons is always two equal widths, the ink one first; danger is the only other colour, and only as text. Signs come in three sizes: 24 before a session's name, 40 beside a task's title or a programme in a list, 64 once, beside a programme's name on its own page.

STORY: The athlete opens Plan and reads the week as one list: the days gone by folded into a line, today marked by the one dark disc, each session by its sign and name. Programmes sit under it as one list that says how each runs and where it has got to. A programme's page carries the bar and the weeks; Today carries only what is owed today, with one button each.

FIRST VIEWPORT: Plan: "This week" over "26 Oct – 1 Nov", previous and next week beside it; one card for the week (Mon 26 – Wed 28 · 2 done · 1 missed, then Thursday 29 on the dark disc with Upper A Done and the tempo run, Saturday's long run with its distance, Sunday's rest and mobility); "Programmes" with New; the programmes as one list, each with its 40-pt sign trailing, and Past programmes as its last row, all above the tab bar.

FORM: The owner's combination, reduced after the second review: the signs from Games, the white cards on a ground from the Coupon book, the calm of the category standard. seed:9319cd879c9732f6

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## What each screen keeps, once

- Plan: the week's dates (title), each day's date (the week's own column), today (the disc), each session's sport (its sign), name, figure where the name does not say it, and its answer (Done, Skipped, Missed, as a word) once given. Programmes, as one list: name, how it runs and where it has got to, its sign. Removed: the seven-day strip and its sport bands, "2 of 7 done", Today on rows, stubs and notches, the blue field, ruled headings.
- A programme's page: name and sign; how it runs and for how long (title's second line); one bar with "Week 1 · 1 of 39 sessions done"; Edit programme, Details, More options; the weeks, the current one open. Removed: the separate "Running programme" headline, "Now", "of 10" (the title says 10 weeks), a sign on every row (every session is a run).
- Today: the day, Log; a card per task (title, sign, one ink button, Skip or move, the steps folded); Done as rows. Removed: "0 of 1 done", the programme's name, the ticket stub.
- Profile: the person (name, handle, avatar, one link to their page), the two counts, Edit profile; Friends with its requests; settings as grouped lists. Removed: the sports chips (the Sports row says it), the field and art behind the header.

## Open decisions

- Sport colours stay as the app has them; the move to burnt orange, olive and #b8407f is withdrawn.
- Host Grotesk replaces Atkinson Hyperlegible Next for words and Jost for figures: one face. The consistency audit's rule that type at 20 px and above is Jost changes in the same commit.
- Days gone by fold into one line instead of one closed row per day (features.md, Plan, This week).
- New programme moves from the header to the Programmes heading; the header's one action is the week stepper.
- The ground model flips to a grey ground with white cards on every screen (today Plan and Today sit on white with grey cards, Profile on the grouped ground).
- DESIGN.md is rewritten only when the owner approves the direction for implementation.
