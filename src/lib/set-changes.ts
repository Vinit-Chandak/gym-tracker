import type { LoggedSet } from "@/server/actions/sessions";

/**
 * The stamp of this browser's latest set change, kept in a cookie so every server render can say
 * which of the browser's set changes it has seen (ADR 0030).
 *
 * A set is saved without the workout being rendered again. Screens that show an open workout's
 * sets can then come from the browser's own copy, made before the latest set: the workout
 * itself after leaving an exercise or on Back, and Today, Progress and the finish screen, which
 * the browser keeps for a minute or brings back on Back. Each of them is rendered with the stamp
 * the request carried; the browser compares it with its own, and lays the missing sets over the
 * workout or has any other screen rendered again.
 *
 * Every page that shows the open workout's sets takes part: the workout through
 * `withSetChanges`, any other screen through `FreshAfterSets`. `set-change-pages.test.ts` fails
 * for a page that reads them and does neither.
 */
export const SET_CHANGES_COOKIE = "overload-set-changes";

/** The stamp a cookie holds; anything unreadable counts as none. */
export function parseSetChanges(value: string | null | undefined): number {
  const stamp = Number(value);
  return Number.isSafeInteger(stamp) && stamp > 0 ? stamp : 0;
}

/** One set saved or deleted on this device. */
export type SetChange = {
  /**
   * When the change was confirmed, in milliseconds, and always above every earlier stamp: a
   * change made after another carries the higher stamp, whichever tab made it and whether or not
   * the cookie survived in between.
   */
  stamp: number;
  sessionId: string;
  workoutExerciseId: string;
  setIndex: number;
  /** The set as the server saved it, or null once it was deleted. */
  set: LoggedSet | null;
};
