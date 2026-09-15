import { and, eq, isNull, or } from "drizzle-orm";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { exercises, gyms } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { coachRollout } from "@/lib/coach-rollout";
import { TRAINING_GOAL_LABELS } from "@/lib/labels";
import { ageOn } from "@/lib/units";
import { todayInTimeZone } from "@/domain/program-calendar";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { requireProfiledUser } from "@/server/auth";
import { latestIntake } from "@/server/repositories/coach-intakes";
import { listCoachAttachments } from "@/server/repositories/coach-attachments";
import { getRequestProfile } from "@/server/queries/request-profile";
import { CoachIntakeForm } from "./intake-form";

export async function ProgrammeCreationPage({ onboarding = false }: { onboarding?: boolean }) {
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
        initial: initial
          ? {
              ...initial,
              needsSave: initial.answers.attachmentIds.some(
                (id) => !reports.some((f) => f.id === id),
              ),
              answers: {
                ...initial.answers,
                attachmentIds: initial.answers.attachmentIds.filter((id) =>
                  reports.some((f) => f.id === id),
                ),
              },
            }
          : null,
        reports,
        locations,
        library,
      };
    },
    { readOnly: true },
  );
  const base = onboarding ? "/welcome/programme" : "/profile/programme";
  const usual = data.locations.find((location) => location.isDefault) ?? data.locations[0];
  return (
    <>
      <PageHeader title="Create a programme" backHref={base} />
      <PageContent>
        {!coachRollout().intake && !data.initial ? (
          <p>
            New coaching setup is temporarily paused. You can still build a programme or track
            workouts from the programme choices.
          </p>
        ) : (
          <CoachIntakeForm
            initial={data.initial}
            reports={data.reports}
            library={data.library}
            prefill={coachIntakeSchema.parse({
              goal: profile.trainingGoal ? TRAINING_GOAL_LABELS[profile.trainingGoal] : "",
              weightKg:
                profile.bodyWeightKg && profile.bodyWeightKg >= 20 ? profile.bodyWeightKg : null,
              heightCm: profile.heightCm,
              ageYears: profile.dateOfBirth
                ? ageOn(profile.dateOfBirth, todayInTimeZone(profile.timeZone))
                : null,
              // An account whose only location is outdoors is neither answer; it asks.
              trainingLocation: usual?.kind === "home" || usual?.kind === "gym" ? usual.kind : null,
            })}
            base={base}
            preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
            configured={
              process.env.COACH_WORKFLOW_ENABLED === "true" &&
              coachRollout().generation &&
              !!getCoachRoutine() &&
              !!getCoachServiceToken()
            }
          />
        )}
      </PageContent>
    </>
  );
}
