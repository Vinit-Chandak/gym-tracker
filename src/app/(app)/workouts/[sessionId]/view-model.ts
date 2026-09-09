import type { BodyLoadUnit } from "@/domain/types";
import type { ComparablePerformance } from "@/server/queries/comparable";
import type { SessionDetail, SessionExercise, SessionSet } from "@/server/repositories/sessions";

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
      sets: exercise.sets.map((set) => ({ ...set, completedAt: set.completedAt.toISOString() })),
      previous: exercise.previous ? toPreviousVM(exercise.previous) : null,
      basis: exercise.basis ? toPreviousVM(exercise.basis) : null,
    })),
  };
}
