"use client";

import type { CSSProperties, ReactNode } from "react";

import { onRamp, rampSize } from "@/components/ui/fit";
import { Glyph } from "@/components/ui/glyphs";
import type { LoadUnit, PrescriptionType } from "@/domain/types";

import { isWarmup, setNumber } from "./logger-model";
import type { RowState } from "./use-set-rows";
import type { SetVM } from "./view-model";

/** A set as the log draws it: what was lifted, counted and felt. History's sets are these too. */
export type ShownSet = Pick<
  SetVM,
  "setType" | "weight" | "unit" | "reps" | "rir" | "durationSeconds" | "distanceMeters"
> & { rpe?: number | null };

/** How a unit is said aloud. */
export function unitName(unit: LoadUnit): string {
  switch (unit) {
    case "lb":
      return "pounds";
    case "plate_count":
      return "plates";
    case "stack_index":
      return "on the stack";
    case "none":
      return "";
    default:
      return "kilograms";
  }
}

const rirName = (rir: number) => (rir === 1 ? "1 rep in reserve" : `${rir} reps in reserve`);

/** What one set counted, said aloud: "4 reps", "45 seconds", "25 metres". */
function countSaid(set: ShownSet, measure: PrescriptionType): string {
  if (measure === "duration" && set.durationSeconds !== null)
    return `${set.durationSeconds} seconds`;
  if (measure === "distance" && set.distanceMeters !== null) return `${set.distanceMeters} metres`;
  return set.reps === null ? "no reps" : `${set.reps} ${set.reps === 1 ? "rep" : "reps"}`;
}

/** The figure a set counted, in its column: reps, seconds or metres. */
function countFigure(set: ShownSet, measure: PrescriptionType): string {
  if (measure === "duration" && set.durationSeconds !== null) return String(set.durationSeconds);
  if (measure === "distance" && set.distanceMeters !== null) return String(set.distanceMeters);
  return set.reps === null ? "–" : String(set.reps);
}

function loadSaid(set: ShownSet): string {
  if (set.weight === null) return "no load";
  const name = unitName(set.unit);
  return name ? `${set.weight} ${name}` : String(set.weight);
}

function effortSaid(set: ShownSet): string | null {
  if (set.rpe !== null && set.rpe !== undefined) return `RPE ${set.rpe}`;
  if (set.rir !== null) return rirName(set.rir);
  return null;
}

/** "Set 2: 60 kilograms, 4 reps, 2 reps in reserve" (DESIGN.md, The log). */
export function setSaid(n: number, set: ShownSet, measure: PrescriptionType): string {
  const effort = effortSaid(set);
  return `Set ${n}: ${loadSaid(set)}, ${countSaid(set, measure)}${effort ? `, ${effort}` : ""}`;
}

/** The log's sizes as CSS: its figures at `size` and its operators a little over half that. */
export function logStyle(size: number): CSSProperties {
  return {
    "--log-size": rampSize(size, 0.25),
    "--log-op": rampSize(onRamp(size * 0.55), 0.25),
  } as CSSProperties;
}

type LogProps = {
  rows: readonly RowState[];
  measure: PrescriptionType;
  /** The log's figure size on the ramp, before the reader's text size. */
  size: number;
  /** Sets that landed while this screen was open: they rise into place. */
  landed: ReadonlySet<number>;
  /** Opens a set to edit; absent where the log is read, not edited. */
  onOpen?: (row: RowState) => void;
  /** Said under the lines: a question about the machine, a note. */
  children?: ReactNode;
};

/**
 * The log (DESIGN.md, The log): what has been lifted so far, in the app's notation, and nothing
 * else. The warm-ups done on one quiet line, then each set done on a line of its own, its number
 * in an 18-pt column at the edge and its figures in the entry's columns, so the entry reads as
 * the log's next line. Nothing is drawn for a set not yet done.
 */
export function Log({ rows, measure, size, landed, onOpen, children }: LogProps) {
  const done = rows.filter((row) => row.logged !== null);
  const warmups = done.filter((row) => isWarmup(row.logged!.setType));
  const sets = done.filter((row) => !isWarmup(row.logged!.setType));
  return (
    <div className="log" style={logStyle(size)}>
      <ol aria-label="Sets">
        {warmups.length > 0 && (
          <li className="log-warm">
            <span aria-hidden className="log-number log-number-warm">
              W
            </span>
            <span role="group" aria-label="Warm-ups" className="log-warm-items">
              {warmups.map((row) => (
                <WarmItem
                  key={row.setIndex}
                  row={row}
                  measure={measure}
                  landed={landed.has(row.setIndex)}
                  onOpen={onOpen}
                />
              ))}
            </span>
          </li>
        )}
        {warmups.map((row) =>
          row.error ? (
            <li key={`note-${row.setIndex}`}>
              <LineNote>{row.error}</LineNote>
            </li>
          ) : null,
        )}
        {sets.map((row) => (
          <LogLine
            key={row.setIndex}
            n={setNumber(rows, row)}
            row={row}
            measure={measure}
            landed={landed.has(row.setIndex)}
            onOpen={onOpen}
          />
        ))}
      </ol>
      {children}
    </div>
  );
}

/** A warm-up in the app's notation: "25 × 8", the operator quieter. */
export function WarmNotation({ set, measure }: { set: ShownSet; measure: PrescriptionType }) {
  return (
    <span className="log-notation" aria-hidden>
      {set.weight === null ? "–" : set.weight} <span className="log-notation-op">×</span>{" "}
      {countFigure(set, measure)}
    </span>
  );
}

/** A set's line on the entry's grid: its number, then load × count @ effort. */
export function SetCells({
  n,
  set,
  measure,
}: {
  n: number;
  set: ShownSet;
  measure: PrescriptionType;
}) {
  const rated = set.rpe !== null && set.rpe !== undefined;
  return (
    <>
      <span aria-hidden className="log-number">
        {n}
      </span>
      <span aria-hidden className="log-figure">
        {set.weight === null ? "–" : set.weight}
      </span>
      <span aria-hidden className="log-op">
        ×
      </span>
      <span aria-hidden className="log-figure">
        {countFigure(set, measure)}
      </span>
      <span aria-hidden className="log-op">
        {rated || measure !== "reps" ? "·" : "@"}
      </span>
      <span aria-hidden className="log-figure">
        {rated ? (
          <>
            <span className="log-rpe">RPE</span> {set.rpe}
          </>
        ) : set.rir === null ? (
          "–"
        ) : (
          set.rir
        )}
      </span>
    </>
  );
}

function WarmItem({
  row,
  measure,
  landed,
  onOpen,
}: {
  row: RowState;
  measure: PrescriptionType;
  landed: boolean;
  onOpen?: (row: RowState) => void;
}) {
  const set = row.logged!;
  const said = `Warm-up: ${loadSaid(set)}, ${countSaid(set, measure)}`;
  return onOpen ? (
    <button
      type="button"
      className="log-warm-item"
      data-landed={landed}
      aria-label={`${said}. Edit`}
      onClick={() => onOpen(row)}
    >
      <WarmNotation set={set} measure={measure} />
    </button>
  ) : (
    <span className="log-warm-item" data-landed={landed}>
      <span className="sr-only">{said}</span>
      <WarmNotation set={set} measure={measure} />
    </span>
  );
}

/** Said aloud for a warm-up that is read, not edited. */
export function warmSaid(set: ShownSet, measure: PrescriptionType): string {
  return `Warm-up: ${loadSaid(set)}, ${countSaid(set, measure)}`;
}

function LogLine({
  n,
  row,
  measure,
  landed,
  onOpen,
}: {
  n: number;
  row: RowState;
  measure: PrescriptionType;
  landed: boolean;
  onOpen?: (row: RowState) => void;
}) {
  const set = row.logged!;
  const said = setSaid(n, set, measure);
  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          className="log-line"
          data-landed={landed}
          aria-label={`${said}. Edit`}
          onClick={() => onOpen(row)}
        >
          <SetCells n={n} set={set} measure={measure} />
        </button>
      ) : (
        <div className="log-line" data-landed={landed}>
          <span className="sr-only">{said}</span>
          <SetCells n={n} set={set} measure={measure} />
        </div>
      )}
      {row.error && <LineNote>{row.error}</LineNote>}
    </li>
  );
}

/** A set whose change has not reached the server says so under its line. */
function LineNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 pb-2 type-meta-small text-ink">
      <Glyph name="warn" className="mt-0.5 glyph-16" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}
