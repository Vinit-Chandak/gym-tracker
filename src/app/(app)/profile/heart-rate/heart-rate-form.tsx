"use client";

import { useActionState, useState, type ChangeEvent } from "react";

import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SavedNotice } from "@/components/ui/saved-notice";
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
import { INITIAL_FORM_STATE, parseForm, type FormState } from "@/server/validation/form";
import { heartRateFieldErrors, heartRateInputSchema } from "@/server/validation/heart-rate";

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
  const [state, formAction, pending] = useActionState(
    keepsFormOnDisconnect(saveHeartRateAction),
    INITIAL_FORM_STATE,
  );
  const [editedState, setEditedState] = useState(state);
  const [correction, setCorrection] = useState<{
    state: FormState;
    errors: Record<string, string>;
  }>();
  function change(event: ChangeEvent<HTMLFormElement>) {
    setEditedState(state);
    if (!state.fieldErrors) return;
    const data = new FormData(event.currentTarget);
    // Changing back to custom mounts its inputs after this event. Validate the kept draft
    // rather than reporting the temporarily unmounted fields as empty.
    if (data.get("zoneMethod") === "custom")
      ZONE_NUMBERS.forEach((zone, index) => {
        if (!data.has(`zone${zone}`)) data.set(`zone${zone}`, floors[index] ?? "");
      });
    const checked = parseForm(heartRateInputSchema, data);
    const errors = checked.success
      ? heartRateFieldErrors(checked.data, checked.data.maxHeartRate ?? inUse)
      : (checked.state.fieldErrors ?? {});
    setCorrection({ state, errors });
  }
  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  const [method, setMethod] = useState<HeartRateZoneMethod>(
    (state.values?.zoneMethod as HeartRateZoneMethod | undefined) ?? values.zoneMethod,
  );
  const [auto, setAuto] = useState(values.maxHeartRateAuto);
  // Switching methods is exploratory: keep unsaved custom floors when their inputs unmount.
  const [floors, setFloors] = useState(() =>
    ZONE_NUMBERS.map((zone, index) => value(`zone${zone}`, values.floors[index]?.toString() ?? "")),
  );
  // Held here to say, as it is typed, whether the reserve has the resting rate it needs.
  const [resting, setResting] = useState(() =>
    value("restingHeartRate", values.restingHeartRate?.toString() ?? ""),
  );
  const errors = correction?.state === state ? correction.errors : state.fieldErrors;
  const saved =
    editedState !== state &&
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

  return (
    <form ref={form} action={formAction} onChange={change} className="space-y-4" noValidate>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
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
                  Readings over {PLAUSIBLE_MAX_HEART_RATE} never count: a wrist sensor sometimes
                  reads cadence. If a run raised it by mistake, enter your own.
                </InfoTip>
              </span>
            </div>
            <Switch
              label="Raise it from my runs"
              checked={auto}
              onChange={(next) => {
                setAuto(next);
                setEditedState(state);
              }}
            />
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
          error={errors?.zoneMethod}
          info="Of maximum: zones start at 50, 60, 70, 80 and 90% of it. Of reserve: the same shares of maximum − resting, added to resting."
          hint={
            method === "reserve" && resting.trim() === ""
              ? "Needs your resting heart rate. Until then, zones use your maximum."
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
                <Field key={zone} label={`Zone ${zone}`} error={errors?.[`zone${zone}`]}>
                  <Input
                    name={`zone${zone}`}
                    inputMode="numeric"
                    value={floors[index]}
                    onChange={(event) =>
                      setFloors((current) =>
                        current.map((floor, i) => (i === index ? event.target.value : floor)),
                      )
                    }
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        )}
      </fieldset>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">{state.formError ? "Retry" : "Save"}</SubmitButton>
      {saved && !pending && <SavedNotice>Heart rate zones saved</SavedNotice>}
    </form>
  );
}
