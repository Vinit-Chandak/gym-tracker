import type { Metadata } from "next";
import { BackLink } from "@/components/shell/back-link";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { NOTE_DISPOSITION_LABELS } from "@/domain/coach-memory";
import { todayInTimeZone } from "@/domain/program-calendar";
import { canRunCoachJobs, isCoachServiceConfigured } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { tidyCoachJobsLater } from "@/server/coach-tidy";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  getCoachMemo,
  latestPlan,
  pendingRequest,
  recentAttempts,
} from "@/server/repositories/coach-plans";
import { loadCoachDashboard } from "@/server/repositories/coach-dashboard";
import { AiCoachSettings } from "./ai-coach-settings";

export const metadata: Metadata = { title: "AI coach" };

export default async function AiCoachSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const year = todayInTimeZone(profile.timeZone).slice(0, 4);
  const workflow = process.env.COACH_WORKFLOW_ENABLED === "true";
  const configured = isCoachServiceConfigured();
  const canRequest = canRunCoachJobs();
  const { memo, plan, pending, attempts, dashboard } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [memo, dashboard, plan, pending, attempts] = await Promise.all([
        getCoachMemo(tx, user.id),
        workflow
          ? loadCoachDashboard(tx, user.id, {
              timeZone: profile.timeZone,
              enabled: profile.aiCoachEnabled,
              workflow,
              configured,
              canRequest,
            })
          : null,
        workflow ? null : latestPlan(tx, user.id),
        workflow ? null : pendingRequest(tx, user.id, new Date()),
        workflow ? [] : recentAttempts(tx, user.id, 8),
      ]);
      return { memo, dashboard, plan, pending, attempts };
    },
    { readOnly: true },
  );
  if (dashboard?.expiredJobs) tidyCoachJobsLater(user.id);
  const status = !configured
    ? "Coaching is not set up on this server yet."
    : !canRequest && profile.aiCoachEnabled
      ? "On-demand coaching is unavailable. Your notes are saved for the next coach run."
      : workflow
        ? null
        : pending
          ? `Planning now · requested ${formatDateTime(pending.requestedAt, profile.timeZone, year)}`
          : plan
            ? `Last plan ${formatDateTime(plan.generatedAt, profile.timeZone, year)}`
            : "Your first plan arrives after the next overnight run.";

  return (
    <>
      <header className="page-header page-width pt-safe">
        <div className="page-header-bar">
          <BackLink fallback="/profile" />
        </div>
      </header>
      <div className="page-width pb-8">
        <AiCoachSettings
          workflow={workflow}
          enabled={profile.aiCoachEnabled}
          status={status}
          noteId={crypto.randomUUID()}
          notes={memo.notes.recent.map((note) => ({
            id: note.id,
            text: note.text,
            sport: note.sport,
            when: formatDateTime(note.createdAt, profile.timeZone, year),
            outcome:
              note.reviewedAt === null
                ? null
                : [
                    note.disposition ? NOTE_DISPOSITION_LABELS[note.disposition] : "Reviewed",
                    note.dispositionDetail,
                  ]
                    .filter(Boolean)
                    .join(" — "),
          }))}
          overview={memo.overview}
          attempts={attempts.map((attempt) => ({
            id: attempt.id,
            when: formatDateTime(attempt.requestedAt, profile.timeZone, year),
            trigger: attempt.trigger === "nightly" ? "Overnight" : "You asked",
            status: attempt.status,
            gymName: attempt.gymName,
            error: attempt.error,
          }))}
          dashboard={dashboard}
        />
      </div>
    </>
  );
}
