# Colour, forms and laps: plan

Written 21 October 2026 from the owner's notes on the built app (Today, Plan and Log a run on an
iPhone) and five rounds of renders reviewed on his phone. The owner locked the direction the same
day ("go ahead for everything"). The rules it sets are already in `DESIGN.md` (Amended 21 October
2026), `PRODUCT.md` (principles 7 to 9) and the `overload-ui` skill; this file is the work that
brings the app up to them.

## What was wrong

1. The interface was black and white everywhere but the art (the Black-and-White Rule): an error
   was an ink box, nothing marked the field at fault, and empty screens read as unfinished.
2. Page heads disagreed: Today showed a date and a 36-px "Nothing planned", Plan its name, Progress
   a hand-built copy of the shared header.
3. Log a run was a stack of boxes with no grouping; a refused save showed its message twice in ink.
4. An interval session entered as laps could not be saved without retyping the totals the laps
   already held ("Enter the duration as more than zero and under seven days"), every lap was a
   plain "Lap", and Kind of run went back to Not said after the refusal (React resets a form after
   an action, and an uncontrolled select returns to the option it mounted with). Seven other
   forms have the same select.
5. Today, Plan and Progress had tab icons built from the same squares and circles.
6. The audits opened every page but did not carry out the tasks, so none of this was caught.

## Decisions (locked 21 October 2026)

| Topic        | Decision                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour       | The Colour Is Information Rule: a sport's pigment on its own prints, marks and data; red (danger) and green (success) as the only signals; ink for the chrome. Pigments unchanged for now               |
| Measured     | Hair `#d8d9dc` / `#37383c`; dark ink 2 `#b2b5bc`; dark control `#787b83`; danger and success ramps; food's ochre edge. Every pair measured (WCAG 2 and APCA) in both themes                             |
| Primary      | One filled action per screen, in ink; never a sport's colour                                                                                                                                             |
| Effects      | No glass, blur or decorative gradient. Motion only for cause and effect: totals that change as laps change, a mark that inks in when done, a refused field brought into view, undo                    |
| Headers      | A tab's root opens on its subject, never its name; nested pages keep back and title; tab labels stay                                                                                                     |
| Tab icons    | Today the app's mark (in its pigments when lit), Plan a calendar, Food the bowl, Progress the loaded bar, Profile the person; outlined, filled when lit                                                  |
| Forms        | Sections as panels on the grouped ground; fields inside panels are filled trays; one filled action pinned                                                                                                |
| Errors       | The field turns red where it is (tint, line, glyph, the fix in words) and stays so until it can be saved; a bar over Save counts what to fix and leads there; every value and choice survives           |
| Laps         | Kinds (Warm-up, Rep, Recovery, Cool-down), "+ Rep" and "+ Recovery", standing recoveries, totals from laps unless the watch's are typed, reps with recoveries make Intervals, rep pace is the pace that counts |
| Intensity    | Heart-rate zones only, as five densities of the sport's pigment on a run's or ride's page; no colour beside effort or a lap                                                                             |
| Skills       | Eleven added (`docs/ui-redesign/revamp/skills.md`, Updated 21 October 2026)                                                                                                                              |

Not decided here, and kept for later: a pigment set without orange and blue (red and green are
taken by the signals, so it would move running to magenta and strength to a deep violet, and every
print would be redrawn); laps for rides and swims.

## The work

### 1. Foundation (tokens and feedback)

- `src/styles/form-v2/palette.css` and `foundation.css`: the new and changed tokens in both
  themes, with `--ov-danger*` and `--ov-success*` no longer pointing at ink; Tailwind names in
  `globals.css`.
- `Field`, `Input`, `Select`, `RowStepper`, `SegmentedControl` and `EffortField`: an invalid field
  takes the danger tint, line, glyph and text (from `aria-invalid`), and its message says the fix.
- `FormError` becomes the refused-save bar: danger tint, the count and names of what to fix, a link
  to the first; it no longer repeats a field's sentence. A failure that is not a field's keeps its
  words and Retry.
- A success bar for a kept record, with Undo where the action can be undone.
- `Panel` and the grouped ground for forms and settings.

### 2. Logging

- Laps: kinds on every lap, "+ Rep" and "+ Recovery", standing recoveries, a rep copies the last
  rep's distance.
- Totals: distance and time from the laps when they are not typed, marked From laps, with "Use the
  watch's totals instead"; typed totals checked to be at least the laps' with a one-tap fix. The
  domain, the server action and the coach's evidence all accept a run whose totals are its laps'.
- Kind of run: Intervals when the laps hold reps and recoveries, until the athlete chooses another.
- Rep pace: shown on the form and the run's page; the run's overall pace says "with rests"; pace
  trends, records and the coach's running pace leave an interval session's overall pace out.
- Every select in an action form keeps its choice after a refusal (running, swimming, scheduling,
  gym equipment, fallback, add exercise, tokens).
- Rides, swims and workouts carried out end to end, and whatever fails fixed in the same way.

### 3. Navigation and Progress

- The five destination icons redrawn; the tab bar keeps its labels.
- Tab roots: Today the day, Plan this week (and the week as seven day papers), Food the day's
  intake, Progress the section being read, Profile the athlete; each with a screen-reader h1 that
  names the tab first.
- Today with nothing planned: the rest day's crescent on its paper, Nothing planned, Log a session.
- Graphs: a sport's in its pigment (thinned bars, the latest full; lines in the pigment); food's in
  its ochre; everything else in ink; time in zones as densities.
- Records: a success-tinted Record tag for one set in the span.

### 4. Forms in panels

Log a run, a ride and a swim, the workout's Finish, body weight, and Profile's settings lists move
onto panels on the grouped ground.

## Done means

Each of these is carried out in the running app (local stack, iPhone and Android profiles, light
and dark), and each becomes a check in `scripts/dev/` that fails when the task fails:

1. Log an unplanned interval run as seven laps (warm-up, three reps, two standing recoveries,
   cool-down) without typing a total; it saves as Intervals, its page leads with the rep pace.
2. Type the watch's distance below the laps' total: the distance turns red with the fix; Use the
   laps' total; save.
3. Refuse a run with Kind of run, effort, surface and laps filled in; every one of them is still
   there after the refusal.
4. Log a pool swim by lengths and an open-water swim by distance; log a ride in miles.
5. Start a workout, log sets including a failed save (offline), finish it.
6. Each tab root: the subject headline, the lit icon, no repeated tab name; at 320 pt and 200% text.
7. Progress: a running graph in vermilion, strength in ultramarine, body weight in ink, in both
   themes.
