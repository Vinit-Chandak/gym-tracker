"use client";

import { useState, useTransition } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { Close } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { formatFoodAmount } from "@/lib/format";
import { attempted } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { deleteSavedMealAction, logSavedMealAction } from "@/server/actions/nutrition";

export type StarredMeal = { id: string; name: string; kcal: number };

/**
 * The starred meals, one tap from being today's (ADR 0032). Edit turns every chip into a way to
 * unstar it; meals already logged from a star keep their foods either way.
 */
export function StarredMeals({ meals }: { meals: readonly StarredMeal[] }) {
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Said to a screen reader once a meal is added, since nothing near the chip changes.
  const [said, setSaid] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (meal: StarredMeal, removing: boolean) =>
    startTransition(async () => {
      setBusyId(meal.id);
      setError(null);
      const outcome = await attempted(
        () => (removing ? deleteSavedMealAction(meal.id) : logSavedMealAction(meal.id)),
        `${meal.name} was not ${removing ? "unstarred" : "added"}. Check your connection and try again.`,
      );
      setBusyId(null);
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error ?? null);
      else setSaid(removing ? `${meal.name} unstarred.` : `${meal.name} added to today.`);
    });

  return (
    <Section
      title="Starred"
      info="Tap a starred meal to add it to today. Star a meal when you add or edit it."
      action={
        <Button
          variant="ghost"
          size="sm"
          className="-my-2.5 text-accent"
          onClick={() => setEditing((current) => !current)}
        >
          {editing ? "Done" : "Edit"}
        </Button>
      }
    >
      {/* One row, scrolled sideways, running to the screen's edges: however many meals are
          starred, the chips take one line of the screen. The vertical padding is the room a
          focus ring needs inside a box that scrolls. */}
      <ul className="-mx-[var(--page-gutter)] -my-1.5 flex [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain px-[var(--page-gutter)] py-1.5 [&::-webkit-scrollbar]:hidden">
        {meals.map((meal) => (
          <li key={meal.id} className="shrink-0">
            <button
              type="button"
              disabled={pending}
              aria-label={editing ? `Unstar ${meal.name}` : undefined}
              onClick={() => run(meal, editing)}
              className={cn(
                buttonClassName("secondary", "sm"),
                "whitespace-nowrap",
                editing && "border-danger text-danger",
              )}
            >
              <span className="max-w-[12rem] truncate">{meal.name}</span>{" "}
              {busyId === meal.id ? (
                <span className="text-ink-muted">{editing ? "Removing…" : "Adding…"}</span>
              ) : editing ? (
                <Close aria-hidden />
              ) : (
                <span className="font-normal text-ink-muted tabular-nums">
                  {formatFoodAmount(meal.kcal)} kcal
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </Section>
  );
}
