import { knownLoads } from "@/domain/load-steps";
import type { BodyLoadUnit, LoadUnit } from "@/domain/types";
import type { SetChange } from "@/lib/set-changes";
import type { LoggedSet } from "@/server/actions/sessions";
import type { ComparablePerformance } from "@/server/queries/comparable";
import type { SessionDetail, SessionExercise, SessionSet } from "@/server/repositories/sessions";
import { setInUnit } from "@/lib/units";

/** JSON-safe shape handed to the client session view (dates as ISO strings). */
export type SetVM = Omit<SessionSet, "completedAt"> & { completedAt: string };

export type PreviousVM = {
  gymName: string;
  equipmentName: string | null;
  performedAt: string;
  sameMachine: boolean;
  sets: {
    setIndex: number;
    setType: SessionSet["setType"];
    weight: number | null;
    unit: SessionSet["unit"];
    reps: number | null;
    rir: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
  }[];
};

export type ExerciseVM = Omit<
  SessionExercise,
  "sets" | "previous" | "basis" | "completedAt" | "skippedAt"
> & {
  sets: SetVM[];
  previous: PreviousVM | null;
  basis: PreviousVM | null;
  completedAt: string | null;
  skippedAt: string | null;
};

function toPreviousVM(performance: ComparablePerformance): PreviousVM {
  return {
    gymName: performance.gymName,
    equipmentName: performance.equipmentInstanceName,
    performedAt: performance.performedAt.toISOString(),
    sameMachine: performance.equipmentInstanceId !== null,
    sets: performance.sets,
  };
}

export type SessionVM = Omit<SessionDetail, "exercises" | "startedAt" | "completedAt"> & {
  exercises: ExerciseVM[];
  startedAt: string;
  completedAt: string | null;
  timeZone: string;
  /** Unit for loads no machine decides — free weights and added bodyweight load. */
  preferredUnit: BodyLoadUnit;
};

export function toSessionVM(
  detail: SessionDetail,
  timeZone: string,
  preferredUnit: BodyLoadUnit,
): SessionVM {
  return {
    ...detail,
    timeZone,
    preferredUnit,
    startedAt: detail.startedAt.toISOString(),
    completedAt: detail.completedAt?.toISOString() ?? null,
    exercises: detail.exercises.map((exercise) => ({
      ...exercise,
      completedAt: exercise.completedAt?.toISOString() ?? null,
      skippedAt: exercise.skippedAt?.toISOString() ?? null,
      sets: exercise.sets.map((set) => ({
        ...setInUnit(set, exercise.equipment?.unit ?? preferredUnit),
        completedAt: set.completedAt.toISOString(),
      })),
      previous: exercise.previous ? toPreviousVM(exercise.previous) : null,
      basis: exercise.basis ? toPreviousVM(exercise.basis) : null,
    })),
  };
}

/** A set as a save returned it, in the shape and unit the server gives the page's own sets. */
function savedSetVM(set: LoggedSet, unit: LoadUnit): SetVM {
  return setInUnit(
    {
      id: set.id,
      setIndex: set.setIndex,
      setType: set.setType,
      weight: set.weight,
      unit: set.unit,
      reps: set.reps,
      rir: set.rir,
      rpe: set.rpe,
      effortReported: set.effortReported,
      durationSeconds: set.durationSeconds,
      distanceMeters: set.distanceMeters,
      completedAt: set.completedAt,
    },
    unit,
  );
}

/**
 * The session as the server has it now: the render, plus the sets this tab has saved or deleted
 * since it was made (ADR 0030).
 *
 * A saved set no longer renders the page again, and the browser can show this render again
 * later, after an exercise is left or on Back. `seen` is how many of this browser's set changes
 * the render already held; the rest are applied in the order they were made. Applying one the
 * render did hold changes nothing, so a render that raced a save is still right.
 *
 * Nothing else in the session depends on its own sets (history reads finished sessions only)
 * except a stack's ladder, which learns every load lifted on it in its own unit. The loads of
 * the sets saved here that still stand are added to it, as the server would add them. A load
 * the render knew only from a set deleted here stays known until the next render: one extra
 * stop on the ladder, never a missing one.
 */
export function withSetChanges(
  session: SessionVM,
  changes: readonly SetChange[],
  seen: number,
): SessionVM {
  const pending = changes.filter(
    (change) => change.sessionId === session.id && change.count > seen,
  );
  if (pending.length === 0) return session;
  // The last change to each set is the one that stands.
  const standing = new Map(
    pending.map((change) => [`${change.workoutExerciseId}:${change.setIndex}`, change]),
  );
  const machineOf = new Map(session.exercises.map((exercise) => [exercise.id, exercise.equipment]));
  const learned = new Map<string, number[]>();
  for (const { workoutExerciseId, set } of standing.values()) {
    const machine = machineOf.get(workoutExerciseId);
    if (!machine?.ladder?.stack || !set || set.unit !== machine.unit) continue;
    if (set.weight === null || set.weight <= 0) continue;
    learned.set(machine.id, [...(learned.get(machine.id) ?? []), set.weight]);
  }
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      const own = pending.filter((change) => change.workoutExerciseId === exercise.id);
      const loads = exercise.equipment ? learned.get(exercise.equipment.id) : undefined;
      if (own.length === 0 && !loads) return exercise;
      const unit = exercise.equipment?.unit ?? session.preferredUnit;
      const bySetIndex = new Map(exercise.sets.map((set) => [set.setIndex, set]));
      for (const change of own) {
        if (change.set) bySetIndex.set(change.setIndex, savedSetVM(change.set, unit));
        else bySetIndex.delete(change.setIndex);
      }
      const ladder = exercise.equipment?.ladder;
      return {
        ...exercise,
        sets:
          own.length === 0
            ? exercise.sets
            : [...bySetIndex.values()].sort((a, b) => a.setIndex - b.setIndex),
        equipment:
          exercise.equipment && ladder && loads
            ? {
                ...exercise.equipment,
                ladder: { ...ladder, known: knownLoads(ladder.known, loads) },
              }
            : exercise.equipment,
      };
    }),
  };
}
