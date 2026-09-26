import { knownLoads } from "@/domain/load-steps";
import type { BodyLoadUnit } from "@/domain/types";
import type { SetChange } from "@/lib/set-changes";
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
    rpe?: number | null;
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

/**
 * The session as the server has it now: the render, plus the sets this tab has saved or deleted
 * since it was made (ADR 0030).
 *
 * A saved set no longer renders the page again, and the browser can show this render again
 * later, after an exercise is left or on Back. `seen` is the stamp of the latest of this
 * browser's set changes the render already held; later ones are applied in the order they were
 * made. Applying one the render did hold changes nothing, so a render that raced a save is still
 * right. A saved set is the same columns the render's own sets are, converted the same way.
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
  const byExercise = new Map<string, SetChange[]>();
  for (const change of changes) {
    if (change.sessionId !== session.id || change.stamp <= seen) continue;
    const list = byExercise.get(change.workoutExerciseId);
    if (list) list.push(change);
    else byExercise.set(change.workoutExerciseId, [change]);
  }
  if (byExercise.size === 0) return session;

  // The last change to each set is the one that stands; a stack learns the loads of those.
  const learned = new Map<string, number[]>();
  for (const exercise of session.exercises) {
    const machine = exercise.equipment;
    const own = byExercise.get(exercise.id);
    if (!own || !machine?.ladder?.stack) continue;
    const standing = new Map(own.map((change) => [change.setIndex, change.set]));
    for (const set of standing.values()) {
      if (!set || set.unit !== machine.unit || set.weight === null || set.weight <= 0) continue;
      learned.set(machine.id, [...(learned.get(machine.id) ?? []), set.weight]);
    }
  }

  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      const own = byExercise.get(exercise.id);
      const loads = exercise.equipment ? learned.get(exercise.equipment.id) : undefined;
      if (!own && !loads) return exercise;
      const unit = exercise.equipment?.unit ?? session.preferredUnit;
      let sets = exercise.sets;
      if (own) {
        const bySetIndex = new Map(sets.map((set) => [set.setIndex, set]));
        for (const change of own) {
          if (change.set) bySetIndex.set(change.setIndex, setInUnit(change.set, unit));
          else bySetIndex.delete(change.setIndex);
        }
        sets = [...bySetIndex.values()].sort((a, b) => a.setIndex - b.setIndex);
      }
      const ladder = exercise.equipment?.ladder;
      return {
        ...exercise,
        sets,
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
