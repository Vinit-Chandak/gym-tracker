import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { getDb } from "@/db/client";
import { programs } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Past programmes" };

/** Programmes that were ended or replaced, every sport's, newest first (ADR 0058). */
export default async function PastProgrammesPage() {
  const user = await requireUser();
  const archived = await withUser(
    getDb(),
    user.id,
    (tx) =>
      tx
        .select({
          id: programs.id,
          name: programs.name,
          sport: programs.sport,
          version: programs.version,
        })
        .from(programs)
        .where(and(eq(programs.userId, user.id), eq(programs.status, "archived")))
        .orderBy(desc(programs.updatedAt))
        .limit(100),
    { readOnly: true },
  );
  return (
    <>
      <PageHeader title="Past programmes" backHref="/plan" />
      <PageContent>
        {archived.length ? (
          // A card each, as Today's tasks are: a programme and its one action (DESIGN.md, The
          // One Card Rule).
          <ul className="space-y-3">
            {archived.map((programme) => (
              <li key={programme.id} className="box space-y-3 panel-padding">
                <div>
                  <h2 className="type-card-title">{programme.name}</h2>
                  <p className="text-sm text-ink-2">
                    {ACTIVITY_SPORT_LABELS[programme.sport]} · Version {programme.version}
                  </p>
                </div>
                <ProgrammeTools id={programme.id} sport={programme.sport} active={false} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-sm text-ink-2">No past programmes yet.</p>
        )}
      </PageContent>
    </>
  );
}
