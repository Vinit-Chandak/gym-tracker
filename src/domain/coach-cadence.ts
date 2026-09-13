import { fromDateTimeLocal } from "@/lib/time";

import { addDays, todayInTimeZone } from "./program-calendar";

export const COACH_TIME_ZONE = "Asia/Kolkata";
export const COACH_BATCH_LOCAL_TIME = "04:00";
/** Bumped when the rule deciding what a review reads and when it runs changes. */
export const WEEKLY_REVIEW_POLICY_VERSION = 2;

/** No review reads less than a full week of training. */
export const MIN_REVIEW_INTERVAL_DAYS = 7;
/** And none waits longer than this for a rest day that may never come. */
export const MAX_REVIEW_INTERVAL_DAYS = 10;

const DAY_MS = 86_400_000;

function boundaryOn(date: string): Date {
  const boundary = fromDateTimeLocal(`${date}T${COACH_BATCH_LOCAL_TIME}`, COACH_TIME_ZONE);
  if (!boundary) throw new Error("Invalid coach review date.");
  return boundary;
}

/** Latest scheduled shared batch, including when a delayed run starts after midnight. */
export function lastCoachBoundary(now = new Date()) {
  let date = todayInTimeZone(COACH_TIME_ZONE, now);
  if (boundaryOn(date) > now) date = addDays(date, -1);
  return { date, at: boundaryOn(date) };
}

/**
 * Whether a review is owed, given when the last one ended.
 *
 * A review reads the week that has just finished and rewrites the week to come, so it belongs
 * on a day with nothing to disturb. Which day that is cannot be known from a calendar: the
 * programme is a sequence, not a timetable — "the next thing to do is always the earliest slot
 * that has not been completed or skipped" — so one missed session slides every later one along
 * and a weekday picked when the programme was written stops being the athlete's rest day.
 *
 * So the review waits for a day the athlete actually rested. `needs_a_quiet_day` says a week
 * has passed and the next off day is the moment; the caller looks at what was logged. Nobody
 * trains forever, but somebody can train for a fortnight, and a review that never runs is
 * worse than one on a training day — hence the ceiling, after which it is simply `due`.
 */
export type ReviewStanding = "too_soon" | "needs_a_quiet_day" | "due";

export function reviewStanding(anchor: Date, scheduledBoundary: Date): ReviewStanding {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(scheduledBoundary.getTime()))
    throw new Error("A valid review anchor and scheduled boundary are required.");
  const elapsedDays = (scheduledBoundary.getTime() - anchor.getTime()) / DAY_MS;
  if (elapsedDays < MIN_REVIEW_INTERVAL_DAYS) return "too_soon";
  return elapsedDays >= MAX_REVIEW_INTERVAL_DAYS ? "due" : "needs_a_quiet_day";
}

/**
 * The evidence interval a review covers: everything since the last one ended, up to the
 * boundary it is running at.
 *
 * The interval is no longer a fixed seven days. A trigger that waits for a rest day can land
 * up to three days late, and a fixed window would leave those days unread by any review at
 * all. Reading from the previous review's own end means every day is read exactly once,
 * whatever the gap turned out to be.
 */
export function weeklyReviewPeriod(anchor: Date, scheduledBoundary: Date) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(scheduledBoundary.getTime()))
    throw new Error("A valid review anchor and scheduled boundary are required.");
  const reviewDate = todayInTimeZone(COACH_TIME_ZONE, scheduledBoundary);
  const end = boundaryOn(reviewDate);
  if (end.getTime() !== scheduledBoundary.getTime())
    throw new Error("Use the scheduled 04:00 Asia/Kolkata boundary, not the execution time.");
  if (anchor >= end) throw new Error("A review interval ends after it starts.");
  return {
    policyVersion: WEEKLY_REVIEW_POLICY_VERSION,
    timeZone: COACH_TIME_ZONE,
    reviewDate,
    /** The previous review's end, or the moment coaching was switched on. */
    start: anchor.toISOString(),
    /** Exclusive evidence end; also the scheduled boundary used for logical review identity. */
    end: end.toISOString(),
  };
}

export type WeeklyReviewPeriod = ReturnType<typeof weeklyReviewPeriod>;

/**
 * Which weekday the programme as written leaves free.
 *
 * Nobody is asked this and nothing is scheduled by it: a review runs on a day the athlete
 * actually rested, which only the log knows. It is kept because the coach is shown it — the
 * day the plan itself intends to be quiet is worth knowing when rewriting the plan — and
 * because it is the honest answer to "when was this programme meant to leave you alone".
 * Each weekday scores by what sits on it (a session, a run, or nothing) and the quietest
 * wins; the tie goes to the later day in the week, so a Monday-to-Friday lifter's free day
 * is Sunday, ready for Monday.
 */
export function reviewWeekdayFor(week: {
  trainingDays: readonly number[];
  runDays?: readonly number[];
}): number {
  const cost = (day: number) =>
    (week.trainingDays.includes(day) ? 2 : 0) + (week.runDays?.includes(day) ? 1 : 0);
  let chosen = 7;
  for (let day = 1; day <= 7; day++) if (cost(day) <= cost(chosen)) chosen = day;
  return chosen;
}
