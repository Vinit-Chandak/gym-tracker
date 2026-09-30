"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";

import { AddMark, RowText } from "@/components/food/food-row";
import { FoodSheet } from "@/components/food/food-sheet";
import { macroLine, portionLine } from "@/components/food/food-text";
import { Button } from "@/components/ui/button";
import { HeroCard } from "@/components/ui/hero-card";
import { Plus, QuickAdd, Search, Star } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, eaten, sameFoods, type Meal } from "@/domain/nutrition";
import { formatKcal, formatPortion } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import { attempted } from "@/lib/offline-submit";
import { deleteEntryAction, deleteSavedMealAction } from "@/server/actions/nutrition";
import type {
  EntryRecord,
  FoodRecord,
  MealScreen,
  SavedMealRecord,
} from "@/server/repositories/nutrition";

import { PortionSheet } from "./portion-sheet";
import { SavedMealSheet, SaveMealSheet } from "./saved-meal-sheets";

/** A row's leading chip for what is not a food of My foods: Quick add, a saved meal, New food. */
const FOOD_CHIP = "bg-food-soft text-food-ink";

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
 * One meal of the day (ADRs 0033, 0035): what it comes to, as a sunflower card with the star that
 * saves it, then what is in it, then everything in My foods that can go into it, searched as it is
 * typed. A food opens a sheet for how much of it; a saved meal, for adding all of it. Tapping a
 * food already in the meal changes its amount, and swiping it aside takes it out, which its sheet
 * can do too. A meal with nothing in it opens straight on adding.
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
}: {
  /** The day the page is showing, today or one before it, which a sheet opened on it logs to. */
  date: string;
  meal: Meal;
  screen: MealScreen;
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

  const macros = macroLine(total);

  return (
    <>
      {entries.length > 0 && (
        <div ref={top} className="scroll-mt-20 space-y-3">
          <HeroCard tone="food" aria-label={`${label} total`} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 pt-1 tabular-nums">
                {/* Whole kcal, as the day's card has it: a tenth is noise in the card's figure. */}
                <span className="font-display text-display-m font-extrabold">
                  {formatKcal(Math.round(total.kcal))}
                </span>{" "}
                <span className="text-headline font-semibold">kcal</span>
              </p>
              {/* Starred, it takes the card's solid pill; unstarred, the card's quiet one. */}
              <Button
                variant={starred ? "primary" : "secondary"}
                size="sm"
                aria-pressed={starred !== null}
                disabled={pending}
                onClick={() => (starred ? unstar(starred) : open({ kind: "star" }))}
                className="shrink-0"
              >
                {/* Starred, the star's own wash is filled in, so it reads as a star that is on. */}
                <Star
                  aria-hidden
                  className={starred ? "[&>path:first-of-type]:opacity-100" : undefined}
                />
                Star
              </Button>
            </div>
            {macros && <p className="text-callout text-ink-muted tabular-nums">{macros}</p>}
            {starred && (
              <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                Saved as {starred.name}
              </p>
            )}
          </HeroCard>
          <ul className="box-rows" aria-label={`In ${label.toLowerCase()}`}>
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
                    className={PRESSABLE_ROW_CLASS}
                  >
                    <RowText title={entry.name} meta={formatPortion(entry.amount, entry.unit)} />{" "}
                    <span className="shrink-0 tabular-nums">
                      {formatKcal(eaten(entry).kcal)} kcal
                    </span>
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="px-1 text-sm text-danger">
          {error}
        </p>
      )}

      <Section title="Add food">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your foods"
            aria-label="Search your foods and saved meals"
            className="pl-10"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
          />
        </div>

        <ul className="box-rows" aria-label="Your foods and meals">
          <li>
            <button
              type="button"
              onClick={() => open({ kind: "quick", name: query.trim() })}
              className={PRESSABLE_ROW_CLASS}
            >
              <RowIcon icon={QuickAdd} className={FOOD_CHIP} />
              <RowText
                title={query.trim() ? `Quick add “${query.trim()}”` : "Quick add"}
                meta="Calories and macros, just this once"
              />
            </button>
          </li>
          {savedMeals.map((saved) => (
            <li key={saved.id}>
              <button
                type="button"
                onClick={() => open({ kind: "saved", saved })}
                className={PRESSABLE_ROW_CLASS}
              >
                <RowIcon icon={Star} className={FOOD_CHIP} />
                <RowText
                  title={saved.name}
                  meta={saved.items.map((item) => item.name).join(", ")}
                />{" "}
                <span className="shrink-0 text-sm tabular-nums">
                  {formatKcal(addUp(saved.items.map(eaten)).kcal)} kcal
                </span>
              </button>
            </li>
          ))}
          {foods.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => open({ kind: "log", food })}
                className={PRESSABLE_ROW_CLASS}
              >
                <RowText title={food.name} meta={portionLine(food)} />
                <AddMark />
              </button>
            </li>
          ))}
          {nothingFound && (
            <li>
              <button
                type="button"
                onClick={() => open({ kind: "create", name: query.trim() })}
                className={PRESSABLE_ROW_CLASS}
              >
                <RowIcon icon={Plus} className={FOOD_CHIP} />
                <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                  {query.trim() ? `New food “${query.trim()}”` : "New food"}
                </span>
              </button>
            </li>
          )}
        </ul>
      </Section>

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
