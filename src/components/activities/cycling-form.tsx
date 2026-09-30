"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatSpeed, speedMetresPerSecond } from "@/domain/activity-metrics";
import { toMetres } from "@/lib/distance-units";
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
  Readout,
  TargetCard,
  useFormValues,
  type ActivityFormValues,
} from "./activity-form-fields";

/**
 * Logging a ride (plan §4.4).
 *
 * Duration is the one thing a ride always has. Distance is optional, because an indoor ride
 * frequently has none worth recording, and an unknown distance stays unknown rather than
 * becoming a zero — which is why no speed appears for it either.
 *
 * Assistance has three answers, and "unknown" is one of them. An e-bike ride and an unpowered
 * one are not the same effort, and nothing here quietly assumes the second.
 */

const ENVIRONMENTS = [
  { value: "outdoor", label: "Outdoor" },
  { value: "indoor", label: "Indoor" },
];

const ASSISTANCE = [
  { value: "unknown", label: "Not sure" },
  { value: "unassisted", label: "Unassisted" },
  { value: "assisted", label: "Assisted" },
];

const DISTANCE_UNITS = [
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
];

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: ActivityFormValues;
  submissionKey: string;
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  target?: { title: string; lines: string[] } | null;
  expectedRevision?: number | null;
  submitLabel: string;
};

export function CyclingForm({
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
  const [hours, setHours] = useState(() => values("hours"));
  const [minutes, setMinutes] = useState(() => values("minutes"));
  const [seconds, setSeconds] = useState(() => values("seconds"));

  const durationMs =
    (Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0)) * 1000;
  const metres =
    distance.trim() === ""
      ? null
      : toMetres(Number(distance.replace(",", ".")), unit as "km" | "mi");
  const speed = metres === null ? null : speedMetresPerSecond(metres, durationMs);
  // "24.5 km/h": the figure in the display face, its unit beside it.
  const [speedFigure, speedUnit] =
    speed === null ? [] : formatSpeed(speed, unit as "km" | "mi").split(" ");

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <input type="hidden" name="sport" value="cycling" />
      <input type="hidden" name="outcome" value={values("outcome") || "logged"} />
      <input type="hidden" name="resourceId" value={values("resourceId")} />
      <ActivityIdentityFields
        submissionKey={submissionKey}
        occurrence={occurrence}
        expectedRevision={expectedRevision}
      />
      {target && <TargetCard sport="cycling" title={target.title} lines={target.lines} />}

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
      </Card>

      <Card className="space-y-4">
        <DurationField
          label="Duration"
          error={
            state.fieldErrors?.duration ??
            state.fieldErrors?.hours ??
            state.fieldErrors?.minutes ??
            state.fieldErrors?.seconds
          }
          parts={[
            {
              name: "hours",
              label: "Hours",
              suffix: "h",
              placeholder: "1",
              value: hours,
              onChange: setHours,
            },
            {
              name: "minutes",
              label: "Minutes",
              suffix: "min",
              placeholder: "30",
              value: minutes,
              onChange: setMinutes,
            },
            {
              name: "seconds",
              label: "Seconds",
              suffix: "s",
              placeholder: "0",
              value: seconds,
              onChange: setSeconds,
            },
          ]}
        />
        <DistanceField
          value={distance}
          unit={unit}
          onValueChange={setDistance}
          onUnitChange={setUnit}
          units={DISTANCE_UNITS}
          hint="Optional"
          info="Leave it blank if you do not know. Without a distance there is no speed to work out, and none is guessed."
          error={state.fieldErrors?.distance ?? state.fieldErrors?.distanceValue}
        />
        {speedFigure && (
          <Readout sport="cycling" label="Overall average" value={speedFigure} unit={speedUnit} />
        )}
      </Card>

      <Section title="Effort">
        <Card>
          <EffortField value={values("effort")} error={state.fieldErrors?.effort} />
          <Field group label="Assistance" error={state.fieldErrors?.assistance}>
            <SegmentedControl
              name="assistance"
              aria-label="Assistance"
              options={ASSISTANCE}
              defaultValue={values("assistance") || "unknown"}
              columns={3}
            />
          </Field>
        </Card>
      </Section>

      <MoreDetails
        hasErrors={[
          "averagePowerWatts",
          "averageCadenceRpm",
          "elevationGainMetres",
          "averageHeartRate",
          "maxHeartRate",
        ].some((field) => Boolean(state.fieldErrors?.[field]))}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Average power W" error={state.fieldErrors?.averagePowerWatts}>
            <Input
              name="averagePowerWatts"
              inputMode="decimal"
              defaultValue={values("averagePowerWatts")}
              placeholder="—"
            />
          </Field>
          <Field label="Average cadence rpm" error={state.fieldErrors?.averageCadenceRpm}>
            <Input
              name="averageCadenceRpm"
              inputMode="decimal"
              defaultValue={values("averageCadenceRpm")}
              placeholder="—"
            />
          </Field>
        </div>
        <Field label="Elevation gain m" error={state.fieldErrors?.elevationGainMetres}>
          <Input
            name="elevationGainMetres"
            inputMode="decimal"
            defaultValue={values("elevationGainMetres")}
            placeholder="—"
          />
        </Field>
        <HeartRateFields values={values} errors={state.fieldErrors} />
      </MoreDetails>

      <NotesFields values={values} errors={state.fieldErrors} />

      <div className="space-y-2">
        <LargeEntryConfirmation message={state.formError} />
        <FormError message={state.formError} />
        <SubmitButton tone="ride" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
