# ADR 0046: The most eaten first, in pages, on one food row

Date: 2026-10-08
Status: accepted; amends decision 2 of [ADR 0033](0033-meals-of-the-day-and-my-foods.md) and
decision 5 of [ADR 0035](0035-targets-from-the-goal-and-my-foods-of-its-own.md) (the order of
foods and saved meals)

## Context

On 8 October 2026 the owner went through adding to a meal and asked for six things:

1. Rows that stand the same height whatever a meal's name or foods: the glyph in front, the name
   on one line and the foods on one more, cut with an ellipsis rather than wrapped, and the saved
   meals clearly apart from the foods.
2. The kcal as a whole number with "kcal" centred under it, in room for four digits: 1000.3 is
   1000 and 1000.8 is 1001.
3. Foods reported as meals are, led by a glyph of their own, and no "+": the meals had none.
4. The most eaten first: "we should maintain a count and thereby show those with the most
   appearances above". Saved meals had been listed by name, foods by when they were last eaten.
5. "show some x food and add pages with x each": no one scrolls past a hundred saved meals to
   reach Foods.
6. "consistent style throughout the app. wherever there's food."

The row was chosen from rendered options (tiles with compact rows; the bowl for foods) and is
drawn in DESIGN.md (Rows and marks, Food rows). This records what lies under it.

## Decisions

1. **One food row wherever food is listed.** `FoodRowText`, `RowGlyph`, `RowFigure` and
   `RowKcal` (`components/food/food-row.tsx`) draw a meal's page (what is in the meal and what
   can be added), My foods, a saved meal's sheet, a meal being built, the Food tab's meals and a
   macronutrient's foods. The row itself, a button, a link or a list item, stays the caller's.
   The Food tab's meal is led by its layer of the bowl, the empty bowl when nothing is in it,
   and loses its "+": the row is the control. A macronutrient's foods end in whole grams, "<1"
   under one and the dash for a food logged without the figure, as before. My foods' rows lose
   their chevrons, as no other food row has one. `.meal-row`, `.meal-add` and
   `.macro-sheet-row` are gone.
2. **Whole figures in a row, tenths in a total.** A row's kcal is rounded to the tenth it is kept
   at and then to the whole (`formatWholeKcal`: 1,000.3 is 1000, 1,000.8 is 1001, never with a
   comma), so four digits always fit the column. Totals (a day's, a meal's, a saved meal's) keep
   their tenth, so a saved meal whose rows read 209 and 130 kcal comes to 338.5.
3. **Saved meals: the most added first.** `saved_meals` gains `times_logged` and
   `last_logged_at` (migration 0048). Adding a saved meal to a day counts one (`logSavedMeal`).
   So does starring a meal (`saveMeal`), since the meal starred was eaten. Neither touches
   `updated_at`, the meal builder's edit token: being eaten is not an edit, and must not stale a
   copy open in My foods. Then the most lately added or, never added, saved; then the name.
4. **Foods: the most eaten first, counted from the entries.** A food's count is the entries that
   still name it, read with the list (`count(*)` over `food_entries` by `food_id`, served by a new
   index on `user_id, food_id`). Nothing new is stored, so a removed entry counts once less at
   once. Among foods eaten as often, the most lately eaten first; a food saved and not eaten yet
   counts from when it was saved, so a new food leads the foods not eaten yet. The count is all
   time: a food eaten daily for a year stays above one eaten daily since last week. Search finds
   either.
5. **The backfill.** Nothing recorded which meals came from a saved meal, so migration 0048
   counts, for each saved meal, the meals of a day (one account, one date, one meal) that held
   exactly its foods by id, at any amounts and whatever quick adds sat beside them. A meal with
   one food more is another meal. A saved meal kept the old way, by names alone, starts at
   nought, and a meal already counted is left alone, so running the migration again changes
   nothing.
6. **A page at a time.** Meals and Foods show five saved meals or ten foods a page
   (`MEALS_PER_PAGE`, `FOODS_PER_PAGE` in `components/food/food-section.tsx`), with History's
   page tabs under each (ADR 0044): on a meal's page, on My foods, and for the foods a meal is
   built from. However many meals there are, Foods starts where it did. A new search starts each
   at its first page, and turning a page whose heading has scrolled away brings the heading
   back. My foods keeps its search and pages in the URL (`?q=oats&meals=2&foods=3`), as History
   keeps its page: a saved meal opens a page of its own, and Back from it, or saving it, would
   otherwise start My foods again at its first page. A meal's page and the meal builder open only
   sheets, so they keep their pages to themselves.

## How it was checked

`server/repositories/nutrition.test.ts` against the real migrations (foods the most eaten first,
the latest among equals, a removed entry counting once less, a food not eaten yet first of those
not eaten; saved meals the most added first, starring counting one, `updated_at` unchanged) and
`db/migrations/most-eaten-first.test.ts` (the backfill, on rows written as the previous deployment
wrote them, run as the migrator runs it and then again). `meal-editor.test.tsx`,
`my-foods-view.test.tsx`, `meal-builder.test.tsx` and `food-view.test.tsx`: each list's rows as
they are read aloud, five meals and ten foods a page, a search from the first page, and My foods'
place kept in the URL and found again. Rendered at 412 and 320 pt, at 100% and 200% text, light
and dark: every food row 58 pt tall at 100% text, its tile 36 pt and its figure's column 49 pt,
with no overflow and no console error; then with 300 foods and 60 saved meals, 30 and 12 pages,
and Back from a saved meal returning to the page and search it left.
