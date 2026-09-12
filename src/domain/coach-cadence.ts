import { fromDateTimeLocal } from "@/lib/time";

import { addDays, isoWeekday, todayInTimeZone } from "./program-calendar";

export const COACH_TIME_ZONE = "Asia/Kolkata";
export const COACH_BATCH_LOCAL_TIME = "04:00";
export const WEEKLY_REVIEW_POLICY_VERSION = 1;

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

/** The complete seven-day evidence interval ending at a scheduled owner-zone boundary. */
export function weeklyReviewPeriod(scheduledBoundary: Date) {
  if (!Number.isFinite(scheduledBoundary.getTime()))
    throw new Error("A valid scheduled review boundary is required.");
  const reviewDate = todayInTimeZone(COACH_TIME_ZONE, scheduledBoundary);
  const end = boundaryOn(reviewDate);
  if (end.getTime() !== scheduledBoundary.getTime())
    throw new Error("Use the scheduled 04:00 Asia/Kolkata boundary, not the execution time.");
  return {
    policyVersion: WEEKLY_REVIEW_POLICY_VERSION,
    timeZone: COACH_TIME_ZONE,
    reviewDate,
    start: boundaryOn(addDays(reviewDate, -7)).toISOString(),
    /** Exclusive evidence end; also the scheduled boundary used for logical review identity. */
    end: end.toISOString(),
  };
}

/**
 * A changed review weekday takes effect at its first boundary at least seven days after
 * the previous scheduled boundary. Keep that persisted anchor through settings edits and
 * retries; actual execution/completion time never replaces it. This calculates a period,
 * not a dispatch decision or an initial anchor for an athlete who has never had a review.
 */
export function nextWeeklyReviewPeriod(input: {
  previousScheduledBoundary: Date;
  /** ISO weekday: Monday = 1, Sunday = 7. */
  reviewWeekday: number;
}) {
  if (!Number.isInteger(input.reviewWeekday) || input.reviewWeekday < 1 || input.reviewWeekday > 7)
    throw new Error("Choose a review weekday from 1 (Monday) to 7 (Sunday).");
  const previous = weeklyReviewPeriod(input.previousScheduledBoundary);
  const earliest = addDays(previous.reviewDate, 7);
  const daysToSelectedWeekday = (input.reviewWeekday - isoWeekday(earliest) + 7) % 7;
  return weeklyReviewPeriod(boundaryOn(addDays(earliest, daysToSelectedWeekday)));
}

export type WeeklyReviewPeriod = ReturnType<typeof weeklyReviewPeriod>;

/** First review: at least seven full days after consent, then the selected rest weekday. */
export function firstWeeklyReviewPeriod(enabledAt: Date, reviewWeekday: number) {
  if (
    !Number.isFinite(enabledAt.getTime()) ||
    !Number.isInteger(reviewWeekday) ||
    reviewWeekday < 1 ||
    reviewWeekday > 7
  )
    throw new Error("A valid enablement time and review weekday are required.");
  const earliest = new Date(enabledAt.getTime() + 7 * 86_400_000);
  let date = todayInTimeZone(COACH_TIME_ZONE, earliest);
  if (boundaryOn(date) < earliest) date = addDays(date, 1);
  date = addDays(date, (reviewWeekday - isoWeekday(date) + 7) % 7);
  return weeklyReviewPeriod(boundaryOn(date));
}
