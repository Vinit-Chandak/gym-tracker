"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { AmountSheet } from "@/components/food/amount-sheet";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/ui/swipe-row";
import { addUp, NUTRITION_LIMITS, scaleFood, type Food } from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";
import { previousAppPage } from "@/lib/navigation-history";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { deleteSavedMealAction, saveLibraryMealAction } from "@/server/actions/nutrition";
import type { FoodRecord, SavedMealRecord } from "@/server/repositories/nutrition";

/**
 * One food of the meal on the page: a food from My foods, or one the saved meal already holds,
 * by its place in it, which the server keeps as it was saved. The key only tells rows apart.
 */
type Item = {
  key: string;
  source: { foodId: string } | { keep: number };
  food: Food;
  amount: number;
};

type SheetView = { kind: "add"; food: FoodRecord } | { kind: "item"; item: Item };

/**
 * A meal in My foods (ADR 0035): a name and a set of the account's foods, each at an amount.
 * New meal opens it empty; a saved meal opens it holding its foods as they were saved. Nothing is
 * saved until Save meal: a food is added from the list below at the amount its sheet is given,
 * changed by tapping it, and taken out by swiping it aside or from its sheet.
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

      {/* What the meal comes to, and Save beside it, as a meal of the day shows it. */}
      <section aria-label="What this meal holds">
        <div className="meal-total">
          <div className="min-w-0">
            <p className="whitespace-nowrap">
              <span className="type-figure-l">{formatKcal(total.kcal)}</span>{" "}
              <span className="food-preview-unit">kcal</span>
            </p>
            {macros && <p className="type-meta-small text-ink-2 tabular-nums">{macros}</p>}
          </div>
          <Button size="sm" disabled={busy} onClick={save} className="shrink-0">
            {saving ? "Saving…" : "Save meal"}
          </Button>
        </div>
        {items.length > 0 && (
          <ul className="meal-entries" aria-label="In this meal">
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
                    className="food-row"
                  >
                    <span className="food-row-text">
                      <span className="food-row-name">{item.food.name}</span>{" "}
                      <span className="food-row-meta">
                        {formatPortion(item.amount, item.food.unit)}
                      </span>
                    </span>{" "}
                    <span className="food-row-kcal">
                      <span className="type-figure">
                        {formatKcal(scaleFood(item.food, item.amount).kcal)}
                      </span>{" "}
                      <span className="food-row-unit">kcal</span>
                    </span>
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        )}
        {errors.items && (
          <p role="alert" className="mt-2 type-meta-small font-semibold">
            {errors.items}
          </p>
        )}
      </section>

      {foods.length > 0 ? (
        <div>
          <div className="food-search">
            <Glyph name="search" className="glyph-20" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Add a food"
              aria-label="Search your foods to add"
              className="food-search-input"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
            />
          </div>
          {choices.length > 0 && (
            <ul className="food-list mt-1.5" aria-label="Your foods">
              {choices.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    disabled={busy || full}
                    onClick={() => open({ kind: "add", food })}
                    className="food-row"
                  >
                    <span className="food-row-text">
                      <span className="food-row-name">{food.name}</span>{" "}
                      <span className="food-row-meta">
                        {formatPortion(food.portionAmount, food.unit)} · {formatKcal(food.kcal)}{" "}
                        kcal
                      </span>
                    </span>
                    <span aria-hidden className="meal-add">
                      <Glyph name="plus" className="glyph-18" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="type-meta-small text-ink-2">No foods yet. Make one in My foods first.</p>
      )}

      {formError && (
        <p role="alert" className="type-meta-small font-semibold">
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
