# Stack: colour means sport, one hero per screen

Follows the redesign brief in [docs/redesign-2026](../redesign-2026/README.md). The owner looked at
three directions drawn from the shipped design (Form) and rejected all three: "too much information,
not clean, no boundaries", and "you don't have to use the same colours". They asked for the whole UI
to be rewritten with the design skills added in Phase 0, keeping every feature and changing
anything else: layout, flow, colour and typography.

## Decisions

1. **A new system, Stack, replaces Form.** Its tokens live in `src/styles/stack/` and are described
   in [DESIGN.md](../../DESIGN.md). The `data-overload-design` attribute on `<html>` now reads
   `stack`; light and dark are chosen the same way as before.
2. **Colour means sport.** Lifting is cobalt, running tangerine, cycling violet, swimming aqua, food
   sunflower and recovery rose, each with a fill, the ink that reads on it, a soft wash and a text
   shade. Nothing else is coloured, so a colour on screen always says which sport it is about. The
   chart series take the same order. Food's macronutrients no longer borrow three sport colours:
   all three are food's own.
3. **One hero per screen.** The thing a screen is for is a filled card in its sport's colour: today's
   session or rest day, the next exercise in a workout, the exercise being logged, the kcal left.
   Inside it the palette is re-pointed, so the same buttons, badges and text read correctly on any
   fill; notes and sheets that open from inside it are drawn in page colours.
4. **A display face for the figure that leads.** Big Shoulders (condensed, 800) sets the day's name,
   the kcal left, set loads and reps and tile figures; everything else is the phone's own font. No
   ALL-CAPS labels, no medium weight, and meta lines joined with commas rather than middle dots.
5. **Containment by colour, radius by hierarchy.** White cards on a mist canvas with no borders or
   shadows; 28px hero corners, 22px cards, 18px tiles, 14px controls, pills for buttons and chips.
   Only floating things cast a shadow: the capsule tab bar, the gym pill, the session and timer
   pills, sheets.
6. **Less text on screen.** Help sentences moved behind info tips beside what they explain; the
   plan, the drills and the macros' breakdown open one tap away rather than sitting on the card.
7. **The set row is rebuilt, its behaviour is not.** Load, reps and effort are big numbers in wells,
   the suggestion is still the placeholder, and each set still saves on its own, now with a round
   check that fills cobalt when the set is saved.

## Not changed

Routes, server actions, data, the per-set save, the offline behaviour and every accessible name the
tests and the audit scripts use. The ten decisions preserved by the first UI redesign
(`docs/ui-redesign/`) still hold.

## Validation

`npm run check` (lint, format, types and the unit tests) passes. Every main screen was captured on a
402 × 874 phone in light and dark against the seeded audit database and reviewed against the rules
in DESIGN.md; the contrast of every text pair, including translucent text on each hero fill, was
measured at 4.5:1 or better (3:1 for display sizes).
