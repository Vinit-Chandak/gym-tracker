# Food

**Superseded in part by [ADR 0033](0033-meals-of-the-day-and-my-foods.md):** freely named meals,
their one-sheet editor, the starred chips and the device drafts (decisions 5–7) gave way to six
meals of the day, a food library with portions, and meals starred under a name. **And by
[ADR 0034](0034-food-takes-the-history-tab.md):** Food is a tab of its own at `/food`, and Today's
card is gone. Targets, the goal band and the receipts that make a retried save harmless stand as
written here.

**Rollout updated 25 September 2026:** the owner requested immediate availability for every
signed-in account. The `FOOD_TRACKING_ENABLED` gate and email allowlist have been removed from
Today, the Food route and all food actions. Existing values of that environment variable are
ignored. Production deployments apply migrations before building the app; migrations through
0040 shipped with PR #76. The original rollout decisions below are retained as history.

The owner asked for calorie tracking: a daily target, and carbohydrate, fat and protein against
it, entered by hand. Food goes into meals, a meal can be starred to add it again in one tap, and
Today gets a card for it. It had to be built so that production does not change until it is
switched on. This record covers what was built and the rules it follows.

## Decisions

1. **One switch, off unless set.** `FOOD_TRACKING_ENABLED` is read on the server at request
   time (`foodTrackingEnabled` in `lib/env.ts`). `true` switches food on for everyone. A
   comma-separated list of email addresses switches it on for those accounts only, so the owner
   can use it in production before anyone else sees it. Anything else, including unset, is off.
   The switch is checked in three places:
   - Today reads nothing and draws no card.
   - `/today/food` is not found.
   - Every action refuses. An action can be called by a plain POST whether or not a screen
     offers it, so the check cannot live only in the screens.

2. **The migration ships regardless, and changes nothing.** 0038 creates four empty tables. With
   the switch off, no screen or action reads or writes them. The migration is written by hand
   from what Drizzle generated, in three ways:
   - Like 0036 and 0037, it is safe to run twice. `migration-safety.test.ts` replays a database
     that recorded 0034 as its last migration, so every later migration runs again on top of its
     own effects.
   - The `(user_id, id)` unique indexes come before the keys that reference them.
   - A deleted starred meal clears only `saved_meal_id` (`set null (saved_meal_id)`). A bare
     `set null` would also clear the owner.

   Previews share the production database and do not migrate (SETUP.md §7). So a preview of this
   change works only with the switch off, and it must stay off anywhere until the production
   deploy that carries the required migrations has run. The follow-up audit adds 0039 for
   resource deletion and 0040 for retry receipts: enable this revision only after 0040.

3. **Targets are one row; grams are worked out when they are shown.** `nutrition_targets` holds
   three things:
   - the day's target `t`, in whole kilocalories, 500–10,000;
   - grams of protein per kilogram, 0.5–4, 1.8 by default;
   - the split.

   The default split takes protein from body weight and fat as 25% of `t`, and gives
   carbohydrate what is left, so the three add up to `t`. The other split is fixed at 55/25/20
   (carbohydrate, fat, protein) of `t`. Grams are never stored. `macroTargets` works them out
   from the newest body weight on every read. A new reading, whether from a finished session or
   the profile, already updates the profile's weight and its cache, so the protein target
   follows it with nothing to recalculate. Two cases are handled, not hidden:
   - **Protein and fat alone exceed `t`.** Carbohydrate is then nil, not negative, and the
     targets form says so.
   - **The account has no body weight.** The fixed split applies until it has one. The Targets
     section opens itself on the Food screen to say why, with a link to the profile.

   The ratio stays per kilogram for accounts in pounds, because that is how the guidance is
   written. The hint beside it gives the weight in the account's own unit.

4. **The goal is a band, both ends included.** A day meets its goal when its total is from
   0.9`t` to 1.1`t`. The comparison is done in tenths of a kilocalorie, because 0.9 has no exact
   binary form: 0.9 × 501 is 450.90000000000003, and a day of exactly 450.9 kcal meets its goal.
   The band and energy totals show up to one decimal, so the visible total and badge agree even
   at a fractional boundary. Macro summaries remain whole grams. A day below
   the band shows no badge, because a day still being eaten has not missed anything. A day
   inside it shows **Goal met**, and a day past it shows **Over**. The bar draws the band as a
   wash with a tick at each end, over the fill. It runs to 1.25`t`, and further when the day
   goes past that.

5. **Food counts only inside a meal.** A day's total is the sum of its meals' foods. There is no
   loose food and no food library: a food exists in a meal or in a starred meal. Each food has
   an optional name, the energy (required), and carbohydrate, fat and protein (each optional),
   stored to the tenth. That way a guessed restaurant meal is one number. A macronutrient left
   out is stored as unknown and adds nothing to a total, so the macro bars show only what was
   entered. `meal_items` is relational, with its bounds in a check constraint. Composite keys
   stop a food being put into another account's meal, and stop a meal pointing at another
   account's star, even from a row that passes the owner policy.

6. **Starring saves a copy.** A starred meal is a row in `saved_meals`: a name and its foods as
   one JSON document, as a saved routine is. A meal points at the copy it was added from or
   starred into, and that is where its star comes from. The rules:
   - Turning the star on saves a copy of the meal as it stands.
   - Turning it off deletes the copy, which takes the star off every meal that pointed at it.
   - Leaving it on while editing a day's meal leaves the copy as it was. Correcting today's
     portion must not quietly change what the star adds tomorrow.
   - Tapping a starred meal's chip logs a new meal for today with the same foods.
   - **Edit** on the Starred row turns the chips into ways to unstar them.

7. **Where it lives.** The Food screen is `/today/food`, under Today, so Today's tab stays
   selected and the back link says Today. The pieces:
   - **Today's card** comes after the day's training: the day's kcal against `t`, the band, and
     three thin bars for carbohydrate, fat and protein. It opens the Food screen.
   - **The Food screen** opens with the same summary plus what is left. Below it come the starred
     meals as one row of chips scrolled sideways, then the day's meals, then **Add meal**, then
     the targets, folded. Until there is a target, setting one is the first thing on the screen,
     and Add meal steps down to secondary.
   - **A meal** is edited by tapping it and deleted by swiping it aside. Swiping only reveals
     **Delete**, which still takes a tap, so a flick while scrolling can delete nothing. The
     sheet a meal opens can also delete it, for a keyboard, a switch or a screen reader.
     Deletion is two deliberate steps, the same rule as discarding an empty session, so nothing
     asks for a confirmation on top.
   - **The add-meal sheet** takes foods one at a time: a name and four numbers. `Sheet` gained an
     optional footer that stays in view while the foods scroll, holding the running totals, the
     star and Save. At short viewport heights or large text sizes, the entire sheet scrolls so
     both fields and Save remain reachable. A new meal is named from the account's own clock ("Afternoon meal 1", the
     next number up when the day already has one), so logging never waits on thinking of a
     name.
   - **Validation** runs on the server, as the app's other forms do. Errors come back against
     the row and field they concern. A lost connection keeps the sheet as it was, and blank rows
     are passed over. Changed meal forms are kept in local storage under their account and
     submission identities. Closing, navigating or reloading preserves them; successful saving
     or explicit discarding clears them. Storage failures are explained in the sheet.
   - **Offline drafts keep their original day.** The owner chose manual retry after reconnecting,
     and the day on which the draft was opened even if midnight has passed. The date is shown
     in the draft list and the sheet. An open Food screen refreshes at a day change when visible
     and online, while an open meal sheet retains its date. There is no automatic background save.
   - **An acknowledged retry cannot duplicate a meal.** Each sheet keeps a stable submission key;
     a receipt and the mutation commit together. A matching retry is a no-op, even after deletion.
     A changed payload under an already committed key is refused with recovery instructions.

8. **What it costs Today.** One more statement runs inside Today's
   transaction. `readFoodDay` returns the targets and the day's sums in one row, anchored on the
   profile. The Food screen is one read-only
   transaction of three statements. Every change revalidates `/today` and `/today/food`, so
   the copy of Today that the browser keeps for a minute is dropped and the card is read again.
   The tabs now prefetch complete data ([tab prefetch decision](0032-the-tabs-arrive-before-the-tap.md));
   `refresh` alone would keep the stale prefetch. Today's food query stays inside its read-only
   transaction.

## Not done, on purpose

- No food database, barcode, photo or other lookup: entry is by hand.
- Only today's browsing: no past-day browser, copying yesterday, or weekly view. A recovered
  draft can still save to its original day, as requested by the owner.
- Food reaches nothing else. Friends, leaderboards, the coach and Progress see none of it.

## Validation

The original implementation checks below are historical. The follow-up audit and its fixes,
including rollout requirements, are recorded in the
[25 September audit](../audits/2026-09-25-food-audit.md).

- **Tests.** 93 new tests: the maths (the split, the band at its exact ends, adding up in
  tenths, meal names), the switch, parsing, the repository with Row Level Security and the
  composite keys on PGlite, the actions behind the switch, and the list, sheet, swipe, chips,
  targets form and summary in jsdom. The whole suite, lint, formatting, type checks and a
  production build pass.
- **Migration.** 0038 was applied to a real Postgres 16 and run a second time there, inside a
  transaction that was then rolled back.
- **End to end.** On the audit stack (production build, Postgres 16, the auth stand-in), with the
  switch on for one account and off for another:
  - The account with the switch off saw Today as before and a not-found screen at
    `/today/food`.
  - The account with it on set a target, added a starred meal of two foods, and was refused a
    food without energy, on that row. It logged the star again in one tap, edited a meal into
    the band ("Goal met"), swiped a meal away, and saw Today's card match.

  The rows left in the database were checked against all of it.

- **Screens.** `/preview/food` (with `?state=first|empty|over|noweight`) and `/preview?food=on`
  were checked at 320 and 390 CSS px in both palettes, with no horizontal scrolling.
