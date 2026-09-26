# Any day on the Food tab, and a calendar of the days logged

Follows [0036](0036-meals-in-eating-order-and-a-calmer-food-card.md). The owner logs food late,
often at the gym after midnight, and by then the Food tab has moved on to the new day with no way
back: every page read and wrote today. They asked to see the days they had logged on a calendar,
to open any of them and to change it, in the Food section and with as little on screen as possible.

Mock-ups of two placements went to the owner first: the date in the header with an arrow either
side and a month calendar behind it, which was recommended, and a week strip under the header. The
owner chose the strip, and answered two more questions below.

## Decisions

1. **Any day up to today opens, and works as today does.**
   - `/food?day=YYYY-MM-DD` shows that day: its totals against the targets, and its meals.
     `/food/<meal>?day=YYYY-MM-DD` adds to it, and its portions can be changed, its foods swiped
     away and its meals starred, as today's. A meal's header already named its day; Back returns
     to the same day.
   - The saves already took the day the page was showing and refused only a day still to come.
     Only the pages were fixed on today, so nothing about saving changed.
   - A day still to come, a date that does not exist, or anything else in the link opens today
     instead of failing. The Food tab itself always opens today.
   - A past day is read against the targets as they are now. Targets are not kept for each day,
     so changing them changes how an old day reads.
2. **A strip of days under the Food header.**
   - Seven days ending on today, not on Sunday. Yesterday is always beside today, even just after
     midnight on a Monday, and the strip never holds a day that has not come yet.
   - Earlier weeks are a swipe to the left: at least eight weeks, and as far back as the day on
     screen, up to a year. The strip rests on the newest week, since it is laid out from the
     right, and a day further back brings its own week into view.
   - The day on screen is filled, today is ringed, and each day with food on it has a dot under
     it. Each day is a link named in full for a screen reader: "Saturday 26 September, today".
3. **The dot says how the day went**, which the owner chose over a plain dot or the day's kcal
   under the date: green inside the goal band, amber past it, and plain under it or without a
   target. A screen reader hears "goal met", "over the goal" or "food logged". A day under its
   band is not marked as missed, as the Food card does not call it missed either.
4. **The month in the header opens a calendar.**
   - The header's date became the month of the day on screen: "September", with the year when it
     is not this one.
   - The calendar lays the month out from Monday, as the app's weeks run, with the strip's marks.
     It turns back as far as wanted and never forward past this month. A day still to come shows
     but cannot be opened.
   - Picking a day opens it and closes the calendar. While another day is on screen, Today leads
     back.
   - The strip's own marks fill every month it holds from the first. Any other month is read once,
     when it is first turned to, by `readFoodMonthAction`, a read with nothing revalidated.
5. **After midnight the Food tab opens today**, which the owner chose over keeping yesterday on
   screen until 4 am. Yesterday is one tap to the left of today.
6. **One read more per visit.** The Food screen reads each day in the strip with food on it, as
   `readFoodDays`: one grouped query over `food_entries_user_day_idx`, every entry rounded to the
   tenth before it is added, as `eaten` rounds it, so a day's mark agrees with its own screen.

## Not done, on purpose

- **No day that ends at 4 am** (decision 5).
- **No targets kept per day.** A past day is measured against today's.
- **No list of past days with their totals.** The dots and the day itself say it.
- **No migration.** Every day's food was already stored under its date.

## Validation

- **Tests.** The whole suite passes, as do lint, formatting, type checks and a production build.
  The new tests cover:
  - the day a link opens: any real date up to today, and today for anything else;
  - the marks against the goal band, with and without a target;
  - the strip's weeks: ending on today, yesterday beside it just after midnight on a Monday, and
    reaching back to the day on screen up to a year;
  - the month grid from Monday, and months across years;
  - `readFoodDays` on PGlite with Row Level Security: each day as its own screen totals it,
    rounding included, only the days asked for, and never another account's;
  - `readFoodMonthAction`: a whole month, nothing for anything else, and nothing revalidated;
  - the Food screen: the strip's days and links, the month in the header, and a day before
    today with its meals opening on it;
  - the calendar: the strip's months not read again, any other month read once, days still to
    come not opening, and Today while another day is on screen.
- **End to end.** `npm run audit:food` gained a scenario:
  - yesterday is opened from the strip, and a food added to its Evening snack is stored on
    yesterday, not today;
  - Back returns to yesterday, which now shows the food and a mark;
  - the calendar opens on yesterday, and Today leads back;
  - a day still to come, or a link that is not a day, opens today.

  On a production build with PostgreSQL 16, the auth stand-in and Chromium, all 18 scenario
  groups passed with no page errors. Axe finds nothing on the Food screen with its strip or on
  the calendar, in either palette. Its first run flagged the calendar's days still to come, drawn
  at 3:1; they are drawn in the muted ink now. WebKit was not available on the machine that ran
  it.

- **Screens.** The built strip and calendar match the mock-ups. The dots' colours were checked
  in both palettes with a met, a passed and an under day added to the local audit account and
  removed afterwards.
