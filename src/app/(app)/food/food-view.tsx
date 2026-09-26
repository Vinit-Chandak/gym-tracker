import type { Route } from "next";

import { FoodSummary } from "@/components/food/food-summary";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronRight, Plus } from "@/components/ui/icons";
import { LinkRow, List, PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import {
  addUp,
  eaten,
  macroTargets,
  MEALS,
  mealSlug,
  splitFor,
  type Meal,
} from "@/domain/nutrition";
import type { TrainingGoal } from "@/domain/types";
import { formatIsoWeekdayDay, formatKcal, formatSplit } from "@/lib/format";
import { MEAL_LABELS, TRAINING_GOAL_LABELS } from "@/lib/labels";
import type { EntryRecord, FoodDay, LibraryCount } from "@/server/repositories/nutrition";

import { FoodDayRollover } from "./day-rollover";

/** Where the screen's links lead: the app's own pages, or in the preview the previews of them. */
export type FoodLinks = {
  meal: (meal: Meal) => Route;
  myFoods: Route;
  targets: Route;
};

export type FoodViewProps = {
  timeZone?: string;
  today: string;
  day: FoodDay;
  /** The newest body weight reading, which the protein target is worked out from. */
  bodyWeightKg: number | null;
  /** The profile's training goal, which chooses the split targets start from (ADR 0035). */
  goal: TrainingGoal | null;
  links?: FoodLinks;
};

const APP_LINKS: FoodLinks = {
  meal: (meal) => `/food/${mealSlug(meal)}` as Route,
  myFoods: "/food/my-foods",
  targets: "/food/targets",
};

/** "2 foods · 1 meal": what My foods holds, or nothing while it holds nothing. */
function libraryMeta({ foods, meals }: LibraryCount): string | undefined {
  const parts = [
    foods > 0 ? `${foods} ${foods === 1 ? "food" : "foods"}` : null,
    meals > 0 ? `${meals} ${meals === 1 ? "meal" : "meals"}` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

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
 * The Food screen (ADRs 0032 to 0035): the day against its targets, then the day's six meals in
 * the order they are eaten, each opening a page to add to it, then My foods and the targets, each
 * a screen of its own. Until there is a target, asking for one is what the screen opens with.
 */
export function FoodView({
  timeZone,
  today,
  day,
  bodyWeightKg,
  goal,
  links = APP_LINKS,
}: FoodViewProps) {
  const target = day.targets ? macroTargets(day.targets, bodyWeightKg, goal) : null;
  const byMeal = new Map<Meal, EntryRecord[]>(MEALS.map((meal) => [meal, []]));
  for (const entry of day.entries) byMeal.get(entry.meal)?.push(entry);
  // Targets that cannot do what they are meant to say so on their row, where they are opened.
  const attention = !target
    ? undefined
    : target.overBudget
      ? "Nothing left for carbs"
      : target.bodyWeightKg === null
        ? "Add your body weight for protein"
        : undefined;

  return (
    <>
      {timeZone && <FoodDayRollover today={today} timeZone={timeZone} />}
      <PageHeader title="Food" meta={formatIsoWeekdayDay(today)} />
      <PageContent>
        {target ? (
          <Card>
            <FoodSummary eaten={day.eaten} target={target} entries={day.entries} />
          </Card>
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <h2 className="font-medium">No daily target yet</h2>
              <p className="text-sm text-ink-muted tabular-nums">
                {goal ? `${TRAINING_GOAL_LABELS[goal]} · ` : ""}
                {formatSplit(splitFor(goal))}
              </p>
            </div>
            <Link
              href={links.targets}
              prefetch="intent"
              className={buttonClassName("primary", "sm")}
            >
              Set target
            </Link>
          </Card>
        )}

        <Section title="Meals">
          <ul className="box-rows" aria-label="Meals">
            {MEALS.map((meal) => (
              <li key={meal}>
                <MealRow meal={meal} entries={byMeal.get(meal) ?? []} href={links.meal(meal)} />
              </li>
            ))}
          </ul>
        </Section>

        <List>
          <li>
            <LinkRow
              href={links.myFoods}
              title="My foods"
              meta={libraryMeta(day.library)}
              prefetch="intent"
            />
          </li>
          <li>
            <LinkRow
              href={links.targets}
              title="Targets"
              subtitle={attention}
              meta={target ? `${formatKcal(target.kcal)} kcal` : "Not set"}
              prefetch="intent"
            />
          </li>
        </List>
      </PageContent>
    </>
  );
}
