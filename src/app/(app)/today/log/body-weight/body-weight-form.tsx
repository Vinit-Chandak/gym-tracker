"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import type { BodyLoadUnit } from "@/domain/types";
import { formatIsoDate } from "@/lib/format";
import { previousAppPage } from "@/lib/navigation-history";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { formatBodyWeight } from "@/lib/units";
import { logBodyWeightAction } from "@/server/actions/body-weight";
import type { BodyWeightReading } from "@/server/repositories/body-weight";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/** Where a reading saved from Log lands: the trend that now holds it. */
const TREND = "/progress?view=body" as Route;

/**
 * A body weight reading: the day, today unless another is chosen and never a later one, and
 * the weight in the account's unit. Under the weight, what the scale said last, or the reading
 * saving would replace when it was that day's.
 *
 * Saved, it goes back to the page it was opened from, which now shows it (Progress, Food's
 * targets); opened from Log, which has nothing more to do, it lands on the trend.
 */
export function BodyWeightForm({
  today,
  unit,
  last,
}: {
  /** Today in the account's time zone, the latest day a reading can be for. */
  today: string;
  unit: BodyLoadUnit;
  /** The newest reading on record, or null before the first. */
  last: BodyWeightReading | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(logBodyWeightAction),
    INITIAL_FORM_STATE,
  );
  const form = useKeptForm();
  const [date, setDate] = useState(today);
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;
  useEffect(() => {
    if (!saved) return;
    const previous = previousAppPage();
    if (previous && previous.split(/[?#]/)[0] !== "/today/log") router.back();
    else router.replace(TREND);
  }, [saved, router]);

  const lastWeight = last && formatBodyWeight(last.weightKg, unit);
  const hint = !last
    ? undefined
    : last.measuredOn === date
      ? `Replaces ${lastWeight}`
      : `Last ${lastWeight} · ${formatIsoDate(last.measuredOn, today.slice(0, 4))}`;

  return (
    <form ref={form} action={formAction} className="space-y-4">
      <Field label="Date" error={state.fieldErrors?.measuredOn}>
        <Input
          name="measuredOn"
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </Field>
      <Field
        label={`Body weight (${unit})`}
        hint={hint}
        error={state.fieldErrors?.bodyWeight}
        info="One reading a day: a second that day replaces the first."
      >
        <input type="hidden" name="unit" value={unit} />
        <Input name="bodyWeight" inputMode="decimal" autoComplete="off" required />
      </Field>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
