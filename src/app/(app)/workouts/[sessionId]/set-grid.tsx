"use client";

import { Check, LoaderCircle } from "lucide-react";

import { sanitizeNumberEntry, SET_LIMITS } from "@/domain/sets";
import type { SetType } from "@/domain/types";
import { SET_TYPE_LABELS } from "@/lib/labels";
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
  ghost: string | undefined;
  inputMode: "decimal" | "numeric";
  max: number;
  onChange: (value: string) => void;
};

function NumericCell({ row, field, label, ghost, inputMode, max, onChange }: CellProps) {
  return (
    <input
      type="text"
      maxLength={24}
      inputMode={inputMode}
      value={row[field]}
      // The ghost is the row's own suggestion, shown unconfirmed until it is saved.
      placeholder={ghost ?? ""}
      disabled={row.saving}
      aria-label={label}
      aria-invalid={row.error ? true : undefined}
      onChange={(event) => onChange(sanitizeNumberEntry(event.target.value, inputMode, max))}
      className="h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-1 text-center text-[length:var(--ov-text-input)] font-medium tabular-nums placeholder:font-normal placeholder:text-ink-subtle focus:border-accent focus:outline-none disabled:opacity-50"
    />
  );
}

type SetGridProps = {
  rows: readonly RowState[];
  ghost: (setIndex: number) => Ghost;
  /** Column heading for the load, e.g. "kg" or "+kg" for bodyweight movements. */
  unitLabel: string;
  isDuration: boolean;
  onEdit: (row: RowState, patch: Partial<RowState>, touch: DraftValueField) => void;
  onSave: (row: RowState) => void;
  onOptions: (row: RowState) => void;
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
  isDuration,
  onEdit,
  onSave,
  onOptions,
}: SetGridProps) {
  const middle = isDuration
    ? { field: "duration" as const, label: "Seconds", max: SET_LIMITS.durationSeconds }
    : { field: "reps" as const, label: "Reps", max: SET_LIMITS.reps };

  return (
    <div className="set-grid">
      <div className="set-row border-b border-line pb-1 text-xs text-ink-muted">
        <span className="text-center">Set</span>
        <span className="text-center">{unitLabel}</span>
        <span className="text-center">{middle.label}</span>
        <span className="text-center">RIR</span>
        <span className="sr-only">Save</span>
      </div>

      <ol>
        {rows.map((row) => {
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
                  className="flex h-11 min-w-0 flex-col items-center justify-center rounded-control border border-line text-ink-muted active:bg-surface-raised"
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
                  label={`Set ${row.setIndex} load, ${unitLabel}`}
                  ghost={g.weight}
                  inputMode="decimal"
                  max={SET_LIMITS.weight}
                  onChange={(value) => onEdit(row, { weight: value }, "weight")}
                />
                <NumericCell
                  row={row}
                  field={middle.field}
                  label={`Set ${row.setIndex} ${middle.label.toLowerCase()}`}
                  ghost={g[middle.field]}
                  inputMode="numeric"
                  max={middle.max}
                  onChange={(value) => onEdit(row, { [middle.field]: value }, middle.field)}
                />
                <NumericCell
                  row={row}
                  field="rir"
                  label={`Set ${row.setIndex} RIR`}
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
                      <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />
                      <span className="sr-only">Saving set {row.setIndex}</span>
                    </span>
                  ) : saved ? (
                    <span className="flex h-11 w-full items-center justify-center text-success">
                      <Check className="size-4" aria-hidden />
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
