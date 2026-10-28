import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { CoachQuestions } from "@/components/coaching/job-status";
import { LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { SubmitButton } from "@/components/ui/form";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { getDb } from "@/db/client";
import { coachIntakes, programDrafts } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { coachIntakeSchema, type CoachIntake } from "@/domain/coaching-workflow";
import { joinFacts } from "@/lib/facts";
import { WEEKDAY_SHORT } from "@/lib/labels";
import { fromKilograms, heightUnitFor, toFeetAndInches } from "@/lib/units";
import { completeOnboardingAction } from "@/server/actions/profile";
import { requireProfiledUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState, setupStepsOf } from "@/server/queries/setup-state";
import { asReconciledJob, getCoachJob, isExpiredClaim } from "@/server/repositories/coaching-jobs";

import { OnboardingFrame } from "../../../onboarding-frame";
import { RefreshWhileWriting } from "./refresh-while-writing";

export const metadata: Metadata = { title: "The coach is writing" };

/** "Mon, Wed, Fri", or the number of days when the athlete left them open. */
function daysLine(answers: CoachIntake): string {
  if (answers.preferredDays.length > 0)
    return answers.preferredDays.map((day) => WEEKDAY_SHORT[day]).join(", ");
  return answers.sessionsPerWeek ? `${answers.sessionsPerWeek} a week` : "Not said";
}

/** "165 cm · 62 kg · 29", in the athlete's own units. */
function bodyLine(answers: CoachIntake, unit: "kg" | "lb"): string {
  const parts: string[] = [];
  if (answers.heightCm !== null) {
    if (heightUnitFor(unit) === "ftin") {
      const { feet, inches } = toFeetAndInches(answers.heightCm);
      parts.push(`${feet}′ ${inches}″`);
    } else parts.push(`${answers.heightCm} cm`);
  }
  if (answers.weightKg !== null) parts.push(`${fromKilograms(answers.weightKg, unit)} ${unit}`);
  if (answers.ageYears !== null) parts.push(String(answers.ageYears));
  return parts.join(" · ") || "Not said";
}

/**
 * Board The coach is writing your programme, while it writes. The screen moves on by itself to
 * the programme once there is one, and setup comes back here if the app is closed meanwhile.
 * "Open Today" ends setup; the programme then waits on Plan (ADR 0059). If the coach asks
 * something, it is answered here; if it could not finish, it says so in the athlete's words, the
 * coach's own folded under Details, and Try again is a tap away. The answers it works from are
 * folded: the athlete gave them a minute ago.
 */
export default async function SetupJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProfiledUser();
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  // Read-only: this page is polled while the coach works, and a poll must not queue behind the
  // coach's own write that finishes the job.
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const job = await getCoachJob(tx, user.id, id);
      if (!job) return null;
      const [[draft], intake, state] = await Promise.all([
        tx
          .select({ id: programDrafts.id })
          .from(programDrafts)
          .where(and(eq(programDrafts.userId, user.id), eq(programDrafts.jobId, id))),
        job.intakeId
          ? tx
              .select({ answers: coachIntakes.answers })
              .from(coachIntakes)
              .where(and(eq(coachIntakes.userId, user.id), eq(coachIntakes.id, job.intakeId)))
              .then(([row]) => row ?? null)
          : Promise.resolve(null),
        readSetupState(tx, user.id, profile.trainingExperience),
      ]);
      return { job, draftId: draft?.id ?? null, intake, state };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  if (data.draftId) redirect(`/welcome/programme/drafts/${data.draftId}`);
  if (isExpiredClaim(data.job)) tidyCoachJobsLater(user.id);
  const job = asReconciledJob(data.job);
  const experienced = data.state.experience === "experienced";
  const form = experienced ? "/welcome/programme/create" : "/welcome/programme";
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";
  const answers = data.intake ? coachIntakeSchema.parse(data.intake.answers) : null;
  const writing = job.status === "queued" || job.status === "claimed";
  const succeeded = job.status === "succeeded";
  const rationale = job.result && "rationale" in job.result ? job.result.rationale : null;
  const questions =
    job.status === "needs_input" && job.result?.outcome === "needs_input"
      ? job.result.questions
      : null;

  const title = writing
    ? "The coach is writing your programme"
    : questions
      ? "The coach has a question"
      : job.status === "superseded"
        ? "Your answers changed"
        : succeeded
          ? job.result?.outcome === "no_change"
            ? "Your programme stays as it is"
            : "Your programme review is complete"
          : "The coach could not finish";

  return (
    <OnboardingFrame
      steps={setupStepsOf(data.state)}
      current={experienced ? "start" : "plan"}
      back={form}
      title={title}
    >
      <RefreshWhileWriting writing={writing} />
      {writing && (
        <>
          <div className="writing-bar" role="progressbar" aria-label="Writing your programme" />
          <p className="onboarding-sub">This can take a while. You can close the app.</p>
          {/* The dispatcher's own words are for whoever runs the coach; the athlete is told
              what they mean for them. */}
          {job.error && <p className="setup-note">This may take until tonight.</p>}
        </>
      )}
      {questions && (
        <div className="mt-4">
          <CoachQuestions jobId={job.id} questions={questions} base="/welcome/programme" />
        </div>
      )}
      {succeeded && rationale && <p className="onboarding-sub">{rationale}</p>}
      {!writing && !questions && !succeeded && (
        <>
          {job.status === "failed" && <p className="onboarding-sub">Your answers are saved.</p>}
          <LinkButton href={form} size="lg" variant="secondary" className="mt-4 w-full">
            Try again
          </LinkButton>
        </>
      )}
      {job.error && (
        <Disclosure summary="Details" className="mt-4">
          <p className="type-meta-small [overflow-wrap:break-word] text-ink-2">{job.error}</p>
        </Disclosure>
      )}

      {answers && (
        <Disclosure
          summary="Your answers"
          meta={joinFacts([
            daysLine(answers),
            answers.minutesPerSession ? `${answers.minutesPerSession} min` : null,
          ])}
          className="mt-3"
        >
          <dl className="setup-facts">
            {(
              [
                ["Goal", answers.goal || "Not said"],
                ["Days", daysLine(answers)],
                ...(answers.minutesPerSession
                  ? ([["Sessions", `${answers.minutesPerSession} min`]] as const)
                  : []),
                ["Where", data.state.place?.name ?? "Not said"],
                ["You", bodyLine(answers, unit)],
                ["Experience", experienced ? "Already trains" : "New to this"],
              ] as const
            ).map(([term, value]) => (
              <div key={term} className="setup-facts-row">
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      )}

      <form action={completeOnboardingAction}>
        <PinnedActions stack>
          {/* Where it goes, in every state. */}
          <SubmitButton variant="tonal" pendingLabel="Opening Today…">
            Open Today
          </SubmitButton>
        </PinnedActions>
      </form>
    </OnboardingFrame>
  );
}
