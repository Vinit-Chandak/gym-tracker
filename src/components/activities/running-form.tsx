"use client";

import { useActionState, useState, type ReactNode } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { IconChoice } from "@/components/ui/icon-choice";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { formatPaceSeconds, paceSecondsPerKm } from "@/domain/activity-metrics";
import { toMetres } from "@/lib/distance-units";
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
  parseDuration,
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
  { value: "outdoor", label: "Outdoor", glyph: "outdoor" },
  { value: "treadmill", label: "Treadmill", glyph: "treadmill" },
] as const;

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
  /** The draft kept on this device, said after the last field. */
  notice?: ReactNode;
};

export function RunningForm({
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
  const [distance, setDistance] = useState(() => values("distanceValue"));
  const [unit, setUnit] = useState(() => values("distanceUnit") || "km");
  const [duration, setDuration] = useState(() =>
    durationFromParts(values("hours"), values("minutes"), values("seconds")),
  );

  const durationMs = (parseDuration(duration) ?? 0) * 1000;
  const metres =
    distance.trim() === "" ? 0 : toMetres(Number(distance.replace(",", ".")), unit as "km" | "mi");
  const pace = Number.isFinite(metres) ? paceSecondsPerKm(metres, durationMs) : null;
  const errors = state.fieldErrors;

  // Board Log a run: what the plan asked for, where, the distance and the time with the pace
  // they make, how hard it felt; everything optional behind one row; Save at the foot.
  return (
    <form action={formAction}>
      <input type="hidden" name="sport" value="running" />
      <input type="hidden" name="outcome" value={values("outcome") || "logged"} />
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
          defaultValue={values("environment") || "outdoor"}
        />
      </div>
      <div className="mt-1.5">
        <DistanceField
          value={distance}
          unit={unit}
          onValueChange={setDistance}
          onUnitChange={setUnit}
          units={DISTANCE_UNITS}
          error={errors?.distance ?? errors?.distanceValue}
        />
        <DurationField
          value={duration}
          onChange={setDuration}
          hint={
            pace !== null ? (
              <span role="status">Pace {formatPaceSeconds(pace)} /km</span>
            ) : undefined
          }
          error={errors?.duration ?? errors?.hours ?? errors?.minutes ?? errors?.seconds}
        />
        <EffortField value={values("effort")} error={errors?.effort} />
      </div>

      <MoreDetails
        hasErrors={[
          "startedAt",
          "startedAtOffsetMinutes",
          "recordedTimeZone",
          "surface",
          "elevationGainMetres",
          "treadmillInclinePercent",
          "cadenceStepsPerMinute",
          "averageHeartRate",
          "maxHeartRate",
          "title",
          "notes",
        ].some((field) => Boolean(errors?.[field]))}
      >
        <ActivityStartFields values={values} errors={errors} />
        <Field label="Surface" hint="Optional" error={errors?.surface}>
          <Input name="surface" defaultValue={values("surface")} placeholder="Road, trail…" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Elevation gain m" error={errors?.elevationGainMetres}>
            <Input
              name="elevationGainMetres"
              inputMode="decimal"
              defaultValue={values("elevationGainMetres")}
              placeholder="—"
            />
          </Field>
          <Field label="Incline %" error={errors?.treadmillInclinePercent}>
            <Input
              name="treadmillInclinePercent"
              inputMode="decimal"
              defaultValue={values("treadmillInclinePercent")}
              placeholder="—"
            />
          </Field>
        </div>
        <Field label="Cadence steps/min" error={errors?.cadenceStepsPerMinute}>
          <Input
            name="cadenceStepsPerMinute"
            inputMode="decimal"
            defaultValue={values("cadenceStepsPerMinute")}
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
