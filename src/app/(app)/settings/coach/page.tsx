import type { Metadata } from "next";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
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
          <h2 className="font-semibold">Connect your coach</h2>
          <p className="text-sm text-ink-muted">
            Use this app&apos;s URL with the endpoints below. Send the token in the Authorization
            header as Bearer followed by the token.
          </p>
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
          <p className="text-xs text-ink-muted">
            Optional from/to dates (YYYY-MM-DD); the default is the last 12 weeks. Every endpoint
            returns JSON and only ever reads your data.
          </p>
        </Card>
      </PageContent>
    </>
  );
}
