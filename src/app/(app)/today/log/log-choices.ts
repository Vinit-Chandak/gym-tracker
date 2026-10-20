import { formatIsoDate } from "@/lib/format";

/** How far back a missed session can still be counted, and how far ahead one can be done early. */
export const MISSED_DAYS = 14;
export const EARLY_DAYS = 6;

/** A lifting day, as Counts as names it: its day, its place in the cycle, and its cycle. */
export type LiftingChoice = { programDayId: string; dayIndex: number; cycleIndex: number };

/** The `counts` of a lifting day, as Counts as writes it into its link. */
export function liftingCounts(choice: LiftingChoice): string {
  return `day:${choice.programDayId}:${choice.dayIndex}:${choice.cycleIndex}`;
}

/** The lifting day a `counts` names, or null for anything else. */
export function parseLifting(counts: string | undefined): LiftingChoice | null {
  const match = counts?.match(/^day:([0-9a-f-]{36}):(\d+):(\d+)$/);
  return match
    ? { programDayId: match[1]!, dayIndex: Number(match[2]), cycleIndex: Number(match[3]) }
    : null;
}

type Dated = { scheduledOn: string; disposition: string };

/**
 * Where a session stands against today, in Counts as's few words: today's, missed on its day,
 * skipped, or to be done early.
 */
export function standing(session: Dated, today: string): string {
  const on = formatIsoDate(session.scheduledOn, today.slice(0, 4));
  const skipped = session.disposition === "skipped";
  if (session.scheduledOn === today) return skipped ? "Today · skipped" : "Today";
  if (skipped) return `${on} · skipped`;
  return session.scheduledOn < today ? `${on} · missed` : `${on} · early`;
}

/** Today's first, then what was missed, most recent first, then what is still to come. */
export function inOrder<T extends Dated>(sessions: readonly T[], today: string): T[] {
  const rank = (session: T) =>
    session.scheduledOn === today ? 0 : session.scheduledOn < today ? 1 : 2;
  return [...sessions].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 1
        ? b.scheduledOn.localeCompare(a.scheduledOn)
        : a.scheduledOn.localeCompare(b.scheduledOn)),
  );
}

/**
 * A lifting day's line under its name in Counts as, read from the start it would get
 * (`liftingStartOption`): the day the programme offers next, one later in this cycle, one
 * skipped, one done this cycle and trained again, or one of a cycle still to come.
 */
export function liftingSub(option: { next: boolean; label: string; cycleIndex: number }): string {
  if (option.next) return "Next in your programme";
  if (option.label === "Start") return "This cycle";
  if (option.label === "Start skipped workout") return "Skipped this cycle";
  if (option.label === "Do again") return "Done this cycle; trains it again";
  return `Cycle ${option.cycleIndex}`;
}
