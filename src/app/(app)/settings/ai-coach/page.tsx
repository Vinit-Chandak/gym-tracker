import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getCoachMemo, latestPlan, pendingRequest } from "@/server/repositories/coach-plans";

import { AiCoachSettings } from "./ai-coach-settings";

export const metadata: Metadata = { title: "AI coach" };

export default async function AiCoachSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { memo, plan, pending } = await withUser(getDb(), user.id, async (tx) => {
    const [memo, plan, pending] = await Promise.all([
      getCoachMemo(tx, user.id),
      latestPlan(tx, user.id),
      pendingRequest(tx, user.id),
    ]);
    return { memo, plan, pending };
  });
  // Whether this server can hear from the coach and start it: an owner-side setup fact.
  const configured = getCoachServiceToken() !== null;
  const canRequest = getCoachRoutine() !== null;

  return (
    <>
      <PageHeader title="AI coach" backHref="/settings" />
      <PageContent>
        <AiCoachSettings
          enabled={profile.aiCoachEnabled}
          userNotes={memo.userNotes}
          overview={memo.overview}
          overviewUpdatedAt={
            memo.overviewUpdatedAt ? formatDateTime(memo.overviewUpdatedAt, profile.timeZone) : null
          }
          lastPlan={
            plan
              ? {
                  generatedAt: formatDateTime(plan.generatedAt, profile.timeZone),
                  summary: plan.summary,
                  status: plan.status,
                }
              : null
          }
          pendingSince={pending ? formatDateTime(pending.requestedAt, profile.timeZone) : null}
        />
        {!configured && (
          <Card>
            <p className="text-sm text-warning">
              This server has no coach configured yet, so nothing will be planned until the owner
              finishes the setup described in the documentation.
            </p>
          </Card>
        )}
        {configured && !canRequest && (
          <Card>
            <p className="text-sm text-ink-muted">
              Overnight plans are on. Asking for a plan from Today needs the routine&apos;s fire
              settings on the server, which the owner has not added yet.
            </p>
          </Card>
        )}
      </PageContent>
    </>
  );
}
