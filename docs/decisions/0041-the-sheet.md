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
  tappable word, and **one highlighter** per screen for today, the selected thing and the primary
  action. The daylight and graphite sheets are two renderings of the same world.
- Barlow, self-hosted, with its semi-condensed cut as the data voice; tabular numerals everywhere.
- Today opens on the plan: the cycle strip (where today sits), the gym line, the day's name set
  large, the plan as numbered rows with the coach's reasons in pen, and the Start bar in thumb
  reach. In the logger, set numbers ink in as sets save, and the highlighter sits on the next Save.
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
