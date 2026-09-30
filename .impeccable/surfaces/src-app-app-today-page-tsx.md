---
version: 1
slug: "src-app-app-today-page-tsx"
primary_target: "src/app/(app)/today/page.tsx"
related_targets:
  [
    "src/app/(app)/workouts/[sessionId]/exercise-logger.tsx",
    "src/app/(app)/progress/page.tsx",
    "src/app/(app)/food/page.tsx",
  ]
---

# Core loop revamp (Today, workout logger, Progress, Food)

Scope: the four anchor screens of the revamp, drawn first as Claude Design mockups. Mode: Operate.
Audience and task: a lifter between sets, one hand, glancing; the same person logging meals and
checking the week. Features per docs/ui-redesign/revamp/features.md, none dropped.
User steer (30 Sept 2026): minimal, complete, creative, intuitive, attractive; colourful and
contrasty; little text; references Apple Fitness, Duolingo, Revolut/Monzo; one direction, fully built.

## Direction contract

THESIS: Every session is meet day. The app borrows the powerlifting platform: attempts on a board,
three judges' lights, the attempt clock, competition plate colours. It refuses the category default
of a near-black screen with one neon accent and long text lists.

OWN-WORLD: Competition plate colours as the whole palette (blue lifting, red endurance, yellow
food, green good lift) plus kettlebell pink, orange and purple for macros; flat fields, no glow.
Chunky rounded type (Nunito 900–1000 numerals, Figtree text). Big rounded cards, pressable
buttons with a solid lip, concentric rings for clocks and food, three lights as the brand mark.

STORY: The athlete sees the day as coloured cards, starts, fills the attempt board set by set,
watches the clock ring, and trusts every number. Food is a ring stack; Progress is a scoreboard.

FIRST VIEWPORT: Today: date and gym chip on top, a full-width blue lifting card with the day's
name and a white Start workout button with a lip, a red run card below, tab bar of colour icons.

FORM: Meet day (powerlifting platform), fourth on my ordered list of seven; seed key 7a1162f9.
Raises: flat colour owns whole regions, no glow (elbow panel); one imperative per screen (park
poster); numbers change in fixed cells, layout never shifts (split-flap); text stays ink, colour
lives in fields and marks (cloud edge); the exercise opens out of its row and folds back (crane).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
