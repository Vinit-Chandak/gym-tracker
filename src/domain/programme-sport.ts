import { z } from "zod";

import { ACTIVITY_SPORTS, type ActivitySport } from "./activity";
import { endurancePrescriptionSchema } from "./activity-prescription";

/** A dated session is owned by one sport programme, independently of the lifting cycle. */
export const programmeEnduranceSessionSchema = z.object({
  lineageId: z.uuid(),
  /** Authoring group only; each dated performance keeps its own occurrence identity. */
  seriesId: z.uuid().optional(),
  name: z.string().trim().max(120).default(""),
  weekIndex: z.number().int().min(1).max(52),
  /** Identity within a legacy weekly lineage. Moving a date never changes its performance. */
  originalWeekIndex: z.number().int().min(1).max(52).optional(),
  /** Days from the programme's own start date. Moving a block moves only its own sessions. */
  dayOffset: z.number().int().min(-366).max(1098),
  scheduledLocalTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .default(null),
  prescription: endurancePrescriptionSchema,
});

export type ProgrammeEnduranceSession = z.infer<typeof programmeEnduranceSessionSchema>;
export const programmeSportSchema = z.enum(ACTIVITY_SPORTS);

export function enduranceIdentityWeek(session: {
  weekIndex: number;
  originalWeekIndex?: number;
}): number {
  return session.originalWeekIndex ?? session.weekIndex;
}

/** Validate new writes without making older stored programmes unreadable. */
export function enduranceScheduleIssues(plan: {
  weeks: number;
  enduranceSessions?: readonly ProgrammeEnduranceSession[];
}): string[] {
  const issues = new Set<string>();
  for (const session of plan.enduranceSessions ?? []) {
    if (session.dayOffset < 0 || session.dayOffset >= plan.weeks * 7)
      issues.add("Keep every scheduled session within the programme's length.");
    if (session.weekIndex !== Math.max(1, Math.floor(session.dayOffset / 7) + 1))
      issues.add("A session's week must match its scheduled date.");
  }
  return [...issues];
}

/** Only old payloads lack an explicit sport. Their existing structured fields identify it. */
export function programmeSport(plan: {
  sport?: ActivitySport;
  days: readonly { includesLifting: boolean }[];
}): ActivitySport {
  return plan.sport ?? (plan.days.some((day) => day.includesLifting) ? "strength" : "running");
}
