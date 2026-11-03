"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { joinFacts } from "@/lib/facts";
import { formatIsoLongDay, formatKcal } from "@/lib/format";
import { attempted } from "@/lib/offline-submit";

import { useFoodActions } from "./food-actions";

/**
 * Copying a day before today to today: everything eaten on it, each food to the same meal, added
 * to whatever today already holds. It asks first, saying what is copied, then opens today.
 */
export function CopyDayToToday({
  from,
  today,
  foods,
  kcal,
  todayHref,
}: {
  /** The day on screen, which is copied. */
  from: string;
  today: string;
  /** How many foods it holds and what they came to, said before it is copied. */
  foods: number;
  kcal: number;
  /** Today's Food screen, opened once the copy is made. */
  todayHref: Route;
}) {
  const { copyFoodDayAction } = useFoodActions();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // One per opening of the sheet, so a retry after a lost reply copies the day only once.
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, startCopying] = useTransition();

  const copy = () =>
    startCopying(async () => {
      setError(null);
      const outcome = await attempted(
        () => copyFoodDayAction({ submissionKey, from, to: today }),
        "The day was not copied. Check your connection and try again.",
      );
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error ?? "The day was not copied.");
      else {
        setOpen(false);
        router.push(todayHref);
      }
    });

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
    setSubmissionKey(crypto.randomUUID());
  };

  return (
    <>
      <Button variant="tonal" size="md" className="food-copy-day" onClick={() => setOpen(true)}>
        Copy to today
      </Button>
      <Sheet open={open} onClose={close} title="Copy to today?" dismissible={!pending}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted tabular-nums">
            {joinFacts([
              `${foods}\u00a0${foods === 1 ? "food" : "foods"}`,
              `${formatKcal(kcal)}\u00a0kcal`,
            ])}{" "}
            from {formatIsoLongDay(from)}, each to the same meal. Anything already logged today
            stays.
          </p>
          <FormError message={error ?? undefined} />
          <Button size="lg" className="w-full" disabled={pending} onClick={copy}>
            {pending ? "Copying…" : "Copy to today"}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" disabled={pending} onClick={close}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}
