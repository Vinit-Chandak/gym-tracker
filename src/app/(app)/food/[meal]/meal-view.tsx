import type { Route } from "next";

import { DayRollover } from "@/components/shell/day-rollover";
import { PageHeader } from "@/components/shell/page-header";
import { mealSlug, type Meal } from "@/domain/nutrition";
import { formatIsoDate } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import type { MealScreen } from "@/server/repositories/nutrition";

import { MealEditor } from "./meal-editor";
import type { FoodDayBowl } from "./portion-sheet";

/**
 * A meal of the day's own page (ADR 0033; board Dinner), one level under the Food screen. Its
 * header names the day it adds to: today's is said with the title, as the screen it came from
 * shows it; a day before today (ADR 0037) is written under it. Left open past midnight, the page
 * keeps its day, which is then written under the title too.
 */
export function MealView({
  timeZone,
  today,
  date = today,
  meal,
  screen,
  day,
  backHref = "/food",
}: {
  /** The account's zone, which the page keeps its day past midnight in; absent in a preview. */
  timeZone?: string;
  today: string;
  /** The day the meal is on, and what is added to it is logged on. */
  date?: string;
  meal: Meal;
  screen: MealScreen;
  /** The day's meals and target, which a portion is shown going into. */
  day?: FoodDayBowl;
  /** Where Back goes without a page before it: the Food screen, or its preview. */
  backHref?: Route;
}) {
  return (
    <>
      {timeZone && (
        <DayRollover
          today={today}
          timeZone={timeZone}
          keep={date === today ? (`/food/${mealSlug(meal)}?day=${date}` as Route) : undefined}
        />
      )}
      <PageHeader
        title={MEAL_LABELS[meal]}
        meta={formatIsoDate(date, today.slice(0, 4))}
        metaHidden={date === today}
        backHref={backHref}
      />
      <div className="meal-page page-width">
        <MealEditor date={date} meal={meal} screen={screen} day={day} />
      </div>
    </>
  );
}
