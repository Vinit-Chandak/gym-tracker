"use client";

import type { Route } from "next";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { FoodRowText, RowGlyph, RowKcal } from "@/components/food/food-row";
import { FOODS_PER_PAGE, FoodSection, MEALS_PER_PAGE } from "@/components/food/food-section";
import { FoodSheet } from "@/components/food/food-sheet";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, eaten } from "@/domain/nutrition";
import { formatPortion } from "@/lib/format";
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

/** Where the page is: what is searched for, and the page each section is on. */
type Place = { query: string; meals: number; foods: number };

/** The URL's names for a place: `?q=oats&meals=2&foods=3`. */
const PLACE_PARAMS: Record<keyof Place, string> = { query: "q", meals: "meals", foods: "foods" };

function placeIn(params: ReadonlyURLSearchParams): Place {
  const page = (key: "meals" | "foods") =>
    Math.max(Math.floor(Number(params.get(PLACE_PARAMS[key]))) || 1, 1);
  return {
    query: params.get(PLACE_PARAMS.query) ?? "",
    meals: page("meals"),
    foods: page("foods"),
  };
}

/**
 * My foods (ADR 0035): every food and saved meal the account keeps, made, corrected and removed
 * here without logging anything. Meals come first, then foods, each the most eaten first and a
 * page at a time; a meal opens a page of its own, a food its sheet. The search and the pages are
 * kept in the URL, as History keeps its page (ADR 0044), so Back from a meal, or saving it,
 * returns to them. Swiping either aside offers Remove, which still takes a tap; a food's sheet
 * can remove it too, and a meal's page can delete it. Its rows are a meal page's, as every list
 * of food is (owner, 8 October 2026; ADR 0045): led by a tile (New food's and New meal's plus, a
 * saved meal's star, a food's bowl), its name on one line and what it holds on one more, and what
 * it comes to in whole kcal at its end.
 */
export function MyFoodsView({
  library,
  links = APP_LINKS,
}: {
  library: Library;
  links?: MyFoodsLinks;
}) {
  // Read from the URL once: what is typed or turned to after that is the page's own, and written
  // back to the URL for the next time the page opens, without a request.
  const searchParams = useSearchParams();
  const [place, setPlace] = useState(() => placeIn(searchParams));
  const move = (change: Partial<Place>) => {
    const next = { ...place, ...change };
    setPlace(next);
    const params = new URLSearchParams(window.location.search);
    const keep = (key: keyof Place, value: string | null) => {
      if (value) params.set(PLACE_PARAMS[key], value);
      else params.delete(PLACE_PARAMS[key]);
    };
    keep("query", next.query.trim() ? next.query : null);
    keep("meals", next.meals > 1 ? String(next.meals) : null);
    keep("foods", next.foods > 1 ? String(next.foods) : null);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  };
  // A new search is read from each section's first page.
  const find = (query: string) => move({ query, meals: 1, foods: 1 });
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

  const search = place.query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(search);
  const shownFoods = search ? foods.filter((food) => matches(food.name)) : foods;
  const shownMeals = search
    ? meals.filter((meal) => matches(meal.name) || meal.items.some((item) => matches(item.name)))
    : meals;
  // A search that finds nothing names the food it was looking for.
  const newName = shownFoods.length === 0 && shownMeals.length === 0 ? place.query.trim() : "";
  const view = sheet.view;

  return (
    <>
      {(library.foods.length > 0 || library.savedMeals.length > 0) && (
        <div className="food-search mt-3">
          <Glyph name="search" className="glyph-20" />
          <input
            type="search"
            value={place.query}
            onChange={(event) => find(event.target.value)}
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
            <FoodRowText
              name={newName ? `New food “${newName}”` : "New food"}
              tile={<RowGlyph name="plus" />}
            />
          </button>
        </li>
        <li>
          <Link href={links.newMeal} prefetch="intent" className="food-row">
            <FoodRowText name="New meal" tile={<RowGlyph name="plus" />} />
          </Link>
        </li>
      </ul>

      {error && (
        <p role="alert" className="mt-3 type-meta-small font-semibold">
          {error}
        </p>
      )}

      <FoodSection
        title="Meals"
        items={shownMeals}
        perPage={MEALS_PER_PAGE}
        page={place.meals}
        onPage={(meals) => move({ meals })}
        row={(meal) => (
          <li key={meal.id}>
            <SwipeRow
              action="Remove"
              actionLabel={`Remove ${meal.name}`}
              onAction={() => remove(meal, "meal")}
            >
              <Link href={links.meal(meal.id)} prefetch="intent" className="food-row">
                <FoodRowText
                  name={meal.name}
                  tile={<RowGlyph name="star" />}
                  meta={meal.items.map((item) => item.name).join(", ")}
                />{" "}
                <RowKcal kcal={addUp(meal.items.map(eaten)).kcal} />
              </Link>
            </SwipeRow>
          </li>
        )}
      />
      <FoodSection
        title="Foods"
        items={shownFoods}
        perPage={FOODS_PER_PAGE}
        page={place.foods}
        onPage={(foods) => move({ foods })}
        row={(food) => (
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
                <FoodRowText
                  name={food.name}
                  tile={<RowGlyph name="food" />}
                  meta={formatPortion(food.portionAmount, food.unit)}
                />{" "}
                <RowKcal kcal={food.kcal} />
              </button>
            </SwipeRow>
          </li>
        )}
      />

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
            if (view.kind === "library") find("");
          }}
        />
      )}
    </>
  );
}
