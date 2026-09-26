import type { Route } from "next";

import { FoodSummary } from "@/components/food/food-summary";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ChevronRight, Plus } from "@/components/ui/icons";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { addUp, eaten, macroTargets, MEALS, mealSlug, type Meal } from "@/domain/nutrition";
import type { BodyLoadUnit } from "@/domain/types";
import { formatFoodAmount, formatIsoWeekdayDay, formatKcal } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import type { EntryRecord, FoodDay } from "@/server/repositories/nutrition";

import { FoodDayRollover } from "./day-rollover";
import { TargetsForm } from "./targets-form";

export type FoodViewProps = {
  timeZone?: string;
  today: string;
  day: FoodDay;
  /** The newest body weight reading, which the protein target is worked out from. */
  bodyWeightKg: number | null;
  unit: BodyLoadUnit;
  /** Where a meal's row leads: its own page, or in the preview the preview of it. */
  mealHref?: (meal: Meal) => Route;
};

const mealPage = (meal: Meal) => `/food/${mealSlug(meal)}` as Route;

/** One meal's row: its name, what went into it, and what that came to. */
function MealRow({ meal, entries, href }: { meal: Meal; entries: EntryRecord[]; href: Route }) {
  const foods = [...new Set(entries.map((entry) => entry.name))].join(", ");
  return (
    <Link href={href} prefetch="intent" className={PRESSABLE_ROW_CLASS}>
      {/* The spaces are for the link's name, which a screen reader reads as one string. */}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{MEAL_LABELS[meal]}</span>{" "}
        {foods ? (
          <span className="line-clamp-2 block text-sm [overflow-wrap:anywhere] text-ink-muted">
            {foods}
          </span>
        ) : (
          <span className="sr-only">nothing yet</span>
        )}
      </span>{" "}
      {entries.length > 0 ? (
        <>
          <span className="shrink-0 tabular-nums">
            {formatKcal(addUp(entries.map(eaten)).kcal)} kcal
          </span>
          <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
        </>
      ) : (
        <Plus className="shrink-0 text-accent" aria-hidden />
      )}
    </Link>
  );
}

/**
 * The Food screen (ADRs 0032, 0033): the day against its targets, then the day's six meals in the
 * order they are eaten, each opening a page to add to it, then the targets themselves. Until
 * there is a target, setting one is what the screen opens with.
 */
export function FoodView({
  timeZone,
  today,
  day,
  bodyWeightKg,
  unit,
  mealHref = mealPage,
}: FoodViewProps) {
  const target = day.targets ? macroTargets(day.targets, bodyWeightKg) : null;
  const byMeal = new Map<Meal, EntryRecord[]>(MEALS.map((meal) => [meal, []]));
  for (const entry of day.entries) byMeal.get(entry.meal)?.push(entry);
  // Targets that are not doing what they were set to do open themselves, so the reason is on
  // the screen: protein by body weight with no weight to go on, or a target too small to hold it.
  const needsAttention =
    target !== null && (target.overBudget || target.split !== day.targets?.split);
  const targetsForm = (
    <TargetsForm
      targets={day.targets}
      bodyWeightKg={bodyWeightKg}
      unit={unit}
      submitLabel={day.targets ? "Save targets" : "Set target"}
    />
  );

  return (
    <>
      {timeZone && <FoodDayRollover today={today} timeZone={timeZone} />}
      <PageHeader title="Food" meta={formatIsoWeekdayDay(today)} />
      <PageContent>
        {target ? (
          <Card>
            <FoodSummary eaten={day.eaten} target={target} />
          </Card>
        ) : (
          <Card>
            <h2 className="text-lg font-medium">Set a daily target</h2>
            {targetsForm}
          </Card>
        )}

        <Section title="Meals">
          <ul className="box-rows">
            {MEALS.map((meal) => (
              <li key={meal}>
                <MealRow meal={meal} entries={byMeal.get(meal) ?? []} href={mealHref(meal)} />
              </li>
            ))}
          </ul>
        </Section>

        {target && (
          <Disclosure
            summary="Targets"
            meta={`${formatFoodAmount(target.kcal)} kcal`}
            defaultOpen={needsAttention}
          >
            {targetsForm}
          </Disclosure>
        )}
      </PageContent>
    </>
  );
}
