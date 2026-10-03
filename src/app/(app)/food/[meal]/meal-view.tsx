import type { Route } from "next";

import { PageHeader } from "@/components/shell/page-header";
import type { Meal } from "@/domain/nutrition";
import { formatIsoWeekdayDay } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import type { MealScreen } from "@/server/repositories/nutrition";

import { FoodDayRollover } from "../day-rollover";
import { MealEditor } from "./meal-editor";
import type { FoodDayBowl } from "./portion-sheet";

/**
 * A meal of the day's own page (ADR 0033; board Dinner), one level under the Food screen. Its
 * header names the day it adds to: today's is said with the title, as the screen it came from
 * shows it; a day before today (ADR 0037) is written under it.
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
      {timeZone && <FoodDayRollover today={today} timeZone={timeZone} />}
      <PageHeader
        title={MEAL_LABELS[meal]}
        meta={formatIsoWeekdayDay(date)}
        metaHidden={date === today}
        backHref={backHref}
      />
      <div className="meal-page page-width">
        <MealEditor date={date} meal={meal} screen={screen} day={day} />
      </div>
    </>
  );
}
