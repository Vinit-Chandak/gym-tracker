"use client";

import { useActionState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

const FIVE = ["1", "2", "3", "4", "5"] as const;

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: {
    sleepHours: string;
    sleepQuality: string;
    fatigue: string;
    soreness: string;
  };
};

/**
 * One to five as five big tiles in a row, each a real radio, so a rating is one tap with a
 * thumb between sets rather than an aim at a small segment. What the two ends mean sits under
 * them. The chosen tile takes recovery's colour: the whole check-in is about recovery.
 *
 * `Field` hands the group its label and any error through the props it passes on here.
 */
function RatingScale({
  name,
  defaultValue,
  low,
  high,
  ...accessibility
}: {
  name: string;
  defaultValue: string;
  /** What 1 means, and what 5 means. */
  low: string;
  high: string;
  id?: string;
  role?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div {...accessibility} role="radiogroup" className="grid grid-cols-5 gap-2">
        {FIVE.map((value) => (
          <label key={value} className="relative min-w-0">
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={defaultValue === value}
              aria-label={value === "1" ? `1, ${low}` : value === "5" ? `5, ${high}` : value}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "flex h-16 pressable items-center justify-center rounded-tile bg-surface-raised font-display text-display-s text-ink-muted tabular-nums select-none",
                "peer-checked:bg-rose peer-checked:text-on-rose",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-focus peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
              )}
            >
              {value}
            </span>
          </label>
        ))}
      </div>
      <p aria-hidden className="flex justify-between gap-3 px-1 text-xs text-ink-muted">
        <span>{low}</span>
        <span className="text-right">{high}</span>
      </p>
    </div>
  );
}

/**
 * Pre-session recovery questionnaire. Every reading is optional, and left blank it stays
 * unknown rather than becoming a zero — the recovery rules distinguish the two, and a
 * fabricated reading would speak for somebody who said nothing.
 *
 * Energy is not asked. It was fatigue asked again the other way up — 1 flat to 5 fired up
 * beside 1 fresh to 5 wrecked — and the two answers contradicted each other as often as
 * not. How you feel is now two scales that read the same way: 1 is fine, 5 is the worst.
 */
export function CheckInForm({ action, initial }: Props) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const value = (key: keyof Props["initial"]) => state.values?.[key] ?? initial[key];

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <Section title="Sleep">
        <Card className="space-y-5">
          <Field label="Hours last night" error={state.fieldErrors?.sleepHours}>
            <Input
              name="sleepHours"
              inputMode="decimal"
              defaultValue={value("sleepHours")}
              placeholder="e.g. 6.5"
            />
          </Field>
          <Field group label="Quality" error={state.fieldErrors?.sleepQuality}>
            <RatingScale
              name="sleepQuality"
              defaultValue={value("sleepQuality")}
              low="Poor"
              high="Great"
            />
          </Field>
        </Card>
      </Section>

      <Section title="How you feel">
        <Card className="space-y-5">
          <Field group label="General fatigue" error={state.fieldErrors?.fatigue}>
            <RatingScale
              name="fatigue"
              defaultValue={value("fatigue")}
              low="Fresh"
              high="Wrecked"
            />
          </Field>
          <Field group label="Soreness" error={state.fieldErrors?.soreness}>
            <RatingScale
              name="soreness"
              defaultValue={value("soreness")}
              low="None"
              high="Severe"
            />
          </Field>
        </Card>
      </Section>

      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">Save and start</SubmitButton>
      </div>
    </form>
  );
}
