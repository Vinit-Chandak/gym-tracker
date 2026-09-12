import type { Metadata } from "next";
import { CoachingActivity } from "@/components/coaching/activity";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  getCoachMemo,
  latestPlan,
  pendingRequest,
  recentAttempts,
  reconcileExpiredCoachRequests,
} from "@/server/repositories/coach-plans";

import { AiCoachSettings } from "./ai-coach-settings";

export const metadata: Metadata = { title: "AI coach" };

export default async function AiCoachSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const workflow = process.env.COACH_WORKFLOW_ENABLED === "true";
  const { memo, plan, pending, attempts } = await withUser(getDb(), user.id, async (tx) => {
    const now = new Date();
    if (workflow)
      return { memo: await getCoachMemo(tx, user.id), plan: null, pending: null, attempts: [] };
    await reconcileExpiredCoachRequests(tx, user.id, now);
    const [memo, plan, pending, attempts] = await Promise.all([
      getCoachMemo(tx, user.id),
      latestPlan(tx, user.id),
      pendingRequest(tx, user.id, now),
      recentAttempts(tx, user.id, 8),
    ]);
    return { memo, plan, pending, attempts };
  });
  // Whether this server can hear from the coach and start it: owner-side setup facts.
  const configured = getCoachServiceToken() !== null;
  const canRequest = getCoachRoutine() !== null;
  const status = !configured
    ? "Not set up on this server yet"
    : workflow
      ? "Daily session preparation and weekly programme reviews are enabled"
      : pending
        ? `Planning now, asked at ${formatDateTime(pending.requestedAt, profile.timeZone)}`
        : plan
          ? `Last plan ${formatDateTime(plan.generatedAt, profile.timeZone)}`
          : "No plan yet; the first arrives after the next overnight run";

  return (
    <>
      <PageHeader title="AI coach" backHref="/settings" />
      <PageContent>
        <CoachingActivity settings />
        <AiCoachSettings
          workflow={workflow}
          enabled={profile.aiCoachEnabled}
          status={
            configured && !canRequest && profile.aiCoachEnabled
              ? `${status} · On-demand coaching is not set up on this server`
              : status
          }
          userNotes={memo.userNotes}
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
        />
      </PageContent>
    </>
  );
}
