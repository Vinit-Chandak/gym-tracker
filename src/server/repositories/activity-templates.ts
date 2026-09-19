import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { activityTemplateRevisions, activityTemplates } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { EnduranceSport } from "@/domain/activity";
import type { EndurancePrescription } from "@/domain/activity-prescription";

/**
 * Reusable sessions, versioned rather than edited (plan §5.1).
 *
 * Editing a template writes a new revision and points the template at it. Anything already
 * scheduled keeps the revision it was built from, so changing "the Tuesday intervals" next
 * month changes what you pick next month and nothing that is already on the calendar.
 * Deleting archives, because a scheduled occurrence and a logged activity still refer to the
 * revision they used.
 */

export class TemplateNotFoundError extends Error {
  constructor() {
    super("That template no longer exists.");
    this.name = "TemplateNotFoundError";
  }
}

export type ActivityTemplate = {
  id: string;
  sport: EnduranceSport;
  name: string;
  notes: string | null;
  archivedAt: Date | null;
  revisionId: string;
  version: number;
  prescription: EndurancePrescription;
};

const columns = {
  id: activityTemplates.id,
  sport: activityTemplates.sport,
  name: activityTemplates.name,
  notes: activityTemplates.notes,
  archivedAt: activityTemplates.archivedAt,
  revisionId: activityTemplateRevisions.id,
  version: activityTemplateRevisions.version,
  prescription: activityTemplateRevisions.prescription,
};

function query(tx: DbOrTx, userId: string) {
  return tx
    .select(columns)
    .from(activityTemplates)
    .innerJoin(
      activityTemplateRevisions,
      and(
        eq(activityTemplateRevisions.id, activityTemplates.currentRevisionId),
        eq(activityTemplateRevisions.userId, activityTemplates.userId),
      ),
    )
    .where(eq(activityTemplates.userId, userId))
    .$dynamic();
}

export async function listTemplates(
  tx: DbOrTx,
  userId: string,
  options: { sport?: EnduranceSport; includeArchived?: boolean } = {},
): Promise<ActivityTemplate[]> {
  const where = [eq(activityTemplates.userId, userId)];
  if (options.sport) where.push(eq(activityTemplates.sport, options.sport));
  if (!options.includeArchived) where.push(isNull(activityTemplates.archivedAt));
  const rows = await query(tx, userId)
    .where(and(...where))
    .orderBy(asc(activityTemplates.sport), asc(activityTemplates.name));
  return rows as ActivityTemplate[];
}

export async function getTemplate(
  tx: DbOrTx,
  userId: string,
  templateId: string,
): Promise<ActivityTemplate | null> {
  const rows = await query(tx, userId).where(
    and(eq(activityTemplates.userId, userId), eq(activityTemplates.id, templateId)),
  );
  return (rows[0] as ActivityTemplate | undefined) ?? null;
}

/** The revision a scheduled occurrence copied, readable even after the template is archived. */
export async function getTemplateRevision(
  tx: DbOrTx,
  userId: string,
  revisionId: string,
): Promise<{ id: string; sport: EnduranceSport; prescription: EndurancePrescription } | null> {
  const [row] = await tx
    .select({
      id: activityTemplateRevisions.id,
      sport: activityTemplateRevisions.sport,
      prescription: activityTemplateRevisions.prescription,
    })
    .from(activityTemplateRevisions)
    .where(
      and(
        eq(activityTemplateRevisions.userId, userId),
        eq(activityTemplateRevisions.id, revisionId),
      ),
    )
    .limit(1);
  return (
    (row as { id: string; sport: EnduranceSport; prescription: EndurancePrescription }) ?? null
  );
}

export async function createTemplate(
  tx: DbOrTx,
  userId: string,
  input: {
    sport: EnduranceSport;
    name: string;
    notes?: string | null;
    prescription: EndurancePrescription;
  },
): Promise<{ id: string; revisionId: string }> {
  const [template] = await tx
    .insert(activityTemplates)
    .values({ userId, sport: input.sport, name: input.name, notes: input.notes ?? null })
    .returning({ id: activityTemplates.id });
  const [revision] = await tx
    .insert(activityTemplateRevisions)
    .values({
      templateId: template!.id,
      userId,
      sport: input.sport,
      version: 1,
      prescription: input.prescription,
    })
    .returning({ id: activityTemplateRevisions.id });
  await tx
    .update(activityTemplates)
    .set({ currentRevisionId: revision!.id })
    .where(eq(activityTemplates.id, template!.id));
  return { id: template!.id, revisionId: revision!.id };
}

/**
 * Edits a template by writing its next revision. What is already scheduled keeps the revision
 * it copied; applying the change to pending work is a separate, previewed decision (§5.1).
 */
export async function reviseTemplate(
  tx: DbOrTx,
  userId: string,
  templateId: string,
  input: { name?: string; notes?: string | null; prescription: EndurancePrescription },
): Promise<{ revisionId: string }> {
  const template = await getTemplate(tx, userId, templateId);
  if (!template) throw new TemplateNotFoundError();
  const [revision] = await tx
    .insert(activityTemplateRevisions)
    .values({
      templateId,
      userId,
      sport: template.sport,
      version: template.version + 1,
      prescription: input.prescription,
    })
    .returning({ id: activityTemplateRevisions.id });
  await tx
    .update(activityTemplates)
    .set({
      currentRevisionId: revision!.id,
      name: input.name ?? template.name,
      notes: input.notes === undefined ? template.notes : input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(activityTemplates.userId, userId), eq(activityTemplates.id, templateId)));
  return { revisionId: revision!.id };
}

/** Archives rather than deletes: history still points at the revisions it used. */
export async function archiveTemplate(
  tx: DbOrTx,
  userId: string,
  templateId: string,
): Promise<void> {
  const updated = await tx
    .update(activityTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(activityTemplates.userId, userId),
        eq(activityTemplates.id, templateId),
        isNull(activityTemplates.archivedAt),
      ),
    )
    .returning({ id: activityTemplates.id });
  if (updated.length === 0) throw new TemplateNotFoundError();
}

export async function restoreTemplate(
  tx: DbOrTx,
  userId: string,
  templateId: string,
): Promise<void> {
  await tx
    .update(activityTemplates)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(activityTemplates.userId, userId), eq(activityTemplates.id, templateId)));
}

/** How many occurrences still point at a template's revisions, for an honest archive warning. */
export async function templateUsage(
  tx: DbOrTx,
  userId: string,
  templateId: string,
): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(activityTemplateRevisions)
    .where(
      and(
        eq(activityTemplateRevisions.userId, userId),
        eq(activityTemplateRevisions.templateId, templateId),
      ),
    );
  return row?.value ?? 0;
}
