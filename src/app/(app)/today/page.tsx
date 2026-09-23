import type { Metadata } from "next";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getWarmupProtocol } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { todayCoachState } from "@/server/repositories/coach-plans";
import { todayWorkflowState } from "@/server/repositories/coaching-today";
import { listGyms } from "@/server/repositories/gyms";
import { occurrencesForSlot, standaloneOccurrencesOnDate } from "@/server/repositories/occurrences";
import { getSchedule, getTodayPlan } from "@/server/repositories/schedule";

import { TodayView } from "./today-view";

export const metadata: Metadata = { title: "Today" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

export default async function TodayPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  // The active session comes from the shared per-request read the resume strip also uses,
  // so Today and the shell agree on one session without asking the database twice.
  const [inProgress, data] = await Promise.all([
    getActiveSession(user.id),
    withUser(getDb(), user.id, async (tx) => {
      const profile = requestProfile;
      // Read once here and handed on: the coach's job target is worked out from the same
      // schedule and gym list rather than reading each a second time.
      const [gyms, schedule] = await Promise.all([listGyms(tx, user.id), getSchedule(tx, user.id)]);
      const plan = await getTodayPlan(tx, user.id, profile.timeZone, schedule);
      const restProtocol =
        plan?.suggestedDay &&
        !plan.suggestedDay.includesLifting &&
        plan.suggestedDay.warmupProtocolId
          ? await getWarmupProtocol(tx, plan.suggestedDay.warmupProtocolId)
          : null;
      // The coach speaks to the day it is offering, lifting or running, and only for an
      // athlete who has switched it on.
      const coachInput =
        profile.aiCoachEnabled && plan?.suggestion && plan.suggestedDay?.includesLifting
          ? {
              enabled: true,
              timeZone: profile.timeZone,
              programId: plan.program.id,
              ref: plan.suggestion.slot,
              gymId: gyms.find((gym) => gym.isActive && gym.isDefault)?.id ?? null,
            }
          : null;
      const coach = !coachInput
        ? null
        : process.env.COACH_WORKFLOW_ENABLED === "true"
          ? await todayWorkflowState(tx, user.id, coachInput, { schedule, gyms })
          : await todayCoachState(tx, user.id, coachInput);
      // The two things that can be due today, each asked for the way it is scheduled.
      //
      // The programme's endurance belongs to the slot the sequence is offering, not to a
      // date: a block written eight weeks ago dated every run in advance, and an athlete two
      // days behind would otherwise be handed a session from a day they have not reached
      // (plan §2.3). The slot is the day's position in the cycle, which is what an occurrence
      // records; asking by the weekday that day usually falls on is what put a run belonging
      // to one day on the card of another. Standalone work is asked for by date, because a
      // date is exactly what the athlete chose when they put it on the calendar. Neither
      // rolls forward.
      const [standalone, programme] = await Promise.all([
        standaloneOccurrencesOnDate(tx, user.id, todayInTimeZone(profile.timeZone)),
        plan?.suggestion && plan.suggestedDay
          ? occurrencesForSlot(tx, user.id, {
              familyId: plan.program.familyId,
              cycleDayIndex: plan.suggestedDay.dayIndex,
              cycleIndex: plan.suggestion.slot.cycleIndex,
            })
          : Promise.resolve([]),
      ]);
      return { profile, gyms, plan, restProtocol, coach, standalone, programme };
    }),
  ]);
  const { profile, gyms, plan, restProtocol, coach, standalone, programme } = data;

  return (
    <TodayView
      today={plan?.today ?? todayInTimeZone(profile.timeZone)}
      timeZone={profile.timeZone}
      // Only active gyms can be trained at, so only they can be chosen between.
      gyms={gyms
        .filter((gym) => gym.isActive)
        .map((gym) => ({ id: gym.id, name: gym.name, kind: gym.kind, isDefault: gym.isDefault }))}
      plan={plan}
      inProgress={inProgress}
      restProtocol={restProtocol}
      coach={coach}
      unit={LOAD_UNIT_LABELS[profile.preferredUnit]}
      programmeOccurrences={programme}
      standaloneOccurrences={standalone}
    />
  );
}
