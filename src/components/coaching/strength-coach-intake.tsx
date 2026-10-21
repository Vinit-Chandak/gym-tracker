import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exercises, gyms } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { coachRollout } from "@/lib/coach-rollout";
import { TRAINING_GOAL_LABELS } from "@/lib/labels";
import { ageOn } from "@/lib/units";
import { todayInTimeZone } from "@/domain/program-calendar";
import { coachIntakeSchema, withKeptFiles } from "@/domain/coaching-workflow";
import { requireProfiledUser } from "@/server/auth";
import { latestIntake } from "@/server/repositories/coach-intakes";
import { listCoachAttachments } from "@/server/repositories/coach-attachments";
import { getRequestProfile } from "@/server/queries/request-profile";
import { CoachPaused } from "./coach-paused";
import { CoachIntakeForm } from "./intake-form";
import { coachConfigured } from "./setup-coach";

/**
 * The coach's questions for a new strength programme, whole: both routes, the brief, and the
 * plans and reports to attach. New programme › Strength › With the coach is their one home
 * (owner, 20 October 2026); its page gives them their title, "New strength programme".
 */
export async function StrengthCoachIntake() {
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [initial, reports, locations, library] = await Promise.all([
        latestIntake(tx, user.id),
        listCoachAttachments(tx, user.id),
        // Only the kinds, to answer "gym or home" with what this account already has. The
        // athlete is never shown the list, so neither the names nor their machines are read.
        tx
          .select({ kind: gyms.kind, isDefault: gyms.isDefault })
          .from(gyms)
          .where(and(eq(gyms.userId, user.id), eq(gyms.isActive, true))),
        tx
          .select({ slug: exercises.slug, name: exercises.name })
          .from(exercises)
          .where(
            and(
              eq(exercises.isActive, true),
              or(isNull(exercises.userId), eq(exercises.userId, user.id)),
            ),
          )
          .orderBy(exercises.name),
      ]);
      // Deleted files are absent from a new editable view; historical confirmed intake stays immutable.
      return {
        initial: withKeptFiles(initial, reports),
        reports,
        locations,
        library,
      };
    },
    { readOnly: true },
  );
  const usual = data.locations.find((location) => location.isDefault) ?? data.locations[0];
  if (!coachRollout().intake && !data.initial) return <CoachPaused sport="strength" />;
  return (
    <CoachIntakeForm
      initial={data.initial}
      reports={data.reports}
      library={data.library}
      prefill={coachIntakeSchema.parse({
        goal: profile.trainingGoal ? TRAINING_GOAL_LABELS[profile.trainingGoal] : "",
        weightKg: profile.bodyWeightKg && profile.bodyWeightKg >= 20 ? profile.bodyWeightKg : null,
        heightCm: profile.heightCm,
        ageYears: profile.dateOfBirth
          ? ageOn(profile.dateOfBirth, todayInTimeZone(profile.timeZone))
          : null,
        // An account whose only location is outdoors is neither answer; it asks.
        trainingLocation: usual?.kind === "home" || usual?.kind === "gym" ? usual.kind : null,
        // Answered at setup, so the coach does not ask again; an account that never answered is
        // asked here, as before.
        track:
          profile.trainingExperience === "new"
            ? "guided"
            : profile.trainingExperience === "experienced"
              ? "detailed"
              : null,
      })}
      base="/plan"
      preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
      configured={coachConfigured()}
    />
  );
}
