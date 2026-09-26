# Meals of the day and My foods

**Followed by [ADR 0034](0034-food-takes-the-history-tab.md):** Food became a tab of its own, at
`/food`, in History's place, and Today no longer carries its card. The paths below are the new
ones.

**Superseded in part by [ADR 0035](0035-targets-from-the-goal-and-my-foods-of-its-own.md):** My foods
is a screen of its own where foods and meals are made without logging, and a meal's page only
adds from it (decisions 5 and 6). Starring, portions and copies stand as written here.

**And by [ADR 0036](0036-meals-in-eating-order-and-a-calmer-food-card.md):** the day has seven
meals, an evening snack before dinner and a late-night snack after it (decision 1).

Follows [0032](0032-food-behind-a-switch.md). The owner compared its food tracking with Samsung
Health's and described the flow they had wanted from the start:

- A food is saved once with five numbers: kcal, carbohydrate, fat, protein and a portion size in
  an obvious unit (g, kg, ml, l and so on). Only the kcal and the portion are required. Foods are
  saved by being logged, and everything else scales with the portion.
- The day has breakfast, lunch and dinner, and a morning, afternoon and evening snack. You pick
  one and add foods to it.
- A meal you will eat again can be starred: you give it a name and it is kept in the same
  proportions.
- 200 g of oats instead of the saved 100 g is a change of size, and the macros follow.

The design was left open: Samsung's was acceptable, something better was welcome, and nothing was
to be over-engineered. This record covers what changed and why.

## Decisions

1. **Six meals, in the order they are eaten.** Breakfast, morning snack, lunch, afternoon snack,
   dinner and evening snack. Samsung lists the three meals and then the three snacks; in eating
   order, the Food screen reads like the day. A meal is not a row of its own: it is the entries
   that name it (`food_entries.meal`), so there is nothing to create, rename or empty out. Each
   meal opens its own page, `/food/<meal>`, one level under the Food screen, whose back control
   says Food.

2. **My foods keeps every food logged.** A food (`foods`) is a name and what one portion holds:
   an amount and a unit, the kcal, and the carbohydrate, fat and protein when known. Names are
   unique per account whatever their capitals, so the list never offers two of one thing. A new
   food is made in the sheet that logs it, and nothing is kept until Add: saving a food is
   logging it. The list puts the foods eaten most lately first (`last_logged_at`), which after a
   week is most of what anyone needs without searching. A food can be corrected or removed from
   its own sheet.

3. **A food is always logged in its own unit.** The units are g, kg, ml, L, oz, cup, tbsp, tsp,
   piece, slice, scoop and serving. Oats saved per 100 g are eaten in grams, whey saved per scoop
   in scoops. Nothing is converted. Conversion between g and kg or ml and L would put a second
   control in every portion sheet, and a food saved in the unit it is weighed in never needs it.

4. **An entry is a copy of its food, and an amount.** `food_entries` holds the food's name,
   portion and figures as they were when it was logged, and how much was eaten. What an entry came
   to is worked out by `scaleFood`: each figure × amount ÷ portion, to the tenth. It is worked in
   whole numbers (tenths of a figure, hundredths of an amount) so the product is exact and an exact
   half always rounds up. Nothing scaled is stored. The Food screen and a meal's page add up the
   same entries with the same function, so they cannot disagree. This has two consequences:
   - Changing an amount rescales from the copy exactly, however often it changes.
   - Correcting or deleting a food in My foods never rewrites a day already eaten. Deleting one
     only clears the entry's `food_id`, by a composite key that nulls nothing else.

5. **How much is one field and four taps.** Tapping a food opens its sheet with the portion and
   what it holds, the amount eaten in the food's unit, and what that comes to as it is typed.
   Half, one, one and a half and two portions are one tap each. Samsung uses a slider; a field
   with four amounts is exact and quicker on a phone. The same sheet changes or removes a food
   already in the meal, and swiping the food aside removes it too.

6. **Starring saves the meal under a name.** The star on a meal's page asks for a name and keeps
   the meal's foods, each with its amount, as a saved meal. `saved_meals` keeps its table; each
   item is now a copy like an entry's. Four rules follow:
   - Saving under a name a saved meal already has saves over it, and the field says so first.
     That is how "Usual breakfast" is brought up to date.
   - The star is lit while the meal holds exactly a saved meal's foods and amounts. Change a
     portion and it is a meal of its own again, with nothing stored to go stale.
   - Tapping a lit star deletes that saved meal.
   - A saved meal is a copy, so it adds what was saved even after its foods are corrected or
     deleted.

7. **One search for everything that can go in.** Below the meal come a search, the saved meals
   (found by their name or by any food they hold) and My foods, with New food first. A search
   that matches nothing becomes the new food's name. After an add, the search clears and the meal
   scrolls back into view, so what was added is seen.

8. **What went.** Freely named meals ("Afternoon meal 1"), the starred chips on the Food screen,
   the multi-food meal sheet and its device drafts are gone. Each add is now one small save, and
   receipts still make a retry after a lost reply harmless, so there is nothing large left
   unsaved to keep on the device. Drafts already in a browser's storage are no longer read.

## Migration

0041 is safe to run twice, like 0036 to 0040, and changes nothing that the running deployment
reads:

- It creates `foods` and `food_entries`. The `(user_id, id)` index on foods comes before the key
  that references it, and deleting a food sets only `food_id` to null.
- Every food of every old meal becomes an entry under the old item's id, so a second run skips
  it. Each is one serving of exactly what was entered, so every day's totals are unchanged. Its
  meal is the one the old meal's name says (breakfast, lunch, dinner or supper) or else the one
  the hour it was logged falls in on the account's clock. An unnamed food takes its meal's name.
  An account whose time zone Postgres does not know is read in UTC rather than failing the deploy.
- Every named food becomes one of the account's foods, one per name, with its most recent figures.
- Saved meals' items gain a portion, a unit, an amount and the food they came from.
- `meals` and `meal_items` stay. The build that applies 0041 runs while the previous deployment
  still serves, and that deployment reads them. A later migration drops them. Should the previous
  deployment write a saved meal in the old shape meanwhile, it reads as one serving of each food.

## Not done, on purpose

- No food database, barcode or photo lookup: entry is by hand, as before.
- No unit conversion (decision 3), no past-day browsing and no weekly chart.
- Food still reaches nothing else: friends, leaderboards, the coach and Progress see none of it.

## Validation

- **Tests.** The food files hold 157 tests. They cover the scaling (exact tenths, halves, unknown
  macronutrients, decimal rounding), units and meals, matching a saved meal, and parsing with
  every error on its own field. The repository runs on PGlite with Row Level Security and the
  composite keys: copies surviving corrections and deletions, exact rescaling, recency, the
  per-account names, saving over a name, retries and account deletion. They also cover the
  actions, the migration against old meals (replayed), the Food screen, and every flow on a
  meal's page in jsdom. The whole suite, lint, formatting, type checks and a production build
  pass.
- **Migration on PostgreSQL 16.13.** Every migration, 0041 included, built the audit database. Then
  old-style meals, foods and a saved meal were written, and 0041 was run over them twice
  inside a rolled-back transaction. Each food landed in the meal its name or hour said, named
  foods were kept one per name, and the saved meal gained portions and its food link. The second
  run changed nothing.
- **End to end.** `npm run audit:food` was rewritten for these flows and run on the audit stack:
  a production build, PostgreSQL 16, the auth stand-in and Chromium. All 15 scenario groups
  passed with no page errors, after the move to a tab of its own (ADR 0034). They cover
  availability, the six meals, a new food kept by being logged (and refused without kcal), 200 g
  of oats from a food saved per 100 g, a meal starred under a name and added to dinner, a changed
  portion unlighting the star, a corrected food leaving eaten days alone, swipe removal, a retried
  add after a lost committed reply logging once, and the Food screen matching the database.
  Targets, account isolation, install and the worker's cache boundaries are covered as before.
  WebKit was not available on the machine that ran it.
- **Screens.** The meal page and both sheets were checked at 320×568, 390×844, 768×1024 and
  1440×900, at 200% text at 320×568 and 568×320, and at 390×300, in both palettes. Nothing scrolls
  sideways and every field and primary button can be reached. Axe finds nothing in either sheet in
  either palette, or on the Food screen, navigation island included.
- **Corrected: the island's active tab.** The first scans reported its label at 3.8 to 4.4:1 and
  left the island out, blaming its translucency. That was wrong. A tab fades its colours for
  120 ms when the palette changes, and the audit scanned inside that fade: sampled frame by
  frame, the label passes through 1.7:1 between 4.9:1 in the light palette and 6:1 in the dark.
  The audit now lets running transitions finish before it measures or takes a screenshot, and
  scans the island with everything else. Nothing in the app changed.
