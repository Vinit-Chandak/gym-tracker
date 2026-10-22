"use client";

import { useActionState, useState, type ReactNode } from "react";

import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { IconChoice } from "@/components/ui/icon-choice";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { Select } from "@/components/ui/select";
import {
  formatPaceSeconds,
  formatRunTime,
  formatRunTotal,
  lapsFurtherThan,
  lapsDistance,
  lapsLongerThan,
  lapsMakeIntervals,
  lapsTime,
  lapTotals,
  paceSecondsPerKm,
  pacePerUnit,
  repPace,
} from "@/domain/activity-metrics";
import { DURATION_MS } from "@/domain/activity-limits";
import { hasBreaks } from "@/domain/run-segments";
import { RUN_TYPE_LABELS, RUN_TYPES, type RunType } from "@/domain/run-types";
import { fromMetres, roundTo, toMetres, type DistanceUnit } from "@/lib/distance-units";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { postedLapFigures, type PlannedLap } from "@/lib/run-laps";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

import {
  ActivityIdentityFields,
  ActivityStartFields,
  DistanceField,
  DurationField,
  durationFromParts,
  EffortField,
  ElevationField,
  formatDuration,
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
import { LapsEditor, lapRowsFrom, postedLap } from "./laps-editor";

/**
 * Logging a run, on the shared routes (plan §4.3).
 *
 * What running always asked for, unchanged: a distance, a duration, outdoor or treadmill, and
 * the pace that follows from the two numbers actually recorded. What is new is that the
 * effort question has an honest second answer, and that the optional detail a more
 * experienced runner wants is one tap away rather than absent.
 *
 * A run entered as laps is not asked for its totals again (PRODUCT.md, principle 7): its
 * distance and time are the laps added up, each marked From laps, until the athlete chooses to
 * type the watch's own; reps with recoveries between them make it Intervals until another kind
 * is chosen; and the reps' pace leads, the session's own pace said only as Overall, with rests.
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

/** The opening of the sentence a total short of its laps is refused with. */
const SHORT_OF_LAPS = "The laps add up to";
/** What a run with no distance is refused with (`validateActual`). */
const NO_DISTANCE = "Enter how far you ran.";

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

/** A typed figure in metres, or none where it is blank or not a number. */
function typedMetres(value: string, unit: string): number | null {
  const figure = Number(value.replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(figure) || figure < 0) return null;
  return toMetres(figure, unit === "mi" ? "mi" : "km");
}

/** "3.47": a distance the laps add up to, as the distance field holds a figure. */
function distanceFigure(metres: number, unit: string): string {
  return roundTo(fromMetres(metres, unit === "mi" ? "mi" : "km"), 2).toFixed(2);
}

/**
 * A total the laps add up to, in the row its field takes when it is typed (board Log a run):
 * read, not typed, and marked From laps. The figure lines up with the steppers' around it. While
 * a lap is still missing its part the total is unknown: a dash, and what is missing.
 */
function FromLapsRow({
  label,
  figure,
  unit,
  missing,
  error,
}: {
  label: string;
  /** Null while the laps hold the total only in part. */
  figure: string | null;
  unit?: string;
  missing: string;
  error?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="row-stepper"
      data-field-error={error ? "true" : undefined}
    >
      <span className="row-stepper-text">
        <span
          className={cn(
            "flex items-center gap-1.5 font-bold [overflow-wrap:break-word]",
            error && "text-danger-text",
          )}
        >
          {error && <Glyph name="warn" className="glyph-16 text-danger-glyph" />}
          {label}
        </span>
        <span className="row-stepper-hint">From laps</span>
        {figure === null && <span className="row-stepper-hint">{missing}</span>}
        {error && (
          <span role="alert" className="type-meta-small font-semibold">
            {error}
          </span>
        )}
      </span>
      <span className="row-stepper-control">
        <span aria-hidden className="round-button invisible" />
        <span className="row-stepper-figure cursor-default">
          <span className="type-figure-l tabular-nums">{figure ?? "—"}</span>
          {unit && figure !== null && <span className="row-stepper-unit">{unit}</span>}
        </span>
        <span aria-hidden className="round-button invisible" />
      </span>
    </div>
  );
}

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
  // A refused save keeps every value and choice, a select's included (PRODUCT.md, principle 8).
  const form = useKeptForm();
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
  const [runType, setRunType] = useState(() => values("runType"));
  const [rows, setRows] = useState(() => lapRowsFrom(values("laps")));
  // The laps as they stood when the last save was sent, which its lap sentences name.
  const [submitted, setSubmitted] = useState<string[]>([]);
  // "Use the watch's totals instead": both totals typed, whatever the laps add up to.
  const [watchTotals, setWatchTotals] = useState(false);

  const figures = rows.map((row) => postedLapFigures(postedLap(row)));
  const sums = lapTotals(figures);
  // What the laps hold whole. A rep with no distance or a lap with no time leaves that total
  // unknown, a dash, never the laps it has (PRODUCT.md, principle 4).
  const lapMetres = lapsDistance(sums);
  const lapMs = lapsTime(sums);
  // A total the athlete has not typed is the laps', once any lap holds a part of it; laps that
  // hold none of it (timed reps with no distance) leave it to be typed, as a run without laps.
  const distanceFromLaps = !watchTotals && distance.trim() === "" && sums.metres > 0;
  const timeFromLaps = !watchTotals && duration.trim() === "" && sums.durationMs > 0;
  const typedDistance = typedMetres(posted.value, posted.unit);
  const typedMs = (parseDuration(duration) ?? 0) * 1000;
  const metres = distanceFromLaps ? (lapMetres ?? 0) : (typedDistance ?? 0);
  const durationMs = timeFromLaps ? (lapMs ?? 0) : typedMs;
  const paceUnit: DistanceUnit = unit === "mi" ? "mi" : "km";
  // Pace per the unit the distance is read in: miles make a pace per mile.
  const pace = pacePerUnit(paceSecondsPerKm(metres, durationMs), paceUnit);
  // Reps with recoveries are intervals until the athlete chooses another kind (DESIGN.md).
  const inferredKind = runType === "" && lapsMakeIntervals(figures);
  // Whether the run's own pace has rests in it, by the rule every reader of a run uses (ADR
  // 0062): a session run in pieces, or any lap marked recovery. Its reps' pace then leads.
  const rests = hasBreaks({
    runType: inferredKind ? "intervals" : ((runType || null) as RunType | null),
    laps: figures,
  });
  const reps = repPace(figures);

  const errors = state.fieldErrors;
  // A total short of its laps is said as it now stands, and no longer once it is not short:
  // the field stays red until it can be saved, and its fix is the laps' own figure.
  const distanceShort =
    !distanceFromLaps && typedDistance !== null && lapsFurtherThan(sums.metres, typedDistance);
  const timeShort = !timeFromLaps && lapsLongerThan(sums.durationMs, typedMs, rows.length);
  const refusedDistance = errors?.distance ?? errors?.distanceValue;
  const distanceError = refusedDistance?.startsWith(SHORT_OF_LAPS)
    ? distanceShort
      ? `${SHORT_OF_LAPS} ${formatRunTotal(sums.metres, paceUnit)}, more than ${formatRunTotal(typedDistance!, paceUnit)}.`
      : undefined
    : refusedDistance && distanceFromLaps
      ? lapMetres === null
        ? // Refused while a lap is missing its distance: the way on is that lap, or the watch's.
          "Give every lap its distance, or use the watch’s totals."
        : // Whole now: a distance asked for is there, so it can be saved and is no longer red.
          refusedDistance === NO_DISTANCE
          ? undefined
          : refusedDistance
      : refusedDistance;
  const refusedTime = errors?.duration ?? errors?.hours ?? errors?.minutes ?? errors?.seconds;
  const durationError = refusedTime?.startsWith(SHORT_OF_LAPS)
    ? timeShort
      ? `${SHORT_OF_LAPS} ${formatRunTime(sums.durationMs)}, longer than ${formatRunTime(typedMs)}.`
      : undefined
    : refusedTime && timeFromLaps
      ? lapMs === null
        ? "Give every lap its time, or use the watch’s totals."
        : lapMs <= DURATION_MS.max
          ? undefined
          : refusedTime
      : refusedTime;
  const lapsCanTotal = sums.metres > 0 || sums.durationMs > 0;

  function takeWatchTotals() {
    // The watch's figures start from the laps' where they hold them, so only what differs is
    // typed; a total they hold in part starts blank.
    if (distance.trim() === "" && lapMetres !== null) setDistance(distanceFigure(lapMetres, unit));
    if (duration.trim() === "" && lapMs !== null)
      setDuration(formatDuration(Math.round(lapMs / 1000)));
    setWatchTotals(true);
  }
  function takeLapTotals() {
    if (sums.metres > 0) setDistance("");
    if (sums.durationMs > 0) setDuration("");
    setWatchTotals(false);
  }

  // Board Log a run: what the plan asked for, where, the distance and the time with the pace
  // they make, how hard it felt; everything optional behind one row; Save at the foot.
  return (
    // Its sections stand as panels on the grouped ground (DESIGN.md, Layout: Forms).
    <form
      ref={form}
      action={formAction}
      className="ov-grouped"
      onSubmit={() => setSubmitted(rows.map((row) => row.key))}
    >
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
      <div className="ov-panel ov-panel-body mt-3">
        <Field
          label="Kind of run"
          aside="Optional"
          hint={inferredKind ? "From laps" : undefined}
          error={errors?.runType}
        >
          <Select
            name="runType"
            value={inferredKind ? "intervals" : runType}
            onChange={(event) => setRunType(event.target.value)}
          >
            <option value="">Not said</option>
            {RUN_TYPES.map((type: RunType) => (
              <option key={type} value={type}>
                {RUN_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        {distanceFromLaps ? (
          <>
            {/* Nothing typed: the server adds the laps up in the unit the athlete runs in. */}
            <input type="hidden" name="distanceUnit" value={unit} />
            <input type="hidden" name="distanceValue" value="" />
            <FromLapsRow
              label="Distance"
              figure={lapMetres === null ? null : distanceFigure(lapMetres, unit)}
              unit={unit}
              missing="Not every lap has a distance"
              error={distanceError}
            />
          </>
        ) : (
          <DistanceField
            value={distance}
            unit={unit}
            onValueChange={setDistance}
            onUnitChange={setUnit}
            units={DISTANCE_UNITS}
            recorded={opened.recorded}
            error={distanceError}
          />
        )}
        {distanceError && distanceShort && (
          <button
            type="button"
            className="text-action"
            onClick={() => setDistance(distanceFigure(sums.metres, unit))}
          >
            Use {formatRunTotal(sums.metres, paceUnit)}
          </button>
        )}
        {timeFromLaps ? (
          <>
            <input type="hidden" name="hours" value="" />
            <input type="hidden" name="minutes" value="" />
            <input type="hidden" name="seconds" value="" />
            <FromLapsRow
              label="Duration"
              figure={lapMs === null ? null : formatRunTime(lapMs)}
              missing="Not every lap has a time"
              error={durationError}
            />
          </>
        ) : (
          <DurationField
            value={duration}
            onChange={setDuration}
            recorded={{
              hours: values("hours"),
              minutes: values("minutes"),
              seconds: values("seconds"),
            }}
            hint={
              rows.length === 0 && pace !== null ? (
                <span role="status">
                  Pace {formatPaceSeconds(pace)} /{paceUnit}
                </span>
              ) : undefined
            }
            error={durationError}
          />
        )}
        {durationError && timeShort && (
          <button
            type="button"
            className="text-action"
            onClick={() => setDuration(formatDuration(Math.round(sums.durationMs / 1000)))}
          >
            Use {formatRunTime(sums.durationMs)}
          </button>
        )}
        {/* With laps, the pace that counts: for reps with rests their own, the whole said only
            as overall, with rests (DESIGN.md, Laps and intervals). */}
        {rows.length > 0 && ((rests && reps !== null) || pace !== null) && (
          <div role="status" className="border-b border-hair py-2.5 type-meta tabular-nums">
            {rests && reps && (
              <p className="flex items-baseline justify-between gap-3 font-bold">
                <span>
                  Rep pace, {reps.reps} {reps.reps === 1 ? "rep" : "reps"}
                </span>
                <span>
                  {formatPaceSeconds(pacePerUnit(reps.secondsPerKm, paceUnit))} /{paceUnit}
                </span>
              </p>
            )}
            {pace !== null && (
              <p
                className={
                  rests
                    ? "flex items-baseline justify-between gap-3 text-ink-2"
                    : "flex items-baseline justify-between gap-3"
                }
              >
                <span>{rests ? "Overall, with rests" : "Pace"}</span>
                <span>
                  {formatPaceSeconds(pace)} /{paceUnit}
                </span>
              </p>
            )}
          </div>
        )}
        {(distanceFromLaps || timeFromLaps) && (
          <button type="button" className="text-action" onClick={takeWatchTotals}>
            Use the watch’s totals instead
          </button>
        )}
        {!distanceFromLaps && !timeFromLaps && lapsCanTotal && (
          <button type="button" className="text-action" onClick={takeLapTotals}>
            Use the laps’ totals
          </button>
        )}
      </div>
      <div className="ov-panel ov-panel-body mt-3">
        <EffortField value={values("effort")} error={errors?.effort} kept={keptEffort} />
      </div>

      <div className="ov-panel ov-panel-body mt-3">
        <LapsEditor
          rows={rows}
          onRowsChange={setRows}
          planned={plannedLaps}
          readIn={(readIn ?? "km") as DistanceUnit}
          errors={errors}
          submitted={submitted}
          missing={{
            distance: Boolean(refusedDistance) && distanceFromLaps && lapMetres === null,
            time: Boolean(refusedTime) && timeFromLaps && lapMs === null,
          }}
          totalMs={timeFromLaps ? undefined : typedMs}
        />
      </div>

      <div className="ov-panel ov-panel-body mt-3">
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
      </div>

      {notice}

      <PinnedActions stack>
        <FormError message={state.formError} />
        <LargeEntryConfirmation message={state.formError} />
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </PinnedActions>
    </form>
  );
}
