"use client";

import type { Route } from "next";
import { useOptimistic, useState, useTransition } from "react";

import { FoodSheet } from "@/components/food/food-sheet";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, eaten } from "@/domain/nutrition";
import { formatKcal, formatPortion } from "@/lib/format";
import { attempted } from "@/lib/offline-submit";
import { deleteFoodAction, deleteSavedMealAction } from "@/server/actions/nutrition";
import type { FoodRecord, Library, SavedMealRecord } from "@/server/repositories/nutrition";

/** Where the page's links lead: the app's own pages, or in the preview the previews of them. */
export type MyFoodsLinks = {
  newMeal: Route;
  meal: (id: string) => Route;
};

const APP_LINKS: MyFoodsLinks = {
  newMeal: "/food/my-foods/meals/new",
  meal: (id) => `/food/my-foods/meals/${id}` as Route,
};

/** "3 foods · 580 kcal": what a saved meal holds, in one line. */
function contents(meal: SavedMealRecord): string {
  const count = meal.items.length;
  const total = addUp(meal.items.map(eaten));
  return `${count} ${count === 1 ? "food" : "foods"} · ${formatKcal(total.kcal)} kcal`;
}

/**
 * My foods (ADR 0035): every food and saved meal the account keeps, made, corrected and removed
 * here without logging anything. Meals come first, then foods, the most lately eaten first; a
 * meal opens a page of its own, a food its sheet. Swiping either aside offers Remove, which still
 * takes a tap; a food's sheet can remove it too, and a meal's page can delete it. The rows are
 * a meal page's (owner, 8 October 2026): each led by its tile (New food's and New meal's plus, a
 * saved meal's star, a food's bowl), its name on one line and what it holds on one more.
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
  const view = sheet.view;

  const opens = <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />;

  return (
    <>
      {(library.foods.length > 0 || library.savedMeals.length > 0) && (
        <div className="food-search mt-3">
          <Glyph name="search" className="glyph-20" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your foods"
            aria-label="Search your foods and meals"
            className="food-search-input"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
          />
        </div>
      )}

      <ul className="food-list mt-1.5">
        <li>
          <button
            type="button"
            onClick={() =>
              setSheet((current) => ({
                key: current.key + 1,
                open: true,
                view: { kind: "library", name: newName },
              }))
            }
            className="food-row"
          >
            <span className="food-row-text food-row-led">
              <span className="food-row-name">
                {newName ? `New food “${newName}”` : "New food"}
              </span>
              <Glyph name="plus" className="food-row-glyph glyph-16" />
            </span>
          </button>
        </li>
        <li>
          <Link href={links.newMeal} prefetch="intent" className="food-row">
            <span className="food-row-text food-row-led">
              <span className="food-row-name">New meal</span>
              <Glyph name="plus" className="food-row-glyph glyph-16" />
            </span>
          </Link>
        </li>
      </ul>

      {error && (
        <p role="alert" className="mt-3 type-meta-small font-semibold">
          {error}
        </p>
      )}

      {shownMeals.length > 0 && (
        <section className="mt-5">
          <h2 className="caption-head">Meals</h2>
          <ul className="food-list" aria-label="Meals">
            {shownMeals.map((meal) => (
              <li key={meal.id}>
                <SwipeRow
                  action="Remove"
                  actionLabel={`Remove ${meal.name}`}
                  onAction={() => remove(meal, "meal")}
                >
                  <Link href={links.meal(meal.id)} prefetch="intent" className="food-row">
                    {/* The spaces are for the link's name, which a screen reader reads as one
                        string; beside flex items they take no room on the screen. */}
                    <span className="food-row-text food-row-led">
                      <span className="food-row-name">{meal.name}</span>
                      <Glyph name="star" className="food-row-glyph glyph-16" />{" "}
                      <span className="food-row-meta">{contents(meal)}</span>
                    </span>
                    {opens}
                  </Link>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shownFoods.length > 0 && (
        <section className="mt-5">
          <h2 className="caption-head">Foods</h2>
          <ul className="food-list" aria-label="Foods">
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
                    className="food-row"
                  >
                    <span className="food-row-text food-row-led">
                      <span className="food-row-name">{food.name}</span>
                      <Glyph name="food" className="food-row-glyph glyph-16" />{" "}
                      <span className="food-row-meta">
                        {formatPortion(food.portionAmount, food.unit)} · {formatKcal(food.kcal)}{" "}
                        kcal
                      </span>
                    </span>
                    {opens}
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </section>
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
