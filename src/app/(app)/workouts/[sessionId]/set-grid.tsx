"use client";

import { Check, LoaderCircle } from "@/components/ui/icons";

import { InfoTip } from "@/components/ui/info-tip";
import { sanitizeNumberEntry, SET_LIMITS } from "@/domain/sets";
import { effortMetric, RIR_HELP, RPE_HELP } from "@/domain/effort";
import type { PrescriptionType, SetType } from "@/domain/types";
import { LOAD_UNIT_LABELS, MEASURE_COLUMN_LABELS, SET_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DraftValueField } from "@/lib/workout-drafts";

import type { Ghost, RowState } from "./use-set-rows";

/** Two or three letters beside the set number; the full name lives in the options sheet. */
const SET_TYPE_MARK: Record<SetType, string | null> = {
  working: null,
  warmup: "W",
  backoff: "BO",
  drop: "D",
  amrap: "AM",
  failure: "F",
};

type CellProps = {
  row: RowState;
  field: DraftValueField;
  /** Spoken name for the control, e.g. "Set 2 load, kilograms". */
  label: string;
  /** The column heading, repeated beside the field once the row has stacked. */
  short: string;
  ghost: string | undefined;
  inputMode: "decimal" | "numeric";
  max: number;
  onChange: (value: string) => void;
};

function NumericCell({
  row,
  field,
  label,
  short,
  ghost,
  inputMode,
  max,
  saved,
  onChange,
}: CellProps & { saved: boolean }) {
  return (
    <span className="set-cell">
      {/* Shown only when the row has stacked: the column header is gone by then. The
          input keeps the full spoken name, so this text is decoration. */}
      <span className="set-cell-label" aria-hidden>
        {short}
      </span>
      <input
        type="text"
        maxLength={24}
        inputMode={inputMode}
        value={row[field]}
        // The ghost is the row's own suggestion, shown unconfirmed until it is saved. It is
        // drawn fainter and lighter than anything typed, so a glance tells the two apart.
        placeholder={ghost ?? ""}
        disabled={row.saving}
        aria-label={label}
        aria-invalid={row.error ? true : undefined}
        onChange={(event) => onChange(sanitizeNumberEntry(event.target.value, inputMode, max))}
        className={cn(
          // A well to type into; once the set is saved the number stands on the row's own
          // colour instead, and the well comes back the moment it is focused to be changed.
          "h-12 w-full min-w-0 rounded-control px-1 text-center font-display text-[1.625rem] leading-none font-extrabold text-ink tabular-nums transition-colors duration-[var(--ov-duration-feedback)] placeholder:font-medium placeholder:text-ink-muted/75 focus:bg-surface focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50",
          saved ? "bg-transparent" : "bg-surface-raised",
        )}
      />
    </span>
  );
}

type SetGridProps = {
  rows: readonly RowState[];
  ghost: (setIndex: number) => Ghost;
  /** Column heading for the load, e.g. "kg" or "+kg" for bodyweight movements. */
  unitLabel: string;
  /** What one set of this exercise counts: reps, seconds held, or metres covered. */
  measure: PrescriptionType;
  /** What RIR means for this exercise, in its own words. */
  rirNote?: string | null;
  /** The RIR the plan asks for, e.g. "1–2", so the tip explains the number on the screen. */
  rirTarget?: string | null;
  onEdit: (row: RowState, patch: Partial<RowState>, touch: DraftValueField) => void;
  onSave: (row: RowState) => void;
  onOptions: (row: RowState) => void;
  /** Puts a set the logger saved as a warm-up back to a working set. */
  onUndoWarmup?: (row: RowState) => void;
};

/** The third column: the field the exercise is actually counted in, and what bounds it. */
const MEASURE_FIELD: Record<PrescriptionType, { field: DraftValueField; max: number }> = {
  reps: { field: "reps", max: SET_LIMITS.reps },
  duration: { field: "duration", max: SET_LIMITS.durationSeconds },
  distance: { field: "distance", max: SET_LIMITS.distanceMeters },
};

/**
 * One row per set: identity and options, load, reps or seconds, RIR, and a check to save it.
 *
 * The labels and the unit are in the header, once, so the rows themselves are only numbers.
 * A saved set turns the row the lifting colour with its check filled, so the sets done and
 * the sets to go read apart at arm's length.
 * Four sets that hold the same values still show four rows, because they are four records —
 * merging them into one "shared" value would lose the ability to change any of them alone.
 */
export function SetGrid({
  rows,
  ghost,
  unitLabel,
  measure,
  rirNote = null,
  rirTarget = null,
  onEdit,
  onSave,
  onOptions,
  onUndoWarmup,
}: SetGridProps) {
  const middle = { ...MEASURE_FIELD[measure], label: MEASURE_COLUMN_LABELS[measure] };
  const effort = effortMetric(measure);

  return (
    <div className="set-grid">
      <div className="set-header set-row px-1.5 pb-1 text-sm font-semibold text-ink-muted">
        <span className="text-center">Set</span>
        <span className="text-center">{unitLabel}</span>
        <span className="text-center">{middle.label}</span>
        {/* RIR is the one column whose meaning changes with the movement, so it explains
            itself here rather than being left to a glossary nobody opens mid-set. */}
        <span className="flex items-center justify-center gap-0.5">
          {effort.toUpperCase()}
          <InfoTip label={`What ${effort.toUpperCase()} means here`} className="-my-2">
            {effort === "rir" ? (rirNote ?? RIR_HELP) : RPE_HELP}
            {effort === "rir" && rirTarget ? ` Today's target is ${rirTarget} RIR.` : ""}
          </InfoTip>
        </span>
        {/* The one explanation the grid needs, kept out of the way over the save column. */}
        <span className="flex justify-center">
          <span className="sr-only">Save</span>
          <InfoTip label="How suggestions work">
            Faint load and rep/time/distance numbers are suggestions. Type over them to record
            something different. Enter your actual effort for each working set; effort is never
            copied from a suggestion. Warm-up effort is optional.
          </InfoTip>
        </span>
      </div>

      <ol className="space-y-1.5">
        {rows.map((row) => {
          const rowUnit = row.unit
            ? `${unitLabel.startsWith("+") ? "+" : ""}${LOAD_UNIT_LABELS[row.unit]}`
            : unitLabel;
          const g = ghost(row.setIndex);
          const saved = row.logged !== null && !row.dirty;
          const mark = SET_TYPE_MARK[row.setType];
          return (
            <li
              key={row.setIndex}
              className={cn(
                "rounded-tile px-1.5 py-1.5 transition-colors duration-[var(--ov-duration-feedback)]",
                saved && "bg-lift-soft",
              )}
            >
              <div className="set-row">
                <button
                  type="button"
                  onClick={() => onOptions(row)}
                  aria-label={`Set ${row.setIndex} options${mark ? `, ${SET_TYPE_LABELS[row.setType].toLowerCase()}` : ""}`}
                  className="set-identity flex size-11 min-w-0 pressable flex-col items-center justify-center justify-self-center rounded-full bg-surface-raised text-ink active:bg-line"
                >
                  <span className="text-[0.9375rem] leading-none font-semibold tabular-nums">
                    {row.setIndex}
                  </span>
                  {mark && (
                    <span className="mt-0.5 text-[0.625rem] leading-none font-bold text-accent">
                      {mark}
                    </span>
                  )}
                </button>

                <NumericCell
                  row={row}
                  field="weight"
                  label={`Set ${row.setIndex} load, ${rowUnit}`}
                  short={rowUnit}
                  ghost={g.weight}
                  inputMode="decimal"
                  max={SET_LIMITS.weight}
                  saved={saved}
                  onChange={(value) => onEdit(row, { weight: value }, "weight")}
                />
                <NumericCell
                  row={row}
                  field={middle.field}
                  label={`Set ${row.setIndex} ${middle.label.toLowerCase()}`}
                  short={middle.label}
                  ghost={g[middle.field]}
                  inputMode={measure === "distance" ? "decimal" : "numeric"}
                  max={middle.max}
                  saved={saved}
                  onChange={(value) => onEdit(row, { [middle.field]: value }, middle.field)}
                />
                <NumericCell
                  row={row}
                  field={effort}
                  label={`Set ${row.setIndex} ${effort.toUpperCase()}`}
                  short={effort.toUpperCase()}
                  ghost={undefined}
                  inputMode="decimal"
                  max={SET_LIMITS[effort]}
                  saved={saved}
                  onChange={(value) => onEdit(row, { [effort]: value }, effort)}
                />

                {/* A saved, unedited row has nothing to save, so its cell is a mark rather
                    than a button. That also removes any way to double-tap a duplicate. */}
                <div className="set-save flex items-center justify-center">
                  {row.saving ? (
                    <span
                      role="status"
                      className="flex size-11 items-center justify-center rounded-full bg-lift-soft text-lift-ink"
                    >
                      <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                      <span className="sr-only">Saving set {row.setIndex}</span>
                    </span>
                  ) : saved ? (
                    <span className="set-done flex size-11 items-center justify-center rounded-full bg-lift text-on-lift">
                      <Check aria-hidden />
                      <span className="sr-only">Set {row.setIndex} saved</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSave(row)}
                      aria-label={
                        row.error
                          ? `Retry saving set ${row.setIndex}`
                          : row.logged
                            ? `Update set ${row.setIndex}`
                            : `Save set ${row.setIndex}`
                      }
                      className={cn(
                        "flex size-11 pressable items-center justify-center rounded-full text-xs font-semibold",
                        row.error
                          ? "border-2 border-danger text-danger active:bg-surface-raised"
                          : row.logged
                            ? // An edited saved set: the same check, asking to be pressed again.
                              "border-2 border-lift bg-surface text-lift-ink active:bg-lift-soft"
                            : "border-2 border-line-strong bg-surface text-ink-subtle active:border-lift active:bg-lift-soft active:text-lift-ink",
                      )}
                    >
                      {row.error ? "Retry" : <Check aria-hidden />}
                    </button>
                  )}
                </div>
              </div>

              {/* Below the row, never inside a column, so the numbers stay in line. */}
              {row.error && (
                <p role="alert" className="pt-1 text-xs text-danger">
                  {row.error}
                </p>
              )}
              {row.autoWarmup && !row.error && row.setType === "warmup" && (
                <p
                  role="status"
                  className="flex flex-wrap items-center gap-x-2 pt-1 text-xs text-ink-muted"
                >
                  Saved as a warm-up: well under today&apos;s working weight, with no RIR.
                  {onUndoWarmup && (
                    <button
                      type="button"
                      onClick={() => onUndoWarmup(row)}
                      aria-label={`Set ${row.setIndex} was a working set`}
                      className="-my-2 min-h-11 font-medium text-accent underline underline-offset-2"
                    >
                      Undo
                    </button>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
