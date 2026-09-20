import { and, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "next";

import { Proposals } from "./proposals";
import { RequestReview, type ReviewAvailability } from "./request-review";
import { RequestList, type RequestView } from "@/components/coaching/request-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { coachWeeklyReviews, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { diffPrograms, programDiffSummary } from "@/domain/program-diff";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { formatDateTime, formatIsoDay } from "@/lib/format";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  listOpenRequests,
  listSettledRequests,
} from "@/server/repositories/coach-program-requests";
import { athleteReviewStatus } from "@/server/repositories/coaching-jobs";
import { listOpenProposals } from "@/server/repositories/program-revisions";
import { readProgramBlueprint } from "@/server/repositories/programs";

/** Asks the athlete has to act on: approve the change, or answer the question. */
const NEEDS_ATHLETE: readonly RequestView["state"][] = ["proposed", "needs_answer"];

/**
 * Everything the coach has changed, proposed or answered, in one place.
 *
 * It holds no programme of its own. Each row says what is different and links to the change
 * that explains it, so the full programme stays in Cycle and is read once rather than
 * reprinted under every review.
 *
 * One change is listed once. A proposal used to appear three times over — as a draft waiting
 * on the athlete, as the outcome of the ask that produced it, and again as a review that
 * proposed something — all three opening the same screen. The ask speaks for its own change
 * wherever there is one, and the other two stand down while it does.
 */
export async function loadProgrammeChanges(db: DbOrTx, userId: string, timeZone: string) {
  const [drafts, legacy, open, settled, reviews, reviewStatus] = await Promise.all([
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
    // The review's own `rationale` is the coach's memory of what it decided and is fed back
    // to it in full; the athlete gets the draft's one-line headline instead, and the draft
    // itself one tap away. A review with no draft has only its reason, so it keeps it.
    db
      .select({
        id: coachWeeklyReviews.id,
        periodEnd: coachWeeklyReviews.periodEnd,
        outcome: coachWeeklyReviews.outcome,
        rationale: coachWeeklyReviews.rationale,
        draftId: coachWeeklyReviews.draftId,
        headline: programDrafts.headline,
      })
      .from(coachWeeklyReviews)
      .leftJoin(programDrafts, eq(programDrafts.id, coachWeeklyReviews.draftId))
      .where(eq(coachWeeklyReviews.userId, userId))
      .orderBy(desc(coachWeeklyReviews.periodEnd))
      .limit(8),
    athleteReviewStatus(db, userId),
  ]);
  // A change an open ask already carries is that ask's to show: it comes with the athlete's
  // own words and the outcome they were given, which a bare draft row cannot say.
  const spokenFor = new Set(
    open.filter((request) => request.state === "proposed" && request.draftId).map((r) => r.draftId),
  );
  const stillOpen = new Set(drafts.map((draft) => draft.id));
  // Only a draft written against a programme is a change; one with no base is a new
  // programme, and it stays with the saved work that produced it.
  const changes = drafts.filter(
    (draft) => draft.baseProgramId !== null && !spokenFor.has(draft.id),
  );
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
  const requests = open.filter((request) => NEEDS_ATHLETE.includes(request.state));
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
    requests: requests.map(toView),
    /** Open asks nobody is waiting on the athlete for: saved, sent back, or parked. */
    withCoach: open.filter((request) => !NEEDS_ATHLETE.includes(request.state)).map(toView),
    settled: settled.map(toView),
    // A review that proposed a change the athlete has not decided yet is that change's row,
    // one section up. It joins the history once it has an outcome.
    reviews: reviews
      .filter((review) => !(review.draftId && stillOpen.has(review.draftId)))
      .map((review) => ({
        id: review.id,
        when: formatDateTime(review.periodEnd, timeZone),
        outcome: review.outcome,
        summary: review.headline || review.rationale,
        draftId: review.draftId,
      })),
    waiting: summaries.length + legacy.length + requests.length,
    review: {
      // Only the server that can start the coach offers to; elsewhere the card would promise
      // something no tap could deliver.
      offered:
        process.env.COACH_WORKFLOW_ENABLED === "true" &&
        getCoachRoutine() !== null &&
        getCoachServiceToken() !== null,
      canAsk: reviewStatus.canAsk,
      running: reviewStatus.running,
      nextOn: reviewStatus.nextAt
        ? formatIsoDay(todayInTimeZone(timeZone, reviewStatus.nextAt))
        : null,
    } satisfies ReviewAvailability,
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
    !data.withCoach.length &&
    !data.settled.length &&
    !data.reviews.length;
  if (nothing)
    return (
      <div className="space-y-6">
        <Card>
          <p className="text-sm text-ink-muted">
            Nothing has changed yet. When the coach reviews your programme, what it changed shows up
            here — only the differences, grouped by day.
          </p>
        </Card>
        <RequestReview availability={data.review} />
      </div>
    );
  return (
    <div className="space-y-6">
      {(data.requests.length > 0 ||
        data.changes.length > 0 ||
        data.legacy.length > 0 ||
        data.withCoach.length > 0) && (
        <Section
          title="Waiting for you"
          info="What you asked for and what became of it, beside any change the coach proposed on its own. Asks are assessed at the next daily coach run: you get a proposal to approve, a specific question, or a reason — never silence. Once you have approved, declined or sent one back, it leaves this list until there is something new to decide."
        >
          {/* The athlete's own asks first: each carries their words and the outcome it was
              given, which is the one thing a change screen cannot say for itself. */}
          {data.requests.length > 0 && <RequestList requests={data.requests} base={base} />}

          {/* Changes nobody asked for — a scheduled review, or the athlete's own edit. */}
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

          {/* Folded, not dropped: an ask waiting on the next coach run is not lost, but it
              needs nothing from the athlete and should not compete with what does. */}
          {data.withCoach.length > 0 && (
            <Disclosure summary="With the coach" meta={`${data.withCoach.length}`}>
              <RequestList requests={data.withCoach} base={base} />
            </Disclosure>
          )}
        </Section>
      )}

      {data.settled.length > 0 && (
        <Section title="Settled requests">
          <RequestList requests={data.settled} base={base} />
        </Section>
      )}

      {(data.review.offered || data.reviews.length > 0) && (
        <Section title="Reviews">
          <RequestReview availability={data.review} />
          {data.reviews.length > 0 && (
            <List>
              {data.reviews.map((review) =>
                // A no-change review has no change to open. Its draft was superseded on the
                // server precisely so nothing offers to apply a programme identical to this one.
                review.draftId && review.outcome !== "no_change" ? (
                  <li key={review.id}>
                    <LinkRow
                      href={`${base}/drafts/${review.draftId}` as Route}
                      title={REVIEW_HEADLINE[review.outcome] ?? "Review"}
                      subtitle={review.summary}
                      meta={review.when.split(",")[0]}
                    />
                  </li>
                ) : (
                  <li key={review.id} className="space-y-1 p-4">
                    <p className="font-medium">{REVIEW_HEADLINE[review.outcome] ?? "Review"}</p>
                    <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                      {review.summary}
                    </p>
                    <p className="text-xs text-ink-muted tabular-nums">{review.when}</p>
                  </li>
                ),
              )}
            </List>
          )}
        </Section>
      )}
    </div>
  );
}
