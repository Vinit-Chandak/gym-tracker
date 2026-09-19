import { and, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "next";

import { Proposals } from "./proposals";
import { RequestList, type RequestView } from "@/components/coaching/request-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { coachWeeklyReviews, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { diffPrograms, programDiffSummary } from "@/domain/program-diff";
import { formatDateTime } from "@/lib/format";
import {
  listOpenRequests,
  listSettledRequests,
} from "@/server/repositories/coach-program-requests";
import { listOpenProposals } from "@/server/repositories/program-revisions";
import { readProgramBlueprint } from "@/server/repositories/programs";

/**
 * Everything the coach has changed, proposed or answered, in one place.
 *
 * It holds no programme of its own. Each row says what is different and links to the change
 * that explains it, so the full programme stays in Cycle and is read once rather than
 * reprinted under every review.
 */
export async function loadProgrammeChanges(db: DbOrTx, userId: string, timeZone: string) {
  const [drafts, legacy, open, settled, reviews] = await Promise.all([
    db
      .select()
      .from(programDrafts)
      .where(
        and(eq(programDrafts.userId, userId), inArray(programDrafts.status, ["editing", "ready"])),
      )
      .orderBy(desc(programDrafts.updatedAt))
      .limit(10),
    listOpenProposals(db, userId),
    listOpenRequests(db, userId),
    listSettledRequests(db, userId),
    db
      .select()
      .from(coachWeeklyReviews)
      .where(eq(coachWeeklyReviews.userId, userId))
      .orderBy(desc(coachWeeklyReviews.periodEnd))
      .limit(8),
  ]);
  // Only a draft written against a programme is a change; one with no base is a new
  // programme, and it stays with the saved work that produced it.
  const changes = drafts.filter((draft) => draft.baseProgramId !== null);
  const summaries = await Promise.all(
    changes.map(async (draft) => {
      const base = await readProgramBlueprint(db, userId, draft.baseProgramId!);
      return {
        id: draft.id,
        name: draft.blueprint.name,
        when: formatDateTime(draft.updatedAt, timeZone),
        fromCoach: draft.source !== "manual",
        summary: base
          ? programDiffSummary(diffPrograms(base.blueprint, draft.blueprint))
          : "Open to see what changes",
      };
    }),
  );
  const toView = (request: (typeof open)[number]): RequestView => ({
    id: request.id,
    summary: request.summary,
    quote: request.quote,
    state: request.state,
    detail: request.detail,
    condition: request.condition,
    reconsiderAfter: request.reconsiderAfter,
    when: formatDateTime(request.createdAt, timeZone),
    draftId: request.draftId,
  });
  return {
    changes: summaries,
    legacy: legacy.map((proposal) => ({
      id: proposal.id,
      summary: proposal.summary,
      rationale: proposal.rationale,
      lines: proposal.lines,
      createdAt: formatDateTime(proposal.createdAt, timeZone),
      fromCoach: proposal.source === "ai",
    })),
    requests: open.map(toView),
    settled: settled.map(toView),
    reviews: reviews.map((review) => ({
      id: review.id,
      when: formatDateTime(review.periodEnd, timeZone),
      outcome: review.outcome,
      rationale: review.rationale,
      draftId: review.draftId,
    })),
    waiting:
      summaries.length +
      legacy.length +
      open.filter((request) => request.state === "needs_answer").length,
  };
}

export type ProgrammeChangesData = Awaited<ReturnType<typeof loadProgrammeChanges>>;

const REVIEW_HEADLINE: Record<string, string> = {
  no_change: "Programme kept as it is",
  automatic: "Future sessions updated",
  proposal: "A change was proposed",
};

export function ProgrammeChanges({
  data,
  base = "/profile/programme",
}: {
  data: ProgrammeChangesData;
  base?: string;
}) {
  const nothing =
    !data.changes.length &&
    !data.legacy.length &&
    !data.requests.length &&
    !data.settled.length &&
    !data.reviews.length;
  if (nothing)
    return (
      <Card>
        <p className="text-sm text-ink-muted">
          Nothing has changed yet. When the coach reviews your programme, what it changed shows up
          here — only the differences, grouped by day.
        </p>
      </Card>
    );
  return (
    <div className="space-y-6">
      {(data.changes.length > 0 || data.legacy.length > 0) && (
        <Section title="Waiting for you">
          {data.changes.length > 0 && (
            <List>
              {data.changes.map((change) => (
                <li key={change.id}>
                  <LinkRow
                    href={`${base}/drafts/${change.id}` as Route}
                    title={change.name}
                    subtitle={change.summary}
                    badge={
                      change.fromCoach ? (
                        <Badge tone="accent">Coach</Badge>
                      ) : (
                        <Badge>Your edit</Badge>
                      )
                    }
                    meta={change.when.split(",")[0]}
                  />
                </li>
              ))}
            </List>
          )}
          {data.legacy.length > 0 && <Proposals proposals={data.legacy} />}
        </Section>
      )}

      {data.requests.length > 0 && (
        <Section
          title="What you asked for"
          info="Requests are assessed at the next daily coach run. You get a proposal to approve, a specific question, or a reason — never silence."
        >
          <RequestList requests={data.requests} base={base} />
        </Section>
      )}

      {data.settled.length > 0 && (
        <Section title="Settled requests">
          <RequestList requests={data.settled} base={base} />
        </Section>
      )}

      {data.reviews.length > 0 && (
        <Section title="Recent reviews">
          <List>
            {data.reviews.map((review) =>
              // A no-change review has no change to open. Its draft was superseded on the
              // server precisely so nothing offers to apply a programme identical to this one.
              review.draftId && review.outcome !== "no_change" ? (
                <li key={review.id}>
                  <LinkRow
                    href={`${base}/drafts/${review.draftId}` as Route}
                    title={REVIEW_HEADLINE[review.outcome] ?? "Review"}
                    subtitle={review.rationale}
                    meta={review.when.split(",")[0]}
                  />
                </li>
              ) : (
                <li key={review.id} className="space-y-1 p-4">
                  <p className="font-medium">{REVIEW_HEADLINE[review.outcome] ?? "Review"}</p>
                  <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                    {review.rationale}
                  </p>
                  <p className="text-xs text-ink-muted tabular-nums">{review.when}</p>
                </li>
              ),
            )}
          </List>
        </Section>
      )}
    </div>
  );
}
