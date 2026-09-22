"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { SWIM_STROKES } from "@/domain/activity";
import { formatPaceSeconds } from "@/domain/activity-metrics";
import { formatDistance, toMetres } from "@/lib/distance-units";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

import {
  ActivityIdentityFields,
  DistanceField,
  EffortField,
  HeartRateFields,
  LargeEntryConfirmation,
  MoreDetails,
  NotesFields,
  TargetCard,
  useFormValues,
  type ActivityFormValues,
} from "./activity-form-fields";

/**
 * Logging a swim (plan §4.5).
 *
 * A swim is elapsed time, and then a question about distance that has three honest answers:
 * counted lengths, a distance you know, or not known. Counting lengths derives the distance
 * from the pool you were actually in — one length is one trip down it, not there and back —
 * and the total is read-only while that is the method, because two totals cannot both be the
 * measurement.
 *
 * Pace needs a stated swimming time. Dividing by elapsed time would count the rests as
 * swimming, so an elapsed-only swim simply has no pace.
 */

const ENVIRONMENTS = [
  { value: "pool", label: "Pool" },
  { value: "open_water", label: "Open water" },
];

const METHODS = [
  { value: "unknown", label: "Not known" },
  { value: "lengths", label: "Count lengths" },
  { value: "manual", label: "Enter distance" },
];

const POOL_UNITS = [
  { value: "m", label: "m" },
  { value: "yd", label: "yd" },
];

const STROKE_LABELS: Record<string, string> = {
  freestyle: "Freestyle",
  backstroke: "Backstroke",
  breaststroke: "Breaststroke",
  butterfly: "Butterfly",
  mixed: "Mixed",
  drill: "Drill",
  unspecified: "Not stated",
};

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: ActivityFormValues;
  submissionKey: string;
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  target?: { title: string; lines: string[] } | null;
  expectedRevision?: number | null;
  submitLabel: string;
};

export function SwimmingForm({
  action,
  initial,
  submissionKey,
  occurrence = null,
  target = null,
  expectedRevision = null,
  submitLabel,
}: Props) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const values = useFormValues(state, initial);
  const [environment, setEnvironment] = useState(() => values("environment") || "pool");
  const [method, setMethod] = useState(() => values("distanceMethod") || "unknown");
  const [poolLength, setPoolLength] = useState(() => values("poolLengthValue"));
  const [poolUnit, setPoolUnit] = useState(() => values("poolLengthUnit") || "m");
  const [lengths, setLengths] = useState(() => values("lengths"));
  const [distance, setDistance] = useState(() => values("distanceValue"));
  const [distanceUnit, setDistanceUnit] = useState(() => values("distanceUnit") || "m");
  const [activeMinutes, setActiveMinutes] = useState(() => values("activeMinutes"));
  const [activeSeconds, setActiveSeconds] = useState(() => values("activeSeconds"));

  const derivedMetres =
    method === "lengths" && poolLength.trim() !== "" && lengths.trim() !== ""
      ? toMetres(Number(poolLength.replace(",", ".")), poolUnit as "m" | "yd") * Number(lengths)
      : method === "manual" && distance.trim() !== ""
        ? toMetres(Number(distance.replace(",", ".")), distanceUnit as "m" | "yd")
        : null;
  const activeMs =
    activeMinutes.trim() === "" && activeSeconds.trim() === ""
      ? null
      : (Number(activeMinutes || 0) * 60 + Number(activeSeconds || 0)) * 1000;
  const paceUnit = (method === "lengths" ? poolUnit : distanceUnit) as "m" | "yd";
  const pace =
    activeMs !== null && derivedMetres !== null && derivedMetres > 0
      ? activeMs / 1000 / (toMetresPerHundred(derivedMetres, paceUnit) || 1)
      : null;

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <input type="hidden" name="sport" value="swimming" />
      <input type="hidden" name="outcome" value={values("outcome") || "logged"} />
      <input type="hidden" name="resourceId" value={values("resourceId")} />
      <ActivityIdentityFields
        submissionKey={submissionKey}
        occurrence={occurrence}
        expectedRevision={expectedRevision}
      />
      {target && <TargetCard title={target.title} lines={target.lines} />}

      <Section title="The swim">
        <Card>
          <Field label="When" error={state.fieldErrors?.startedAt}>
            <Input
              name="startedAt"
              type="datetime-local"
              defaultValue={values("startedAt")}
              required
            />
          </Field>

          <Field group label="Where">
            <SegmentedControl
              name="environment"
              aria-label="Where"
              options={ENVIRONMENTS}
              value={environment}
              onChange={(value) => {
                setEnvironment(value);
                // Open water has no lengths to count; the method goes back to a real choice.
                if (value === "open_water" && method === "lengths") setMethod("unknown");
              }}
              columns={2}
            />
          </Field>

          <Field
            group
            label="Elapsed time"
            hint="From getting in to getting out, rests included"
            error={state.fieldErrors?.elapsed ?? state.fieldErrors?.minutes}
          >
            <div className="grid grid-cols-3 gap-2">
              <Field label="Hours">
                <Input
                  name="hours"
                  inputMode="numeric"
                  defaultValue={values("hours")}
                  placeholder="0"
                />
              </Field>
              <Field label="Minutes">
                <Input
                  name="minutes"
                  inputMode="numeric"
                  defaultValue={values("minutes")}
                  placeholder="40"
                />
              </Field>
              <Field label="Seconds">
                <Input
                  name="seconds"
                  inputMode="decimal"
                  defaultValue={values("seconds")}
                  placeholder="0"
                />
              </Field>
            </div>
          </Field>
        </Card>
      </Section>

      <Section title="Distance">
        <Card>
          <Field group label="How it was measured" error={state.fieldErrors?.distanceMethod}>
            <SegmentedControl
              name="distanceMethod"
              aria-label="Distance method"
              options={
                environment === "open_water"
                  ? METHODS.filter((item) => item.value !== "lengths")
                  : METHODS
              }
              value={method}
              onChange={setMethod}
              columns={3}
            />
          </Field>

          {method === "lengths" && (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label="Pool length" error={state.fieldErrors?.poolLength}>
                  <Input
                    name="poolLengthValue"
                    inputMode="decimal"
                    value={poolLength}
                    onChange={(event) => setPoolLength(event.target.value)}
                    placeholder="25"
                  />
                </Field>
                <Field group label="Unit">
                  <SegmentedControl
                    name="poolLengthUnit"
                    aria-label="Pool unit"
                    options={POOL_UNITS}
                    value={poolUnit}
                    onChange={setPoolUnit}
                    columns={2}
                  />
                </Field>
              </div>
              <Field
                label="Lengths"
                hint="One length is one trip from one end to the other"
                error={state.fieldErrors?.lengths}
              >
                <Input
                  name="lengths"
                  inputMode="numeric"
                  value={lengths}
                  onChange={(event) => setLengths(event.target.value)}
                  placeholder="16"
                />
              </Field>
              {derivedMetres !== null && (
                <p role="status" className="text-sm text-ink-muted tabular-nums">
                  {formatDistance(derivedMetres, poolUnit as "m" | "yd")}
                  {/* A yard pool is not a metre pool, and the metres say so exactly. */}
                  {poolUnit === "yd" ? ` · ${formatDistance(derivedMetres, "m", 2)}` : ""}
                </p>
              )}
            </>
          )}

          {environment === "pool" && method !== "lengths" && (
            <>
              <input type="hidden" name="poolLengthValue" value={poolLength} />
              <input type="hidden" name="poolLengthUnit" value={poolUnit} />
            </>
          )}

          {method === "manual" && (
            <DistanceField
              value={distance}
              unit={distanceUnit}
              onValueChange={setDistance}
              onUnitChange={setDistanceUnit}
              units={POOL_UNITS}
              error={state.fieldErrors?.distance ?? state.fieldErrors?.distanceValue}
            />
          )}

          {method === "unknown" && (
            <p className="text-sm text-ink-muted">
              The time still counts. Nothing is made up for the distance.
            </p>
          )}
        </Card>
      </Section>

      <Section title="Effort">
        <Card>
          <EffortField value={values("effort")} error={state.fieldErrors?.effort} />
        </Card>
      </Section>

      <Section title="Details">
        <MoreDetails>
          <Field
            group
            label="Swimming time"
            hint="Optional — the time actually swimming, without the rests"
            error={state.fieldErrors?.activeMs}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label="Minutes">
                <Input
                  name="activeMinutes"
                  inputMode="numeric"
                  value={activeMinutes}
                  onChange={(event) => setActiveMinutes(event.target.value)}
                  placeholder="—"
                />
              </Field>
              <Field label="Seconds">
                <Input
                  name="activeSeconds"
                  inputMode="decimal"
                  value={activeSeconds}
                  onChange={(event) => setActiveSeconds(event.target.value)}
                  placeholder="—"
                />
              </Field>
            </div>
          </Field>
          {pace !== null && (
            <p role="status" className="text-sm text-ink-muted tabular-nums">
              {formatPaceSeconds(pace, 1)} per 100 {paceUnit}
            </p>
          )}
          <Field label="Stroke" error={state.fieldErrors?.stroke}>
            <Select name="stroke" defaultValue={values("stroke") || "unspecified"}>
              {SWIM_STROKES.map((stroke) => (
                <option key={stroke} value={stroke}>
                  {STROKE_LABELS[stroke]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Strokes taken" hint="Optional" error={state.fieldErrors?.strokeCount}>
            <Input
              name="strokeCount"
              inputMode="numeric"
              defaultValue={values("strokeCount")}
              placeholder="—"
            />
          </Field>
          <HeartRateFields values={values} errors={state.fieldErrors} />
        </MoreDetails>
      </Section>

      <NotesFields values={values} errors={state.fieldErrors} />

      <div className="space-y-2">
        <LargeEntryConfirmation message={state.formError} />
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** Hundreds of the chosen unit in a distance, for the per-100 pace preview. */
function toMetresPerHundred(metres: number, unit: "m" | "yd"): number {
  const perUnit = unit === "yd" ? 0.9144 : 1;
  return metres / perUnit / 100;
}
