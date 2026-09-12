"use client";

import { Check, LoaderCircle } from "@/components/ui/icons";

import { InfoTip } from "@/components/ui/info-tip";
import { sanitizeNumberEntry, SET_LIMITS } from "@/domain/sets";
import type { PrescriptionType, SetType } from "@/domain/types";
import { LOAD_UNIT_LABELS, MEASURE_COLUMN_LABELS, rirMeaning, SET_TYPE_LABELS } from "@/lib/labels";
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
        // The ghost is the row's own suggestion, shown unconfirmed until it is saved. It is
        // drawn fainter and lighter than anything typed, so a glance tells the two apart.
        placeholder={ghost ?? ""}
        disabled={row.saving}
        aria-label={label}
        aria-invalid={row.error ? true : undefined}
        onChange={(event) => onChange(sanitizeNumberEntry(event.target.value, inputMode, max))}
        className="h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-1 text-center text-[length:var(--ov-text-input)] font-semibold text-ink tabular-nums placeholder:font-normal placeholder:text-ink-ghost focus:border-accent focus:outline-none disabled:opacity-50"
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
}: SetGridProps) {
  const middle = { ...MEASURE_FIELD[measure], label: MEASURE_COLUMN_LABELS[measure] };

  return (
    <div className="set-grid">
      <div className="set-header set-row border-b border-line pb-1 text-sm font-semibold">
        <span className="text-center">Set</span>
        <span className="text-center">{unitLabel}</span>
        <span className="text-center">{middle.label}</span>
        {/* RIR is the one column whose meaning changes with the movement, so it explains
            itself here rather than being left to a glossary nobody opens mid-set. */}
        <span className="flex items-center justify-center gap-0.5">
          RIR
          <InfoTip label="What RIR means here" className="-my-2">
            {rirNote ?? rirMeaning(measure)}
            {rirTarget ? ` Today's target is ${rirTarget} RIR.` : ""}
          </InfoTip>
        </span>
        {/* The one explanation the grid needs, kept out of the way over the save column. */}
        <span className="flex justify-center">
          <span className="sr-only">Save</span>
          <InfoTip label="How suggestions work">
            Faint numbers are this set&apos;s suggestion. Save records them as shown; type over one
            to use your own, or clear it to leave it unknown.
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
          return (
            <li key={row.setIndex} className="border-b border-line py-1.5">
              <div className="set-row">
                <button
                  type="button"
                  onClick={() => onOptions(row)}
                  aria-label={`Set ${row.setIndex} options${mark ? `, ${SET_TYPE_LABELS[row.setType].toLowerCase()}` : ""}`}
                  className="set-identity flex h-11 min-w-0 flex-col items-center justify-center rounded-control border border-line px-3 text-ink-muted active:bg-surface-raised"
                >
                  <span className="text-sm font-medium tabular-nums">{row.setIndex}</span>
                  {mark ? (
                    <span className="text-[0.625rem] leading-none font-medium text-accent">
                      {mark}
                    </span>
                  ) : (
                    <span className="text-[0.625rem] leading-none" aria-hidden>
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
                  field="rir"
                  label={`Set ${row.setIndex} RIR`}
                  short="RIR"
                  ghost={g.rir}
                  inputMode="decimal"
                  max={SET_LIMITS.rir}
                  onChange={(value) => onEdit(row, { rir: value }, "rir")}
                />

                {/* A saved, unedited row has nothing to save, so its cell is a mark rather
                    than a button. That also removes any way to double-tap a duplicate. */}
                <div className="set-save flex items-center justify-center">
                  {row.saving ? (
                    <span
                      role="status"
                      className="flex h-11 w-full items-center justify-center text-ink-muted"
                    >
                      <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
                      <span className="sr-only">Saving set {row.setIndex}</span>
                    </span>
                  ) : saved ? (
                    <span className="flex h-11 w-full items-center justify-center text-success">
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
                        "h-11 w-full rounded-control text-xs font-medium",
                        row.error
                          ? "border border-danger text-danger active:bg-surface-raised"
                          : "bg-accent text-on-accent active:bg-accent-strong",
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
