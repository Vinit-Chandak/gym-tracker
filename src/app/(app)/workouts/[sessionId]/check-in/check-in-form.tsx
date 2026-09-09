"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Section } from "@/components/ui/section";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

const FIVE = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: {
    sleepHours: string;
    sleepQuality: string;
    energy: string;
    fatigue: string;
    soreness: string;
    backPainPre: string;
    shinLeftPre: string;
    shinRightPre: string;
  };
};

/**
 * Pre-session recovery questionnaire. Every reading is optional, and left blank it stays
 * unknown rather than becoming a zero — the recovery rules distinguish the two, and a
 * fabricated zero would read as "no pain at all" when nothing was actually said.
 */
export function CheckInForm({ action, initial }: Props) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  const value = (key: keyof Props["initial"]) => state.values?.[key] ?? initial[key];
  const [back, setBack] = useState(() => value("backPainPre"));
  const [shinLeft, setShinLeft] = useState(() => value("shinLeftPre"));
  const [shinRight, setShinRight] = useState(() => value("shinRightPre"));

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <Section title="Sleep">
        <Field label="Hours last night" error={state.fieldErrors?.sleepHours}>
          <Input
            name="sleepHours"
            inputMode="decimal"
            defaultValue={value("sleepHours")}
            placeholder="e.g. 6.5"
          />
        </Field>
        <Field label="Quality" hint="1 = poor, 5 = great" error={state.fieldErrors?.sleepQuality}>
          <SegmentedControl
            name="sleepQuality"
            options={FIVE}
            defaultValue={value("sleepQuality")}
            columns={5}
          />
        </Field>
      </Section>

      <Section title="How you feel">
        <Field label="Energy" hint="1 = flat, 5 = fired up" error={state.fieldErrors?.energy}>
          <SegmentedControl
            name="energy"
            options={FIVE}
            defaultValue={value("energy")}
            columns={5}
          />
        </Field>
        <Field
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
        <Field label="Soreness" hint="1 = none, 5 = severe" error={state.fieldErrors?.soreness}>
          <SegmentedControl
            name="soreness"
            options={FIVE}
            defaultValue={value("soreness")}
            columns={5}
          />
        </Field>
      </Section>

      <Section title="Symptoms" description="0 = nothing, 10 = worst it has been.">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Lower back"
            value={back}
            onChange={setBack}
            step={1}
            max={10}
            inputMode="numeric"
          />
          <NumberField
            label="Left shin"
            value={shinLeft}
            onChange={setShinLeft}
            step={1}
            max={10}
            inputMode="numeric"
          />
          <NumberField
            label="Right shin"
            value={shinRight}
            onChange={setShinRight}
            step={1}
            max={10}
            inputMode="numeric"
          />
        </div>
        <input type="hidden" name="backPainPre" value={back} />
        <input type="hidden" name="shinLeftPre" value={shinLeft} />
        <input type="hidden" name="shinRightPre" value={shinRight} />
        {(state.fieldErrors?.backPainPre ||
          state.fieldErrors?.shinLeftPre ||
          state.fieldErrors?.shinRightPre) && (
          <p role="alert" className="text-sm text-danger">
            Symptom scores must be whole numbers from 0 to 10.
          </p>
        )}
      </Section>

      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">Save and start</SubmitButton>
      </div>
    </form>
  );
}
