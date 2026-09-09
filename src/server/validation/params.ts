import type { Route } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

const uuid = z.uuid();

/**
 * Every dynamic route segment in this app is a UUID. A malformed one is a bad URL,
 * not a server fault: left unchecked it reaches Postgres, which rejects the cast and
 * surfaces as "Something went wrong" instead of the not-found screen.
 */
export function requireUuid(value: string): string {
  if (!uuid.safeParse(value).success) notFound();
  return value;
}

export type WorkoutReturn = { sessionId: string; workoutExerciseId: string };

/**
 * Where to come back to after registering a machine mid-workout.
 *
 * Two ids rather than a path: the destination is then built on the server from values that
 * have been checked as UUIDs, so a hand-edited query string cannot turn the redirect into
 * somewhere else entirely. Anything that does not parse simply means "no return path".
 */
export function parseWorkoutReturn(
  sessionId: string | undefined,
  workoutExerciseId: string | undefined,
): WorkoutReturn | null {
  if (!sessionId || !workoutExerciseId) return null;
  if (!uuid.safeParse(sessionId).success || !uuid.safeParse(workoutExerciseId).success) return null;
  return { sessionId, workoutExerciseId };
}

/** The logger URL for a workout return, with the exercise back in focus. */
export function workoutReturnPath(
  target: WorkoutReturn,
): Route<`/workouts/${string}?exercise=${string}`> {
  return `/workouts/${target.sessionId}?exercise=${target.workoutExerciseId}`;
}
