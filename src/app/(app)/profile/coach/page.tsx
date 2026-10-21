import type { Metadata } from "next";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Disclosure } from "@/components/ui/disclosure";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listCoachTokens } from "@/server/repositories/coach-tokens";
import { expiresLabel } from "./expires";
import { TokenManager } from "./token-manager";

export const metadata: Metadata = { title: "Access tokens" };

const ENDPOINTS = [
  "/api/coach/summary",
  "/api/coach/workouts",
  "/api/coach/exercises/{id}/history",
  "/api/coach/running",
  "/api/coach/recovery",
  "/api/coach/program/current",
];
export default async function CoachSettingsPage() {
  const user = await requireUser();
  const [{ timeZone }, tokens] = await Promise.all([
    getRequestProfile(user.id, user.email),
    withUser(getDb(), user.id, (tx) => listCoachTokens(tx, user.id), { readOnly: true }),
  ]);
  return (
    <>
      {/* A row of AI coach's (owner, 20 October 2026): back there, by that page's name. */}
      <PageHeader title="Access tokens" backHref="/profile/ai-coach" backLabel="AI coach" />
      <PageContent>
        <TokenManager
          tokens={tokens.map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
            expiresAt: t.expiresAt.toISOString(),
            expires: expiresLabel(t.expiresAt, timeZone),
            revokedAt: t.revokedAt?.toISOString() ?? null,
            expired: t.expiresAt <= new Date(),
          }))}
        />
        {/* A developer's reference, not the athlete's: folded, with how many it holds. */}
        <Disclosure summary="Endpoints" meta={String(ENDPOINTS.length)}>
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Relative to this app&apos;s URL. Send the token as{" "}
              <code className="font-mono">Authorization: Bearer …</code>. Optional from/to dates
              (YYYY-MM-DD) default to the last 12 weeks. Everything is read-only JSON.
            </p>
            <ul className="space-y-2 font-mono text-xs break-all">
              {ENDPOINTS.map((path) => (
                <li key={path}>GET {path}</li>
              ))}
            </ul>
          </div>
        </Disclosure>
      </PageContent>
    </>
  );
}
