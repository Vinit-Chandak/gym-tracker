import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkRow, List } from "@/components/ui/link-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { listSessions } from "@/server/repositories/sessions";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await requireUser();
  const { sessions, timeZone } = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    return { sessions: await listSessions(tx, user.id, 100), timeZone: profile.timeZone };
  });

  return (
    <>
      <PageHeader title="History" />
      <PageContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No sessions yet"
            description="Finished sessions appear here. Runs, recovery logs and machine-specific filters arrive in Phase 7."
          />
        ) : (
          <List>
            {sessions.map((session) => (
              <li key={session.id}>
                <LinkRow
                  href={`/workouts/${session.id}`}
                  title={session.dayName ?? "Ad hoc session"}
                  subtitle={`${formatDateTime(session.startedAt, timeZone)} · ${session.gymName}`}
                  meta={`${session.setCount} ${session.setCount === 1 ? "set" : "sets"}`}
                />
              </li>
            ))}
          </List>
        )}
      </PageContent>
    </>
  );
}
