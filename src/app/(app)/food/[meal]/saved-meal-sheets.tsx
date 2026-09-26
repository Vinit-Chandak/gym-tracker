"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { addUp, eaten, NUTRITION_LIMITS, type LoggedFood, type Meal } from "@/domain/nutrition";
import { formatKcal, formatPortion } from "@/lib/format";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import {
  deleteSavedMealAction,
  logSavedMealAction,
  saveMealAction,
} from "@/server/actions/nutrition";
import type { SavedMealRecord } from "@/server/repositories/nutrition";

import { Preview } from "@/components/food/amount-field";

type Place = { eatenOn: string; meal: Meal; mealLabel: string };

/** "3 foods · 520 kcal": what a list of foods holds, in one line. */
function contents(foods: readonly LoggedFood[]): string {
  const total = addUp(foods.map(eaten));
  return `${foods.length} ${foods.length === 1 ? "food" : "foods"} · ${formatKcal(total.kcal)} kcal`;
}

/**
 * Starring a meal (ADR 0033): it is kept, foods and amounts as they stand, under a name. A name a
 * saved meal already has is that meal saved again, which is how a usual breakfast is brought up to
 * date; the field says so before Save does it.
 */
export function SaveMealSheet({
  open,
  onClose,
  place,
  foods,
  savedNames,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  place: Place;
  /** What the meal holds now, which is what is saved. */
  foods: readonly LoggedFood[];
  /** The saved meals' names, to say when one is about to be replaced. */
  savedNames: readonly string[];
  onDone: (said: string, added: boolean) => void;
}) {
  const formId = useId();
  const [name, setName] = useState("");
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const replaces = savedNames.find(
    (saved) => name.trim() !== "" && saved.trim().toLowerCase() === name.trim().toLowerCase(),
  );

  const save = () =>
    startSaving(async () => {
      setFormError(null);
      const outcome = await attempted(
        () => saveMealAction({ submissionKey, eatenOn: place.eatenOn, meal: place.meal, name }),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) setFormError(outcome.message);
      else if (outcome.value.ok) {
        onDone(`${place.mealLabel} saved as ${name.trim()}.`, false);
        onClose();
      } else {
        setError(outcome.value.fieldErrors?.name);
        setFormError(outcome.value.error ?? null);
      }
    });

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      dismissible={!saving}
      title="Star meal"
      footer={
        <div className="space-y-3">
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <Button type="submit" form={formId} size="lg" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save meal"}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving) save();
        }}
      >
        <p className="text-sm text-ink-muted tabular-nums">
          {place.mealLabel}: {contents(foods)}
        </p>
        <Field
          label="Name"
          error={error}
          hint={replaces ? `Replaces your saved meal ${replaces}.` : undefined}
        >
          <Input
            value={name}
            maxLength={NUTRITION_LIMITS.name}
            autoComplete="off"
            placeholder="e.g. Usual breakfast"
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </form>
    </Sheet>
  );
}

/**
 * A saved meal: what it holds, added to this meal in one go, or deleted. Its foods are added as
 * they were saved, so a food corrected since is added as it was.
 */
export function SavedMealSheet({
  open,
  onClose,
  saved,
  place,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  saved: SavedMealRecord;
  place: Place;
  /** Said once the change is made; `added` when its foods went into the meal. */
  onDone: (said: string, added: boolean) => void;
}) {
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const busy = adding || deleting;

  const add = () =>
    startAdding(async () => {
      setFormError(null);
      const outcome = await attempted(
        () =>
          logSavedMealAction({
            submissionKey,
            eatenOn: place.eatenOn,
            meal: place.meal,
            savedMealId: saved.id,
          }),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) setFormError(outcome.message);
      else if (!outcome.value.ok) setFormError(outcome.value.error ?? null);
      else {
        onDone(`${saved.name} added to ${place.mealLabel}.`, true);
        onClose();
      }
    });

  const remove = () =>
    startDeleting(async () => {
      setFormError(null);
      const outcome = await attempted(
        () => deleteSavedMealAction(saved.id),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) setFormError(outcome.message);
      else if (!outcome.value.ok) setFormError(outcome.value.error ?? null);
      else {
        onDone(`${saved.name} deleted.`, false);
        onClose();
      }
    });

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      title={saved.name}
      footer={
        <div className="space-y-3">
          <Preview amounts={addUp(saved.items.map(eaten))} />
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <Button size="lg" className="w-full" disabled={busy} onClick={add}>
            {adding ? "Adding…" : `Add to ${place.mealLabel}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-1">
        <ul className="ruled-list">
          {saved.items.map((item, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {item.name}{" "}
                <span className="text-sm text-ink-muted">
                  {formatPortion(item.amount, item.unit)}
                </span>
              </span>{" "}
              <span className="shrink-0 text-sm tabular-nums">
                {formatKcal(eaten(item).kcal)} kcal
              </span>
            </li>
          ))}
        </ul>
        <Button variant="danger" className="w-full" disabled={busy} onClick={remove}>
          {deleting ? "Deleting…" : "Delete saved meal"}
        </Button>
      </div>
    </Sheet>
  );
}
