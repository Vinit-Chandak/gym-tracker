"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, INPUT_CLASS } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { FOOD_UNITS, NUTRITION_LIMITS, scaleFood, type Food, type Meal } from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import { FOOD_UNIT_LABELS } from "@/lib/labels";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import {
  createFoodAction,
  createLibraryFoodAction,
  deleteFoodAction,
  updateFoodAction,
} from "@/server/actions/nutrition";
import type { FoodRecord } from "@/server/repositories/nutrition";
import type { FoodDraft } from "@/server/validation/nutrition";

import { AmountField, Preview, typedAmount } from "./amount-field";

/**
 * A new food, logged in a meal as it is made; a new food kept in My foods without being logged
 * (ADR 0035); or one in My foods, to correct or delete.
 */
export type FoodSheetTarget =
  | { kind: "create"; name: string; eatenOn: string; meal: Meal; mealLabel: string }
  | { kind: "library"; name: string }
  | { kind: "edit"; food: FoodRecord };

const FIGURES = [
  { field: "kcal", label: "kcal", max: NUTRITION_LIMITS.itemKcal },
  { field: "carbsG", label: "Carbs g", max: NUTRITION_LIMITS.itemGrams },
  { field: "fatG", label: "Fat g", max: NUTRITION_LIMITS.itemGrams },
  { field: "proteinG", label: "Protein g", max: NUTRITION_LIMITS.itemGrams },
] as const;

const typed = (value: number | null): string => (value === null ? "" : String(value));

/** A typed figure for the preview: blank, or not yet a number, is unknown. */
function figure(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
}

function draftOf(target: FoodSheetTarget): FoodDraft {
  if (target.kind !== "edit") {
    // Labels give their figures per 100 g, so that is where a new food starts.
    return {
      name: target.name,
      portionAmount: "100",
      unit: "g",
      kcal: "",
      carbsG: "",
      fatG: "",
      proteinG: "",
    };
  }
  const { food } = target;
  return {
    name: food.name,
    portionAmount: String(food.portionAmount),
    unit: food.unit,
    kcal: String(food.kcal),
    carbsG: typed(food.carbsG),
    fatG: typed(food.fatG),
    proteinG: typed(food.proteinG),
  };
}

/**
 * A food's five numbers (ADR 0033): its name, a portion in a unit, and the energy and the three
 * macronutrients that portion holds, of which only the energy is needed. A new food made in a
 * meal is logged as it is made, so the amount eaten is asked here too: it follows the portion
 * until it is changed, so a food entered as eaten needs no second number. One made in My foods
 * is only kept (ADR 0035), so nothing about eating it is asked.
 */
export function FoodSheet({
  open,
  onClose,
  target,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  target: FoodSheetTarget;
  /** Said once the change is made; `added` when a food went into the meal. */
  onDone: (said: string, added: boolean) => void;
}) {
  const formId = useId();
  const [fields, setFields] = useState<FoodDraft>(() => draftOf(target));
  // Null while it follows the portion.
  const [eaten, setEaten] = useState<string | null>(null);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const content = useRef<HTMLFormElement>(null);
  const busy = saving || deleting;
  const creating = target.kind === "create";
  const amount = eaten ?? fields.portionAmount;
  const unit = fields.unit as Food["unit"];

  // After a refused save, the first field the server named is where the eye and the caret go.
  useEffect(() => {
    if (busy || Object.keys(errors).length === 0) return;
    const invalid = content.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    invalid?.focus();
    invalid?.scrollIntoView?.({ block: "center" });
  }, [errors, busy]);

  const set = (field: keyof FoodDraft, value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  const save = () =>
    startSaving(async () => {
      setFormError(null);
      const outcome = await attempted(
        () =>
          target.kind === "create"
            ? createFoodAction({
                submissionKey,
                eatenOn: target.eatenOn,
                meal: target.meal,
                ...fields,
                amount,
              })
            : target.kind === "library"
              ? createLibraryFoodAction({ submissionKey, ...fields })
              : updateFoodAction({ foodId: target.food.id, ...fields }),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) {
        setFormError(outcome.message);
        return;
      }
      if (outcome.value.ok) {
        const name = fields.name.trim();
        onDone(
          target.kind === "create"
            ? `${name} added to ${target.mealLabel}.`
            : target.kind === "library"
              ? `${name} saved to My foods.`
              : `${name} saved.`,
          target.kind === "create",
        );
        onClose();
        return;
      }
      setErrors(outcome.value.fieldErrors ?? {});
      setFormError(outcome.value.error ?? null);
    });

  const remove = () =>
    startDeleting(async () => {
      if (target.kind !== "edit") return;
      setFormError(null);
      const outcome = await attempted(
        () => deleteFoodAction(target.food.id),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) setFormError(outcome.message);
      else if (!outcome.value.ok) setFormError(outcome.value.error ?? null);
      else {
        onDone(`${target.food.name} removed from My foods.`, false);
        onClose();
      }
    });

  // What the amount eaten comes to, once there is a portion to scale from and an amount.
  const portion = typedAmount(fields.portionAmount);
  const eatenAmount = typedAmount(amount);
  const preview =
    portion && eatenAmount
      ? scaleFood(
          {
            portionAmount: portion,
            kcal: figure(fields.kcal) ?? 0,
            carbsG: figure(fields.carbsG),
            fatG: figure(fields.fatG),
            proteinG: figure(fields.proteinG),
          },
          eatenAmount,
        )
      : { kcal: 0, carbsG: null, fatG: null, proteinG: null };

  const figureErrors = FIGURES.map(({ field }) => errors[field]).filter(Boolean);
  const figuresErrorId = `${formId}-figures-error`;
  const portionErrorId = `${formId}-portion-error`;
  const portionError = errors.portionAmount ?? errors.unit;

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      title={target.kind === "edit" ? "Edit food" : "New food"}
      footer={
        <div className="space-y-3">
          {creating && <Preview amounts={preview} />}
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <Button type="submit" form={formId} size="lg" className="w-full" disabled={busy}>
            {target.kind === "create"
              ? saving
                ? "Adding…"
                : `Add to ${target.mealLabel}`
              : saving
                ? "Saving…"
                : "Save food"}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        ref={content}
        className="space-y-4 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) save();
        }}
      >
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <Field label="Name" error={errors.name}>
            <Input
              value={fields.name}
              maxLength={NUTRITION_LIMITS.name}
              autoComplete="off"
              placeholder="e.g. Oats"
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>

          <div className="min-w-0 space-y-1.5">
            <p id={`${formId}-portion`} className="text-sm font-medium text-ink-muted">
              Nutrition per
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={fields.portionAmount}
                aria-labelledby={`${formId}-portion`}
                aria-invalid={errors.portionAmount ? true : undefined}
                aria-describedby={portionError ? portionErrorId : undefined}
                onChange={(event) =>
                  set(
                    "portionAmount",
                    sanitizeNumberEntry(event.target.value, "decimal", NUTRITION_LIMITS.amount),
                  )
                }
                className={cn(INPUT_CLASS, "tabular-nums", errors.portionAmount && "border-danger")}
              />
              <Select
                value={fields.unit}
                aria-label="Unit"
                aria-invalid={errors.unit ? true : undefined}
                onChange={(event) => set("unit", event.target.value)}
              >
                {FOOD_UNITS.map((option) => (
                  <option key={option} value={option}>
                    {FOOD_UNIT_LABELS[option]}
                  </option>
                ))}
              </Select>
            </div>
            {portionError && (
              <p id={portionErrorId} role="alert" className="text-sm text-danger">
                {portionError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            {/* Four across on a phone at normal text; fewer, never clipped, as text grows. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,4rem),1fr))] gap-2">
              {FIGURES.map(({ field, label, max }) => {
                const error = errors[field];
                return (
                  <label key={field} className="min-w-0 space-y-1">
                    <span className="block text-xs text-ink-subtle">
                      {label}
                      {field === "kcal" && <span aria-hidden> *</span>}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={fields[field]}
                      aria-label={label}
                      aria-required={field === "kcal" ? true : undefined}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? figuresErrorId : undefined}
                      onChange={(event) =>
                        set(field, sanitizeNumberEntry(event.target.value, "decimal", max))
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
            {figureErrors.length > 0 && (
              <p id={figuresErrorId} role="alert" className="text-sm text-danger">
                {figureErrors[0]}
              </p>
            )}
          </div>

          {creating && (
            <AmountField
              label="Amount eaten"
              value={amount}
              onChange={setEaten}
              unit={unit}
              portionAmount={portion ?? 1}
              error={errors.amount}
              disabled={busy}
            />
          )}

          {target.kind === "edit" && (
            <Button variant="danger" className="w-full" disabled={busy} onClick={remove}>
              {deleting ? "Removing…" : "Remove from My foods"}
            </Button>
          )}
        </fieldset>
      </form>
    </Sheet>
  );
}
