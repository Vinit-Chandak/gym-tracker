import { and, eq, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { activities, workoutSessions } from "@/db/schema";
import type { DateRange } from "@/server/validation/date-range";

/**
 * A workout's day, as every screen dates it: the local date its parent activity froze when the
 * session was opened (plan §6.3), as a run's, a ride's and a swim's are. A later change of the
 * profile's zone moves none of them, so the calendar, the day, History and the graphs put a
 * lift on the day it was done, beside the run of the same morning. A session older than the
 * parents, which has none, is dated by its start in the account's zone, as it always was.
 *
 * Each helper needs the parent joined: `.leftJoin(activities, strengthParent)`.
 */

/** A session's parent activity, joined on the owner as well as the id. */
export const strengthParent = and(
  eq(activities.id, workoutSessions.activityId),
  eq(activities.userId, workoutSessions.userId),
);

/** The day as `YYYY-MM-DD`. */
export const strengthDay = (timeZone: string) =>
  sql<string>`coalesce(
    to_char(${activities.occurredOn}, 'YYYY-MM-DD'),
    to_char(${workoutSessions.startedAt} at time zone ${timeZone}, 'YYYY-MM-DD')
  )`;

/**
 * No zone is more than 26 hours from another (UTC−12 to UTC+14), so a day recorded in one is
 * never more than two days from the same day's instants in another.
 */
const MARGIN_MS = 2 * 86_400_000;

/**
 * Sessions on the days of `range`, both ends included: by the parent's date, else by the
 * range's instants. The instants, widened by the margin, come first so the index on a session's
 * start still answers most of it.
 */
export const strengthOnDays = (range: DateRange) =>
  and(
    gte(workoutSessions.startedAt, new Date(range.start.getTime() - MARGIN_MS)),
    lt(workoutSessions.startedAt, new Date(range.end.getTime() + MARGIN_MS)),
    or(
      and(
        isNotNull(activities.id),
        gte(activities.occurredOn, range.from),
        lte(activities.occurredOn, range.to),
      ),
      and(
        isNull(activities.id),
        gte(workoutSessions.startedAt, range.start),
        lt(workoutSessions.startedAt, range.end),
      ),
    ),
  );
