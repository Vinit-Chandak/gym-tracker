import { and, desc, eq } from "drizzle-orm";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { getDb } from "@/db/client";
import { programs } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { requireUser } from "@/server/auth";

export default async function ArchivedProgrammesPage() {
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
      <PageHeader title="Archived programmes" backHref="/training" />
      <PageContent>
        <p className="text-sm text-ink-2">
          Your completed training stays in history. Duplicate a programme to review it and start a
          new block.
        </p>
        {archived.length ? (
          <ul className="divide-y divide-line">
            {archived.map((programme) => (
              <li key={programme.id} className="space-y-3 py-5">
                <div>
                  <h2 className="text-lg font-medium [overflow-wrap:break-word]">
                    {programme.name}
                  </h2>
                  <p className="text-sm text-ink-2">
                    {ACTIVITY_SPORT_LABELS[programme.sport]} · Version {programme.version}
                  </p>
                </div>
                <ProgrammeTools id={programme.id} sport={programme.sport} active={false} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-sm text-ink-2">No archived programmes yet.</p>
        )}
      </PageContent>
    </>
  );
}
