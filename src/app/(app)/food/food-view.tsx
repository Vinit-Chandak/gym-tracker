import type { Route } from "next";
import { Fragment } from "react";

import { STRATA } from "@/components/art/geometry";
import { paintToken } from "@/components/art/shapes";
import { FoodCalendarButton, FoodWeekStrip } from "@/components/food/food-days";
import { FoodSummary, mealTotals } from "@/components/food/food-summary";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { stripRange, type FoodDayTotal } from "@/domain/food-days";
import { macroTargets, MEALS, mealSlug, splitFor, type Meal } from "@/domain/nutrition";
import type { TrainingGoal } from "@/domain/types";
import { formatKcal, formatSplit } from "@/lib/format";
import { MEAL_LABELS, TRAINING_GOAL_LABELS } from "@/lib/labels";
import type { EntryRecord, FoodDay, LibraryCount } from "@/server/repositories/nutrition";

import { FoodDayRollover } from "./day-rollover";

/** Where the screen's links lead: the app's own pages, or in the preview the previews of them. */
export type FoodLinks = {
  /** The Food screen itself, which a day before today opens on with its date (ADR 0037). */
  base: Route;
  meal: (meal: Meal) => Route;
  myFoods: Route;
  targets: Route;
};

export type FoodViewProps = {
  timeZone?: string;
  today: string;
  /** The day on screen: today, or any day before it (ADR 0037). */
  date?: string;
  day: FoodDay;
  /** Each day with food on it across the strip, which marks them. */
  days?: readonly FoodDayTotal[];
  /** The newest body weight reading, which the protein target is worked out from. */
  bodyWeightKg: number | null;
  /** The profile's training goal, which chooses the split targets start from (ADR 0035). */
  goal: TrainingGoal | null;
  links?: FoodLinks;
};

const APP_LINKS: FoodLinks = {
  base: "/food",
  meal: (meal) => `/food/${mealSlug(meal)}` as Route,
  myFoods: "/food/my-foods",
  targets: "/food/targets",
};

/**
 * "2 foods · 1 meal": what My foods holds, or nothing while it holds nothing. Each count keeps
 * its noun on its line.
 */
function libraryMeta({ foods, meals }: LibraryCount): string | undefined {
  const parts = [
    foods > 0 ? `${foods}\u00a0${foods === 1 ? "food" : "foods"}` : null,
    meals > 0 ? `${meals}\u00a0${meals === 1 ? "meal" : "meals"}` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * One meal's row (board Food): its layer of the bowl as its mark, then its name, what went into
 * it and what that came to. A meal with nothing in it yet is its name and a plus.
 */
function MealRow({
  meal,
  entries,
  kcal,
  layer,
  href,
}: {
  meal: Meal;
  entries: EntryRecord[];
  kcal: number;
  /** Its place among the meals in the bowl, which gives it its layer's pigment. */
  layer: number;
  href: Route;
}) {
  const name = MEAL_LABELS[meal];
  if (entries.length === 0)
    return (
      <Link
        href={href}
        prefetch="intent"
        aria-label={`${name}: nothing yet. Add`}
        className="meal-row meal-row-empty"
      >
        <span className="mark-cell">
          <span aria-hidden className="meal-swatch" />
        </span>
        <span className="meal-row-name">{name}</span>
        <span aria-hidden className="meal-add">
          <Glyph name="plus" className="glyph-18" />
        </span>
      </Link>
    );
  const foods = [...new Set(entries.map((entry) => entry.name))].join(" · ");
  return (
    <Link href={href} prefetch="intent" className="meal-row">
      <span className="mark-cell">
        <span
          aria-hidden
          className="meal-swatch"
          style={{ background: paintToken(STRATA[layer % STRATA.length]!, "paper") }}
        />
      </span>
      {/* The spaces are for the link's name, which a screen reader reads as one string. */}
      <span className="meal-row-text">
        <span className="meal-row-name">{name}</span>{" "}
        <span className="meal-row-foods">{foods}</span>
      </span>{" "}
      <span className="type-figure whitespace-nowrap">
        {formatKcal(kcal)}
        <span className="sr-only"> kcal</span>
      </span>
    </Link>
  );
}

/** A page of the account's, at the foot of the screen: its glyph, its name, what it holds. */
function FoodTile({
  href,
  glyph,
  title,
  lines,
}: {
  href: Route;
  glyph: "target" | "book";
  title: string;
  lines: readonly (string | undefined)[];
}) {
  return (
    <Link href={href} prefetch="intent" className="food-tile">
      <Glyph name={glyph} className="glyph-20" />
      {/* The spaces are for the link's name, which a screen reader reads as one string. */}
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{title}</span>
        {lines.map(
          (line) =>
            line && (
              <Fragment key={line}>
                {" "}
                <span className="food-tile-line">{line}</span>
              </Fragment>
            ),
        )}
      </span>
    </Link>
  );
}

/**
 * The Food screen (ADRs 0032 to 0037; boards Food, Food-Over): the days under the header, then
 * the day on screen as the kcal eaten over its bowl and its macronutrients, then its seven meals
 * in the order they are eaten, each led by its layer of the bowl and opening a page to add to
 * it, then the targets and My foods, each a screen of its own. Until there is a target, asking
 * for one stands where the bowl would be. A day before today reads and changes exactly as today
 * does.
 */
export function FoodView({
  timeZone,
  today,
  date = today,
  day,
  days = [],
  bodyWeightKg,
  goal,
  links = APP_LINKS,
}: FoodViewProps) {
  const target = day.targets ? macroTargets(day.targets, bodyWeightKg, goal) : null;
  // A meal of a day before today is opened on that day, and Back from it returns there.
  const onDate = (href: Route) => (date === today ? href : (`${href}?day=${date}` as Route));
  const daysProps = { today, date, days, targetKcal: target?.kcal ?? null, base: links.base };
  const byMeal = new Map<Meal, EntryRecord[]>(MEALS.map((meal) => [meal, []]));
  for (const entry of day.entries) byMeal.get(entry.meal)?.push(entry);
  // The meals in the bowl, each with its place in it, which gives its row its layer.
  const inBowl = mealTotals(day.entries);
  // Targets that cannot do what they are meant to say so on their tile, where they are opened.
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
      <PageHeader
        title="Food"
        action={<FoodCalendarButton from={stripRange(today, date).from} {...daysProps} />}
      />
      <div className="food page-width">
        <FoodWeekStrip {...daysProps} />
        <FoodSummary eaten={day.eaten} target={target} entries={day.entries} />
        {!target && (
          <div className="food-no-target">
            <div className="min-w-0">
              <h2 className="type-heading">No daily target yet</h2>
              <p className="type-meta-small text-ink-2 tabular-nums">
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
          </div>
        )}

        <ul className="food-meals" aria-label="Meals">
          {MEALS.map((meal) => {
            const layer = inBowl.findIndex((total) => total.meal === meal);
            return (
              <li key={meal}>
                <MealRow
                  meal={meal}
                  entries={byMeal.get(meal) ?? []}
                  kcal={inBowl[layer]?.kcal ?? 0}
                  layer={Math.max(0, layer)}
                  href={onDate(links.meal(meal))}
                />
              </li>
            );
          })}
        </ul>

        <div className="food-tiles">
          <FoodTile
            href={links.targets}
            glyph="target"
            title="Targets"
            lines={[target ? `${formatKcal(target.kcal)} kcal` : "Not set", attention]}
          />
          <FoodTile
            href={links.myFoods}
            glyph="book"
            title="My foods"
            lines={[libraryMeta(day.library)]}
          />
        </div>
      </div>
    </>
  );
}
