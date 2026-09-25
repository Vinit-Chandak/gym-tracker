"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Close, Plus, Star } from "@/components/ui/icons";
import { Field, Input, INPUT_CLASS } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { addUp, NUTRITION_LIMITS, type FoodAmounts, type FoodItem } from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import { formatFoodAmount } from "@/lib/format";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { deleteMealAction, saveMealAction } from "@/server/actions/nutrition";
import type { MealRecord } from "@/server/repositories/nutrition";
import type { FoodDraft } from "@/server/validation/nutrition";

type FoodRow = FoodDraft & { key: number };

const AMOUNTS = [
  { field: "kcal", label: "kcal", max: NUTRITION_LIMITS.itemKcal },
  { field: "carbsG", label: "Carbs g", max: NUTRITION_LIMITS.itemGrams },
  { field: "fatG", label: "Fat g", max: NUTRITION_LIMITS.itemGrams },
  { field: "proteinG", label: "Protein g", max: NUTRITION_LIMITS.itemGrams },
] as const;

const typed = (value: number | null): string => (value === null ? "" : String(value));

/** A typed amount for the running total: blank, or not yet a number, adds nothing. */
function amount(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
}

function toAmounts(row: FoodDraft): FoodAmounts {
  return {
    kcal: amount(row.kcal) ?? 0,
    carbsG: amount(row.carbsG),
    fatG: amount(row.fatG),
    proteinG: amount(row.proteinG),
  };
}

function toRow(key: number, item?: FoodItem): FoodRow {
  return {
    key,
    name: item?.name ?? "",
    kcal: item ? typed(item.kcal) : "",
    carbsG: typed(item?.carbsG ?? null),
    fatG: typed(item?.fatG ?? null),
    proteinG: typed(item?.proteinG ?? null),
  };
}

/**
 * Adds a meal, or edits one (ADR 0032): a name, then its foods one at a time, each a name and
 * four numbers of which only the energy is needed. What the meal comes to is kept in view
 * under the list with the star and Save, however many foods it grows to.
 *
 * Mounted afresh for every opening, so it always starts from the meal it was opened for.
 */
export function MealSheet({
  open,
  meal,
  suggestedName,
  onClose,
}: {
  open: boolean;
  /** The meal being edited; null for a new one. */
  meal: MealRecord | null;
  /** The name a new meal starts with, so logging one never waits on thinking of one. */
  suggestedName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? suggestedName);
  const [rows, setRows] = useState<FoodRow[]>(() =>
    meal && meal.items.length > 0
      ? meal.items.map((item, index) => toRow(index, item))
      : [toRow(0)],
  );
  // Keys for rows added later carry on from the ones the sheet opened with.
  const nextKey = useRef(Math.max(meal?.items.length ?? 0, 1));
  const [starred, setStarred] = useState(meal?.savedMealId != null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // A row added by "Add food" takes the focus; the rows the sheet opens with do not, so opening
  // it never throws a keyboard over the sheet before anything was asked for.
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const content = useRef<HTMLDivElement>(null);
  const busy = saving || deleting;

  // After a refused save, the first field the server named is where the eye and the caret go.
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    const invalid = content.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    invalid?.focus();
    invalid?.scrollIntoView?.({ block: "center" });
  }, [errors]);

  const total = addUp(rows.map(toAmounts));

  const update = (key: number, field: keyof FoodDraft, value: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );

  const addFood = () => {
    const key = nextKey.current++;
    setRows((current) => [...current, toRow(key)]);
    setFocusKey(key);
  };

  // Errors are keyed by a row's place in what was sent, so they are dropped rather than left on
  // whichever row slides into a removed one's place.
  const removeFood = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
    setErrors({});
  };

  const save = () =>
    startSaving(async () => {
      setFormError(null);
      const outcome = await attempted(
        () =>
          saveMealAction({
            mealId: meal?.id,
            name,
            items: rows.map(({ key: _key, ...food }) => food),
            starred,
          }),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) {
        setFormError(outcome.message);
        return;
      }
      if (outcome.value.ok) {
        onClose();
        return;
      }
      setErrors(outcome.value.fieldErrors ?? {});
      setFormError(outcome.value.error ?? null);
    });

  const remove = () =>
    startDeleting(async () => {
      if (!meal) return;
      setFormError(null);
      const outcome = await attempted(() => deleteMealAction(meal.id), OFFLINE_SUBMIT_MESSAGE);
      if (!outcome.ok) setFormError(outcome.message);
      else if (!outcome.value.ok) setFormError(outcome.value.error ?? null);
      else onClose();
    });

  const macros = [
    ["Carbs", total.carbsG],
    ["Fat", total.fatG],
    ["Protein", total.proteinG],
  ] as const;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meal ? "Edit meal" : "Add meal"}
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-medium tabular-nums">
                {formatFoodAmount(total.kcal)}
                <span className="text-sm font-normal text-ink-muted"> kcal</span>
              </p>
              <p className="text-xs text-ink-muted tabular-nums">
                {macros
                  .map(([label, grams]) => `${label} ${formatFoodAmount(grams)} g`)
                  .join(" · ")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={starred}
              disabled={busy}
              onClick={() => setStarred((current) => !current)}
              className="shrink-0 aria-pressed:border-accent aria-pressed:bg-accent-soft"
            >
              <Star className={starred ? "text-accent" : "text-ink-subtle"} aria-hidden />
              Star
            </Button>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <Button size="lg" className="w-full" disabled={busy} onClick={save}>
            {saving ? "Saving…" : "Save meal"}
          </Button>
        </div>
      }
    >
      <div ref={content} className="space-y-4 pb-1">
        <Field label="Meal" error={errors.name}>
          <Input
            value={name}
            maxLength={NUTRITION_LIMITS.name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <ol className="space-y-4">
          {rows.map((row, index) => {
            const number = index + 1;
            const rowErrors = [
              errors[`items.${index}.name`],
              ...AMOUNTS.map(({ field }) => errors[`items.${index}.${field}`]),
            ].filter(Boolean);
            const errorId = `food-${row.key}-error`;
            return (
              <li key={row.key} className="space-y-2 border-t border-line pt-3">
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <Input
                    value={row.name}
                    maxLength={NUTRITION_LIMITS.name}
                    autoComplete="off"
                    autoFocus={row.key === focusKey}
                    placeholder={`Food ${number}, e.g. Oats 60 g`}
                    aria-label={`Food ${number} name`}
                    aria-invalid={errors[`items.${index}.name`] ? true : undefined}
                    aria-describedby={rowErrors.length > 0 ? errorId : undefined}
                    onChange={(event) => update(row.key, "name", event.target.value)}
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove food ${number}`}
                      disabled={busy}
                      onClick={() => removeFood(row.key)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted active:bg-surface-raised disabled:opacity-45"
                    >
                      <Close aria-hidden />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
                  {AMOUNTS.map(({ field, label, max }) => {
                    const error = errors[`items.${index}.${field}`];
                    return (
                      <label key={field} className="min-w-0 space-y-1">
                        <span className="block truncate text-xs text-ink-subtle">
                          {label}
                          {field === "kcal" && <span aria-hidden> *</span>}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={row[field]}
                          aria-label={`Food ${number} ${label}`}
                          aria-required={field === "kcal" ? true : undefined}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) =>
                            update(
                              row.key,
                              field,
                              sanitizeNumberEntry(event.target.value, "decimal", max),
                            )
                          }
                          className={cn(
                            INPUT_CLASS,
                            "px-1 text-center tabular-nums",
                            error && "border-danger",
                          )}
                        />
                      </label>
                    );
                  })}
                </div>
                {rowErrors.length > 0 && (
                  <p id={errorId} role="alert" className="text-sm text-danger">
                    {rowErrors[0]}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <Button
          variant="secondary"
          className="w-full"
          disabled={busy || rows.length >= NUTRITION_LIMITS.itemsPerMeal}
          onClick={addFood}
        >
          <Plus aria-hidden />
          Add food
        </Button>

        {meal && (
          <Button variant="danger" className="w-full" disabled={busy} onClick={remove}>
            {deleting ? "Deleting…" : "Delete meal"}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
