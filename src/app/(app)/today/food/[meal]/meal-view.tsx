import type { Route } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import type { Meal } from "@/domain/nutrition";
import { formatIsoWeekdayDay } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import type { MealScreen } from "@/server/repositories/nutrition";

import { FoodDayRollover } from "../day-rollover";
import { MealEditor } from "./meal-editor";

/** A meal of the day's own page (ADR 0033), one level under the Food screen. */
export function MealView({
  timeZone,
  today,
  meal,
  screen,
  backHref = "/today/food",
}: {
  timeZone?: string;
  today: string;
  meal: Meal;
  screen: MealScreen;
  /** Where Back goes without a page before it: the Food screen, or its preview. */
  backHref?: Route;
}) {
  return (
    <>
      {timeZone && <FoodDayRollover today={today} timeZone={timeZone} />}
      <PageHeader title={MEAL_LABELS[meal]} meta={formatIsoWeekdayDay(today)} backHref={backHref} />
      <PageContent>
        <MealEditor today={today} meal={meal} screen={screen} />
      </PageContent>
    </>
  );
}
