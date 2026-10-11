"use client";

import { useId, useState, type ReactNode } from "react";

import { FigureText } from "@/components/ui/figure-text";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input, Textarea } from "@/components/ui/input";
import { RowStepper } from "@/components/ui/row-stepper";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import {
  climbIn,
  climbUnit,
  entryIn,
  LENGTH_UNITS,
  METRES_PER_FOOT,
  roundTo,
  type DistanceUnit,
  type LengthUnit,
} from "@/lib/distance-units";
import { FACT_SEPARATOR } from "@/lib/facts";
import { dateTimeLocalCandidates, formatUtcOffset, timeZoneOffsetMinutes } from "@/lib/time";
import { DECIMALS, EFFORT, TEXT_LIMITS } from "@/domain/activity-limits";
import type { FormState } from "@/server/validation/form";

/**
 * The parts every endurance form shares (plan §4.1).
 *
 * Only the mechanics are shared: when it happened, how hard it felt, what the athlete wants
 * to remember, and the way optional detail is folded away. The measurements themselves are
 * each sport's own, because a pool length is not a cadence and a run has no assistance.
 *
 * Nothing here prefills a performance. Opening a plan shows what was asked for beside the
 * form, never inside the boxes that are about to record what actually happened (ACTUAL-01).
 */

export type ActivityFormValues = Record<string, string>;

export function useFormValues(state: FormState, initial: ActivityFormValues) {
  return (key: string): string => state.values?.[key] ?? initial[key] ?? "";
}

/** Native date/time input, with an explicit choice only when clocks repeat that time. */
export function ActivityStartFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  const [local, setLocal] = useState(() => values("startedAt"));
  const [offset, setOffset] = useState(() => values("startedAtOffsetMinutes"));
  const timeZone = values("recordedTimeZone") || "UTC";
  const choices = dateTimeLocalCandidates(local, timeZone);
  return (
    <>
      <input type="hidden" name="recordedTimeZone" value={timeZone} />
      <Field
        label="When"
        hint={`Date and time in ${timeZone}.`}
        error={
          errors?.startedAt ??
          errors?.recordedTimeZone ??
          (choices.length <= 1 ? errors?.startedAtOffsetMinutes : undefined)
        }
      >
        <Input
          name="startedAt"
          type="datetime-local"
          value={local}
          onChange={(event) => {
            setLocal(event.target.value);
            setOffset("");
          }}
          required
        />
      </Field>
      {choices.length > 1 ? (
        <Field
          label="Which time?"
          hint="Clocks go back here, so this time happens twice. Choose when you started."
          error={errors?.startedAtOffsetMinutes}
        >
          <Select
            name="startedAtOffsetMinutes"
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
            required
          >
            <option value="">Choose the first or second time</option>
            {choices.map((instant, index) => {
              const minutes = timeZoneOffsetMinutes(timeZone, instant);
              return (
                <option key={minutes} value={minutes}>
                  {index === 0 ? "First" : "Second"} occurrence ({formatUtcOffset(minutes)})
                </option>
              );
            })}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="startedAtOffsetMinutes" value="" />
      )}
    </>
  );
}

/**
 * 1 to 5, or the answer that says the athlete does not know.
 *
 * Five steps and "Not sure" make six pills, which is one row on a phone. The scale came down
 * from ten because ten asked for a precision nobody reports consistently: nothing was gained
 * by offering a 6 and a 7 that the same run could honestly be given either of.
 */
const EFFORT_OPTIONS = [
  ...Array.from({ length: EFFORT.max }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  })),
  { value: "unsure", label: "Not sure" },
];

/** A distance as it was entered: the figure as typed, and the unit it was typed in. */
export type DistanceEntry = { value: string; unit: string };

const isLengthUnit = (unit: string): unit is LengthUnit =>
  (LENGTH_UNITS as readonly string[]).includes(unit);

/** The figure an entry comes to in `unit` (`entryIn`), or null where it is not a distance. */
function entryFigure(entry: DistanceEntry, unit: string): { value: string; exact: boolean } | null {
  if (entry.unit === unit) return { value: entry.value, exact: true };
  const typed = Number(entry.value.replace(",", "."));
  if (entry.value.trim() === "" || !Number.isFinite(typed)) return null;
  if (!isLengthUnit(entry.unit) || !isLengthUnit(unit)) return null;
  const read = entryIn(typed, entry.unit, unit);
  return { value: String(read.value), exact: read.exact };
}

/**
 * A recorded distance as a form opens on it: in the athlete's own unit for the sport (`readIn`:
 * the pool's for a swim, the road's for a run or a ride), whatever unit it was entered in, with
 * the entry kept beside it (`recorded`). A blank distance opens in their unit too. Without a
 * unit to read in, it opens as it was entered.
 */
export function openDistance(
  value: string,
  unit: string,
  readIn: string | undefined,
): DistanceEntry & { recorded: DistanceEntry | null } {
  if (!readIn || unit === readIn) return { value, unit, recorded: null };
  if (value.trim() === "") return { value, unit: readIn, recorded: null };
  const read = entryFigure({ value, unit }, readIn);
  return read
    ? { value: read.value, unit: readIn, recorded: { value, unit } }
    : { value, unit, recorded: null };
}

/**
 * What a distance field posts: the recorded entry while the figure still reads as the form
 * opened on it, so correcting the notes of a swim entered in metres converts nothing; what is
 * typed, in the unit beside it, once either is changed. `note` says the entry where the figure
 * on screen is only near it ("1640 yd" for 1,500 m).
 */
export function postedDistance(
  value: string,
  unit: string,
  recorded: DistanceEntry | null | undefined,
): DistanceEntry & { note: string | null } {
  const read = recorded ? entryFigure(recorded, unit) : null;
  if (!recorded || !read || read.value !== value) return { value, unit, note: null };
  const figure = Number(recorded.value.replace(",", ".")).toLocaleString("en-GB", {
    maximumFractionDigits: DECIMALS.distance,
  });
  return {
    ...recorded,
    note: read.exact ? null : `Entered as ${figure}\u00a0${recorded.unit}`,
  };
}

/**
 * A distance and the unit it was entered in, as a figure in a row (boards Log a run, a ride):
 * − and + by a tenth, the unit beside the figure, pressing it says the distance in the other.
 * Both are stored; neither is re-derived. A recorded distance opened in another unit
 * (`openDistance`) is posted as it was entered until it is changed, and says what that was.
 */
export function DistanceField({
  value,
  unit,
  onValueChange,
  onUnitChange,
  units,
  error,
  label = "Distance",
  hint,
  step = 0.1,
  name = "distanceValue",
  unitName = "distanceUnit",
  recorded = null,
}: {
  value: string;
  unit: string;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
  units: readonly { value: string; label: string }[];
  error?: string;
  label?: string;
  hint?: ReactNode;
  /** What − and + step by: a tenth of a kilometre, a pool's length. */
  step?: number;
  name?: string;
  unitName?: string;
  /** The entry a recorded distance was opened from, in a unit other than the field's. */
  recorded?: DistanceEntry | null;
}) {
  const at = units.findIndex((option) => option.value === unit);
  const other = units[(at + 1) % units.length] ?? units[0]!;
  const shown = units[at]?.label ?? unit;
  const posted = postedDistance(value, unit, recorded);
  const kept = posted.value !== value || posted.unit !== unit;
  return (
    <>
      <input type="hidden" name={unitName} value={posted.unit} />
      {kept && <input type="hidden" name={name} value={posted.value} />}
      <RowStepper
        label={label}
        hint={
          hint && posted.note ? (
            <>
              {hint}
              {FACT_SEPARATOR}
              {posted.note}
            </>
          ) : (
            (posted.note ?? hint)
          )
        }
        name={kept ? undefined : name}
        value={value}
        onChange={onValueChange}
        unit={shown}
        onUnit={
          units.length > 1
            ? {
                label: `${label} in ${shown}. Change to ${other.label}`,
                onPress: () => onUnitChange(other.value),
              }
            : undefined
        }
        step={step}
        max={100_000}
        less={`Less, ${step} ${shown}`}
        more={`More, ${step} ${shown}`}
        error={error}
      />
    </>
  );
}

/** "26:30", "1:10:00", a swim's "40:12.5": a duration as a figure, tenths only when given. */
export function formatDuration(totalSeconds: number): string {
  const tenths = Math.round(totalSeconds * 10);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  const seconds = `${two(whole % 60)}${fraction ? `.${fraction}` : ""}`;
  return hours > 0 ? `${hours}:${two(minutes)}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * A duration as typed: "26:30" is minutes and seconds, "1:10:00" hours too, and a bare "45" is
 * minutes. The seconds may carry a tenth, as a swim's always could. Null when it is not one.
 */
export function parseDuration(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  const parts = text.split(":");
  const last = parts.length - 1;
  if (parts.length > 3) return null;
  if (
    parts.some(
      (part, index) => !(index === last && last > 0 ? /^\d*(\.\d?)?$/ : /^\d*$/).test(part),
    )
  )
    return null;
  const numbers = parts.map((part) => Number(part || 0));
  if (numbers.length === 1) return numbers[0]! * 60;
  if (numbers.length === 2) return numbers[0]! * 60 + numbers[1]!;
  return numbers[0]! * 3600 + numbers[1]! * 60 + numbers[2]!;
}

/** A duration's stored parts, as the form posts them and a record restores them. */
export type DurationParts = { hours: string; minutes: string; seconds: string };

/** The parts of a duration, as the form posts them. */
function durationParts(value: string): DurationParts {
  const total = parseDuration(value);
  if (total === null) return { hours: "", minutes: "", seconds: "" };
  const tenths = Math.round(total * 10);
  return {
    hours: String(Math.floor(tenths / 36_000)),
    minutes: String(Math.floor((tenths % 36_000) / 600)),
    seconds: String((tenths % 600) / 10),
  };
}

/**
 * The figure a form's stored parts make, or blank: to the whole second, as the record's own
 * page reads it ("32:17", not "32:16.6"). A tenth the record holds is not lost by it, because
 * DurationField posts the parts it was given until the figure is changed.
 */
export function durationFromParts(hours: string, minutes: string, seconds: string): string {
  if (hours.trim() === "" && minutes.trim() === "" && seconds.trim() === "") return "";
  const total =
    Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds.replace(",", ".") || 0);
  return Number.isFinite(total) && total >= 0 ? formatDuration(Math.round(total)) : "";
}

/**
 * A duration as a figure in a row (boards Log a run, a ride, a swim): typed as the clock writes
 * it, − and + by a minute. The form posts it as hours, minutes and seconds, as it always has;
 * while the figure still reads as the `recorded` parts do, it posts those, so correcting the
 * notes keeps a time stored to the tenth.
 */
export function DurationField({
  label = "Duration",
  hint,
  value,
  onChange,
  error,
  recorded,
}: {
  label?: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** The parts the record or the draft holds, which the figure opened on. */
  recorded?: DurationParts;
}) {
  const parts =
    recorded &&
    value !== "" &&
    value === durationFromParts(recorded.hours, recorded.minutes, recorded.seconds)
      ? recorded
      : durationParts(value);
  return (
    <>
      <input type="hidden" name="hours" value={parts.hours} />
      <input type="hidden" name="minutes" value={parts.minutes} />
      <input type="hidden" name="seconds" value={parts.seconds} />
      <RowStepper
        label={label}
        hint={hint}
        value={value}
        onChange={onChange}
        step={60}
        max={24 * 3600 - 1}
        inputMode="text"
        parse={parseDuration}
        format={formatDuration}
        sanitize={(raw) => raw.replace(/[^\d:.,]/g, "").slice(0, 10)}
        placeholder="0:00"
        less="A minute less"
        more="A minute more"
        error={error}
      />
    </>
  );
}

/**
 * How hard it felt (boards Log a run, a ride, a swim): its name and what the ends mean on one
 * line, then 1 to 5 and Not sure in a tray, the chosen one in ink: 1 to 5 always in one row of
 * equal columns, Not sure beside them or, where it does not fit, under them. Not sure is an
 * answer, and the hint keeps saying so (LOG-03).
 *
 * Correcting a record that carries an unconfirmed legacy number adds a seventh choice, chosen
 * from the start: As recorded, which leaves that number as it is. Without it the form could
 * only offer Not sure, and correcting a typo in the notes quietly erased the number.
 */
export function EffortField({
  value,
  error,
  kept,
}: {
  value: string;
  error?: string;
  /** The unconfirmed number a correction keeps unless another answer is chosen. */
  kept?: { value: number | null } | null;
}) {
  const id = useId();
  const options = kept
    ? [...EFFORT_OPTIONS, { value: "keep", label: "As recorded" }]
    : EFFORT_OPTIONS;
  return (
    <div className="effort-field" data-field-error={error ? "true" : undefined}>
      <p className="effort-field-head">
        <span id={id} className="font-bold">
          Effort
        </span>
        <span className="effort-field-ends">1 very easy to 5 maximal</span>
      </p>
      <div className="scale">
        <SegmentedControl
          name="effort"
          aria-labelledby={id}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          options={options}
          defaultValue={value}
          columns={options.length}
          scale
        />
      </div>
      <p id={`${id}-hint`} className="type-caption font-medium text-ink-2">
        How hard it actually felt. Not sure is an answer.
        {kept &&
          (kept.value === null
            ? " As recorded leaves it unrecorded."
            : ` As recorded keeps the earlier ${kept.value}/5, still unconfirmed.`)}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

export function NotesFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  return (
    <>
      <Field label="Title" hint="Optional" error={errors?.title}>
        <Input
          name="title"
          defaultValue={values("title")}
          maxLength={TEXT_LIMITS.title}
          placeholder="Morning loop"
        />
      </Field>
      <Field label="Notes" hint="Optional and private" error={errors?.notes}>
        <Textarea
          name="notes"
          defaultValue={values("notes")}
          maxLength={TEXT_LIMITS.notes}
          placeholder="How it felt, the route, anything worth remembering…"
        />
      </Field>
    </>
  );
}

/**
 * Everything optional, folded away behind one row (board Log a run: "Notes, heart rate, more"):
 * when it happened (now, until it is changed), the sport's own details, heart rate, a title and
 * notes. A beginner never has to open it; a refused field opens it. Its name starts with the
 * date, which is in it: "Notes, heart rate, more" left a run logged late nowhere to be dated.
 */
export function MoreDetails({
  children,
  hasErrors = false,
  defaultOpen = false,
}: {
  children: ReactNode;
  hasErrors?: boolean;
  /** Opened from the start when something in it needs reading, such as a restored date. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(hasErrors || defaultOpen);
  const [wasRequested, setWasRequested] = useState(hasErrors);
  // The section must already be open on the render that first reports the error.
  if (hasErrors !== wasRequested) {
    setWasRequested(hasErrors);
    if (hasErrors) setOpen(true);
  }
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="more-details"
    >
      <summary className="more-details-summary">
        <Glyph name={open ? "minus" : "plus"} className="glyph-20" />
        Date, notes, heart rate, more
      </summary>
      <div className="space-y-4 pt-1 pb-2">{children}</div>
    </details>
  );
}

/**
 * Elevation gain, in feet for an athlete who runs or rides in miles and in metres otherwise
 * (`climbUnit`); it is kept in metres, and a figure in feet is turned into metres as it is posted.
 * A recorded climb opens in their unit and is posted as it was stored until it is changed.
 */
export function ElevationField({
  values,
  errors,
  readIn,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
  /** The road unit the athlete reads distances in. */
  readIn?: DistanceUnit;
}) {
  const unit = climbUnit(readIn ?? "km");
  const stored = values("elevationGainMetres");
  const [opened] = useState(() => {
    const metres = Number(stored);
    return unit === "ft" && stored.trim() !== "" && Number.isFinite(metres)
      ? String(climbIn(metres, "ft"))
      : stored;
  });
  const [figure, setFigure] = useState(opened);
  const feet = Number(figure.replace(",", "."));
  const posted =
    unit === "m"
      ? figure
      : figure === opened
        ? stored
        : figure.trim() === "" || !Number.isFinite(feet)
          ? figure
          : String(roundTo(feet * METRES_PER_FOOT, DECIMALS.elevation));
  return (
    <Field label={`Elevation gain ${unit}`} error={errors?.elevationGainMetres}>
      <Input
        name={unit === "m" ? "elevationGainMetres" : undefined}
        inputMode="decimal"
        value={figure}
        onChange={(event) => setFigure(event.target.value)}
        placeholder="—"
      />
      {unit === "ft" && <input type="hidden" name="elevationGainMetres" value={posted} />}
    </Field>
  );
}

export function HeartRateFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Average heart rate" error={errors?.averageHeartRate}>
        <Input
          name="averageHeartRate"
          inputMode="numeric"
          defaultValue={values("averageHeartRate")}
          placeholder="—"
        />
      </Field>
      <Field label="Maximum heart rate" error={errors?.maxHeartRate}>
        <Input
          name="maxHeartRate"
          inputMode="numeric"
          defaultValue={values("maxHeartRate")}
          placeholder="—"
        />
      </Field>
    </div>
  );
}

/**
 * What the plan asked for, shown beside the form and never inside it (board Log a run): its
 * figure, then how it is meant to feel, on surface.
 *
 * A target is not a result: it stays here, in its own box, so nothing on the page can be
 * mistaken for a measurement of what actually happened.
 */
export function TargetCard({ title, lines }: { title: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  const [first, ...rest] = lines;
  // "25–30 min": the figure in Jost, its unit after it in words.
  const split = /^([\d.,:×–\s]*\d)\s+(\D.*)$/.exec(first!);
  return (
    <section aria-label={title} className="target-card">
      {split ? (
        <p>
          <span className="type-figure-l">
            <FigureText>{split[1]!}</FigureText>
          </span>{" "}
          <span className="target-card-unit">{split[2]}</span>
        </p>
      ) : (
        <p className="font-bold [overflow-wrap:break-word]">{first}</p>
      )}
      {rest.map((line, index) => (
        <p key={index} className="type-meta [overflow-wrap:break-word] text-ink-2">
          {line}
        </p>
      ))}
    </section>
  );
}

/** The hidden fields that carry identity: the submission key, the occurrence, the version. */
export function ActivityIdentityFields({
  submissionKey,
  occurrence,
  expectedRevision,
}: {
  submissionKey: string;
  occurrence: { id: string; revisionId: string; planId?: string | null } | null;
  expectedRevision?: number | null;
}) {
  return (
    <>
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {occurrence && (
        <>
          <input type="hidden" name="occurrenceId" value={occurrence.id} />
          <input type="hidden" name="revisionId" value={occurrence.revisionId} />
          {occurrence.planId && <input type="hidden" name="planId" value={occurrence.planId} />}
        </>
      )}
      {expectedRevision !== null && expectedRevision !== undefined && (
        <input type="hidden" name="expectedRevision" value={String(expectedRevision)} />
      )}
    </>
  );
}

/**
 * The answer to "is that right?" for an unusually large entry. The question is the form's error,
 * printed once just above; this is the box that answers it.
 *
 * It appears only once the server has asked, and it confirms rather than corrects: what was
 * typed is what gets saved (§4.6).
 */
export function LargeEntryConfirmation({ message }: { message?: string }) {
  const asking = Boolean(message && /Confirm the/.test(message));
  if (!asking) return null;
  return (
    <label className="check-row">
      <input type="checkbox" name="confirmLarge" value="on" className="check-row-box" />
      Yes, that is right.
    </label>
  );
}
