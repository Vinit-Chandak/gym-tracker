import { z } from "zod";

import { ACTIVITY_SPORTS, type ActivitySport } from "./activity";
import { endurancePrescriptionSchema } from "./activity-prescription";

/** A dated session is owned by one sport programme, independently of the lifting cycle. */
export const programmeEnduranceSessionSchema = z.object({
  lineageId: z.uuid(),
  name: z.string().trim().max(120).default(""),
  weekIndex: z.number().int().min(1).max(52),
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

/** Only old payloads lack an explicit sport. Their existing structured fields identify it. */
export function programmeSport(plan: {
  sport?: ActivitySport;
  days: readonly { includesLifting: boolean }[];
}): ActivitySport {
  return plan.sport ?? (plan.days.some((day) => day.includesLifting) ? "strength" : "running");
}
