import type { ActivityOutcome, ActivitySport } from "./activity";

/**
 * One intended performance, and what became of it (plan §§6.3, 7).
 *
 * A week and a weekday cannot name a session: two runs on the same Wednesday are two
 * occurrences, each with its own identity, its own prescription revision and its own answer.
 * That identity is what lets one be logged, skipped or moved without touching the other, and
 * what keeps a missed swim from holding up anything at all.
 *
 * An occurrence's disposition is what somebody decided. Whether it is late is a calculation
 * about today's date, not a state anyone wrote — nothing expires at a week boundary (SCHED-04).
 */

export const OCCURRENCE_DISPOSITIONS = [
  "pending",
  "skipped",
  "cancelled",
  /** Resolved by history that has no raw activity behind it, such as migration 0011's rows. */
  "legacy_completed",
] as const;
export type OccurrenceDisposition = (typeof OCCURRENCE_DISPOSITIONS)[number];

export const OCCURRENCE_EVENT_KINDS = [
  "created",
  "logged",
  "log_deleted",
  "skipped",
  "reopened",
  "rescheduled",
  "revised",
  "cancelled",
  "legacy_resolved",
] as const;
export type OccurrenceEventKind = (typeof OCCURRENCE_EVENT_KINDS)[number];

export type Occurrence = {
  id: string;
  sport: ActivitySport;
  disposition: OccurrenceDisposition;
  /** The date it is meant to happen on, in the scheduling zone. */
  scheduledOn: string;
  /** Stable order within a day when several activities share it. */
  orderIndex: number;
  /** Null for standalone work, which belongs to no programme. */
  programFamilyId: string | null;
  /** The week it was first placed in; adherence keeps counting against it after a move. */
  originalWeekIndex: number | null;
  originalScheduledOn: string | null;
};

/** What actually answers for an occurrence. Exactly one activity may ever do so. */
export type OccurrenceResolution =
  | { kind: "logged"; activityId: string; outcome: ActivityOutcome; occurredOn: string }
  | { kind: "skipped" }
  | { kind: "cancelled" }
  | { kind: "legacy_completed" }
  | { kind: "incomplete" };

export type LinkedActivity = {
  id: string;
  outcome: ActivityOutcome;
  /** The actual local date it happened on, which may be later than the scheduled date. */
  occurredOn: string;
};

/**
 * Derived, never stored twice: a logged resolution is the unique linked activity, and every
 * other outcome is what the disposition says. An event log records the history; it is not a
 * second place a completion can come from.
 */
export function resolveOccurrence(
  occurrence: Pick<Occurrence, "disposition">,
  activity: LinkedActivity | null,
): OccurrenceResolution {
  if (activity)
    return {
      kind: "logged",
      activityId: activity.id,
      outcome: activity.outcome,
      occurredOn: activity.occurredOn,
    };
  if (occurrence.disposition === "skipped") return { kind: "skipped" };
  if (occurrence.disposition === "cancelled") return { kind: "cancelled" };
  if (occurrence.disposition === "legacy_completed") return { kind: "legacy_completed" };
  return { kind: "incomplete" };
}

/** Late is a display fact about today, not a destructive state transition. */
export function isOverdue(
  occurrence: Pick<Occurrence, "scheduledOn">,
  resolution: OccurrenceResolution,
  today: string,
): boolean {
  return resolution.kind === "incomplete" && occurrence.scheduledOn < today;
}

/**
 * Whether an activity may still be logged against this occurrence. A skip can be undone by
 * logging it; a cancelled occurrence cannot, because a programme change removed the
 * obligation, and a legacy resolution has to be reopened explicitly first.
 */
export function canLog(
  occurrence: Pick<Occurrence, "disposition">,
  activity: LinkedActivity | null,
): boolean {
  if (activity) return false;
  return occurrence.disposition === "pending" || occurrence.disposition === "skipped";
}

export type AdherenceCounts = {
  logged: number;
  skipped: number;
  incomplete: number;
  cancelled: number;
  legacyCompleted: number;
};

const EMPTY: AdherenceCounts = {
  logged: 0,
  skipped: 0,
  incomplete: 0,
  cancelled: 0,
  legacyCompleted: 0,
};

const COUNT_KEY = {
  logged: "logged",
  skipped: "skipped",
  incomplete: "incomplete",
  cancelled: "cancelled",
  legacy_completed: "legacyCompleted",
} as const;

/**
 * Adherence for a set of occurrences, counted per sport and never merged.
 *
 * Cancelled work is reported apart from the rest: a substitution the athlete approved is not
 * an obligation they failed. Strength adherence is computed over strength occurrences alone,
 * which is the correction to the old combined-day state — an unfinished run no longer makes a
 * completed workout look missed (§9.1).
 */
export function adherenceCounts(
  entries: readonly { resolution: OccurrenceResolution }[],
): AdherenceCounts {
  const counts = { ...EMPTY };
  for (const entry of entries) counts[COUNT_KEY[entry.resolution.kind]]++;
  return counts;
}

export function adherenceBySport(
  entries: readonly { sport: ActivitySport; resolution: OccurrenceResolution }[],
): Partial<Record<ActivitySport, AdherenceCounts>> {
  const out: Partial<Record<ActivitySport, AdherenceCounts>> = {};
  for (const entry of entries) {
    const counts = out[entry.sport] ?? { ...EMPTY };
    counts[COUNT_KEY[entry.resolution.kind]]++;
    out[entry.sport] = counts;
  }
  return out;
}

/**
 * The work still owed, out of a set of occurrences.
 *
 * A date on the calendar is not an obligation: an occurrence that was logged, skipped or
 * cancelled has had its answer, whether that date has come round yet or not. Counting by date
 * alone is what told somebody who had just finished today's run that they still had one to do.
 */
export function outstanding<T extends { resolution: OccurrenceResolution }>(
  occurrences: readonly T[],
): T[] {
  return occurrences.filter((occurrence) => occurrence.resolution.kind === "incomplete");
}

/** Upcoming and earlier standalone work, for the schedule view that owns it (SCHED-08). */
export function splitByDate<T extends Pick<Occurrence, "scheduledOn">>(
  occurrences: readonly T[],
  today: string,
): { upcoming: T[]; earlier: T[] } {
  const upcoming: T[] = [];
  const earlier: T[] = [];
  for (const occurrence of occurrences) {
    (occurrence.scheduledOn >= today ? upcoming : earlier).push(occurrence);
  }
  upcoming.sort((a, b) => (a.scheduledOn < b.scheduledOn ? -1 : 1));
  earlier.sort((a, b) => (a.scheduledOn > b.scheduledOn ? -1 : 1));
  return { upcoming, earlier };
}
