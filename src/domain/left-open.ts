/**
 * A workout left open (owner, 11 October 2026): nothing logged in it for six hours, counted from
 * its last set, or from its start before any. Nothing closes it for the athlete. Today and the
 * workout offer to finish it as of that last set, or to discard it while it holds none, and only
 * the athlete's tap does either. Finished so, its time is the training's, start to last set,
 * everywhere it is read, rather than the night it stood open.
 */
export const LEFT_OPEN_MS = 6 * 60 * 60 * 1000;

/** When an open workout was last trained: its last set, or its start before any. */
export function lastTrainedAt(startedAt: Date, lastSetAt: Date | null | undefined): Date {
  return lastSetAt ?? startedAt;
}

/** Whether an open workout has been left open by `now`. */
export function isLeftOpen(
  startedAt: Date,
  lastSetAt: Date | null | undefined,
  now: Date,
): boolean {
  return now.getTime() - lastTrainedAt(startedAt, lastSetAt).getTime() > LEFT_OPEN_MS;
}

/**
 * When a workout finished as of its last set ends: at that set, when it was left open; at `now`
 * otherwise, as any finish does, so a tap made just after a set never moves the end back.
 */
export function finishedAsOf(lastSetAt: Date | null, now: Date): Date {
  return lastSetAt && now.getTime() - lastSetAt.getTime() > LEFT_OPEN_MS ? lastSetAt : now;
}
