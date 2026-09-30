# Prompt 1: three directions for the core loop

The first Claude Design round. It asks for two or three genuinely different directions on the
four anchor screens, drawn from the real feature list and without looking at the current
design, so the result is a new idea rather than a repaint.

## How to run it

**In Claude Code (recommended).** Start a session on `main` and type:

```text
/design Follow docs/ui-redesign/revamp/prompts/01-directions.md, section "The brief".
```

Claude Code can read the repository, so every direction gets the real features and sample
content, and it can check anything the inventory leaves unclear against the code.

**In claude.ai/design.** Start a project, attach
[`docs/ui-redesign/revamp/features.md`](../features.md), and paste the brief below. Where the
brief says "read `docs/ui-redesign/revamp/features.md`", it means the attached file.

Either way, open the canvas on claude.ai to compare the directions, comment and tweak.

## The brief

You are designing **Overload**, a phone-first workout tracker, from the ground up. Keep the
name Overload. Everything else is open: identity, colour, typography, layout, navigation,
interaction and motion. The aim is **creative, minimal and intuitive**: a tool a lifter can use
one-handed between sets, sweaty and glancing, in a bright gym or a dark one.

### What to read first, and what not to

1. Read `docs/ui-redesign/revamp/features.md`. It is the contract: every screen you draw must
   carry the features, information, actions and states it lists for that screen, using its
   sample content. If you are unsure what something does, check the code files it cites. Do
   not invent features, numbers or claims.
2. Read the "Decisions that implementation must preserve" in `docs/ui-redesign/README.md` and
   the decisions in `docs/ui-redesign/revamp/README.md`.
3. **Do not** look at or reuse the current visual design: the screenshots in `docs/audits/` and
   `output/`, the styles in `src/styles/` and `src/app/globals.css`, and component styling. They
   are the look being replaced. Use the code only to learn what the app does.

### What to make

One canvas, **"Overload revamp: directions"**, with one page per direction. Make **three**
directions that differ on a named axis (for example density, warmth, expressiveness or how
much colour carries meaning), not three tints of one idea. Each direction must be one you could
defend shipping.

Each direction draws the same four anchor screens at **402×874** (iPhone 17):

1. **Today**: what to train now, the gym, the plan, and the other activities of the day.
2. **Logging a set mid-workout**: an exercise open, earlier sets saved, the next set being
   entered, the rest timer running.
3. **Progress**: the overview a lifter checks weekly.
4. **Food**: today's calories and macros against targets, and the meals of the day.

Draw all four in **light**, plus **Today** and **Logging a set** in **dark** (dark versions of
the rest follow once a direction is chosen). Add one **system sheet** artboard per direction:
colour tokens for both themes, the type scale with numerals, spacing and radii, and the
primitives the screens use (button, field, stepper, list row, sheet, tab bar, stat, chart).

Every artboard uses real content from the inventory's sample data. Anything the inventory
lists for a screen must be visible or one tap away; say in your reply which items each
direction puts one tap away and where.

### Constraints

- **Native apps are coming.** Overload is a PWA today, with iOS and Android apps soon. Use
  patterns both platforms have (tab bar, stack navigation, sheets, lists, steppers); nothing
  central may depend on hover or a web-only effect. The five destinations (Today, Training,
  Food, Progress, Profile) must stay reachable; how navigation is organised is open.
- **Numbers are the product.** Loads, reps, RIR, times, calories: large, tabular, readable at
  arm's length, and never ambiguous about units (kg or lb).
- **One thumb.** Primary actions sit in reach; targets are at least 44 px; entry fields are
  never smaller than 16 px text.
- **Accessible in both themes.** Body text at 4.5:1 contrast or better; colour never carries
  meaning alone; the layout survives text at 200%.
- **Typography is new.** Pick faces for the brand, licensed for the web and for embedding in
  iOS and Android apps (an open licence such as the SIL OFL is simplest). Numerals matter
  most.
- **Avoid these defaults**, which read as generic: cream, beige or off-white backgrounds; warm
  neutrals with copper or terracotta (the current look); near-black with neon or acid-green
  accents (the stock fitness look); italic accent words in headlines; numbered "01/02/03"
  labels; monospace or all-caps eyebrow labels; pill buttons everywhere; cards nested in cards;
  left-border accent cards; gradient washes, glows and decorative glass; Inter, Roboto or Arial
  as the brand face; emoji; stock photography; fake status bars.

### Motion (described, not animated)

Motion may be richer than before. For each direction, describe in your reply how four moments
move, with durations, curves or springs, and what reduced motion shows instead:

1. a set is saved;
2. the rest timer runs and ends;
3. a sheet opens and is dismissed by a swipe;
4. moving from the workout into an exercise and back.

### Your reply

- the canvas link;
- per direction: its name, the axis it explores, a one-paragraph thesis, the type pairing (with
  licences), the colour logic in both themes, the shape language, the motion notes, and what
  sits one tap away;
- a short table comparing the three;
- any assumption you made where the inventory was silent.

Do not write application code or change the repository.

## After this round

1. Pick one direction, or name a blend, then ask for two contrasting alternatives of it to test
   the choice.
2. Upload 12–16 current screenshots (one per archetype) and ask for the chosen direction to be
   mapped onto the real content of every archetype.
3. Freeze it into a Claude Design design system, then prototype the core loop. See
   [the workflow](../README.md).
