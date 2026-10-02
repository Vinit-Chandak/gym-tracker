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

/**
 * One cell of the sheet. What the coach or the rule proposes sits in it in pencil, as the
 * placeholder; what the athlete types over it is ink.
 */
function NumericCell({ row, field, label, short, ghost, inputMode, max, onChange }: CellProps) {
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
        placeholder={ghost ?? ""}
        disabled={row.saving}
        aria-label={label}
        aria-invalid={row.error ? true : undefined}
        onChange={(event) => onChange(sanitizeNumberEntry(event.target.value, inputMode, max))}
        className="h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-1 text-center font-data text-lg font-semibold text-ink tabular-nums placeholder:font-normal placeholder:text-ink-ghost focus:border-pen focus:ring-1 focus:ring-pen focus:outline-none disabled:opacity-50 aria-invalid:border-danger"
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
 * One row per set: identity and options, load, reps or seconds, RIR, save.
 *
 * The labels and the unit are in the header, once, so the rows themselves are only numbers.
 * A set's number is outlined until the set is saved and inked in once it is, so a glance down
 * the margin says how far the exercise has got. The highlighter sits on the one Save that
 * matters next; the rows after it wait in outline. Four sets that hold the same values still
 * show four rows, because they are four records.
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
  // The next set to save: the first row that is not already on record and unedited.
  const nextIndex = rows.find((row) => !(row.logged !== null && !row.dirty))?.setIndex ?? null;

  return (
    <div className="set-grid">
      <div className="set-header set-row border-b border-line pb-1.5 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
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

      <ol>
        {rows.map((row) => {
          const rowUnit = row.unit
            ? `${unitLabel.startsWith("+") ? "+" : ""}${LOAD_UNIT_LABELS[row.unit]}`
            : unitLabel;
          const g = ghost(row.setIndex);
          const saved = row.logged !== null && !row.dirty;
          const mark = SET_TYPE_MARK[row.setType];
          const next = row.setIndex === nextIndex;
          return (
            <li key={row.setIndex} className="border-b border-line py-1.5">
              <div className="set-row">
                <button
                  type="button"
                  onClick={() => onOptions(row)}
                  aria-label={`Set ${row.setIndex} options${mark ? `, ${SET_TYPE_LABELS[row.setType].toLowerCase()}` : ""}`}
                  className={cn(
                    "set-identity flex h-12 min-w-0 flex-col items-center justify-center rounded-control border px-2 transition-colors duration-[var(--ov-duration-ink)] ease-[var(--ov-ease-out)] active:bg-surface-raised",
                    saved ? "ink-in border-ink bg-ink text-canvas" : "border-line text-ink-muted",
                  )}
                >
                  <span className="font-data text-base leading-none font-semibold tabular-nums">
                    {row.setIndex}
                  </span>
                  {mark ? (
                    <span
                      className={cn(
                        "mt-0.5 text-[0.625rem] leading-none font-semibold",
                        saved ? "text-highlight" : "text-pen",
                      )}
                    >
                      {mark}
                    </span>
                  ) : (
                    <span className="mt-0.5 text-[0.625rem] leading-none" aria-hidden>
                      ···
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
                  onChange={(value) => onEdit(row, { [effort]: value }, effort)}
                />

                {/* A saved, unedited row has nothing to save, so its cell is a mark rather
                    than a button. That also removes any way to double-tap a duplicate. */}
                <div className="set-save flex items-center justify-center">
                  {row.saving ? (
                    <span
                      role="status"
                      className="flex h-12 w-full items-center justify-center text-ink-muted"
                    >
                      <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                      <span className="sr-only">Saving set {row.setIndex}</span>
                    </span>
                  ) : saved ? (
                    <span className="ink-in flex h-12 w-full items-center justify-center text-success">
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
                        "h-12 w-full rounded-control text-sm font-semibold transition-[background-color,transform] duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)] active:scale-[0.97]",
                        row.error
                          ? "border border-danger text-danger active:bg-surface-raised"
                          : next || row.dirty
                            ? "border border-highlight-strong bg-highlight text-on-highlight active:bg-highlight-strong"
                            : "border border-line-strong bg-surface text-ink active:bg-surface-raised",
                      )}
                    >
                      {row.error ? "Retry" : "Save"}
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
                      className="-my-2 min-h-11 font-medium text-pen underline underline-offset-2"
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
