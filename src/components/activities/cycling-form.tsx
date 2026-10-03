"use client";

import { useActionState, useState, type ReactNode } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { IconChoice } from "@/components/ui/icon-choice";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatSpeed, speedMetresPerSecond } from "@/domain/activity-metrics";
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
  { value: "outdoor", label: "Outdoor", glyph: "outdoor" },
  { value: "indoor", label: "Indoor", glyph: "trainer" },
] as const;

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
  /** The draft kept on this device, said after the last field. */
  notice?: ReactNode;
};

export function CyclingForm({
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
    distance.trim() === ""
      ? null
      : toMetres(Number(distance.replace(",", ".")), unit as "km" | "mi");
  const speed = metres === null ? null : speedMetresPerSecond(metres, durationMs);
  const errors = state.fieldErrors;

  // Board Log a ride: where, the time, the distance if it is known and the speed it makes, how
  // hard it felt and whether it was assisted; everything optional behind one row; Save.
  return (
    <form action={formAction}>
      <input type="hidden" name="sport" value="cycling" />
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
          defaultValue={values("environment") || "outdoor"}
        />
      </div>
      <div className="mt-1.5">
        <DurationField
          value={duration}
          onChange={setDuration}
          error={errors?.duration ?? errors?.hours ?? errors?.minutes ?? errors?.seconds}
        />
        <DistanceField
          value={distance}
          unit={unit}
          onValueChange={setDistance}
          onUnitChange={setUnit}
          units={DISTANCE_UNITS}
          hint={
            speed !== null ? (
              <span role="status">
                Optional · overall average {formatSpeed(speed, unit as "km" | "mi")}
              </span>
            ) : (
              "Optional"
            )
          }
          error={errors?.distance ?? errors?.distanceValue}
        />
        <EffortField value={values("effort")} error={errors?.effort} />
        <div className="space-y-1.5 pt-3 pb-1">
          <p id="ride-assistance" className="type-meta-small font-bold">
            Assistance
          </p>
          <SegmentedControl
            name="assistance"
            aria-labelledby="ride-assistance"
            options={ASSISTANCE}
            defaultValue={values("assistance") || "unknown"}
            columns={3}
          />
          {errors?.assistance && (
            <p role="alert" className="type-meta-small font-semibold">
              {errors.assistance}
            </p>
          )}
        </div>
      </div>

      <MoreDetails
        hasErrors={[
          "startedAt",
          "startedAtOffsetMinutes",
          "recordedTimeZone",
          "averagePowerWatts",
          "averageCadenceRpm",
          "elevationGainMetres",
          "averageHeartRate",
          "maxHeartRate",
          "title",
          "notes",
        ].some((field) => Boolean(errors?.[field]))}
      >
        <ActivityStartFields values={values} errors={errors} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Average power W" error={errors?.averagePowerWatts}>
            <Input
              name="averagePowerWatts"
              inputMode="decimal"
              defaultValue={values("averagePowerWatts")}
              placeholder="—"
            />
          </Field>
          <Field label="Average cadence rpm" error={errors?.averageCadenceRpm}>
            <Input
              name="averageCadenceRpm"
              inputMode="decimal"
              defaultValue={values("averageCadenceRpm")}
              placeholder="—"
            />
          </Field>
        </div>
        <Field label="Elevation gain m" error={errors?.elevationGainMetres}>
          <Input
            name="elevationGainMetres"
            inputMode="decimal"
            defaultValue={values("elevationGainMetres")}
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
