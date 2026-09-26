import type { Metadata } from "next";
import { CoachingActivity } from "@/components/coaching/activity";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { NOTE_DISPOSITION_LABELS } from "@/domain/coach-memory";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  getCoachMemo,
  latestPlan,
  pendingRequest,
  recentAttempts,
} from "@/server/repositories/coach-plans";
import { countWaitingOnAthlete } from "@/server/repositories/coach-proposals";

import { AiCoachSettings } from "./ai-coach-settings";

export const metadata: Metadata = { title: "AI coach" };

export default async function AiCoachSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const workflow = process.env.COACH_WORKFLOW_ENABLED === "true";
  const { memo, plan, pending, attempts, waiting } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const now = new Date();
      if (workflow)
        return {
          memo: await getCoachMemo(tx, user.id),
          plan: null,
          pending: null,
          attempts: [],
          waiting: await countWaitingOnAthlete(tx, user.id),
        };
      // Expired requests are shown as the failures they will be recorded as (`recentAttempts`),
      // so this screen reads without the athlete lock.
      const [memo, plan, pending, attempts] = await Promise.all([
        getCoachMemo(tx, user.id),
        latestPlan(tx, user.id),
        pendingRequest(tx, user.id, now),
        recentAttempts(tx, user.id, 8),
      ]);
      return { memo, plan, pending, attempts, waiting: 0 };
    },
    { readOnly: true },
  );
  // Whether this server can hear from the coach and start it: owner-side setup facts.
  const configured = getCoachServiceToken() !== null;
  const canRequest = getCoachRoutine() !== null;
  // A coach that is on and working says nothing: the switch is the statement. What is worth a
  // line is that it cannot run here, or, on the older single-plan path, what it last produced.
  const status = !configured
    ? "Not set up on this server yet"
    : workflow
      ? null
      : pending
        ? `Planning now, asked at ${formatDateTime(pending.requestedAt, profile.timeZone)}`
        : plan
          ? `Last plan ${formatDateTime(plan.generatedAt, profile.timeZone)}`
          : "No plan yet; the first arrives after the next overnight run";

  return (
    <>
      <PageHeader title="AI coach" backHref="/profile" />
      <PageContent>
        <AiCoachSettings
          workflow={workflow}
          enabled={profile.aiCoachEnabled}
          status={
            configured && !canRequest && profile.aiCoachEnabled
              ? [status, "On-demand coaching is not set up on this server"]
                  .filter(Boolean)
                  .join(" · ")
              : status
          }
          noteId={crypto.randomUUID()}
          notes={memo.notes.recent.map((note) => ({
            id: note.id,
            text: note.text,
            when: formatDateTime(note.createdAt, profile.timeZone),
            // What became of it, not merely that it was read: a request the coach has parked
            // until your programme review reads very differently from one it declined.
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
          overviewUpdatedAt={
            memo.overviewUpdatedAt ? formatDateTime(memo.overviewUpdatedAt, profile.timeZone) : null
          }
          attempts={attempts.map((attempt) => ({
            id: attempt.id,
            when: formatDateTime(attempt.requestedAt, profile.timeZone),
            trigger: attempt.trigger === "nightly" ? "Overnight" : "You asked",
            status: attempt.status,
            gymName: attempt.gymName,
            error: attempt.error,
          }))}
        >
          <CoachingActivity settings waiting={waiting} />
        </AiCoachSettings>
      </PageContent>
    </>
  );
}
