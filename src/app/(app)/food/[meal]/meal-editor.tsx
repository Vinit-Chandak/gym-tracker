"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Plus, Search, Star } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, eaten, sameFoods, type Meal } from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import { attempted } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { deleteEntryAction, deleteSavedMealAction } from "@/server/actions/nutrition";
import type {
  EntryRecord,
  FoodRecord,
  MealScreen,
  SavedMealRecord,
} from "@/server/repositories/nutrition";

import { FoodSheet } from "./food-sheet";
import { PortionSheet } from "./portion-sheet";
import { SavedMealSheet, SaveMealSheet } from "./saved-meal-sheets";

/** The sheet that is open, and what it was opened for. */
type SheetView =
  | { kind: "log"; food: FoodRecord }
  | { kind: "entry"; entry: EntryRecord }
  | { kind: "create"; name: string }
  | { kind: "edit"; food: FoodRecord }
  | { kind: "saved"; saved: SavedMealRecord }
  | { kind: "star" };

function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * One meal of the day (ADR 0033): what is in it and what that comes to, the star that saves it,
 * and everything that can go into it, searched as it is typed. A food opens a sheet for how much
 * of it; a saved meal, for adding all of it. Tapping a food already in the meal changes its
 * amount, and swiping it aside takes it out, which its sheet can do too.
 */
export function MealEditor({
  today,
  meal,
  screen,
}: {
  /** The day the page is showing, which a sheet opened on it logs to. */
  today: string;
  meal: Meal;
  screen: MealScreen;
}) {
  const label = MEAL_LABELS[meal];
  const place = { eatenOn: today, meal, mealLabel: label };
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
  // A search for a food that exists is not a name for a new one.
  const newName = screen.foods.some((food) => food.name.toLowerCase() === search)
    ? ""
    : query.trim();
  const view = sheet.view;

  return (
    <>
      {entries.length > 0 && (
        <div ref={top} className="scroll-mt-20 space-y-3">
          <section aria-label={`${label} total`} className="box panel-padding">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-2xl font-medium tabular-nums">
                  {formatKcal(total.kcal)}
                  <span className="text-sm font-normal text-ink-muted"> kcal</span>
                </p>
                <p className="text-sm text-ink-muted tabular-nums">{formatMacros(total)}</p>
                {starred && (
                  <p className="mt-1 text-xs [overflow-wrap:anywhere] text-ink-muted">
                    Saved as {starred.name}
                  </p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={starred !== null}
                disabled={pending}
                onClick={() => (starred ? unstar(starred) : open({ kind: "star" }))}
                className="shrink-0 aria-pressed:border-accent aria-pressed:bg-accent-soft"
              >
                <Star className={starred ? "text-accent" : "text-ink-subtle"} aria-hidden />
                Star
              </Button>
            </div>
          </section>
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
                    {/* The spaces are for the button's name, which a screen reader reads as one
                        string; beside flex items they take no room on the screen. */}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {entry.name}
                      </span>{" "}
                      <span className="block text-sm text-ink-muted tabular-nums">
                        {formatPortion(entry.amount, entry.unit)}
                      </span>
                    </span>{" "}
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

      <div className="space-y-5">
        {(screen.foods.length > 0 || screen.savedMeals.length > 0) && (
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
              aria-label="Search your foods and saved meals"
              className="pl-9"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
            />
          </div>
        )}

        {savedMeals.length > 0 && (
          <Section title="Saved meals">
            <ul className="box-rows" aria-label="Saved meals">
              {savedMeals.map((saved) => (
                <li key={saved.id}>
                  <button
                    type="button"
                    onClick={() => open({ kind: "saved", saved })}
                    className={PRESSABLE_ROW_CLASS}
                  >
                    <Star className="shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {saved.name}
                      </span>{" "}
                      <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
                        {saved.items.map((item) => item.name).join(", ")}
                      </span>
                    </span>{" "}
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatKcal(addUp(saved.items.map(eaten)).kcal)} kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="My foods"
          info="Every food you log is kept here, the most recently eaten first. Tap one to say how much you had."
        >
          <ul className="box-rows" aria-label="My foods">
            <li>
              <button
                type="button"
                onClick={() => open({ kind: "create", name: newName })}
                className={cn(PRESSABLE_ROW_CLASS, "font-medium text-accent")}
              >
                <Plus className="shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {newName ? `New food “${newName}”` : "New food"}
                </span>
              </button>
            </li>
            {foods.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => open({ kind: "log", food })}
                  className={PRESSABLE_ROW_CLASS}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium [overflow-wrap:anywhere]">{food.name}</span>{" "}
                    <span className="block text-sm text-ink-muted tabular-nums">
                      {formatPortion(food.portionAmount, food.unit)} · {formatKcal(food.kcal)} kcal
                    </span>
                  </span>
                  <Plus className="shrink-0 text-accent" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {screen.foods.length === 0 && (
            <p className="px-1 text-sm text-ink-muted">
              Each food you log is kept here, to log again at any amount.
            </p>
          )}
        </Section>
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
          target={{
            kind: "log",
            foodId: view.food.id,
            ...place,
            onEditFood: () => open({ kind: "edit", food: view.food }),
          }}
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
      {view?.kind === "edit" && (
        <FoodSheet
          key={sheet.key}
          open={sheet.open}
          onClose={close}
          target={{ kind: "edit", food: view.food }}
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
