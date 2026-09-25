import { and, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Metadata, Route } from "next";

import { RequestList } from "@/components/coaching/request-list";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { coachProgramRequests, coachWeeklyReviews, programDrafts } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { OPEN_REQUEST_STATES } from "@/domain/program-request";
import { formatDay } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { HISTORY_DRAFT_STATUSES } from "../changes";

export const metadata: Metadata = { title: "Past requests and changes" };

/** How a past change ended, in a word or two. */
function outcomeOf(draft: {
  status: string;
  closedAs: string | null;
  source: string;
  automatic: boolean;
}): string {
  if (draft.status === "activated")
    return draft.automatic
      ? "Applied by the coach"
      : draft.source === "manual"
        ? "Your edit"
        : "Approved";
  if (draft.closedAs === "revised") return "Sent back for changes";
  if (draft.closedAs === "discarded") return "Discarded";
  return "Declined";
}

/**
 * Everything settled, a line each, one tap from the change it came to.
 *
 * The Changes tab keeps only what needs the athlete. What was asked and what came of it, and
 * each change that was approved, applied or declined, lives here instead — in their own words,
 * with the outcome, and nothing the change screen already says.
 */
export default async function ProgrammeHistoryPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { requests, changes } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [requests, changes] = await Promise.all([
        tx
          .select()
          .from(coachProgramRequests)
          .where(
            and(
              eq(coachProgramRequests.userId, user.id),
              notInArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
            ),
          )
          .orderBy(desc(coachProgramRequests.updatedAt))
          .limit(30),
        tx
          .select({
            id: programDrafts.id,
            status: programDrafts.status,
            closedAs: programDrafts.closedAs,
            closedAt: programDrafts.closedAt,
            updatedAt: programDrafts.updatedAt,
            source: programDrafts.source,
            headline: programDrafts.headline,
            automatic: sql<boolean>`exists (select 1 from ${coachWeeklyReviews} where ${coachWeeklyReviews.draftId} = ${programDrafts.id} and ${coachWeeklyReviews.outcome} = 'automatic')`,
          })
          .from(programDrafts)
          .where(
            and(
              eq(programDrafts.userId, user.id),
              isNotNull(programDrafts.baseProgramId),
              inArray(programDrafts.status, [...HISTORY_DRAFT_STATUSES]),
            ),
          )
          .orderBy(desc(programDrafts.updatedAt))
          .limit(20),
      ]);
      return { requests, changes };
    },
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Past requests and changes" backHref="/profile/programme?view=changes" />
      <PageContent>
        {requests.length > 0 && (
          <Section title="Your requests">
            <RequestList
              requests={requests.map((request) => ({
                id: request.id,
                quote: request.quote,
                state: request.state,
                // A settled ask says what it came to: done, with a link to the change (listed
                // below with its own line), or the coach's reason when it was not recommended
                // or already there.
                detail: ["not_recommended", "already_satisfied"].includes(request.state)
                  ? request.detail
                  : "",
                condition: request.condition,
                reconsiderAfter: request.reconsiderAfter,
                draftId: request.state === "applied" ? request.draftId : null,
                settledOn: formatDay(request.resolvedAt ?? request.updatedAt, profile.timeZone),
              }))}
            />
          </Section>
        )}
        {changes.length > 0 && (
          <Section title="Programme changes">
            <List>
              {changes.map((change) => (
                <li key={change.id}>
                  <LinkRow
                    href={`/profile/programme/drafts/${change.id}` as Route}
                    title={change.headline || "Programme change"}
                    subtitle={outcomeOf(change)}
                    meta={formatDay(change.closedAt ?? change.updatedAt, profile.timeZone)}
                  />
                </li>
              ))}
            </List>
          </Section>
        )}
        {requests.length === 0 && changes.length === 0 && (
          <Card>
            <p className="text-sm text-ink-muted">Nothing settled yet.</p>
          </Card>
        )}
      </PageContent>
    </>
  );
}
