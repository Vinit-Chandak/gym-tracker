import type { SessionDetail, SessionExercise, SessionSet } from "@/server/repositories/sessions";

/** JSON-safe shape handed to the client session view (dates as ISO strings). */
export type SetVM = Omit<SessionSet, "completedAt"> & { completedAt: string };

export type PreviousVM = {
  gymName: string;
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
  "sets" | "previous" | "completedAt" | "skippedAt"
> & {
  sets: SetVM[];
  previous: PreviousVM | null;
  completedAt: string | null;
  skippedAt: string | null;
};

export type SessionVM = Omit<SessionDetail, "exercises" | "startedAt" | "completedAt"> & {
  exercises: ExerciseVM[];
  startedAt: string;
  completedAt: string | null;
  timeZone: string;
};

export function toSessionVM(detail: SessionDetail, timeZone: string): SessionVM {
  return {
    ...detail,
    timeZone,
    startedAt: detail.startedAt.toISOString(),
    completedAt: detail.completedAt?.toISOString() ?? null,
    exercises: detail.exercises.map((exercise) => ({
      ...exercise,
      completedAt: exercise.completedAt?.toISOString() ?? null,
      skippedAt: exercise.skippedAt?.toISOString() ?? null,
      sets: exercise.sets.map((set) => ({ ...set, completedAt: set.completedAt.toISOString() })),
      previous: exercise.previous
        ? {
            gymName: exercise.previous.gymName,
            performedAt: exercise.previous.performedAt.toISOString(),
            sameMachine: exercise.previous.equipmentInstanceId !== null,
            sets: exercise.previous.sets,
          }
        : null,
    })),
  };
}
