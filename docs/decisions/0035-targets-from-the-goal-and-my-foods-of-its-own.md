# Targets from the goal, and My foods of its own

**Followed by [ADR 0036](0036-meals-in-eating-order-and-a-calmer-food-card.md):** a
macronutrient's sheet lists its foods by grams alone, with no share of the day and no bar per
food, and the card's macronutrients are rows, its goal range drawn on the bar and not written out
(decisions 2 and 3 there). The colours of decision 8 stand as written here.

Follows [0033](0033-meals-of-the-day-and-my-foods.md) and
[0034](0034-food-takes-the-history-tab.md). The owner asked for four things:

- **My foods outside the meals.** It sat inside every meal's page, so it read as six copies of one
  list. They wanted it in one place, where foods and meals are added to be reused in any meal.
- **Targets that are sound for muscle growth.** The split was either protein per kilogram with fat
  a fixed quarter, or a fixed 55 / 25 / 20. They asked whether people should set their own
  carbohydrate, fat and protein, given that the three have to add up to the calories, and how the
  person's goal should come into it. The setting was to stay one clean flow, with no screens of
  explanation.
- **A macro that opens its foods.** Tapping carbohydrate, fat or protein should list the foods by
  how much each gave.
- **Bars that change colour when full.**

Research came first. It covered the sports-nutrition literature on protein, fat, carbohydrate,
rates of weight change and estimating maintenance, and how MacroFactor, Carbon, Cronometer,
MyFitnessPal, RP and Yazio handle the same questions. It went to the owner as a proposal with mock
screens and a list of decisions. The owner made the decisions below, and approved mock-ups of every
change before anything was built.

## Decisions

1. **Calories are the account's own.** The target is typed once and nothing moves it. Estimates
   from an equation, and maintenance learned from logs and weigh-ins, were offered and declined:
   "a consistent target, nothing dynamic".
2. **The profile's training goal chooses where targets start.** Targets show the goal as one line,
   with no tabs and no explanations. It is changed on the profile, and the coach still reads it.
   - Build muscle, Get stronger and General fitness start from 55 / 25 / 20 (carbohydrate, fat,
     protein); so does an account with no goal.
   - Lose fat starts from 45 / 25 / 30, since protein matters most in a deficit.
   - Build endurance starts from 60 / 20 / 20, giving carbohydrate the share running needs.

   The split is only where the fields start:
   - The first time, protein and fat follow it as the target is typed, until either is changed.
   - After that, "Use 55 / 25 / 20" (the goal's own numbers) appears only while the targets
     differ from it, and refills protein and fat.

3. **Protein per kilogram, fat as a share, carbohydrate the rest.** The split switch is gone.
   - **Protein** stays per kilogram of the newest body weight, as before, so it follows every
     weigh-in. A split's protein share becomes grams per kilogram at the target and weight it is
     applied to, to the tenth. 20% of 2,700 kcal at 63.5 kg is 2.1 g/kg.
   - **Fat** was a fixed quarter. It is now a field, in whole percent from 5 to 80: bounds that
     catch a slip, not advice.
   - **Carbohydrate** is whatever energy is left, so the three always add up to the target and
     cannot disagree with it. Any split is still reachable.

   Protein per kilogram is how the evidence is written, and the reason the fixed split went. A
   fixed share of calories lowers protein exactly when calories fall: on 55 / 25 / 20 an 80 kg
   lifter gets 1.75 g/kg at 2,800 kcal and 1.25 g/kg at 2,000. The literature says a deficit is
   when protein should rise (Helms, Aragon and Fitschen 2014; Longland et al. 2016; Refalo, Trexler
   and Helms 2025).

   Without a body weight, protein is the goal's share of the target until there is one, which for
   every goal but losing fat is the 20% the fixed split gave. The Targets screen says so, and the
   Food screen's Targets row reads "Add your body weight for protein". Protein and fat that leave
   nothing for carbohydrate still save, with the warning as before, and that row then reads
   "Nothing left for carbs".

4. **Targets are a screen of their own, `/food/targets`.** It is the last row of the Food screen.
   Saving goes back to wherever it was opened from, so Back does not return to the form. Until
   there is a target, the summary's place on the Food screen says "No daily target yet", with the
   goal and its split and a Set target button.
5. **My foods is a screen of its own, `/food/my-foods`.** It is the row above Targets. It lists
   meals first, by name, then foods, the most lately eaten first. Its parts:
   - **New food** saves a food without logging it. A food not yet eaten counts from when it was
     saved, so it stays near the top.
   - **New meal** opens `/food/my-foods/meals/new`, and a saved meal opens
     `/food/my-foods/meals/<id>`. A meal is a name and a set of the account's foods, each at an
     amount. Foods are added from the list below it, changed by tapping them and taken out by
     swiping them aside. Nothing is saved until Save meal.
   - **What a saved meal keeps.** A food it already held keeps the copy it was saved with. A food
     added from My foods is copied as it stands, as logging it would be.
   - **Names.** A name another meal has is refused here, where starring a meal saves over it.
     Starring saves over deliberately, to bring "Usual breakfast" up to date. Here the name is
     typed as the meal's own.
   - **Removing.** A food or meal is removed by swiping it aside and tapping Remove, from the
     food's sheet, or with Delete meal. Days already eaten keep their copies.
6. **A meal's page adds, and does not manage.**
   - Everything in My foods is one list under its search, saved meals first. The My foods heading
     and its tip are gone.
   - New food appears only when a search finds nothing. An empty My foods finds nothing, so a new
     account starts at New food. It makes the food, keeps it in My foods and adds it to the meal
     in one go, so logging something new never means leaving the meal.
   - The amount sheet lost its Edit button: foods are corrected in My foods.
7. **Each macronutrient opens what today's foods gave it.**
   - The three share one row in the order the split names them: carbohydrate, fat, protein.
   - A sheet ranks the day's foods by grams of that macronutrient, each with its meals, its amount
     and its share of the day's total.
   - A food eaten in more than one meal is one row, added up, by name and unit.
   - A food logged without the figure closes the list with a dash, since it is why a total may
     read low. A food that gave none is left out.
8. **Carbohydrate and fat turn red past their targets; protein turns green when reached.**
   - Protein is a minimum, so reaching it is the point; it gains a tick. Carbohydrate and fat are
     limits, over once the whole grams on screen pass the target, so "75 / 75 g" is never red.
     The calorie bar keeps its band.
   - The red is a new token, `--ov-over`: `#b4333d` light and `#f07575` dark. The dark palette's
     error colour, `#f0a18d`, is nearly the calorie bar's copper (1.04:1), so an over bar read as
     the calorie bar. As text the new red is at least 4.6:1 on every surface in both palettes,
     the bar's track included. Forced colours use CanvasText, as the other states do.
   - Each bar's name says its state for screen readers: "Fat: 82 of 67 g, over".

## Migration

0042 is safe to run twice, like 0036 to 0041:

- It adds `nutrition_targets.fat_percent`, 25 by default, and widens the check to hold it between
  5 and 80.
- **Fixed-split accounts move to protein per kilogram.** Each one with a body weight gets 20% of
  its target as grams per kilogram of that weight, to the tenth and within the column's bounds,
  so its protein stays within rounding of what it was. From then on it follows the account's
  weigh-ins, as everyone else's does. It is marked `body_weight`, so a second run finds nothing
  to change.
- A fixed-split account with no body weight is left as it is. Its protein is the goal's share of
  the target until it has one.
- `macro_split` stays while the previous deployment still serves, since that deployment reads it.
  It gives a converted account the same protein as this one does, and fat stays the quarter it
  always gave, since every row starts at 25%. This deployment writes `body_weight` and reads
  nothing there. A later migration can drop the column.

## Not done, on purpose

- **No estimated or learned maintenance, no pace, no activity question** (decision 1).
- **No recipes.** A meal in My foods is a set of foods; a food combined from ingredients into one
  item was offered and not chosen.
- **Today only in a breakdown**, with no week or month.
- **No carbohydrate floor for running days, no weight cap on protein at a high BMI, and no
  calorie-floor or rate-of-loss warnings.** These were in the research, and are not in what the
  owner chose or approved.

## Validation

- **Tests.** The whole suite passes: 203 files and 1,584 tests. So do lint, formatting, type
  checks and a production build. The food tests cover:
  - **Domain.** The goal splits, and the split's protein as grams per kilogram. Targets with a fat
    share, and without a body weight. Whole-gram bar states, and contributions merged by name,
    with shares that add up.
  - **Repository, on PGlite with Row Level Security.** Targets with fat, foods kept without
    logging, and meals built, changed and refused. Kept copies surviving a correction, and
    isolation between accounts.
  - **Validation and actions**, including receipts and revalidation of every food screen.
  - **Migration 0042**, replayed.
  - **Components, in jsdom.** The Food screen, the Targets form, the breakdown sheet and colours,
    My foods, the meal builder and a meal's page.
- **Migration on PostgreSQL 16.13.**
  - Every migration, 0042 included, built the audit database.
  - Fixed-split rows were then written the old way and 0042 run over them twice, inside a
    rolled-back transaction. An 80 kg account at 2,700 kcal moved to 1.7 g/kg, and one with no
    weight stayed as it was. The second run changed nothing.
- **End to end.** `npm run audit:food` was updated for these flows and run on the audit stack: a
  production build, PostgreSQL 16, the auth stand-in and Chromium. All 17 scenario groups passed
  with no page errors. They cover:
  - targets set on their own screen from the split, and a Back that does not return to the form;
  - a food made from a meal's page only through a search that finds nothing;
  - a food corrected in My foods and not from a meal;
  - a food and a meal kept in My foods without logging, and the meal added to the evening snack;
  - a protein breakdown with a food eaten in four meals as one row;
  - the missing-weight and over-budget rows;
  - "Use 55 / 25 / 20" refilling protein within its bound.

  WebKit was not available on the machine that ran it.

- **Screens.**
  - Axe finds nothing, in either palette, on the Food screen, Targets, My foods, New meal, the
    protein sheet, and a meal's page and its sheets.
  - The meal page and its sheets pass the audit's responsive matrix: from 320 px to 1440 px,
    200% text and a 300 px tall viewport.
  - The red and the tick were checked on the built app with fat over and protein reached, in
    both palettes.

## Sources

- Helms, Aragon and Fitschen 2014, evidence-based recommendations for contest preparation.
  _J Int Soc Sports Nutr_. doi:10.1186/1550-2783-11-20
- Longland et al. 2016, 2.4 against 1.2 g/kg of protein in an energy deficit. _Am J Clin Nutr_.
  doi:10.3945/ajcn.115.119339
- Refalo, Trexler and Helms 2025, protein in energy restriction. _Strength Cond J_.
  doi:10.1519/SSC.0000000000000888
