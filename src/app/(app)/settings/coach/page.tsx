import type { Metadata } from "next";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listCoachTokens } from "@/server/repositories/coach-tokens";
import { TokenManager } from "./token-manager";

export const metadata: Metadata = { title: "Coach access" };
export default async function CoachSettingsPage() {
  const user = await requireUser();
  const tokens = await withUser(getDb(), user.id, (tx) => listCoachTokens(tx, user.id));
  return (
    <>
      <PageHeader title="Coach access" backHref="/settings" />
      <PageContent>
        <TokenManager
          tokens={tokens.map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
            expiresAt: t.expiresAt.toISOString(),
            revokedAt: t.revokedAt?.toISOString() ?? null,
            expired: t.expiresAt <= new Date(),
          }))}
        />
        <Card>
          <h2 className="flex items-center gap-1 text-base font-medium">
            Endpoints
            <InfoTip label="About the endpoints">
              Relative to this app&apos;s URL. Send the token as{" "}
              <code className="font-mono">Authorization: Bearer …</code>. Optional from/to dates
              (YYYY-MM-DD) default to the last 12 weeks. Everything is read-only JSON.
            </InfoTip>
          </h2>
          <ul className="space-y-2 font-mono text-xs break-all">
            {[
              "/api/coach/summary",
              "/api/coach/workouts",
              "/api/coach/exercises/{id}/history",
              "/api/coach/running",
              "/api/coach/recovery",
              "/api/coach/program/current",
            ].map((path) => (
              <li key={path}>GET {path}</li>
            ))}
          </ul>
        </Card>
      </PageContent>
    </>
  );
}
