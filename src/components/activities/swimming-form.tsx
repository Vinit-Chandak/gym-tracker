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
  DurationField,
  EffortField,
  HeartRateFields,
  LargeEntryConfirmation,
  MoreDetails,
  NotesFields,
  NumberWell,
  Readout,
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
  // "400 yd": the figure in the display face, its unit beside it.
  const [lengthsFigure, lengthsUnit] =
    method === "lengths" && derivedMetres !== null
      ? formatDistance(derivedMetres, poolUnit as "m" | "yd").split(" ")
      : [];

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
      {target && <TargetCard sport="swimming" title={target.title} lines={target.lines} />}

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
      </Card>

      <Card className="space-y-4">
        <DurationField
          label="Elapsed time"
          info="From getting in to getting out, rests included."
          error={
            state.fieldErrors?.elapsed ??
            state.fieldErrors?.hours ??
            state.fieldErrors?.minutes ??
            state.fieldErrors?.seconds
          }
          parts={[
            {
              name: "hours",
              label: "Hours",
              suffix: "h",
              placeholder: "0",
              defaultValue: values("hours"),
            },
            {
              name: "minutes",
              label: "Minutes",
              suffix: "min",
              placeholder: "40",
              defaultValue: values("minutes"),
            },
            {
              name: "seconds",
              label: "Seconds",
              suffix: "s",
              placeholder: "0",
              inputMode: "decimal",
              defaultValue: values("seconds"),
            },
          ]}
        />

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
            <DistanceField
              label="Pool length"
              name="poolLengthValue"
              unitName="poolLengthUnit"
              unitLabel="Pool unit"
              placeholder="25"
              value={poolLength}
              unit={poolUnit}
              onValueChange={setPoolLength}
              onUnitChange={setPoolUnit}
              units={POOL_UNITS}
              error={state.fieldErrors?.poolLength}
            />
            <Field
              label="Lengths"
              info="One length is one trip from one end of the pool to the other."
              error={state.fieldErrors?.lengths}
            >
              <NumberWell
                name="lengths"
                inputMode="numeric"
                value={lengths}
                onChange={(event) => setLengths(event.target.value)}
                placeholder="16"
              />
            </Field>
            {lengthsFigure && (
              <Readout
                sport="swimming"
                label="Distance"
                value={lengthsFigure}
                unit={lengthsUnit}
                // A yard pool is not a metre pool, and the metres say so exactly.
                detail={
                  poolUnit === "yd" && derivedMetres !== null
                    ? formatDistance(derivedMetres, "m", 2)
                    : undefined
                }
              />
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
            placeholder="800"
            error={state.fieldErrors?.distance ?? state.fieldErrors?.distanceValue}
          />
        )}

        {method === "unknown" && (
          <p className="text-sm text-ink-muted">
            The time still counts. Nothing is made up for the distance.
          </p>
        )}
      </Card>

      <Section title="Effort">
        <Card>
          <EffortField value={values("effort")} error={state.fieldErrors?.effort} />
        </Card>
      </Section>

      <MoreDetails
        hasErrors={[
          "activeMs",
          "activeMinutes",
          "activeSeconds",
          "stroke",
          "strokeCount",
          "averageHeartRate",
          "maxHeartRate",
        ].some((field) => Boolean(state.fieldErrors?.[field]))}
      >
        <DurationField
          label="Swimming time"
          hint="Optional"
          info="The time actually swimming, without the rests. A pace needs it."
          error={
            state.fieldErrors?.activeMs ??
            state.fieldErrors?.activeMinutes ??
            state.fieldErrors?.activeSeconds
          }
          parts={[
            {
              name: "activeMinutes",
              label: "Minutes",
              suffix: "min",
              placeholder: "—",
              value: activeMinutes,
              onChange: setActiveMinutes,
            },
            {
              name: "activeSeconds",
              label: "Seconds",
              suffix: "s",
              placeholder: "—",
              inputMode: "decimal",
              value: activeSeconds,
              onChange: setActiveSeconds,
            },
          ]}
        />
        {pace !== null && (
          <Readout
            sport="swimming"
            label="Swimming pace"
            value={formatPaceSeconds(pace, 1)}
            unit={`per 100 ${paceUnit}`}
          />
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

      <NotesFields values={values} errors={state.fieldErrors} />

      <div className="space-y-2">
        <LargeEntryConfirmation message={state.formError} />
        <FormError message={state.formError} />
        <SubmitButton tone="swim" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Hundreds of the chosen unit in a distance, for the per-100 pace preview. */
function toMetresPerHundred(metres: number, unit: "m" | "yd"): number {
  const perUnit = unit === "yd" ? 0.9144 : 1;
  return metres / perUnit / 100;
}
