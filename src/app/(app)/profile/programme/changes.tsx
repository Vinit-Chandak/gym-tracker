import { and, desc, eq, gte, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Route } from "next";

import { Proposals } from "./proposals";
import { RequestReview, type ReviewAvailability } from "./request-review";
import { RequestList, type RequestView } from "@/components/coaching/request-list";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { coachProgramRequests, coachWeeklyReviews, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { changeSummaryLine, summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";
import { OPEN_REQUEST_STATES } from "@/domain/program-request";
import { progress } from "@/domain/schedule";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { formatDay, formatIsoDay } from "@/lib/format";
import { todayInTimeZone } from "@/domain/program-calendar";
import { listOpenRequests } from "@/server/repositories/coach-program-requests";
import { athleteReviewStatus } from "@/server/repositories/coaching-jobs";
import { listOpenProposals } from "@/server/repositories/program-revisions";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { getSchedule } from "@/server/repositories/schedule";

/** How long a change the coach applied on its own stays in view on this tab. */
const RECENT_DAYS = 7;

/** Changes that count as history: ones the athlete decided on, or that were applied. */
export const HISTORY_DRAFT_STATUSES = ["activated", "rejected"] as const;

/**
 * What needs the athlete, and nothing that does not.
 *
 * Each proposal is one row: the line that says what it does, and the athlete's own words when
 * it answers something they asked. A question is answered where it is asked. Asks waiting on
 * the coach are folded, a change the coach applied by itself this week is one row, and
 * everything settled is a tap away under History rather than printed here in full.
 */
export async function loadProgrammeChanges(db: DbOrTx, userId: string, timeZone: string) {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const [drafts, legacy, open, recent, [counts], [lastReview], reviewStatus, schedule] =
    await Promise.all([
      db
        .select()
        .from(programDrafts)
        .where(
          and(
            eq(programDrafts.userId, userId),
            inArray(programDrafts.status, ["editing", "ready"]),
            isNotNull(programDrafts.baseProgramId),
          ),
        )
        .orderBy(desc(programDrafts.updatedAt))
        .limit(10),
      listOpenProposals(db, userId),
      listOpenRequests(db, userId),
      db
        .select({
          id: coachWeeklyReviews.id,
          draftId: coachWeeklyReviews.draftId,
          completedAt: coachWeeklyReviews.completedAt,
          headline: programDrafts.headline,
        })
        .from(coachWeeklyReviews)
        .innerJoin(programDrafts, eq(programDrafts.id, coachWeeklyReviews.draftId))
        .where(
          and(
            eq(coachWeeklyReviews.userId, userId),
            eq(coachWeeklyReviews.outcome, "automatic"),
            gte(coachWeeklyReviews.completedAt, since),
          ),
        )
        .orderBy(desc(coachWeeklyReviews.completedAt))
        .limit(3),
      // Both counts in one statement: the History row says only how many there are.
      db
        .select({
          requests: sql<number>`(select count(*) from ${coachProgramRequests} where ${and(
            eq(coachProgramRequests.userId, userId),
            notInArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
          )})`.mapWith(Number),
          changes: sql<number>`(select count(*) from ${programDrafts} where ${and(
            eq(programDrafts.userId, userId),
            isNotNull(programDrafts.baseProgramId),
            inArray(programDrafts.status, [...HISTORY_DRAFT_STATUSES]),
          )})`.mapWith(Number),
        })
        .from(sql`(select 1) as one`),
      db
        .select({ completedAt: coachWeeklyReviews.completedAt })
        .from(coachWeeklyReviews)
        .where(eq(coachWeeklyReviews.userId, userId))
        .orderBy(desc(coachWeeklyReviews.completedAt))
        .limit(1),
      athleteReviewStatus(db, userId),
      getSchedule(db, userId),
    ]);
  const openDrafts = new Set(drafts.map((draft) => draft.id));
  const asks = new Map<string, string[]>();
  for (const request of open)
    if (request.state === "proposed" && request.draftId && openDrafts.has(request.draftId))
      asks.set(request.draftId, [...(asks.get(request.draftId) ?? []), request.quote]);

  const currentCycle = schedule ? progress(schedule.state).currentCycle : 1;
  const proposals = await Promise.all(
    drafts.map(async (draft) => {
      const base = await readProgramBlueprint(db, userId, draft.baseProgramId!);
      const summary = base
        ? changeSummaryLine(
            summariseProgramDiff(diffPrograms(base.blueprint, draft.blueprint), {
              fromWeek: schedule?.program.id === draft.baseProgramId ? currentCycle : 1,
            }),
          )
        : "Open to see what changes";
      return {
        id: draft.id,
        title: draft.headline || summary,
        fromCoach: draft.source !== "manual",
        asks: asks.get(draft.id) ?? [],
      };
    }),
  );

  const toView = (request: (typeof open)[number]): RequestView => ({
    id: request.id,
    quote: request.quote,
    // An ask still marked proposed whose proposal has closed is back with the coach; the
    // next run it reaches puts it back on the list properly.
    state:
      request.state === "proposed" && !(request.draftId && openDrafts.has(request.draftId))
        ? "waiting"
        : request.state,
    detail: request.detail,
    condition: request.condition,
    reconsiderAfter: request.reconsiderAfter,
    draftId: request.draftId,
  });
  const questions = open.filter((request) => request.state === "needs_answer").map(toView);
  const withCoach = open
    .filter(
      (request) =>
        request.state === "waiting" ||
        request.state === "deferred" ||
        (request.state === "proposed" && !(request.draftId && openDrafts.has(request.draftId))),
    )
    .map(toView);
  return {
    proposals,
    legacy: legacy.map((proposal) => ({
      id: proposal.id,
      summary: proposal.summary,
      rationale: proposal.rationale,
      lines: proposal.lines,
      createdAt: formatDay(proposal.createdAt, timeZone),
      fromCoach: proposal.source === "ai",
    })),
    questions,
    withCoach,
    recent: recent.map((row) => ({
      id: row.draftId!,
      title: row.headline || "The coach adjusted your programme",
      when: formatDay(row.completedAt, timeZone),
    })),
    history: { requests: counts?.requests ?? 0, changes: counts?.changes ?? 0 },
    waiting: proposals.length + legacy.length + questions.length,
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
      lastOn: lastReview ? formatDay(lastReview.completedAt, timeZone) : null,
    } satisfies ReviewAvailability,
  };
}

export type ProgrammeChangesData = Awaited<ReturnType<typeof loadProgrammeChanges>>;

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function ProgrammeChanges({
  data,
  base = "/profile/programme",
}: {
  data: ProgrammeChangesData;
  base?: string;
}) {
  const past = data.history.requests + data.history.changes;
  const nothing =
    !data.proposals.length &&
    !data.legacy.length &&
    !data.questions.length &&
    !data.withCoach.length &&
    !data.recent.length;
  return (
    <div className="space-y-6">
      {data.waiting > 0 && (
        <Section title="Waiting for you">
          {data.proposals.length > 0 && (
            <List>
              {data.proposals.map((proposal) => (
                <li key={proposal.id}>
                  <LinkRow
                    href={`${base}/drafts/${proposal.id}` as Route}
                    title={proposal.title}
                    subtitle={
                      proposal.asks.length
                        ? `You asked: ${proposal.asks.map((quote) => `“${quote}”`).join(", ")}`
                        : proposal.fromCoach
                          ? undefined
                          : "Your edit"
                    }
                  />
                </li>
              ))}
            </List>
          )}
          {data.legacy.length > 0 && <Proposals proposals={data.legacy} />}
          {data.questions.length > 0 && <RequestList requests={data.questions} base={base} />}
        </Section>
      )}

      {data.withCoach.length > 0 && (
        <Disclosure summary="With the coach" meta={`${data.withCoach.length}`}>
          <RequestList requests={data.withCoach} base={base} />
        </Disclosure>
      )}

      {data.recent.length > 0 && (
        <Section title="Updated by the coach">
          <List>
            {data.recent.map((change) => (
              <li key={change.id}>
                <LinkRow
                  href={`${base}/drafts/${change.id}` as Route}
                  title={change.title}
                  meta={change.when}
                />
              </li>
            ))}
          </List>
        </Section>
      )}

      {nothing && (
        <Card>
          <p className="text-sm text-ink-muted">Nothing is waiting for you.</p>
        </Card>
      )}

      <RequestReview availability={data.review} />

      {past > 0 && (
        <List>
          <li>
            <LinkRow
              href={`${base}/history` as Route}
              title="Past requests and changes"
              subtitle={[
                data.history.requests > 0 && plural(data.history.requests, "request"),
                data.history.changes > 0 && plural(data.history.changes, "change"),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </li>
        </List>
      )}
    </div>
  );
}
