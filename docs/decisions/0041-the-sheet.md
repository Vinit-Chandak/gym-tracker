# 0041. The sheet: one visual world, rebuilt from the coach outward

Date: 2026-10-02 · Status: accepted · Supersedes the interface decisions in 0011, 0013, 0014,
0015, 0017, 0022, 0023, 0024 and the visual half of 0036 (their product decisions stand).

## Context

The interface had grown screen by screen into a stack of same-size boxes on a cream canvas with a
terracotta accent: competent, and indistinguishable from what any tool ships for a fitness app.
The coach, which is the product, lived behind Profile and under a disclosure on Today. The owner
asked for a ground-up revamp with every feature kept, and for the result to be judged on taste.

## Decision

One visual world, **the sheet**, chosen through the design skill's direction round from seven
artifacts of the athlete's own culture (the periodisation chart and programme sheet won the roll
over the coach's whiteboard, the plate colour code, the running-watch screen, the meet
scoreboard, the anatomical chart and the athletics track). It is recorded as a direction contract
under `.impeccable/surfaces/` and, once built, documented in `DESIGN.md`.

- Every screen is a position on the training plan, drawn on one page with a faint construction
  grid. Groups are ruled blocks, not boxes; the one opaque container (`panel`) is reserved for a
  thing that must stand off the page.
- Four inks with meanings: **ink** for what is confirmed, **pencil** for what the coach proposes
  and the athlete has not confirmed, **pen** (ballpoint blue) for the coach's own hand and every
  tappable word, and **one highlighter** per screen for today, the current step and the primary
  action, and nothing else: a chosen cell in a segmented control is inked in, a marked row or
  tile in a picker takes the highlighter's soft tint with a pen check, and the wordmark carries
  its highlighter stroke only on the sign-in screens, where the app is the subject. The daylight
  and graphite sheets are two renderings of the same world.
- Barlow, self-hosted, with its semi-condensed cut as the data voice; tabular numerals everywhere.
- Today opens on the plan: the cycle strip (where today sits), the gym line, the day's name set
  large, the plan as numbered rows with the coach's reasons in pen, and the Start bar in thumb
  reach. In the logger, set numbers ink in as sets save, the highlighter sits on the next Save,
  and a completed exercise hands on to the next one with one tap.
- Progress opens on the programme as a periodisation chart, the world's signature graphic: the
  work of each week as stepped bars in ink over the cycle blocks, the plan's sets a week as a
  pencil step, the sequence's cycle under the highlighter and today as a pen line.
- The tab bar is flush to the bottom edge with a highlighter mark on the current tab; the session
  line and the rest timer are one slim strip that is off most of the time.
- Route changes turn the sheet through React's view transitions, typed by the link: a tab
  crosses, a row slides in, a direct back link slides out; reduced motion holds a still.

## Consequences

- Every feature, action and test-asserted string was kept; the visual layer, navigation, icons,
  type, colour, art and motion were replaced.
- `DESIGN.md` and `.impeccable/design.json` are the design authority; `.claude/skills/overload-ui`
  carries the house rules for working in this world. Earlier revamp documents were deleted unread.
- The native Android and iOS apps to come inherit the world: nothing in it depends on web-only
  chrome, and the tokens, type and art port as they are.

## How it was finished

The build closed the way the direction contract demanded: unreviewed and undocumented is
unfinished.

- **Finish review.** The design skill's finishing reviewer, with fresh eyes and no build
  context, read the direction contract against captures of every tab in both palettes, the
  desktop views and the logger. Its first disposition was _fix_, with eight material findings:
  the periodisation chart had not been built; a label sat above the day's name on Today; the
  wordmark carried a fourth highlighter; the session overview gave the highlighter to Finish
  instead of the next exercise; the superset band ran beside the Start bar; a converted load
  printed to the hundredth; the behind count appeared twice and in warning ochre; Food's total
  was a hero metric. All eight were fixed in one batch, the one partial fix (Food's total) and
  two regressions the chart introduced (lettering under 12 px, an orphaned date) in a second,
  and the recaptured packet earned _ship_ on the scored items.
- **Critique.** Two isolated assessments: a design director's review (specificity, Nielsen's
  heuristics scored 29/40, cognitive load, emotional journey, personas) and a deterministic pass
  (the detector clean over the whole tree; the browser overlay finding tab labels under 11 px and
  a width transition on the progress bar, both fixed). The review's priority issues were a path
  from a finished exercise to the next, the coach's RIR missing from the logger's headline, the
  Start bar leaking the rows beneath it, the proposal cutting the athlete's ask, and the
  programme page opening on a wall of controls; all five were taken in the same batch. The full
  report is kept under `.impeccable/critique/`.
- **Left open, by choice.** The ceiling items the reviewer named are not defects of the world
  and are not taken: the dot grid stays texture rather than a strict armature the rows snap to,
  finished exercises are inked rather than punched, and the highlighter is a clean rectangle
  rather than a marker stroke. The critique's remaining minor observations (the strength chart
  opening on a one-point series, the check-in interposing on every start, the empty body map on a
  new account, the rest timer only reachable from Profile) are recorded there for a later pass.
