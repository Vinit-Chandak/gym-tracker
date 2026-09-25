import type { Metadata } from "next";

import { FreshAfterSets } from "@/components/fresh-after-sets";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { macroTargets } from "@/domain/nutrition";
import { todayInTimeZone } from "@/domain/program-calendar";
import { foodTrackingEnabled } from "@/lib/env";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { getActiveSession } from "@/server/queries/active-session";
import { getWarmupProtocol } from "@/server/queries/reference";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { todayCoachState, withPreparedTargets } from "@/server/repositories/coach-plans";
import { todayWorkflowState } from "@/server/repositories/coaching-today";
import { listGyms } from "@/server/repositories/gyms";
import { readFoodDay } from "@/server/repositories/nutrition";
import { occurrencesForSlot, standaloneOccurrencesOnDate } from "@/server/repositories/occurrences";
import { getSchedule, getTodayPlan } from "@/server/repositories/schedule";

import Loading from "./loading";
import { TodayView } from "./today-view";

export const metadata: Metadata = { title: "Today" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once, except a set: a copy older
 * than the latest set is rendered again before it is shown (the open workout's card counts them).
 * Only a change made elsewhere, on another device or by the coach, can take up to the minute.
 */
export const unstable_dynamicStaleTime = 60;

export default async function TodayPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  const seen = await seenSetChanges();
  // Food tracking is hidden unless switched on for this account (ADR 0032); off, Today reads
  // exactly what it read before.
  const food = foodTrackingEnabled(user.email);
  // The active session comes from the shared per-request read the resume strip also uses,
  // so Today and the shell agree on one session without asking the database twice.
  const [inProgress, data] = await Promise.all([
    getActiveSession(user.id),
    // Read-only, so rendering Today (or prefetching it) never queues behind a set being saved.
    withUser(
      getDb(),
      user.id,
      async (tx) => {
        const profile = requestProfile;
        // Read once here and handed on: the coach's job target is worked out from the same
        // schedule and gym list rather than reading each a second time.
        const [gyms, schedule] = await Promise.all([
          listGyms(tx, user.id),
          getSchedule(tx, user.id),
        ]);
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
        const [standalone, programme, foodDay] = await Promise.all([
          standaloneOccurrencesOnDate(tx, user.id, todayInTimeZone(profile.timeZone)),
          plan?.suggestion && plan.suggestedDay
            ? occurrencesForSlot(tx, user.id, {
                familyId: plan.program.familyId,
                cycleDayIndex: plan.suggestedDay.dayIndex,
                cycleIndex: plan.suggestion.slot.cycleIndex,
              })
            : Promise.resolve([]),
          // One read-only statement when enabled; no food query when the flag is off.
          food
            ? readFoodDay(tx, user.id, todayInTimeZone(profile.timeZone))
            : Promise.resolve(null),
        ]);
        // What the coach prepared for each, where it did: the target to follow today.
        const [preparedStandalone, preparedProgramme] = await Promise.all([
          withPreparedTargets(tx, user.id, standalone),
          withPreparedTargets(tx, user.id, programme),
        ]);
        return {
          profile,
          gyms,
          plan,
          restProtocol,
          coach,
          standalone: preparedStandalone,
          programme: preparedProgramme,
          foodDay,
        };
      },
      { readOnly: true },
    ),
  ]);
  const { profile, gyms, plan, restProtocol, coach, standalone, programme, foodDay } = data;
  if (coach?.expiredJobs) tidyCoachJobsLater(user.id);

  return (
    <FreshAfterSets seen={seen} loading={<Loading />}>
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
        food={
          foodDay && {
            eaten: foodDay.eaten,
            // Protein follows the newest body weight, so it is worked out now, not stored.
            target: foodDay.targets ? macroTargets(foodDay.targets, profile.bodyWeightKg) : null,
          }
        }
      />
    </FreshAfterSets>
  );
}
