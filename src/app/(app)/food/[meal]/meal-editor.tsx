"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";

import { Glyph } from "@/components/ui/glyphs";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, eaten, sameFoods, type Meal } from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion, formatWholeKcal } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import { attempted } from "@/lib/offline-submit";
import { deleteEntryAction, deleteSavedMealAction } from "@/server/actions/nutrition";
import type {
  EntryRecord,
  FoodRecord,
  MealScreen,
  SavedMealRecord,
} from "@/server/repositories/nutrition";

import { FoodSheet } from "@/components/food/food-sheet";
import { PortionSheet, type FoodDayBowl } from "./portion-sheet";
import { SavedMealSheet, SaveMealSheet } from "./saved-meal-sheets";

/** The sheet that is open, and what it was opened for. */
type SheetView =
  | { kind: "log"; food: FoodRecord }
  | { kind: "entry"; entry: EntryRecord }
  | { kind: "create"; name: string }
  | { kind: "quick"; name: string }
  | { kind: "saved"; saved: SavedMealRecord }
  | { kind: "star" };

function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * What a row comes to, in Jost, its unit beside it (board Dinner: "338.5 kcal"). Beside a list to
 * add from, `whole`: the nearest whole kcal, which the stylesheet sets over its unit in a column.
 */
function Kcal({ kcal, whole = false }: { kcal: number; whole?: boolean }) {
  return (
    <span className="food-row-kcal">
      <span className="type-figure">{whole ? formatWholeKcal(kcal) : formatKcal(kcal)}</span>{" "}
      <span className="food-row-unit">kcal</span>
    </span>
  );
}

/**
 * One meal of the day (ADRs 0033, 0035; board Dinner): what is in it and what that comes to, the
 * star that saves it, and everything in My foods that can go into it, searched as it is typed:
 * the saved meals under Meals, then the foods under Foods, as My foods sets them out. Every row to
 * add from is led by its tile (Quick add's bolt, a saved meal's star, a food's bowl) and keeps its
 * name to one line and what is under it (a meal's foods, a food's portion) to one more, its whole
 * kcal in a column at its end, so a meal and a food stand the same height whatever they are
 * called and hold (owner, 8 October 2026). A food opens a sheet for how much of it; a saved meal,
 * for adding all of it, which shows its name and foods in full. Tapping a food already in the
 * meal changes its amount, and swiping it aside takes it out, which its sheet can do too.
 *
 * The page adds from My foods and does not manage it: foods are made, corrected and removed on
 * My foods' own screen. Only a search that finds nothing offers a new food, made and added here
 * in one go, since leaving to make it would lose the meal. Quick add, always first, logs
 * something eaten just this once from its figures alone, and keeps nothing in My foods.
 */
export function MealEditor({
  date,
  meal,
  screen,
  day,
}: {
  /** The day the page is showing, today or one before it, which a sheet opened on it logs to. */
  date: string;
  meal: Meal;
  screen: MealScreen;
  /** The day's meals and target, which a portion is shown going into. */
  day?: FoodDayBowl;
}) {
  const label = MEAL_LABELS[meal];
  const place = { eatenOn: date, meal, mealLabel: label };
  const [query, setQuery] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A new key for every opening mounts the sheet afresh; closing keeps the key, so the dialog
  // is closed where it is and hands the focus back to whatever opened it.
  const [sheet, setSheet] = useState<{ key: number; open: boolean; view: SheetView | null }>({
    key: 0,
    open: false,
    view: null,
  });
  const open = (view: SheetView) =>
    setSheet((current) => ({ key: current.key + 1, open: true, view }));
  const close = () => setSheet((current) => ({ ...current, open: false }));
  const top = useRef<HTMLDivElement>(null);

  // A food taken out leaves the list at once; if that does not go through, it comes back.
  const [entries, hide] = useOptimistic(
    screen.entries,
    (current: readonly EntryRecord[], id: string) => current.filter((entry) => entry.id !== id),
  );
  const [pending, startTransition] = useTransition();
  const total = addUp(entries.map(eaten));
  const starred =
    entries.length > 0
      ? (screen.savedMeals.find((saved) => sameFoods(entries, saved.items)) ?? null)
      : null;

  const done = (message: string, added: boolean) => {
    setSaid(message);
    setError(null);
    if (!added) return;
    setQuery("");
    // What was added is shown in the meal at the top; bring it back into view if the list was
    // scrolled past it.
    if ((top.current?.getBoundingClientRect().top ?? 0) < 0) {
      top.current?.scrollIntoView({ behavior: scrollBehaviour(), block: "start" });
    }
  };

  const remove = (entry: EntryRecord) =>
    startTransition(async () => {
      hide(entry.id);
      setError(null);
      const outcome = await attempted(
        () => deleteEntryAction(entry.id),
        `${entry.name} was not removed. Check your connection and try again.`,
      );
      // After an await an update is no longer the transition's own: marked as one, the
      // message arrives in the same render as the food coming back, not a frame ahead of it.
      startTransition(() => {
        if (!outcome.ok) setError(outcome.message);
        else if (!outcome.value.ok) setError(outcome.value.error ?? null);
        else setSaid(`${entry.name} removed.`);
      });
    });

  const unstar = (saved: SavedMealRecord) =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => deleteSavedMealAction(saved.id),
        `${saved.name} was not unstarred. Check your connection and try again.`,
      );
      startTransition(() => {
        if (!outcome.ok) setError(outcome.message);
        else if (!outcome.value.ok) setError(outcome.value.error ?? null);
        else setSaid(`${saved.name} unstarred.`);
      });
    });

  const search = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(search);
  const foods = search ? screen.foods.filter((food) => matches(food.name)) : screen.foods;
  const savedMeals = search
    ? screen.savedMeals.filter(
        (saved) => matches(saved.name) || saved.items.some((item) => matches(item.name)),
      )
    : screen.savedMeals;
  const nothingFound = foods.length === 0 && savedMeals.length === 0;
  const view = sheet.view;

  return (
    <>
      {entries.length > 0 && (
        <div ref={top} className="scroll-mt-20">
          <section aria-label={`${label} total`} className="meal-total mt-3">
            <div className="min-w-0">
              <p className="whitespace-nowrap">
                <span className="type-figure-l">{formatKcal(total.kcal)}</span>{" "}
                <span className="food-preview-unit">kcal</span>
              </p>
              <p className="type-meta-small text-ink-2 tabular-nums">{formatMacros(total)}</p>
              {starred && (
                <p className="mt-0.5 type-caption font-medium [overflow-wrap:anywhere] text-ink-2">
                  Saved as {starred.name}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-pressed={starred !== null}
              disabled={pending}
              onClick={() => (starred ? unstar(starred) : open({ kind: "star" }))}
              className="star-button"
            >
              <Glyph
                name="star"
                className="glyph-18"
                style={starred ? { fill: "currentColor" } : undefined}
              />
              Star
            </button>
          </section>
          <ul className="meal-entries" aria-label={`In ${label.toLowerCase()}`}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <SwipeRow
                  action="Remove"
                  actionLabel={`Remove ${entry.name}`}
                  onAction={() => remove(entry)}
                >
                  <button
                    type="button"
                    onClick={() => open({ kind: "entry", entry })}
                    className="food-row"
                  >
                    {/* The spaces are for the button's name, which a screen reader reads as one
                        string; beside flex items they take no room on the screen. */}
                    <span className="food-row-text">
                      <span className="food-row-name">{entry.name}</span>{" "}
                      <span className="food-row-meta">
                        {formatPortion(entry.amount, entry.unit)}
                      </span>
                    </span>{" "}
                    <Kcal kcal={eaten(entry).kcal} />
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 type-meta-small font-semibold">
          {error}
        </p>
      )}

      <div className="food-search mt-3">
        <Glyph name="search" className="glyph-20" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your foods"
          aria-label="Search your foods and saved meals"
          className="food-search-input"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>

      <div role="group" aria-label="Your foods and meals">
        <ul className="food-list mt-1.5">
          <li>
            <button
              type="button"
              onClick={() => open({ kind: "quick", name: query.trim() })}
              className="food-row"
            >
              {/* The glyph is drawn in front of the name but comes after it in the button's
                  name, so a screen reader still starts with what the row is called. */}
              <span className="food-row-text food-row-led">
                <span className="food-row-name">
                  {query.trim() ? `Quick add “${query.trim()}”` : "Quick add"}
                </span>
                <Glyph name="bolt" className="food-row-glyph glyph-16" />{" "}
                <span className="food-row-meta food-row-hint">
                  Calories and macros, just this once
                </span>
              </span>
            </button>
          </li>
          {nothingFound && (
            <li>
              <button
                type="button"
                onClick={() => open({ kind: "create", name: query.trim() })}
                className="food-row"
              >
                <span className="food-row-text food-row-led">
                  <span className="food-row-name">
                    {query.trim() ? `New food “${query.trim()}”` : "New food"}
                  </span>
                  <Glyph name="plus" className="food-row-glyph glyph-16" />
                </span>
              </button>
            </li>
          )}
        </ul>

        {savedMeals.length > 0 && (
          <section className="mt-5">
            <h2 className="caption-head">Meals</h2>
            <ul className="food-list" aria-label="Meals">
              {savedMeals.map((saved) => (
                <li key={saved.id}>
                  <button
                    type="button"
                    onClick={() => open({ kind: "saved", saved })}
                    className="food-row"
                  >
                    <span className="food-row-text food-row-led">
                      <span className="food-row-name">{saved.name}</span>
                      <Glyph
                        name="star"
                        label="Saved meal"
                        className="food-row-glyph glyph-16"
                      />{" "}
                      <span className="food-row-meta">
                        {saved.items.map((item) => item.name).join(", ")}
                      </span>
                    </span>{" "}
                    <Kcal kcal={addUp(saved.items.map(eaten)).kcal} whole />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {foods.length > 0 && (
          <section className="mt-5">
            <h2 className="caption-head">Foods</h2>
            <ul className="food-list" aria-label="Foods">
              {foods.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => open({ kind: "log", food })}
                    className="food-row"
                  >
                    <span className="food-row-text food-row-led">
                      <span className="food-row-name">{food.name}</span>
                      <Glyph name="food" className="food-row-glyph glyph-16" />{" "}
                      <span className="food-row-meta">
                        {formatPortion(food.portionAmount, food.unit)}
                      </span>
                    </span>{" "}
                    <Kcal kcal={food.kcal} whole />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      {view?.kind === "log" && (
        <PortionSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          food={view.food}
          amount={view.food.portionAmount}
          target={{ kind: "log", foodId: view.food.id, ...place }}
          day={day}
          meal={meal}
          onDone={done}
        />
      )}
      {view?.kind === "entry" && (
        <PortionSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          food={view.entry}
          amount={view.entry.amount}
          target={{ kind: "entry", entryId: view.entry.id }}
          day={day}
          meal={meal}
          onDone={done}
        />
      )}
      {view?.kind === "create" && (
        <FoodSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          target={{ kind: "create", name: view.name, ...place }}
          onDone={done}
        />
      )}
      {view?.kind === "quick" && (
        <FoodSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          target={{ kind: "quick", name: view.name, ...place }}
          onDone={done}
        />
      )}
      {view?.kind === "saved" && (
        <SavedMealSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          saved={view.saved}
          place={place}
          onDone={done}
        />
      )}
      {view?.kind === "star" && (
        <SaveMealSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          place={place}
          foods={entries}
          savedNames={screen.savedMeals.map((saved) => saved.name)}
          onDone={done}
        />
      )}
    </>
  );
}
