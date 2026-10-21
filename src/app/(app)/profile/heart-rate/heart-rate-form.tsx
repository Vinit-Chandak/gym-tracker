"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  HEART_RATE_ZONE_METHODS,
  PLAUSIBLE_MAX_HEART_RATE,
  ZONE_METHOD_LABELS,
  ZONE_NUMBERS,
  type HeartRateZoneMethod,
} from "@/domain/heart-rate";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveHeartRateAction } from "@/server/actions/heart-rate";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const METHODS = HEART_RATE_ZONE_METHODS.map((value) => ({
  value,
  label: ZONE_METHOD_LABELS[value],
}));

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
 * hands the maximum back to the runs and the estimate — so the field says what blank means, on
 * the screen (WCAG 3.3.2); where a maximum comes from is its ⓘ, and how each method works the
 * method's. Under the method, only what it needs now: a resting rate, for the reserve.
 */
export function HeartRateForm({
  values,
  inUse,
  estimate,
}: {
  values: HeartRateFormValues;
  /** The maximum in use when the field is left blank, said in its placeholder. */
  inUse: number | null;
  /** The age formula's maximum for the athlete, or null without a date of birth. */
  estimate: number | null;
}) {
  // The switch and the zone method are held in state: React's reset after the action would put
  // them back to how the page opened on screen and in the next save (PRODUCT.md, principle 8).
  const form = useKeptForm();
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveHeartRateAction),
    INITIAL_FORM_STATE,
  );
  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  const [method, setMethod] = useState<HeartRateZoneMethod>(
    (state.values?.zoneMethod as HeartRateZoneMethod | undefined) ?? values.zoneMethod,
  );
  const [auto, setAuto] = useState(values.maxHeartRateAuto);
  // Held here to say, as it is typed, whether the reserve has the resting rate it needs.
  const [resting, setResting] = useState(() =>
    value("restingHeartRate", values.restingHeartRate?.toString() ?? ""),
  );
  const errors = state.fieldErrors;
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

  return (
    <form ref={form} action={formAction} className="space-y-4">
      <Field
        label="Maximum heart rate"
        aside="bpm"
        hint={
          inUse === null
            ? "Leave it blank to use your runs or your age."
            : `Leave it blank to use ${inUse}, from your runs or your age.`
        }
        info={`From a race or an all-out effort. By age it is ${estimate ?? "208 − 0.7 × age"} (Tanaka 2001), often ten beats out.`}
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
            <span className="flex items-center gap-1">
              <span className="switch-row-label">Raise it from my runs</span>
              <InfoTip label="About raising it from my runs">
                Readings over {PLAUSIBLE_MAX_HEART_RATE} never count: a wrist sensor sometimes reads
                cadence. If a run raised it by mistake, enter your own.
              </InfoTip>
            </span>
          </div>
          <Switch label="Raise it from my runs" checked={auto} onChange={setAuto} />
        </div>
        <input type="hidden" name="maxHeartRateAuto" value={auto ? "on" : ""} />
      </div>
      <Field
        label="Resting heart rate"
        aside="Optional"
        info="Lying still, just after waking. Zones of reserve need it."
        error={errors?.restingHeartRate}
      >
        <Input
          name="restingHeartRate"
          inputMode="numeric"
          value={resting}
          onChange={(event) => setResting(event.target.value)}
          placeholder="—"
        />
      </Field>
      <Field
        group
        label="How zones are worked out"
        info="Of maximum: zones start at 50, 60, 70, 80 and 90% of it. Of reserve: the same shares of maximum − resting, added to resting."
        hint={
          method === "reserve" && resting.trim() === ""
            ? "Needs your resting heart rate."
            : undefined
        }
      >
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
