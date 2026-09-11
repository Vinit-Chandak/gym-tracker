# 0023 — A masthead, not a stack

Status: accepted, 2026-09-11. Follows [0017](0017-navigation-island-and-page-headers.md), whose
page header this replaces, and [0022](0022-a-status-bar-at-the-bottom-of-the-screen.md).

## Context

Every screen opened with the same two lines: a small letterspaced uppercase eyebrow, and the
title under it. On Today that meant reading `FRI, 11 SEPT 2026` before arriving at the word
"Today" — the least interesting thing on the screen announced in the loudest register the type
ramp has, above the one word that the tab already says. On a page one level down the eyebrow
carried the section, so a lone back chevron had a caption that was nowhere near it: the trail
was printed above the title while the control it explained sat to the left of both.

Three directions were drawn against the app's own tokens at the phone's width and looked at
side by side. This one was chosen.

## Decisions

1. **The title owns a line, and its meta hangs off the far end of it.** `PageHeader` takes
   `meta` where it used to take `context`, and renders it right-aligned on the title's own
   baseline in `--ov-text-small`, tabular. One row instead of two: the date Today is, the range
   History and Progress are drawn over, the gym a form is for. Nothing moved in the type ramp —
   the eyebrow simply stopped existing.

2. **Today says the app's name.** Its title is the `Wordmark` — "Overload" with the accent full
   stop, the mark the desktop rail already carried and now shares — with today's date at the
   right end as `Fri 11 Sept`. `formatIsoWeekdayDay` drops the year, which on today's date is
   never the question, and the comma en-GB puts after the weekday, which a masthead does not
   want.

3. **One level down is a compact bar with the way back named.** Where a screen has a
   `backHref`, the header becomes a 3.25rem row: the chevron and its destination on the left,
   the title centred between two flexible cells, whatever the screen offers on the right. The
   destination comes from `sectionLabel`, so a machine three levels inside a gym goes back to
   "Gyms" and says so; `backLabel` overrides it where the section is vaguer than the page. The
   whole cell is the target, and the accessible name is "Back to Gyms" rather than "Back".

4. **A sentence is not a qualifier.** The substitution screen's "Instead of this exercise at
   this gym" line moved into the page, where a sentence has room; the pages whose context was
   an identity — the gym a machine is being added to, the day a session is finishing — keep it
   as meta in the bar, truncating rather than wrapping.

5. **A preview of the set.** `/preview/headers` renders the real `PageHeader` in each of its
   shapes against made-up screens, so the next change to the header can be looked at on a phone
   in both palettes before it ships, the way 0021 kept the preview group for Today and the set
   grid.
