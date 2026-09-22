"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatPaceSeconds, paceSecondsPerKm } from "@/domain/activity-metrics";
import { toMetres } from "@/lib/distance-units";
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
 * Logging a run, on the shared routes (plan §4.3).
 *
 * What running always asked for, unchanged: a distance, a duration, outdoor or treadmill, and
 * the pace that follows from the two numbers actually recorded. What is new is that the
 * effort question has an honest second answer, and that the optional detail a more
 * experienced runner wants is one tap away rather than absent.
 */

const ENVIRONMENTS = [
  { value: "outdoor", label: "Outdoor" },
  { value: "treadmill", label: "Treadmill" },
];

const DISTANCE_UNITS = [
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
];

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: ActivityFormValues;
  submissionKey: string;
  /** The occurrence being logged, with the revision pinned when the form opened. */
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  /** What the plan asked for, kept beside the form rather than inside it. */
  target?: { title: string; lines: string[] } | null;
  expectedRevision?: number | null;
  submitLabel: string;
};

export function RunningForm({
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
  const [distance, setDistance] = useState(() => values("distanceValue"));
  const [unit, setUnit] = useState(() => values("distanceUnit") || "km");
  const [minutes, setMinutes] = useState(() => values("minutes"));
  const [seconds, setSeconds] = useState(() => values("seconds"));
  const [hours, setHours] = useState(() => values("hours"));

  const durationMs =
    (Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0)) * 1000;
  const metres =
    distance.trim() === "" ? 0 : toMetres(Number(distance.replace(",", ".")), unit as "km" | "mi");
  const pace = Number.isFinite(metres) ? paceSecondsPerKm(metres, durationMs) : null;

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <input type="hidden" name="sport" value="running" />
      <input type="hidden" name="outcome" value={values("outcome") || "logged"} />
      <ActivityIdentityFields
        submissionKey={submissionKey}
        occurrence={occurrence}
        expectedRevision={expectedRevision}
      />
      {target && <TargetCard title={target.title} lines={target.lines} />}

      <Section title="The run">
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
              defaultValue={values("environment") || "outdoor"}
              columns={2}
            />
          </Field>

          <DistanceField
            value={distance}
            unit={unit}
            onValueChange={setDistance}
            onUnitChange={setUnit}
            units={DISTANCE_UNITS}
            error={state.fieldErrors?.distance ?? state.fieldErrors?.distanceValue}
          />

          <Field
            group
            label="Duration"
            error={state.fieldErrors?.duration ?? state.fieldErrors?.minutes}
          >
            <div className="grid grid-cols-3 gap-2">
              <Field label="Hours">
                <Input
                  name="hours"
                  inputMode="numeric"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Minutes">
                <Input
                  name="minutes"
                  inputMode="numeric"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  placeholder="30"
                />
              </Field>
              <Field label="Seconds">
                <Input
                  name="seconds"
                  inputMode="numeric"
                  value={seconds}
                  onChange={(event) => setSeconds(event.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
          </Field>

          {pace !== null && (
            <p role="status" className="text-sm text-ink-muted tabular-nums">
              Pace {formatPaceSeconds(pace)} /km
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
          <Field label="Surface" hint="Optional" error={state.fieldErrors?.surface}>
            <Input name="surface" defaultValue={values("surface")} placeholder="Road, trail…" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Elevation gain m" error={state.fieldErrors?.elevationGainMetres}>
              <Input
                name="elevationGainMetres"
                inputMode="decimal"
                defaultValue={values("elevationGainMetres")}
                placeholder="—"
              />
            </Field>
            <Field label="Incline %" error={state.fieldErrors?.treadmillInclinePercent}>
              <Input
                name="treadmillInclinePercent"
                inputMode="decimal"
                defaultValue={values("treadmillInclinePercent")}
                placeholder="—"
              />
            </Field>
          </div>
          <Field label="Cadence steps/min" error={state.fieldErrors?.cadenceStepsPerMinute}>
            <Input
              name="cadenceStepsPerMinute"
              inputMode="decimal"
              defaultValue={values("cadenceStepsPerMinute")}
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
