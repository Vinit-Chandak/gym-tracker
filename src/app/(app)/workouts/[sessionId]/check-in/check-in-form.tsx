"use client";

import { useActionState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Section } from "@/components/ui/section";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

const FIVE = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

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
        <Card>
          <Field label="Hours last night" error={state.fieldErrors?.sleepHours}>
            <Input
              name="sleepHours"
              inputMode="decimal"
              defaultValue={value("sleepHours")}
              placeholder="e.g. 6.5"
            />
          </Field>
          <Field
            group
            label="Quality"
            hint="1 = poor, 5 = great"
            error={state.fieldErrors?.sleepQuality}
          >
            <SegmentedControl
              name="sleepQuality"
              options={FIVE}
              defaultValue={value("sleepQuality")}
              columns={5}
            />
          </Field>
        </Card>
      </Section>

      <Section title="How you feel">
        <Card>
          <Field
            group
            label="General fatigue"
            hint="1 = fresh, 5 = wrecked"
            error={state.fieldErrors?.fatigue}
          >
            <SegmentedControl
              name="fatigue"
              options={FIVE}
              defaultValue={value("fatigue")}
              columns={5}
            />
          </Field>
          <Field
            group
            label="Soreness"
            hint="1 = none, 5 = severe"
            error={state.fieldErrors?.soreness}
          >
            <SegmentedControl
              name="soreness"
              options={FIVE}
              defaultValue={value("soreness")}
              columns={5}
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
