"use client";

import type { Route } from "next";
import { useOptimistic, useState, useTransition } from "react";

import { FoodSheet } from "@/components/food/food-sheet";
import Link from "@/components/ui/app-link";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRight, Food, Search, Star } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, eaten } from "@/domain/nutrition";
import { formatKcal, formatPortion } from "@/lib/format";
import { attempted } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { deleteFoodAction, deleteSavedMealAction } from "@/server/actions/nutrition";
import type { FoodRecord, Library, SavedMealRecord } from "@/server/repositories/nutrition";

/**
 * Where the page's links lead: the app's own pages, or in the preview the previews of them. A
 * saved meal's page is a pattern with its id in it, since a function cannot be handed to this
 * client component from the preview's server page; a pattern without `{id}` opens the same
 * page for every meal, which is what the preview wants.
 */
export type MyFoodsLinks = {
  newMeal: Route;
  meal: string;
};

const APP_LINKS: MyFoodsLinks = {
  newMeal: "/food/my-foods/meals/new",
  meal: "/food/my-foods/meals/{id}",
};

/** A saved meal's own page. */
function mealHref(links: MyFoodsLinks, id: string): Route {
  return links.meal.replace("{id}", id) as Route;
}

/** "3 foods · 580 kcal": what a saved meal holds, in one line. */
function contents(meal: SavedMealRecord): string {
  const count = meal.items.length;
  const total = addUp(meal.items.map(eaten));
  return `${count} ${count === 1 ? "food" : "foods"} · ${formatKcal(total.kcal)} kcal`;
}

/**
 * My foods (ADR 0035): every food and saved meal the account keeps, made, corrected and removed
 * here without logging anything. A new food is the screen's one highlighted action, a new meal
 * the ruled one beside it. Meals come first, then foods, the most lately eaten first; a meal
 * opens a page of its own, a food its sheet. Swiping either aside offers Remove, which still
 * takes a tap; a food's sheet can remove it too, and a meal's page can delete it.
 */
export function MyFoodsView({
  library,
  links = APP_LINKS,
}: {
  library: Library;
  links?: MyFoodsLinks;
}) {
  const [query, setQuery] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A new key for every opening mounts the sheet afresh; closing keeps the key, so the dialog
  // is closed where it is and hands the focus back to whatever opened it.
  const [sheet, setSheet] = useState<{
    key: number;
    open: boolean;
    view: { kind: "library"; name: string } | { kind: "edit"; food: FoodRecord } | null;
  }>({ key: 0, open: false, view: null });

  // What is removed leaves the list at once; if that does not go through, it comes back.
  const [foods, hideFood] = useOptimistic(
    library.foods,
    (current: readonly FoodRecord[], id: string) => current.filter((food) => food.id !== id),
  );
  const [meals, hideMeal] = useOptimistic(
    library.savedMeals,
    (current: readonly SavedMealRecord[], id: string) => current.filter((meal) => meal.id !== id),
  );
  const [, startTransition] = useTransition();

  const remove = (item: { id: string; name: string }, kind: "food" | "meal") =>
    startTransition(async () => {
      if (kind === "food") hideFood(item.id);
      else hideMeal(item.id);
      setError(null);
      const outcome = await attempted(
        () => (kind === "food" ? deleteFoodAction(item.id) : deleteSavedMealAction(item.id)),
        `${item.name} was not removed. Check your connection and try again.`,
      );
      // After an await an update is no longer the transition's own: marked as one, the
      // message arrives in the same render as the row coming back, not a frame ahead of it.
      startTransition(() => {
        if (!outcome.ok) setError(outcome.message);
        else if (!outcome.value.ok) setError(outcome.value.error ?? null);
        else setSaid(`${item.name} removed from My foods.`);
      });
    });

  const search = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(search);
  const shownFoods = search ? foods.filter((food) => matches(food.name)) : foods;
  const shownMeals = search
    ? meals.filter((meal) => matches(meal.name) || meal.items.some((item) => matches(item.name)))
    : meals;
  // A search that finds nothing names the food it was looking for.
  const newName = shownFoods.length === 0 && shownMeals.length === 0 ? query.trim() : "";
  const hasLibrary = library.foods.length > 0 || library.savedMeals.length > 0;
  const view = sheet.view;

  const newFood = (
    <Button
      size="lg"
      onClick={() =>
        setSheet((current) => ({
          key: current.key + 1,
          open: true,
          view: { kind: "library", name: newName },
        }))
      }
    >
      {newName ? `New food “${newName}”` : "New food"}
    </Button>
  );

  return (
    <>
      {hasLibrary ? (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your foods"
              aria-label="Search your foods and meals"
              className="pl-10"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
            />
          </div>
          <div className="action-row">
            {newFood}
            <Link
              href={links.newMeal}
              prefetch="intent"
              className={buttonClassName("secondary", "lg")}
            >
              New meal
            </Link>
          </div>
        </div>
      ) : (
        <section className="box">
          <EmptyState
            icon={Food}
            title="Nothing in My foods yet"
            description="Foods and meals kept here are one tap away in every meal of the day."
            action={
              <div className="flex flex-col items-center gap-2">
                {newFood}
                <Link href={links.newMeal} prefetch="intent" className={buttonClassName("ghost")}>
                  New meal
                </Link>
              </div>
            }
          />
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {shownMeals.length > 0 && (
        <Section title="Meals">
          <ul className="box-rows" aria-label="Meals">
            {shownMeals.map((meal) => (
              <li key={meal.id}>
                <SwipeRow
                  action="Remove"
                  actionLabel={`Remove ${meal.name}`}
                  onAction={() => remove(meal, "meal")}
                >
                  <Link
                    href={mealHref(links, meal.id)}
                    prefetch="intent"
                    className={cn(PRESSABLE_ROW_CLASS, "flex-wrap")}
                  >
                    {/* The spaces are for the link's name, which a screen reader reads as one
                        string; beside flex items they take no room on the screen. */}
                    <span className="flex min-w-0 flex-[1_1_10rem] flex-wrap items-center gap-3">
                      <Star className="shrink-0 text-pen" aria-hidden />
                      <span className="min-w-0 flex-[1_1_8rem]">
                        <span className="block font-medium [overflow-wrap:anywhere]">
                          {meal.name}
                        </span>{" "}
                        <span className="block font-data text-sm text-ink-muted tabular-nums">
                          {contents(meal)}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="ml-auto shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {shownFoods.length > 0 && (
        <Section title="Foods">
          <ul className="box-rows" aria-label="Foods">
            {shownFoods.map((food) => (
              <li key={food.id}>
                <SwipeRow
                  action="Remove"
                  actionLabel={`Remove ${food.name}`}
                  onAction={() => remove(food, "food")}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSheet((current) => ({
                        key: current.key + 1,
                        open: true,
                        view: { kind: "edit", food },
                      }))
                    }
                    className={PRESSABLE_ROW_CLASS}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {food.name}
                      </span>{" "}
                      <span className="block font-data text-sm text-ink-muted tabular-nums">
                        {formatPortion(food.portionAmount, food.unit)} · {formatKcal(food.kcal)}{" "}
                        kcal
                      </span>
                    </span>
                    <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      {view && (
        <FoodSheet
          key={sheet.key}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          target={view}
          onDone={(message) => {
            setSaid(message);
            setError(null);
            if (view.kind === "library") setQuery("");
          }}
        />
      )}
    </>
  );
}
