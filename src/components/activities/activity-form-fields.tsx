"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { Disclosure } from "@/components/ui/disclosure";
import { FigureInput } from "@/components/ui/figure-input";
import { FigureText } from "@/components/ui/figure-text";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input, Textarea } from "@/components/ui/input";
import { figureWidth, RowStepper } from "@/components/ui/row-stepper";
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

/**
 * Native date/time input, with an explicit choice only when clocks repeat that time. The time
 * zone it is read in stands at the end of the label, in view while the time is typed: it is the
 * time's unit, which an athlete away from home needs before saving, not after.
 */
export function ActivityStartFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  const splitDate = values("entryDate");
  const [local, setLocal] = useState(() =>
    splitDate ? `${splitDate}T${values("entryTime")}` : values("startedAt"),
  );
  const [offset, setOffset] = useState(() => values("startedAtOffsetMinutes"));
  const timeZone = values("recordedTimeZone") || "UTC";
  const choices = dateTimeLocalCandidates(local, timeZone);
  return (
    <>
      <input type="hidden" name="recordedTimeZone" value={timeZone} />
      {splitDate ? (
        <>
          <input type="hidden" name="startedAt" value={local} />
          <Field label="Training date" error={errors?.startedAt}>
            <Input
              name="entryDate"
              type="date"
              value={local.slice(0, 10)}
              max={values("latestDate") || undefined}
              required
              onChange={(event) => {
                setLocal(`${event.target.value}T${local.slice(11)}`);
                setOffset("");
              }}
            />
          </Field>
          <Field
            label="Start time"
            aside={timeZone}
            error={errors?.startedAt ?? errors?.recordedTimeZone}
          >
            <Input
              name="entryTime"
              type="time"
              value={local.slice(11)}
              required
              onChange={(event) => {
                setLocal(`${local.slice(0, 10)}T${event.target.value}`);
                setOffset("");
              }}
            />
          </Field>
        </>
      ) : (
        <Field
          label="When"
          aside={timeZone}
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
      )}
      {choices.length > 1 ? (
        // The clocks go back, so the time typed happens twice: the label asks which.
        <Field
          label={`${local.slice(11, 16)} happens twice here. Which one?`}
          error={errors?.startedAtOffsetMinutes}
        >
          <Select
            name="startedAtOffsetMinutes"
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
            required
          >
            <option value="">Choose one</option>
            {choices.map((instant, index) => {
              const minutes = timeZoneOffsetMinutes(timeZone, instant);
              return (
                <option key={minutes} value={minutes}>
                  The {index === 0 ? "first" : "second"} ({formatUtcOffset(minutes)})
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

/** Digits alone: what a part of a figure typed on the number pad keeps. */
const digitsOf = (raw: string) => raw.replace(/\D/g, "");

/** A distance's whole as typed, without the zero it stood at before a figure was typed after it. */
const wholeOf = (raw: string) =>
  digitsOf(raw)
    .replace(/^0+(?=\d)/, "")
    .slice(0, 5);

/** A distance's figure in its two parts: the whole, and the digits after the point. */
export function distanceParts(value: string): { whole: string; fraction: string } {
  const [whole = "", fraction = ""] = value.replace(",", ".").split(".");
  return { whole, fraction };
}

/** The figure two parts make: "5" and "2" are 5.2, "" and "5" are 0.5, both blank none. */
export function joinDistance(whole: string, fraction: string): string {
  if (whole === "" && fraction === "") return "";
  return fraction === "" ? whole : `${whole || "0"}.${fraction}`;
}

/**
 * A distance and the unit it was entered in, as a figure in a row (boards Log a run, a ride):
 * − and + by a tenth, the unit beside the figure, pressing it says the distance in the other.
 * Both are stored; neither is re-derived. A recorded distance opened in another unit
 * (`openDistance`) is posted as it was entered until it is changed, and says what that was.
 *
 * A phone types it on the number pad, which has no point: the figure is two parts, the whole
 * and what follows the point, with the point drawn between them ("5" then "2" is 5.2 km). A
 * point typed into the whole, from a keyboard that has one, moves on to the part after it. A
 * distance counted in whole units (a swim's metres or yards) is one part.
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
  aside,
  step = 0.1,
  name = "distanceValue",
  unitName = "distanceUnit",
  recorded = null,
  whole = false,
}: {
  value: string;
  unit: string;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
  units: readonly { value: string; label: string }[];
  error?: string;
  label?: string;
  hint?: ReactNode;
  /** "Optional" at the end of its name, read with the row. */
  aside?: ReactNode;
  /** What − and + step by: a tenth of a kilometre, a pool's length. */
  step?: number;
  name?: string;
  unitName?: string;
  /** The entry a recorded distance was opened from, in a unit other than the field's. */
  recorded?: DistanceEntry | null;
  /** Counted in whole units, a swim's metres or yards: one part, with no point. */
  whole?: boolean;
}) {
  const after = useRef<HTMLInputElement>(null);
  const at = units.findIndex((option) => option.value === unit);
  const other = units[(at + 1) % units.length] ?? units[0]!;
  const shown = units[at]?.label ?? unit;
  const posted = postedDistance(value, unit, recorded);
  const kept = posted.value !== value || posted.unit !== unit;
  const parts = distanceParts(value);
  return (
    <>
      <input type="hidden" name={unitName} value={posted.unit} />
      {(kept || !whole) && <input type="hidden" name={name} value={posted.value} />}
      <RowStepper
        label={label}
        aside={aside}
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
        name={kept || !whole ? undefined : name}
        value={value}
        onChange={onValueChange}
        inputMode={whole ? "numeric" : "decimal"}
        placeholder={whole ? "–" : "0.00"}
        figure={
          whole
            ? undefined
            : ({ id, describedBy, invalid, fontSize }) => (
                <>
                  <FigureInput
                    id={id}
                    inputMode="numeric"
                    value={parts.whole}
                    placeholder="0"
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(event) => {
                      const typed = event.target.value.replace(",", ".");
                      const point = typed.indexOf(".");
                      if (point < 0) {
                        onValueChange(joinDistance(wholeOf(typed), parts.fraction));
                        return;
                      }
                      // A point typed here: what was before it is the whole, and the rest
                      // comes after it, where the typing goes on.
                      onValueChange(
                        joinDistance(
                          wholeOf(typed.slice(0, point)),
                          digitsOf(typed.slice(point + 1)).slice(0, DECIMALS.distance),
                        ),
                      );
                      after.current?.focus();
                    }}
                    style={{ width: figureWidth(parts.whole || "0"), fontSize }}
                  />
                  <span aria-hidden className="row-stepper-point" style={{ fontSize }}>
                    .
                  </span>
                  <FigureInput
                    ref={after}
                    inputMode="numeric"
                    value={parts.fraction}
                    placeholder="00"
                    aria-label={`${label}, after the point`}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(event) =>
                      onValueChange(
                        joinDistance(
                          parts.whole,
                          digitsOf(event.target.value).slice(0, DECIMALS.distance),
                        ),
                      )
                    }
                    style={{ width: figureWidth(parts.fraction || "00"), fontSize }}
                  />
                </>
              )
        }
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

/**
 * Digits typed into a duration, written as a clock writes them: the colons place themselves
 * from the right, as on a timer's keypad, so the phone's number pad is all it takes. 2530 is
 * 25:30, 10530 is 1:05:30; anything but a digit is let go, and a seventh digit is not taken.
 */
export function clockEntry(raw: string): string {
  const digits = digitsOf(raw).replace(/^0+/, "").slice(0, 6);
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  const seconds = padded.slice(-2);
  const rest = padded.slice(0, -2);
  return rest.length <= 2
    ? `${Number(rest)}:${seconds}`
    : `${Number(rest.slice(0, -2))}:${rest.slice(-2)}:${seconds}`;
}

/** A duration as the clock writes it once its field is left: 0:75 is 1:15. */
function settleDuration(value: string): string {
  const total = parseDuration(value);
  return total === null ? value : formatDuration(total);
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
 * A duration as a figure in a row (boards Log a run, a ride, a swim): typed in digits on the
 * number pad, the colons placing themselves (`clockEntry`), − and + by a minute. The form posts
 * it as hours, minutes and seconds, as it always has; while the figure still reads as the
 * `recorded` parts do, it posts those, so correcting the notes keeps a time stored to the tenth.
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
  /** What the figure comes to ("Pace 6:46 /km"), or what it counts ("Rests included"). */
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
        inputMode="numeric"
        parse={parseDuration}
        format={formatDuration}
        sanitize={clockEntry}
        settle={settleDuration}
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
 * answer, and is offered as one (LOG-03); nothing under the tray says so again.
 *
 * Correcting a record that carries an unconfirmed legacy number adds a seventh choice, chosen
 * from the start: As recorded, which leaves that number as it is, and the line under the tray
 * says what it keeps, since it is chosen for the athlete (WCAG 3.3.2). Without it the form
 * could only offer Not sure, and correcting a typo in the notes quietly erased the number.
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
        <span id={id} className="flex items-center gap-1.5 font-bold">
          {error && <Glyph name="warn" className="glyph-16 text-danger-glyph" />}
          Effort
        </span>
        <span id={`${id}-ends`} className="effort-field-ends">
          1 very easy to 5 maximal
        </span>
      </p>
      <div className="scale">
        <SegmentedControl
          name="effort"
          aria-labelledby={id}
          aria-describedby={[`${id}-ends`, kept && `${id}-kept`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? true : undefined}
          options={options}
          defaultValue={value}
          columns={options.length}
          scale
        />
      </div>
      {kept && (
        <p id={`${id}-kept`} className="type-caption font-medium text-ink-2">
          {kept.value === null
            ? "As recorded leaves it unrecorded."
            : `As recorded keeps the earlier ${kept.value}/5, still unconfirmed.`}
        </p>
      )}
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
      {/* Optional at the label's end: the fold they are in also holds the required When. */}
      <Field label="Title" aside="Optional" error={errors?.title}>
        <Input
          name="title"
          defaultValue={values("title")}
          maxLength={TEXT_LIMITS.title}
          placeholder="Morning loop"
        />
      </Field>
      <Field label="Notes" aside="Optional, private" error={errors?.notes}>
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
 * notes. A beginner never has to open it; a refused field opens it, and so does a required one
 * the browser finds blank or ambiguous before sending (the date, the start time, which of two
 * repeated times), so Save says what it needs rather than doing nothing (WCAG 3.3.1). Its name
 * starts with the date, which is in it: "Notes, heart rate, more" left a run logged late nowhere
 * to be dated.
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
      // `invalid` does not bubble, so it is caught on its way down. Opened at once, in the DOM
      // as well as in state, the browser can then focus the field and show its message.
      onInvalidCapture={(event) => {
        event.currentTarget.open = true;
        setOpen(true);
      }}
      className="more-details"
    >
      {/* Drawn as every fold is: its name at the edge, its chevron at the end (DESIGN.md). */}
      <summary className="more-details-summary">
        <span className="min-w-0 flex-1">Date, notes, heart rate, more</span>
        <Glyph name="chevronDown" className="more-details-chevron glyph-20 shrink-0" />
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
        inputMode="numeric"
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

/** What a planned session asked for, as its log form shows it beside the fields. */
export type PlanTarget = {
  /** Whose plan it is, the card's name aloud: "The plan asked for", "Your coach asked for". */
  title: string;
  /** What it asks for as one figure: "25–30 min", "6 × 800 m". */
  figure: string;
  /** Its stop rule, kept in view: a safety rule is need-to-know. */
  stop: string | null;
  /** Its steps, a line per step or repeated block (ADR 0059). */
  steps: readonly string[];
  /** How to do it: the pace note, the instructions. */
  notes: readonly string[];
};

/**
 * What the plan asked for, shown beside the form and never inside it (board Log a run): its
 * figure and its stop rule on surface, its steps and how to do it folded under them, since each
 * lap's empty fields show what the plan asked of that lap while it is typed.
 *
 * A target is not a result: it stays here, in its own box, so nothing on the page can be
 * mistaken for a measurement of what actually happened.
 */
export function TargetCard({ title, figure, stop, steps, notes }: PlanTarget) {
  // "25–30 min": the figure in Jost, its unit after it in words.
  const split = /^([\d.,:×–\s]*\d)\s+(\D.*)$/.exec(figure);
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
        <p className="font-bold [overflow-wrap:break-word]">{figure}</p>
      )}
      {stop && (
        <p className="mt-1 flex items-start gap-1.5 type-meta [overflow-wrap:break-word]">
          <Glyph name="warn" label="Stop if" className="mt-0.5 glyph-16" />
          <span className="min-w-0">{stop}</span>
        </p>
      )}
      {steps.length + notes.length > 0 && (
        <Disclosure
          summary="The plan"
          meta={
            steps.length > 0
              ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}`
              : undefined
          }
          variant="inline"
          className="mt-2"
        >
          {[...steps, ...notes].map((line, index) => (
            <p key={index} className="type-meta [overflow-wrap:break-word] text-ink-2">
              {line}
            </p>
          ))}
        </Disclosure>
      )}
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
