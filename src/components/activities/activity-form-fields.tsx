"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input, Textarea } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import type { ActivitySport } from "@/domain/activity";
import { EFFORT, TEXT_LIMITS } from "@/domain/activity-limits";
import { SPORT_TONE, TONE_SOFT } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";
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

/**
 * A measurement typed into a well, in the display face: the numbers are what the form is for,
 * so they are set the way the set rows set theirs. The unit sits inside the well at its end,
 * where it is read with the number, and is decoration: the field's label carries its name.
 */
export function NumberWell({
  suffix,
  className,
  ...props
}: ComponentProps<"input"> & { suffix?: string }) {
  return (
    <span className="relative block min-w-0">
      <input
        type="text"
        {...props}
        className={cn(
          // The placeholder is an example, never a result (ACTUAL-01), so it is drawn well
          // below anything typed: a glance tells an empty well from a filled one.
          "h-16 w-full min-w-0 rounded-control bg-surface-raised px-3 text-center font-display text-display-m leading-none font-extrabold text-ink tabular-nums transition-colors duration-[var(--ov-duration-feedback)] placeholder:font-semibold placeholder:text-ink-ghost/40 focus:bg-surface focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger",
          suffix && "pr-11",
          className,
        )}
      />
      {suffix && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-ink-muted"
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

/** One box of an elapsed time: its name for a screen reader, its unit on screen. */
export type DurationPart = {
  name: string;
  label: string;
  suffix: string;
  placeholder: string;
  inputMode?: "numeric" | "decimal";
  /** Controlled, for a form that works something out from the time as it is typed. */
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
};

/**
 * Hours, minutes and seconds as wells side by side. Each well keeps its own name for a
 * screen reader ("Minutes"); on screen the unit inside the well says the same thing once,
 * rather than a row of labels over a row of boxes under the group's own label.
 */
export function DurationField({
  label,
  info,
  hint,
  error,
  parts,
}: {
  label: string;
  info?: ReactNode;
  hint?: string;
  error?: string;
  parts: readonly DurationPart[];
}) {
  return (
    <Field group label={label} info={info} hint={hint} error={error}>
      <div className={cn("grid gap-2", parts.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {parts.map((part) => (
          <NumberWell
            key={part.name}
            name={part.name}
            aria-label={part.label}
            inputMode={part.inputMode ?? "numeric"}
            suffix={part.suffix}
            placeholder={part.placeholder}
            aria-invalid={error ? true : undefined}
            {...(part.onChange
              ? {
                  value: part.value ?? "",
                  onChange: (event) => part.onChange?.(event.target.value),
                }
              : { defaultValue: part.defaultValue })}
          />
        ))}
      </div>
    </Field>
  );
}

/**
 * A distance and the unit it was entered in. Both are stored; neither is re-derived.
 *
 * The unit is chosen beside the label, so the number gets the card's whole width and reads
 * with its unit at the end of the well.
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
  info,
  name = "distanceValue",
  unitName = "distanceUnit",
  unitLabel = "Distance unit",
  placeholder = "5",
}: {
  value: string;
  unit: string;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
  units: readonly { value: string; label: string }[];
  error?: string;
  label?: string;
  hint?: string;
  info?: ReactNode;
  /** The fields it posts, for a length that is not the session's distance: a pool's. */
  name?: string;
  unitName?: string;
  unitLabel?: string;
  placeholder?: string;
}) {
  const id = useId();
  const feedbackId = `${id}-feedback`;
  return (
    <div className="min-w-0 space-y-1.5" data-field-error={error ? "true" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-ink-muted">
          <label htmlFor={id} className="min-w-0 [overflow-wrap:anywhere]">
            {label}
          </label>
          {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
        </span>
        <div className="w-32 max-w-full shrink-0">
          <SegmentedControl
            name={unitName}
            aria-label={unitLabel}
            options={units}
            value={unit}
            onChange={onUnitChange}
            columns={units.length}
          />
        </div>
      </div>
      <NumberWell
        id={id}
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        suffix={units.find((option) => option.value === unit)?.label ?? unit}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? feedbackId : undefined}
      />
      {(error || hint) && (
        <span
          id={feedbackId}
          role={error ? "alert" : undefined}
          className={error ? "block text-sm text-danger" : "block text-xs text-ink-subtle"}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}

/**
 * What follows from the numbers as they are typed, in the sport's colour: a run's pace, a
 * ride's average, a swim's distance. It is a status, so it is read out when it changes, and it
 * appears only once both numbers it needs are there.
 */
export function Readout({
  sport,
  label,
  value,
  unit,
  detail,
}: {
  sport: ActivitySport;
  label: string;
  value: string;
  unit?: string;
  /** The same figure in a second unit, where the first is not the one everything compares. */
  detail?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-tile px-4 py-3 tabular-nums",
        TONE_SOFT[SPORT_TONE[sport]],
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      {/* Spaces as text, not margins, so the figure reads "400 yd (365.76 m)" aloud too. */}
      <span className="text-ink">
        <span className="font-display text-display-s font-extrabold">{value}</span>
        {unit && (
          <>
            {" "}
            <span className="text-sm font-semibold">{unit}</span>
          </>
        )}
        {detail && (
          <>
            {" "}
            <span className="text-sm text-ink-muted">({detail})</span>
          </>
        )}
      </span>
    </p>
  );
}

/**
 * The label is hidden because every caller puts this in a section already headed "Effort",
 * and the screen was printing the word twice, one line above the other.
 */
export function EffortField({ value, error }: { value: string; error?: string }) {
  return (
    <Field
      group
      labelHidden
      label="Effort"
      hint="1 very easy to 5 maximal. Not sure is an answer."
      error={error}
    >
      <SegmentedControl
        name="effort"
        aria-label="Effort"
        options={EFFORT_OPTIONS}
        defaultValue={value}
        columns={EFFORT_OPTIONS.length}
      />
    </Field>
  );
}

/** A title and a note: the words the athlete adds, in one box of their own. */
export function NotesFields({
  values,
  errors,
}: {
  values: (key: string) => string;
  errors?: Record<string, string>;
}) {
  return (
    <Card>
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
    </Card>
  );
}

/** Optional summary metrics, folded away. A beginner never has to open this. */
export function MoreDetails({
  children,
  hasErrors = false,
}: {
  children: ReactNode;
  hasErrors?: boolean;
}) {
  return (
    <Disclosure summary="More details" meta="Optional" defaultOpen={hasErrors}>
      <div className="space-y-3">{children}</div>
    </Disclosure>
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
 * What the plan asked for, shown beside the form and never inside it.
 *
 * A target is not a result: it stays here, in its own box on the sport's soft wash, so
 * nothing on the page can be mistaken for a measurement of what actually happened.
 */
export function TargetCard({
  sport,
  title,
  lines,
}: {
  sport: ActivitySport;
  title: string;
  lines: readonly string[];
}) {
  if (lines.length === 0) return null;
  const Icon = SPORT_ICON[sport];
  const [first, ...rest] = lines;
  return (
    <section
      aria-label={title}
      className={cn("min-w-0 space-y-1 rounded-card p-4", TONE_SOFT[SPORT_TONE[sport]])}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden />
        {title}
      </p>
      <p className="text-headline leading-snug font-semibold [overflow-wrap:anywhere] text-ink">
        {first}
      </p>
      {rest.map((line, index) => (
        <p key={index} className="text-sm [overflow-wrap:anywhere] text-ink-muted">
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
 * The answer to "is that right?" for an unusually large entry.
 *
 * It appears only once the server has asked, and it confirms rather than corrects: what was
 * typed is what gets saved (§4.6).
 */
export function LargeEntryConfirmation({ message }: { message?: string }) {
  const asking = Boolean(message && /Confirm the/.test(message));
  if (!asking) return null;
  return (
    <Card>
      <p className="text-sm text-warning">{message}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="confirmLarge" value="on" className="size-5 accent-accent" />
        Yes, that is right.
      </label>
    </Card>
  );
}
