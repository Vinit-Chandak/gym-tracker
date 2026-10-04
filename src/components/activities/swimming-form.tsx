"use client";

import { useActionState, useState, type ReactNode } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { IconChoice } from "@/components/ui/icon-choice";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { RowStepper } from "@/components/ui/row-stepper";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { SWIM_STROKES } from "@/domain/activity";
import { formatPaceSeconds } from "@/domain/activity-metrics";
import { formatDistance, toMetres } from "@/lib/distance-units";
import { SWIM_STROKE_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

import {
  ActivityIdentityFields,
  ActivityStartFields,
  DistanceField,
  DurationField,
  durationFromParts,
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
  { value: "pool", label: "Pool", glyph: "pool" },
  { value: "open_water", label: "Open water", glyph: "openwater" },
] as const;

const METHODS = [
  { value: "unknown", label: "Not known" },
  { value: "lengths", label: "Count lengths" },
  { value: "manual", label: "Enter distance" },
];

const POOL_UNITS = [
  { value: "m", label: "m" },
  { value: "yd", label: "yd" },
];

const STROKE_LABELS: Record<string, string> = SWIM_STROKE_LABELS;

/** "1,000 m": a distance with its thousands grouped, as the lengths' hint writes it. */
const grouped = (distance: string) =>
  distance.replace(/^\d+/, (whole) => Number(whole).toLocaleString("en-GB"));

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: ActivityFormValues;
  submissionKey: string;
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  target?: { title: string; lines: string[] } | null;
  expectedRevision?: number | null;
  submitLabel: string;
  /** The draft kept on this device, said after the last field. */
  notice?: ReactNode;
};

export function SwimmingForm({
  action,
  initial,
  submissionKey,
  occurrence = null,
  target = null,
  expectedRevision = null,
  submitLabel,
  notice,
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
  const [elapsed, setElapsed] = useState(() =>
    durationFromParts(values("hours"), values("minutes"), values("seconds")),
  );
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

  const errors = state.fieldErrors;
  const poolUnitIndex = POOL_UNITS.findIndex((option) => option.value === poolUnit);
  const otherPoolUnit = POOL_UNITS[(poolUnitIndex + 1) % POOL_UNITS.length]!;

  // Board Log a swim: where, the elapsed time, how the distance was measured and what that
  // came to, how hard it felt; everything optional behind one row; Save at the foot.
  return (
    <form action={formAction}>
      <input type="hidden" name="sport" value="swimming" />
      <input type="hidden" name="outcome" value={values("outcome") || "logged"} />
      <input type="hidden" name="resourceId" value={values("resourceId")} />
      <ActivityIdentityFields
        submissionKey={submissionKey}
        occurrence={occurrence}
        expectedRevision={expectedRevision}
      />
      {target && (
        <div className="mt-3">
          <TargetCard title={target.title} lines={target.lines} />
        </div>
      )}

      <div className="mt-3">
        <IconChoice
          name="environment"
          options={ENVIRONMENTS}
          value={environment}
          onChange={(value) => {
            setEnvironment(value);
            // Open water has no lengths to count; the method goes back to a real choice.
            if (value === "open_water" && method === "lengths") setMethod("unknown");
          }}
        />
      </div>
      <div className="mt-1.5">
        <DurationField
          label="Elapsed time"
          hint="Rests included"
          value={elapsed}
          onChange={setElapsed}
          error={errors?.elapsed ?? errors?.hours ?? errors?.minutes ?? errors?.seconds}
        />

        <div className="space-y-1.5 border-b border-hair pt-3 pb-3">
          <p id="swim-method" className="type-meta-small font-bold">
            How it was measured
          </p>
          <SegmentedControl
            name="distanceMethod"
            aria-labelledby="swim-method"
            options={
              environment === "open_water"
                ? METHODS.filter((item) => item.value !== "lengths")
                : METHODS
            }
            value={method}
            onChange={setMethod}
            columns={3}
          />
          {errors?.distanceMethod && (
            <p role="alert" className="type-meta-small font-semibold">
              {errors.distanceMethod}
            </p>
          )}
          {method === "unknown" && (
            <p className="type-caption font-medium text-ink-2">
              The time still counts. Nothing is made up for the distance.
            </p>
          )}
        </div>

        {method === "lengths" && (
          <>
            <input type="hidden" name="poolLengthUnit" value={poolUnit} />
            <RowStepper
              label="Pool length"
              name="poolLengthValue"
              value={poolLength}
              onChange={setPoolLength}
              unit={poolUnit}
              onUnit={{
                label: `Pool length in ${poolUnit}. Change to ${otherPoolUnit.label}`,
                onPress: () => setPoolUnit(otherPoolUnit.value),
              }}
              step={1}
              max={1000}
              less="Shorter"
              more="Longer"
              error={errors?.poolLength}
            />
            <RowStepper
              label="Lengths"
              hint={
                derivedMetres !== null ? (
                  <span role="status">
                    {grouped(formatDistance(derivedMetres, poolUnit as "m" | "yd"))}
                    {/* A yard pool is not a metre pool, and the metres say so exactly. */}
                    {poolUnit === "yd"
                      ? ` · ${grouped(formatDistance(derivedMetres, "m", 2))}`
                      : ""}
                  </span>
                ) : (
                  "One length is one trip from one end to the other"
                )
              }
              name="lengths"
              value={lengths}
              onChange={setLengths}
              step={1}
              max={10_000}
              inputMode="numeric"
              less="One fewer"
              more="One more"
              error={errors?.lengths}
            />
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
            step={25}
            error={errors?.distance ?? errors?.distanceValue}
          />
        )}

        <EffortField value={values("effort")} error={errors?.effort} />
      </div>

      <MoreDetails
        hasErrors={[
          "startedAt",
          "startedAtOffsetMinutes",
          "recordedTimeZone",
          "activeMs",
          "activeMinutes",
          "activeSeconds",
          "stroke",
          "strokeCount",
          "averageHeartRate",
          "maxHeartRate",
          "title",
          "notes",
        ].some((field) => Boolean(errors?.[field]))}
      >
        <ActivityStartFields values={values} errors={errors} />
        <Field
          group
          label="Swimming time"
          hint="Optional — the time actually swimming, without the rests"
          error={errors?.activeMs ?? errors?.activeMinutes ?? errors?.activeSeconds}
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
          <p role="status" className="type-meta-small text-ink-2 tabular-nums">
            {formatPaceSeconds(pace, 1)} per 100 {paceUnit}
          </p>
        )}
        <Field label="Stroke" error={errors?.stroke}>
          <Select name="stroke" defaultValue={values("stroke") || "unspecified"}>
            {SWIM_STROKES.map((stroke) => (
              <option key={stroke} value={stroke}>
                {STROKE_LABELS[stroke]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Strokes taken" hint="Optional" error={errors?.strokeCount}>
          <Input
            name="strokeCount"
            inputMode="numeric"
            defaultValue={values("strokeCount")}
            placeholder="—"
          />
        </Field>
        <HeartRateFields values={values} errors={errors} />
        <NotesFields values={values} errors={errors} />
      </MoreDetails>

      {notice}

      <PinnedActions stack>
        <FormError message={state.formError} />
        <LargeEntryConfirmation message={state.formError} />
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </PinnedActions>
    </form>
  );
}

/** Hundreds of the chosen unit in a distance, for the per-100 pace preview. */
function toMetresPerHundred(metres: number, unit: "m" | "yd"): number {
  const perUnit = unit === "yd" ? 0.9144 : 1;
  return metres / perUnit / 100;
}
