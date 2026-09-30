"use client";

import { useEffect, useState } from "react";

import { formatSets } from "@/domain/sets";
import { todayInTimeZone } from "@/domain/program-calendar";
import type { LoadPortability, LoadUnit } from "@/domain/types";
import { formatIsoDay } from "@/lib/format";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { setInUnit } from "@/lib/units";
import { readExerciseHistoryAction, type ExerciseHistoryEntry } from "@/server/actions/sessions";

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; entries: ExerciseHistoryEntry[]; more: boolean };

/**
 * Every past session of this exercise, on any machine, newest first. Read when the History tab
 * opens rather than with the session, so logging a set never waits on the whole record.
 */
export function ExerciseHistory({
  exerciseId,
  workoutExerciseId,
  loadPortability,
  preferredUnit,
  timeZone,
}: {
  exerciseId: string;
  workoutExerciseId: string;
  loadPortability: LoadPortability;
  /** Free-weight loads are shown in this unit; a machine's stay in the machine's own. */
  preferredUnit: LoadUnit;
  timeZone: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    readExerciseHistoryAction(exerciseId, workoutExerciseId).then(
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
  }, [exerciseId, workoutExerciseId, attempt]);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        Loading history…
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <p className="text-ink-muted">
        Could not load the history.{" "}
        <button
          type="button"
          className="min-h-11 font-medium text-accent"
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
    return <p className="text-ink-muted">No earlier sessions of this exercise.</p>;
  }

  return (
    <div className="space-y-1">
      <h3 className="font-medium">
        All sessions{" "}
        <span className="font-normal text-ink-muted tabular-nums">
          · {state.entries.length}
          {state.more ? "+" : ""}
        </span>
      </h3>
      <ul className="divide-y divide-line">
        {state.entries.map((entry) => (
          <li key={entry.workoutExerciseId} className="space-y-0.5 py-2">
            <div className="flex justify-between gap-3">
              <span className="font-medium tabular-nums">
                {formatIsoDay(todayInTimeZone(timeZone, new Date(entry.performedAt)))}
              </span>
              <span className="min-w-0 truncate text-ink-muted">
                {entry.gymName}
                {entry.equipmentName ? ` · ${entry.equipmentName}` : ""}
              </span>
            </div>
            <p className="[overflow-wrap:anywhere] text-ink-muted tabular-nums">
              {formatSets(
                entry.sets.map((set) =>
                  loadPortability === "global" ? setInUnit(set, preferredUnit) : set,
                ),
                (unit) => LOAD_UNIT_LABELS[unit],
              )}
            </p>
          </li>
        ))}
      </ul>
      {state.more && (
        <p className="text-xs text-ink-subtle">
          Showing the latest {state.entries.length} sessions.
        </p>
      )}
    </div>
  );
}
