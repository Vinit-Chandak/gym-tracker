import type { LoggedSet } from "@/server/actions/sessions";

/**
 * How many sets this browser has saved or deleted, kept in a cookie so every server render can
 * say how many of them it has seen (ADR 0030).
 *
 * A set is saved without the workout being rendered again. Screens that show an open workout's
 * sets can then come from the browser's own copy, made before the latest set: the workout
 * itself after leaving an exercise or on Back, and Today, Progress and the finish screen, which
 * the browser keeps for a minute or brings back on Back. Each of them is rendered with the count
 * the request carried; the browser compares it with its own, and lays the missing sets over the
 * workout or has any other screen rendered again.
 */
export const SET_CHANGES_COOKIE = "overload-set-changes";

/** The count a cookie holds; anything unreadable counts as none. */
export function parseSetChanges(value: string | null | undefined): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** One set saved or deleted on this device, numbered by the change count it brought. */
export type SetChange = {
  count: number;
  sessionId: string;
  workoutExerciseId: string;
  setIndex: number;
  /** The set as the server saved it, or null once it was deleted. */
  set: LoggedSet | null;
};
