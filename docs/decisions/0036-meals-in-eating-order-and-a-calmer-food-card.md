# Meals in eating order, and a calmer Food card

Follows [0035](0035-targets-from-the-goal-and-my-foods-of-its-own.md). The owner sent the Food
screen partway through a day, with the protein sheet open, and asked for three things:

- **Meals in order.** Evening snack came after Dinner, and there was nowhere for food after
  dinner. They wanted the two in the order they are eaten, and a late-night snack after dinner.
- **A cleaner macro sheet.** The sheet that tapping carbs, fat or protein opens "looks weird": a
  percentage and a bar on every food, the bars ending at different places. They wanted no
  percentages, and a sheet as clean as the rest of the app.
- **A calmer card.** The card at the top of Food had too many numbers to read: eleven, at much the
  same size, close together.

Mock-ups of all three went to the owner first, with three options for the card, and the owner
chose among them.

## Decisions

1. **Seven meals, in the order they are eaten:** Breakfast, Morning snack, Lunch, Afternoon snack,
   Evening snack, Dinner, Late-night snack.
   - Evening snack moves above Dinner. Late-night snack is new, after Dinner, at
     `/food/late-night-snack`, and works like every other meal.
   - Nothing already logged moves: an entry in Evening snack stays there. Moving entries logged
     late at night into Late-night snack was offered and declined.
   - A meal's URL now turns every underscore into a hyphen. It had turned only the first, which a
     three-word meal would have shown as `late-night_snack`.
2. **A macronutrient's sheet is one bar and plain rows.**
   - At the top, what was eaten, large, "of" its target, and where that leaves the day in words:
     "44 g to go" for protein, which is a minimum; "165 g left" for carbohydrate and fat, which are
     limits; "Reached" with a tick; or "7 g over" in red. Under it, one bar, as on the card.
   - Then each food as a row like the rest of the app's: its name, its meals and amount under it,
     and its grams on the right, the most first.
   - No share of the day, and no bar under each food. The order and the grams already rank the
     foods, and bars that ended where each row's numbers began were the misalignment the owner
     saw.
   - A food eaten in two meals is still one row. A food logged without the figure still closes the
     list with a dash, which a screen reader reads as "no figure".
3. **The card keeps what changes during the day.**
   - Beside the total, where the day stands: "1,587 left" while under the goal band, "Goal met"
     inside it, and "241 over" past it. The line under the bar is gone.
   - The goal band's ends are no longer written out. The two ticks on the bar mark them, "Goal
     met" says when the day is inside them, and a screen reader still hears them from the bar.
   - One row per macronutrient: its name, a bar, and "eaten / target" lined up on the right, each
     row opening its sheet. Carbohydrate and fat turn red past their targets, and protein green
     with a tick, as before (ADR 0035).
   - When a row is too narrow for all four, on a 320 px phone or with large text, its bar drops
     under its numbers. A container query on the list decides, as for the set grid.
   - The owner chose these rows over the three columns with the eaten grams made larger, which was
     recommended, and over the eaten grams alone, with each target moved into its sheet.

## Migration

0043 is safe to run twice, like 0036 to 0042. It drops `food_entries_values_chk` if present and
adds it again with `late_night_snack` among the meals. No row is rewritten.

The previous deployment writes only the six meals it knows, which the wider check accepts. While it
still serves, a late-night snack logged through this deployment counts in its day's total but is
not in its list of meals.

## Not done, on purpose

- **No meal from the clock.** The app has never picked a meal by the time of day, and a
  late-night snack does not change that.
- **No share of the day anywhere.** The domain no longer works one out.

## Validation

- **Tests.** The whole suite passes, as do lint, formatting, type checks and a production build.
  The new and changed tests cover:
  - the meals' order and URLs, every underscore included, and the Food screen's seven meals;
  - migration 0043, replayed: entries keep their meals, a late-night snack is taken, a meal the
    day does not have is refused, and a second run changes nothing;
  - the card: "left", "Goal met" and "over" beside the total, and no goal range written out;
  - the rows' colours and the tick for reached protein;
  - the sheet: plain rows with no share, a single bar, and "left", "to go", "Reached" and "over".
- **Migration on PostgreSQL 16.13.** The migrator applied 0043 to the audit database. It was then
  run twice more over entries in Dinner and Evening snack, inside a rolled-back transaction. They
  kept their meals, a late-night snack was accepted and "brunch" was refused.
- **End to end.** `npm run audit:food` was updated for seven meals, a saved meal added to the
  late-night snack, the new sheet and the card. On a production build with PostgreSQL 16, the
  auth stand-in and Chromium, it passed all 17 scenario groups with no page errors, and Axe
  found nothing on the Food screen or the protein sheet in either palette.
  - One earlier run hung in the audit's own wait for animations, on the new-food sheet at
    390 × 300, which this change does not touch. The re-run passed.
  - WebKit was not available on the machine that ran it.
- **Screens.** The built Food screen and protein sheet match the mock-ups.
  - At 390 and 375 px each macronutrient is one line.
  - At 320 px its bar drops under its numbers.
  - At 200% text the numbers drop under the name as well, with nothing overlapping and no
    sideways scroll.
