# Food takes History's tab

Follows [0033](0033-meals-of-the-day-and-my-foods.md). Food was a card at the foot of Today that
opened a screen of Today's. The owner asked for it to be a section of its own, in the tab History
had, and for History to move into Progress.

## Decisions

1. **The tabs are Today, Training, Food, Progress and Profile.**
   - Food is logged several times a day, and the card put it a scroll below the day's training.
     History is a look back, which is what Progress is for. Swapping them keeps the island at five
     tabs, each with one job.
   - Food's glyph is a filled bowl. A fork and knife says food as plainly, but it is drawn in
     hairlines that fade beside the barbell and the shoe at the navigation's size, the problem the
     bars already solved for Progress.
2. **Food is a tab like the others.**
   - The Food screen is `/food` and a meal's page `/food/<meal>`. The screen has no back control,
     as no tab has. A meal's page keeps Food selected and goes back to it by name.
   - Like every tab it is prefetched whole, and a copy is kept for a minute (ADRs 0030, 0032).
   - Every food action revalidates `/food` and the meal pages. Nothing on Today changes with them
     any more.
3. **Today no longer shows food.** The card is gone, and so is Today's read of the day's food. The
   tab is one tap from anywhere, which is what the card was for, and Today is about the day's
   training again. The preview's `?food=on` went with it.
4. **History is a section of Progress.**
   - Progress's picker lists Overview, History, Strength, Running, Recovery and Body. The header
     says Progress on every section; the picker says which one.
   - History keeps a page of its own, `/progress/history`, rather than becoming a view of the
     Progress page. It reads what the charts do not: every record in the range, and the gyms to
     filter them by. As a view, every visit to Progress, and every prefetch of it, would read that
     too.
   - Moving between History and the other sections keeps the query. Both read their dates from
     `from` and `to`, so a range chosen on one holds on the other, and History's filters and the
     exercise chosen on Strength wait in the query for the way back.
   - A switch replaces the entry instead of adding one, as the other sections do. Back leaves
     Progress rather than stepping back through the sections looked at.
   - The picker loads History whole as soon as it is open, so choosing it is as quick as choosing
     one of the page's own sections. From History, the other sections get Next's ordinary prefetch:
     five whole Progress pages loaded at once would compete with the tap (ADR 0032).
5. **What History opens keeps Progress selected.** A workout, run, ride or swim opened from History
   carries `from=history` as before (NAV-03). That now selects Progress and goes back to History by
   name. Deleting an activity lands on History, and so does Back from a finished workout opened by
   a direct link.
6. **Old paths still work.** `/history` redirects permanently to `/progress/history`, its query
   included, and `/today/food` and everything under it to `/food`, as `/settings` did to `/profile`
   (ADR 0026).

## Not done, on purpose

- No glance at the day's food on Today. It can come back as a one-line link if the tab alone
  proves a step too far.
- History is not folded into Overview: the list and the charts answer different questions.

## Validation

- **Tests.** The navigation's order, the tab each path selects, the back labels, the origins and
  the redirects are unit-tested, as are the picker's links, queries and prefetching. The whole
  suite, lint, formatting, type checks and a production build pass.
- **End to end.** On the audit stack (production build, PostgreSQL 16, the auth stand-in and
  Chromium), `npm run audit:food` passed all 15 of its scenario groups and `npm run audit:flows`
  all 20, with no page errors. They cover:
  - the island reading Today, Training, Food, Progress, Profile, and Today carrying no food;
  - a meal's page keeping Food selected;
  - `/today/food/breakfast`, `/today/food` and `/history?kind=workout` landing on their new paths,
    query included;
  - History's filters surviving the move to Strength and back;
  - History arriving from Progress's picker 81 ms after the tap without a request of its own, and
    Back then leaving Progress;
  - History → activity → correction → Back with Progress selected throughout, through a reload
    and Forward;
  - a deleted activity landing on History.
- **Tabs.** Measured on the same build, every tab, Food included, is on screen 77–88 ms after a
  tap, with no request.
- **Screens.** Axe finds nothing on the Food tab or History, navigation island included, in either
  palette. `npm run audit:screens` over Today, Food, Progress and History, as three accounts and
  in both palettes, found every screen whole: no overflow, no page error and nothing from Axe.
