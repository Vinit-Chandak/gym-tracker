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
import { listGyms } from "@/server/repositories/gyms";
import { getTodayPlan } from "@/server/repositories/schedule";

import { TodayView } from "./today-view";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const requestProfile = await getRequestProfile(user.id, user.email);
  // The active session comes from the shared per-request read the resume strip also uses,
  // so Today and the shell agree on one session without asking the database twice.
  const inProgress = await getActiveSession(user.id);
  const data = await withUser(getDb(), user.id, async (tx) => {
    const profile = requestProfile;
    const [gyms, plan] = await Promise.all([
      listGyms(tx, user.id),
      getTodayPlan(tx, user.id, profile.timeZone),
    ]);
    const restProtocol =
      plan?.suggestedDay && !plan.suggestedDay.includesLifting && plan.suggestedDay.warmupProtocolId
        ? await getWarmupProtocol(tx, plan.suggestedDay.warmupProtocolId)
        : null;
    // The coach speaks to the day it is offering, lifting or running, and only for an
    // athlete who has switched it on.
    const coach =
      profile.aiCoachEnabled &&
      plan?.suggestion &&
      (plan.suggestedDay?.includesLifting || plan.suggestedDay?.includesRun)
        ? await todayCoachState(tx, user.id, {
            enabled: true,
            timeZone: profile.timeZone,
            programId: plan.program.id,
            ref: plan.suggestion.slot,
            gymId: gyms.find((gym) => gym.isActive && gym.isDefault)?.id ?? null,
          })
        : null;
    return { profile, gyms, plan, restProtocol, coach };
  });
  const { profile, gyms, plan, restProtocol, coach } = data;

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
    />
  );
}
