"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { AmountSheet } from "@/components/food/amount-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Food, Plus, Search } from "@/components/ui/icons";
import { Field, Input } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, NUTRITION_LIMITS, scaleFood, type Food as FoodFigures } from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";
import { previousAppPage } from "@/lib/navigation-history";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { deleteSavedMealAction, saveLibraryMealAction } from "@/server/actions/nutrition";
import type { FoodRecord, SavedMealRecord } from "@/server/repositories/nutrition";

/**
 * One food of the meal on the page: a food from My foods, or one the saved meal already holds,
 * by its place in it, which the server keeps as it was saved. The key only tells rows apart.
 */
type Item = {
  key: string;
  source: { foodId: string } | { keep: number };
  food: FoodFigures;
  amount: number;
};

type SheetView = { kind: "add"; food: FoodRecord } | { kind: "item"; item: Item };

/**
 * A meal in My foods (ADR 0035): a name and a set of the account's foods, each at an amount.
 * New meal opens it empty; a saved meal opens it holding its foods as they were saved. Nothing is
 * saved until Save meal, the one highlighted action, which stays within the thumb's reach at the
 * end of the meal while a long one scrolls under it. A food is added from the list below at the
 * amount its sheet is given, changed by tapping it, and taken out by swiping it aside or from
 * its sheet.
 */
export function MealBuilder({
  saved,
  foods,
  leaveTo = "/food/my-foods",
}: {
  /** The meal being changed, or null for a new one. */
  saved: SavedMealRecord | null;
  /** My foods, the most lately eaten first, to add from. */
  foods: readonly FoodRecord[];
  /** Where saving or deleting returns to when there is no page to go back to. */
  leaveTo?: Route;
}) {
  const router = useRouter();
  const [name, setName] = useState(saved?.name ?? "");
  const [items, setItems] = useState<Item[]>(() =>
    (saved?.items ?? []).map((item, index) => ({
      key: `kept-${index}`,
      source: { keep: index },
      food: item,
      amount: item.amount,
    })),
  );
  // Item indexes and the version belong to the snapshot opened by this editor.
  const [expectedUpdatedAt] = useState(saved?.updatedAt);
  // Stable across retries, including an edit that removed or reordered retained foods.
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [sheet, setSheet] = useState<{ key: number; open: boolean; view: SheetView | null }>({
    key: 0,
    open: false,
    view: null,
  });
  const added = useRef(0);
  const nameField = useRef<HTMLInputElement>(null);
  const busy = saving || deleting;
  const total = addUp(items.map((item) => scaleFood(item.food, item.amount)));
  const macros = formatMacros(total);

  // After a refused save, a refused name is where the caret goes, once the field is enabled again.
  useEffect(() => {
    if (!busy && errors.name) nameField.current?.focus();
  }, [errors, busy]);

  const open = (view: SheetView) =>
    setSheet((current) => ({ key: current.key + 1, open: true, view }));
  const leave = () => {
    if (previousAppPage()) router.back();
    else router.replace(leaveTo);
  };

  const save = () =>
    startSaving(async () => {
      setFormError(null);
      const outcome = await attempted(
        () =>
          saveLibraryMealAction({
            submissionKey,
            savedMealId: saved?.id,
            expectedUpdatedAt,
            name,
            items: items.map((item) => ({ ...item.source, amount: String(item.amount) })),
          }),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) {
        setFormError(outcome.message);
        return;
      }
      if (outcome.value.ok) {
        leave();
        return;
      }
      const fieldErrors = outcome.value.fieldErrors ?? {};
      setErrors(fieldErrors);
      // An amount the sheet let through but the server did not is said once, above Save.
      const itemError = Object.entries(fieldErrors).find(([path]) => path.startsWith("items."));
      setFormError(outcome.value.error ?? itemError?.[1] ?? null);
    });

  const remove = () =>
    startDeleting(async () => {
      if (!saved) return;
      setFormError(null);
      const outcome = await attempted(
        () => deleteSavedMealAction(saved.id),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) setFormError(outcome.message);
      else if (!outcome.value.ok) setFormError(outcome.value.error ?? null);
      else leave();
    });

  const search = query.trim().toLowerCase();
  const choices = search ? foods.filter((food) => food.name.toLowerCase().includes(search)) : foods;
  const full = items.length >= NUTRITION_LIMITS.itemsPerMeal;
  const view = sheet.view;

  return (
    <>
      <Field label="Name" error={errors.name}>
        <Input
          ref={nameField}
          value={name}
          maxLength={NUTRITION_LIMITS.name}
          autoComplete="off"
          placeholder="e.g. Usual breakfast"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      {/* The meal: what it comes to at the head of the block, what is in it, and Save. */}
      <div className="box py-4">
        <section aria-label="What this meal holds" className="min-w-0">
          {/* The space is for a screen reader, which reads the line as one string; beside flex
              items it takes no room on the screen. */}
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="measure text-2xl">{formatKcal(total.kcal)}</span>{" "}
            <span className="font-data text-sm text-ink-muted">kcal</span>
          </p>
          {macros && <p className="mt-1 font-data text-sm text-ink-muted tabular-nums">{macros}</p>}
        </section>

        {items.length > 0 && (
          <ul className="mt-3 border-t border-line ruled-list" aria-label="In this meal">
            {items.map((item) => (
              <li key={item.key}>
                <SwipeRow
                  action="Remove"
                  actionLabel={`Remove ${item.food.name}`}
                  onAction={() => setItems((current) => current.filter((row) => row !== item))}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => open({ kind: "item", item })}
                    className={cn(PRESSABLE_ROW_CLASS, "flex-wrap")}
                  >
                    {/* The spaces are for the button's name, which a screen reader reads as one
                        string; beside flex items they take no room on the screen. */}
                    <span className="min-w-0 flex-[1_1_10rem]">
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {item.food.name}
                      </span>{" "}
                      <span className="block font-data text-sm text-ink-muted tabular-nums">
                        {formatPortion(item.amount, item.food.unit)}
                      </span>
                    </span>{" "}
                    <span className="ml-auto max-w-full font-data font-semibold tabular-nums">
                      {formatKcal(scaleFood(item.food, item.amount).kcal)} kcal
                    </span>
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        )}
        {errors.items && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {errors.items}
          </p>
        )}

        {/* Kept on screen while a long meal scrolls under it, on a strip of canvas so the rows
            never show through. */}
        <div className="sticky bottom-[var(--actions-inset)] z-[1] -mx-1 mt-3 bg-canvas px-1 py-2">
          <Button size="lg" className="w-full" disabled={busy} onClick={save}>
            {saving ? "Saving…" : "Save meal"}
          </Button>
        </div>
      </div>

      {foods.length > 0 ? (
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
              placeholder="Add a food"
              aria-label="Search your foods to add"
              className="pl-10"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
            />
          </div>
          {choices.length > 0 && (
            <ul className="box-rows" aria-label="Your foods">
              {choices.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    disabled={busy || full}
                    onClick={() => open({ kind: "add", food })}
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
                    <Plus className="shrink-0 text-pen" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <section className="box">
          <EmptyState icon={Food} title="No foods yet" description="Make one in My foods first." />
        </section>
      )}

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      {saved && (
        <Button variant="danger" className="w-full" disabled={busy} onClick={remove}>
          {deleting ? "Deleting…" : "Delete meal"}
        </Button>
      )}

      {view?.kind === "add" && (
        <AmountSheet
          key={sheet.key}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          food={view.food}
          amount={view.food.portionAmount}
          submitLabel="Add to meal"
          onSubmit={(amount) => {
            setItems((current) => [
              ...current,
              {
                key: `added-${++added.current}`,
                source: { foodId: view.food.id },
                food: view.food,
                amount,
              },
            ]);
            setErrors(({ items: _items, ...rest }) => rest);
            setQuery("");
          }}
        />
      )}
      {view?.kind === "item" && (
        <AmountSheet
          key={sheet.key}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          food={view.item.food}
          amount={view.item.amount}
          submitLabel="Save"
          onSubmit={(amount) =>
            setItems((current) =>
              current.map((row) => (row === view.item ? { ...row, amount } : row)),
            )
          }
          onRemove={() => setItems((current) => current.filter((row) => row !== view.item))}
        />
      )}
    </>
  );
}
