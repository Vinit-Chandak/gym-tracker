"use client";

import { useActionState, useState, type ReactNode } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { IconChoice } from "@/components/ui/icon-choice";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { Select } from "@/components/ui/select";
import { formatPaceSeconds, paceSecondsPerKm, pacePerUnit } from "@/domain/activity-metrics";
import { RUN_TYPE_LABELS, RUN_TYPES, type RunType } from "@/domain/run-types";
import { toMetres, type DistanceUnit } from "@/lib/distance-units";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import type { PlannedLap } from "@/lib/run-laps";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

import {
  ActivityIdentityFields,
  ActivityStartFields,
  DistanceField,
  DurationField,
  durationFromParts,
  EffortField,
  ElevationField,
  HeartRateFields,
  LargeEntryConfirmation,
  MoreDetails,
  NotesFields,
  openDistance,
  parseDuration,
  postedDistance,
  TargetCard,
  useFormValues,
  type ActivityFormValues,
  type PlanTarget,
} from "./activity-form-fields";
import { LapsEditor } from "./laps-editor";

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

/** Offered, not imposed: a surface is still the athlete's own words where these do not fit. */
const SURFACES = ["Road", "Trail", "Track", "Grass", "Sand", "Mixed"];

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: ActivityFormValues;
  submissionKey: string;
  /** The occurrence being logged, with the revision pinned when the form opened. */
  occurrence?: { id: string; revisionId: string; planId?: string | null } | null;
  /** What the plan asked for, kept beside the form rather than inside it. */
  target?: PlanTarget | null;
  expectedRevision?: number | null;
  submitLabel: string;
  /** The draft kept on this device, said after the last field. */
  notice?: ReactNode;
  /** A correction's unconfirmed legacy effort, which stays unless another answer is chosen. */
  keptEffort?: { value: number | null } | null;
  /** Opens the folded details from the start, when something in them needs reading. */
  openDetails?: boolean;
  /** The unit the athlete reads runs in, which a recorded run opens in. */
  readIn?: DistanceUnit;
  /** The planned session's steps, which the laps can be laid out from (ADR 0059). */
  plannedLaps?: readonly PlannedLap[];
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
  keptEffort = null,
  openDetails = false,
  readIn,
  plannedLaps = [],
}: Props) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const values = useFormValues(state, initial);
  // A run entered in kilometres opens in miles for a miles runner, and the other way round.
  const [opened] = useState(() =>
    openDistance(values("distanceValue"), values("distanceUnit") || readIn || "km", readIn),
  );
  const [distance, setDistance] = useState(opened.value);
  const [unit, setUnit] = useState(opened.unit);
  const posted = postedDistance(distance, unit, opened.recorded);
  const [duration, setDuration] = useState(() =>
    durationFromParts(values("hours"), values("minutes"), values("seconds")),
  );

  const durationMs = (parseDuration(duration) ?? 0) * 1000;
  const metres =
    posted.value.trim() === ""
      ? 0
      : toMetres(Number(posted.value.replace(",", ".")), posted.unit as "km" | "mi");
  // Pace per the unit the distance is being typed in: miles make a pace per mile.
  const pace = Number.isFinite(metres)
    ? pacePerUnit(paceSecondsPerKm(metres, durationMs), unit as "km" | "mi")
    : null;
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
          <TargetCard {...target} />
        </div>
      )}

      <div className="mt-3">
        <IconChoice
          name="environment"
          options={ENVIRONMENTS}
          defaultValue={values("environment") || "outdoor"}
        />
      </div>
      {/* What kind of run it was: a planned session's own kind to start with, which is context
          and not a measurement, and anything the athlete chooses instead (ADR 0059). */}
      <div className="mt-1.5">
        <Field label="Kind of run" aside="Optional" error={errors?.runType}>
          <Select name="runType" defaultValue={values("runType")}>
            <option value="">Not said</option>
            {RUN_TYPES.map((type: RunType) => (
              <option key={type} value={type}>
                {RUN_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-1.5">
        <DistanceField
          value={distance}
          unit={unit}
          onValueChange={setDistance}
          onUnitChange={setUnit}
          units={DISTANCE_UNITS}
          recorded={opened.recorded}
          error={errors?.distance ?? errors?.distanceValue}
        />
        <DurationField
          value={duration}
          onChange={setDuration}
          recorded={{
            hours: values("hours"),
            minutes: values("minutes"),
            seconds: values("seconds"),
          }}
          hint={
            pace !== null ? (
              <span role="status">
                Pace {formatPaceSeconds(pace)} /{unit === "mi" ? "mi" : "km"}
              </span>
            ) : undefined
          }
          error={errors?.duration ?? errors?.hours ?? errors?.minutes ?? errors?.seconds}
        />
        <EffortField value={values("effort")} error={errors?.effort} kept={keptEffort} />
      </div>

      <LapsEditor
        initial={values("laps")}
        planned={plannedLaps}
        readIn={(readIn ?? "km") as DistanceUnit}
        totalMs={durationMs}
        error={errors?.laps}
      />

      <MoreDetails
        defaultOpen={openDetails}
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
        <Field label="Surface" aside="Optional" error={errors?.surface}>
          <Input
            name="surface"
            list="run-surfaces"
            defaultValue={values("surface")}
            placeholder="Road, trail, track…"
          />
        </Field>
        <datalist id="run-surfaces">
          {SURFACES.map((surface) => (
            <option key={surface} value={surface} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-2">
          <ElevationField values={values} errors={errors} readIn={readIn} />
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
            inputMode="numeric"
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
