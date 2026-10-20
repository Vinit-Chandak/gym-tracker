"use client";

import { useEffect, useState } from "react";

import { measureOf as measureOfSet } from "@/domain/sets";
import { todayInTimeZone } from "@/domain/program-calendar";
import type { LoadPortability, LoadUnit, PrescriptionType } from "@/domain/types";
import type { SetLengthUnit } from "@/lib/distance-units";
import { FACT_SEPARATOR } from "@/lib/facts";
import { formatIsoDay } from "@/lib/format";
import { setInUnit } from "@/lib/units";
import type { ExerciseHistoryEntry } from "@/server/actions/sessions";

import { logStyle, SetCells, setSaid, WarmNotation, warmSaid, type ShownSet } from "./log";
import { useLoggerActions } from "./logger-actions";
import { isWarmup, logSize } from "./logger-model";

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; entries: ExerciseHistoryEntry[]; more: boolean };

/**
 * Every past session of this exercise, on any machine, newest first, each set as it was logged
 * in the same lines as Log (DESIGN.md, The log). History is read, not edited: its lines are not
 * buttons. Read when the History tab opens rather than with the session, so logging a set never
 * waits on the whole record.
 */
export function ExerciseHistory({
  exerciseId,
  workoutExerciseId,
  loadPortability,
  unit,
  timeZone,
  measure,
  length,
  width = 402,
  grow = 1,
}: {
  exerciseId: string;
  workoutExerciseId: string;
  loadPortability: LoadPortability;
  /**
   * The unit the Log tab beside it writes loads in: free-weight loads are shown in it, so the
   * same lifts read the same on both tabs; a machine's stay in the machine's own.
   */
  unit: LoadUnit;
  timeZone: string;
  /** What this exercise counts, for a set that says nothing itself. */
  measure?: PrescriptionType;
  /** What a carry reads in, as the Log tab beside it reads it: metres or yards. */
  length: SetLengthUnit;
  /** The screen's width and how much larger figures are drawn: the lines fit their columns. */
  width?: number;
  grow?: number;
}) {
  const { readHistory } = useLoggerActions();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    readHistory(exerciseId, workoutExerciseId).then(
      (read) => {
        if (live) setState({ status: "ready", ...read });
      },
      () => {
        if (live) setState({ status: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [exerciseId, workoutExerciseId, attempt, readHistory]);

  if (state.status === "loading") {
    return (
      <p role="status" className="mt-3 type-body text-ink-2">
        Loading history…
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <p className="mt-3 type-body text-ink-2">
        Could not load the history.{" "}
        <button
          type="button"
          className="min-h-[var(--ov-target)] font-bold text-ink"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </p>
    );
  }
  if (state.entries.length === 0) {
    return <p className="mt-3 type-body text-ink-2">No earlier sessions.</p>;
  }

  const shown = (sets: ExerciseHistoryEntry["sets"]): ShownSet[] =>
    sets.map((set) => (loadPortability === "global" ? setInUnit(set, unit) : set));
  // One size for every session's lines, so a load reads the same in each: 26 at most.
  const loads = state.entries.flatMap((entry) =>
    shown(entry.sets)
      .filter((set) => !isWarmup(set.setType))
      .map((set) => (set.weight === null ? "–" : String(set.weight))),
  );
  const size = logSize(loads, width, grow, 26);

  return (
    <div>
      <h2 className="mt-3 type-caption text-ink-2 tabular-nums">
        All sessions{FACT_SEPARATOR}
        {state.entries.length}
        {state.more ? "+" : ""}
      </h2>
      {state.entries.map((entry, index) => {
        const sets = shown(entry.sets);
        const warmups = sets.filter((set) => isWarmup(set.setType));
        const work = sets.filter((set) => !isWarmup(set.setType));
        const headingId = `history-${entry.workoutExerciseId}`;
        return (
          <section
            key={entry.workoutExerciseId}
            aria-labelledby={headingId}
            className={index === 0 ? "mt-2" : "mt-3.5"}
          >
            <h3
              id={headingId}
              className="flex min-h-8 flex-wrap items-baseline gap-x-2 text-[length:var(--ov-type-meta)] font-bold"
            >
              <span className="tabular-nums">
                {formatIsoDay(todayInTimeZone(timeZone, new Date(entry.performedAt)))}
              </span>
              <span className="min-w-0 type-meta-small [overflow-wrap:break-word] text-ink-2">
                {entry.gymName}
                {entry.equipmentName ? `${FACT_SEPARATOR}${entry.equipmentName}` : ""}
              </span>
            </h3>
            <ol className="log py-0" style={logStyle(size)}>
              {warmups.length > 0 && (
                <li className="log-warm">
                  <span aria-hidden className="log-number log-number-warm">
                    W
                  </span>
                  <span className="log-warm-items">
                    {warmups.map((set, k) => (
                      <span key={k} className="log-warm-item">
                        <span className="sr-only">
                          {warmSaid(set, measure ?? measureOfSet(set), length)}
                        </span>
                        <WarmNotation
                          set={set}
                          measure={measure ?? measureOfSet(set)}
                          length={length}
                        />
                      </span>
                    ))}
                  </span>
                </li>
              )}
              {work.map((set, k) => (
                <li key={k} className="log-line">
                  <span className="sr-only">
                    {setSaid(k + 1, set, measure ?? measureOfSet(set), length)}
                  </span>
                  <SetCells
                    n={k + 1}
                    set={set}
                    measure={measure ?? measureOfSet(set)}
                    length={length}
                  />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
