import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { todayInTimeZone } from "@/domain/program-calendar";
import { coachRollout } from "@/lib/coach-rollout";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { TRAINING_GOAL_LABELS } from "@/lib/labels";
import { ageOn } from "@/lib/units";
import type { Profile } from "@/server/queries/profile";
import type { SetupPlace } from "@/server/queries/setup-state";
import { listCoachAttachments } from "@/server/repositories/coach-attachments";
import { latestIntake } from "@/server/repositories/coach-intakes";

import { SetupCoachForm } from "./setup-coach-form";

/** Whether the coach can be asked for a programme at all on this deployment. */
export function coachConfigured(): boolean {
  return (
    process.env.COACH_WORKFLOW_ENABLED === "true" &&
    coachRollout().generation &&
    !!getCoachRoutine() &&
    !!getCoachServiceToken()
  );
}

/**
 * The coach's questions as setup asks them (boards Your first programme, What should the coach
 * plan?), with everything already known filled in: the goal, height, weight and age from the
 * profile, the route from "Which sounds like you?", the place from Where you train, and running
 * from the sports. A draft of answers left earlier is picked up where it was.
 */
export async function SetupCoach({
  userId,
  profile,
  place,
  runs,
  detailed,
}: {
  userId: string;
  profile: Profile;
  place: SetupPlace;
  /** Whether running is among the sports: the coach plans around runs it is told about. */
  runs: boolean;
  detailed: boolean;
}) {
  const data = await withUser(
    getDb(),
    userId,
    async (tx) => {
      const [initial, reports] = await Promise.all([
        latestIntake(tx, userId),
        listCoachAttachments(tx, userId),
      ]);
      return { initial, reports };
    },
    { readOnly: true },
  );
  // A confirmed intake is a request already made: its answers are where a new one starts.
  const initial = data.initial
    ? { id: data.initial.id, revision: data.initial.revision, answers: data.initial.answers }
    : null;
  const prefill = coachIntakeSchema.parse({
    track: detailed ? "detailed" : "guided",
    goal: profile.trainingGoal ? TRAINING_GOAL_LABELS[profile.trainingGoal] : "",
    weightKg: profile.bodyWeightKg && profile.bodyWeightKg >= 20 ? profile.bodyWeightKg : null,
    heightCm: profile.heightCm,
    ageYears: profile.dateOfBirth
      ? ageOn(profile.dateOfBirth, todayInTimeZone(profile.timeZone))
      : null,
    // Outdoors is answered as home: what you own, and your body.
    trainingLocation: place.kind === "gym" ? "gym" : "home",
    gymId: place.id,
    // Not asked again: a lifter who also runs leaves the coach to plan the runs, one who does
    // not is planned none.
    runsPerWeek: runs ? null : 0,
  });
  return (
    <SetupCoachForm
      detailed={detailed}
      initial={initial}
      prefill={prefill}
      reports={data.reports}
      preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
      configured={coachConfigured() && (coachRollout().intake || initial !== null)}
      offerTracking={!detailed}
    />
  );
}
