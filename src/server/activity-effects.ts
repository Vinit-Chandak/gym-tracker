import { revalidatePath } from "next/cache";

import type { ActivitySport } from "@/domain/activity";

/**
 * Everything a change to one activity is visible in (plan §9.3).
 *
 * Centralised on purpose. Saving used to revalidate a hand-written list of paths at each call
 * site, which is how one of them ends up stale: a log appears in History but not on Progress,
 * or a deleted activity still counts on a friend's leaderboard. One typed helper means adding
 * a screen means adding it here, once.
 */

export type ActivityChange = {
  sport: ActivitySport;
  activityId?: string | null;
  /** Set when the change settled or reopened a scheduled occurrence. */
  occurrenceId?: string | null;
  /** The account's public handle, when its shared projection changed with it. */
  username?: string | null;
};

/** The screens that read an athlete's own training, whatever the sport. */
const OWNED_PATHS = ["/today", "/training", "/progress", "/progress/history", "/profile"];

/** Kept while the old Runs pages still resolve, so a bookmarked list is not stale either. */
const COMPATIBILITY_PATHS = ["/runs", "/profile/programme"];

export function activityPaths(change: ActivityChange): string[] {
  const paths = [...OWNED_PATHS, ...COMPATIBILITY_PATHS];
  if (change.activityId) {
    paths.push(`/training/activities/${change.activityId}`);
    if (change.sport === "running") paths.push(`/runs/${change.activityId}`);
  }
  if (change.occurrenceId) {
    paths.push("/training/programme");
    paths.push(`/training/programme/occurrences/${change.occurrenceId}`);
  }
  if (change.username) paths.push(`/u/${change.username}`);
  return paths;
}

/** Revalidates every view a change touches. Call it after the transaction commits. */
export function revalidateActivity(change: ActivityChange): void {
  for (const path of activityPaths(change)) revalidatePath(path);
}
