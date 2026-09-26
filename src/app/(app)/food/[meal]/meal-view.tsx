import type { Route } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import type { Meal } from "@/domain/nutrition";
import { formatIsoWeekdayDay } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import type { MealScreen } from "@/server/repositories/nutrition";

import { FoodDayRollover } from "../day-rollover";
import { MealEditor } from "./meal-editor";

/**
 * A meal of the day's own page (ADR 0033), one level under the Food screen. Its header names the
 * day it adds to, which is today's or, opened from a day before it, that day's (ADR 0037).
 */
export function MealView({
  timeZone,
  today,
  date = today,
  meal,
  screen,
  backHref = "/food",
}: {
  timeZone?: string;
  today: string;
  /** The day the meal is on, and what is added to it is logged on. */
  date?: string;
  meal: Meal;
  screen: MealScreen;
  /** Where Back goes without a page before it: the Food screen, or its preview. */
  backHref?: Route;
}) {
  return (
    <>
      {timeZone && <FoodDayRollover today={today} timeZone={timeZone} />}
      <PageHeader title={MEAL_LABELS[meal]} meta={formatIsoWeekdayDay(date)} backHref={backHref} />
      <PageContent>
        <MealEditor date={date} meal={meal} screen={screen} />
      </PageContent>
    </>
  );
}
