"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { ZONE_NUMBERS, type HeartRateZoneMethod } from "@/domain/heart-rate";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveHeartRateAction } from "@/server/actions/heart-rate";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const METHODS: { value: HeartRateZoneMethod; label: string }[] = [
  { value: "max", label: "Of maximum" },
  { value: "reserve", label: "Of reserve" },
  { value: "custom", label: "My own" },
];

const METHOD_HINTS: Record<HeartRateZoneMethod, string> = {
  max: "Zones at 50, 60, 70, 80 and 90 per cent of your maximum, as most watches set them.",
  reserve:
    "Zones at the same shares of the gap between resting and maximum (Karvonen). Needs your resting heart rate.",
  custom:
    "Where each zone starts, from a lab test or a threshold run. Zone 5 runs to your maximum.",
};

export type HeartRateFormValues = {
  maxHeartRate: number | null;
  restingHeartRate: number | null;
  zoneMethod: HeartRateZoneMethod;
  maxHeartRateAuto: boolean;
  /** The floors to start custom zones from: the athlete's own, or the zones in use. */
  floors: readonly number[];
};

/**
 * The settings behind the zones (ADR 0059): a maximum of the athlete's own or none, whether runs
 * may raise it, a resting rate, and how the zones are cut. A blank maximum is an answer — it
 * hands the maximum back to the runs and the estimate — so the field says what blank means.
 */
export function HeartRateForm({
  values,
  inUse,
}: {
  values: HeartRateFormValues;
  /** The maximum in use when the field is left blank, said in its placeholder. */
  inUse: number | null;
}) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveHeartRateAction),
    INITIAL_FORM_STATE,
  );
  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  const [method, setMethod] = useState<HeartRateZoneMethod>(
    (state.values?.zoneMethod as HeartRateZoneMethod | undefined) ?? values.zoneMethod,
  );
  const [auto, setAuto] = useState(values.maxHeartRateAuto);
  const errors = state.fieldErrors;
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Maximum heart rate"
        aside="bpm"
        hint={
          inUse === null
            ? "From a race or an all-out effort. Leave it blank to use your runs or your age."
            : `Leave it blank to use ${inUse}, from your runs or your age.`
        }
        error={errors?.maxHeartRate}
      >
        <Input
          name="maxHeartRate"
          inputMode="numeric"
          defaultValue={value("maxHeartRate", values.maxHeartRate?.toString() ?? "")}
          placeholder={inUse?.toString() ?? "—"}
        />
      </Field>
      <div className="switch-row border-b-0">
        <div className="switch-row-main">
          <div className="switch-row-text">
            <span className="switch-row-label">Raise it from my runs</span>
            <span className="switch-row-effect">
              A run that records a higher heart rate becomes your maximum.
            </span>
          </div>
          <Switch label="Raise it from my runs" checked={auto} onChange={setAuto} />
        </div>
        <input type="hidden" name="maxHeartRateAuto" value={auto ? "on" : ""} />
      </div>
      <Field
        label="Resting heart rate"
        aside="Optional"
        hint="Taken lying still, just after waking."
        error={errors?.restingHeartRate}
      >
        <Input
          name="restingHeartRate"
          inputMode="numeric"
          defaultValue={value("restingHeartRate", values.restingHeartRate?.toString() ?? "")}
          placeholder="—"
        />
      </Field>
      <Field group label="How zones are worked out" hint={METHOD_HINTS[method]}>
        <SegmentedControl
          name="zoneMethod"
          aria-label="How zones are worked out"
          options={METHODS}
          value={method}
          onChange={setMethod}
          columns={3}
        />
      </Field>
      {method === "custom" && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-[length:var(--ov-type-meta-small)] font-bold">
            Where each zone starts
          </legend>
          <div className="heart-rate-floors">
            {ZONE_NUMBERS.map((zone, index) => (
              <Field
                key={zone}
                label={`Zone ${zone}`}
                error={zone === 1 ? errors?.zone1 : undefined}
              >
                <Input
                  name={`zone${zone}`}
                  inputMode="numeric"
                  defaultValue={value(`zone${zone}`, values.floors[index]?.toString() ?? "")}
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
        </fieldset>
      )}
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      <p className="sr-only" role="status">
        {saved ? "Heart rate zones saved" : ""}
      </p>
    </form>
  );
}
