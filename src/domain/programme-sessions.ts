import type { ActivitySport } from "./activity";
import type { OccurrenceResolution } from "./occurrences";
import {
  allSlots,
  nextPendingSlot,
  partStatus,
  slotFor,
  type ScheduleState,
  type SlotRef,
} from "./schedule";

/**
 * Where each of a programme's sessions stands, read the way the programme runs (ADR 0051).
 *
 * The programme is a sequence that waits. A run belongs to a slot of the cycle, and Today
 * offers it when the sequence reaches that slot, whatever the date on its row — that date is
 * where the block first put it, not a deadline. So a run whose date has gone by is not missed
 * while the sequence has still to reach it: it is to come, and the one at the slot the
 * sequence has reached is Today's. Reading the date alone called the run Today was offering
 * "Not done", and every run of a fortnight's gap "Logged" on days nothing happened.
 *
 * Only work the sequence cannot offer is read by its date: an occurrence that belongs to no
 * slot of the cycle, which the programme view is the one place to answer.
 */
export type SessionStanding =
  /** At the slot the sequence has reached: the run Today offers. */
  | "next"
  /** Still owed, further along the sequence (or, for work no slot owns, dated from today on). */
  | "to_come"
  /** Left behind with no answer: the sequence has passed it, or it owns no slot and its day went by. */
  | "not_done"
  | "logged"
  | "skipped"
  | "cancelled"
  | "legacy_completed";

export type ProgrammeSession = {
  scheduledOn: string;
  /** The cycle and the slot of the cycle it belongs to; null when it belongs to none. */
  cycleIndex: number | null;
  cycleDayIndex: number | null;
  resolution: OccurrenceResolution;
};

function sameSlot(a: SlotRef, b: SlotRef): boolean {
  return a.cycleIndex === b.cycleIndex && a.dayIndex === b.dayIndex;
}

function slotBefore(a: SlotRef, b: SlotRef): boolean {
  return a.cycleIndex < b.cycleIndex || (a.cycleIndex === b.cycleIndex && a.dayIndex < b.dayIndex);
}

/** The slot of the sequence a session belongs to, or null when the programme has no such slot. */
export function sessionSlot(state: ScheduleState, session: ProgrammeSession): SlotRef | null {
  if (session.cycleIndex === null || session.cycleDayIndex === null) return null;
  const ref = { cycleIndex: session.cycleIndex, dayIndex: session.cycleDayIndex };
  return allSlots(state).some((slot) => sameSlot(slot, ref)) ? ref : null;
}

/**
 * Where a session stands by its date alone: for work no running sequence offers — standalone
 * sessions, a block since replaced, and work that belongs to no slot of the cycle.
 */
export function standingByDate(
  session: Pick<ProgrammeSession, "scheduledOn" | "resolution">,
  today: string,
): SessionStanding {
  if (session.resolution.kind !== "incomplete") return session.resolution.kind;
  return session.scheduledOn < today ? "not_done" : "to_come";
}

/**
 * Where one session stands.
 *
 * An answer on the occurrence is the answer. A run skipped from Today, or by "Pick up from
 * today", is skipped on the occurrence itself (`skipSlotPart`), so it reads skipped here as it
 * does in the coach's adherence; one still owed is owed, whatever the day says. It used to be
 * read from the day, which said "Skipped" here of a run the coach was told was not done.
 * `position` is the slot the sequence has reached (`nextPendingSlot`), worked out once by a
 * caller reading many sessions.
 */
export function sessionStanding(
  state: ScheduleState,
  session: ProgrammeSession,
  today: string,
  position: SlotRef | null = nextPendingSlot(state),
): SessionStanding {
  const ref = sessionSlot(state, session);
  if (session.resolution.kind !== "incomplete" || !ref) return standingByDate(session, today);
  // A completion recorded on the day with no activity behind it is history from before
  // occurrences answered for runs: completed, with nothing invented.
  if (partStatus(state, ref, "run") === "completed") return "legacy_completed";
  if (position && sameSlot(ref, position)) return "next";
  if (position === null || slotBefore(ref, position)) return "not_done";
  return "to_come";
}

/** Still owed, and not yet left behind: what the programme view lists first. */
export function isAhead(standing: SessionStanding): boolean {
  return standing === "next" || standing === "to_come";
}

export type SportAdherence = {
  sport: ActivitySport;
  /** Logged, or finished as a workout; a completion migrated without an activity counts too. */
  done: number;
  skipped: number;
  toCome: number;
  notDone: number;
  /** Withdrawn by a change to the programme: not an obligation anybody failed. */
  cancelled: number;
};

const empty = (sport: ActivitySport): SportAdherence => ({
  sport,
  done: 0,
  skipped: 0,
  toCome: 0,
  notDone: 0,
  cancelled: 0,
});

/**
 * The lifting half of the programme, counted by its days.
 *
 * Lifting has no occurrences — its sequence is the programme's own (plan §2.3) — so its days
 * are counted from the sequence: each day that lifts, in every cycle, done, skipped or still
 * to come. A day that lifts and runs counts here for its workout and with the runs for its
 * run, so neither sport's record is the other's.
 */
export function liftingAdherence(state: ScheduleState): SportAdherence | null {
  const counts = empty("strength");
  let days = 0;
  for (const ref of allSlots(state)) {
    if (!slotFor(state, ref)?.includesLifting) continue;
    days++;
    const status = partStatus(state, ref, "session");
    if (status === "completed") counts.done++;
    else if (status === "skipped") counts.skipped++;
    else counts.toCome++;
  }
  return days > 0 ? counts : null;
}

/** A programme's endurance sessions, counted per sport by where each stands. */
export function enduranceAdherence(
  sessions: readonly { sport: ActivitySport; standing: SessionStanding }[],
): SportAdherence[] {
  const bySport = new Map<ActivitySport, SportAdherence>();
  for (const { sport, standing } of sessions) {
    const counts = bySport.get(sport) ?? empty(sport);
    if (standing === "logged" || standing === "legacy_completed") counts.done++;
    else if (standing === "skipped") counts.skipped++;
    else if (standing === "cancelled") counts.cancelled++;
    else if (standing === "not_done") counts.notDone++;
    else counts.toCome++;
    bySport.set(sport, counts);
  }
  return [...bySport.values()];
}
