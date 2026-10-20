import { and, desc, eq, gte, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Route } from "next";

import { Proposals } from "./proposals";
import { RequestChange } from "@/components/coaching/request-change";

import { RequestReview, type ReviewAvailability } from "./request-review";
import { RequestList, type RequestView } from "@/components/coaching/request-list";
import { Card } from "@/components/ui/card";
import type { GlyphName } from "@/components/ui/glyphs";
import { Disclosure } from "@/components/ui/disclosure";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { coachProgramRequests, coachWeeklyReviews, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import { changeSummaryLine, summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";
import { OPEN_REQUEST_STATES } from "@/domain/program-request";
import { progress } from "@/domain/schedule";
import { canRunCoachJobs, isCoachServiceConfigured } from "@/lib/env";
import { FACT_SEPARATOR } from "@/lib/facts";
import { formatDay, formatIsoDay } from "@/lib/format";
import { todayInTimeZone } from "@/domain/program-calendar";
import { listOpenRequests } from "@/server/repositories/coach-program-requests";
import { athleteReviewStatus } from "@/server/repositories/coaching-jobs";
import { listOpenProposals } from "@/server/repositories/program-revisions";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { getSchedule } from "@/server/repositories/schedule";

/** A change's glyph, when all of it is one kind of change; otherwise the edit pencil. */
function leadOf(summary: ReturnType<typeof summariseProgramDiff> | null): GlyphName {
  const kinds = new Set(summary?.days.flatMap((day) => day.operations.map((op) => op.kind)) ?? []);
  if (kinds.size !== 1) return "edit";
  const [kind] = kinds;
  return kind === "added"
    ? "plus"
    : kind === "replaced"
      ? "swap"
      : kind === "moved_in" || kind === "moved_out"
        ? "arrowRight"
        : kind === "removed"
          ? "minus"
          : "edit";
}

/** How long a change the coach applied on its own stays in view on this tab. */
const RECENT_DAYS = 7;

/** Changes that count as history: ones the athlete decided on, or that were applied. */
export const HISTORY_DRAFT_STATUSES = ["activated", "rejected"] as const;

/**
 * What needs the athlete about one programme, and nothing that does not (ADR 0058: each
 * programme's requests, changes and answers are its own page's).
 *
 * Each proposal is one row: the line that says what it does, and the athlete's own words when
 * it answers something they asked. A question is answered where it is asked. Asks waiting on
 * the coach are folded, a change the coach applied by itself this week is one row, and
 * everything settled is a tap away under Past requests and changes rather than printed here in
 * full. `coachOn` is the athlete's switch: with the coach off, no review is offered, since it
 * would be refused.
 */
export async function loadProgrammeChanges(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  { sport = "strength", coachOn = true }: { sport?: ActivitySport; coachOn?: boolean } = {},
) {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const [drafts, legacy, open, recent, [counts], [lastReview], reviewStatus, schedule] =
    await Promise.all([
      // Every open draft of this sport's programmes, a new programme the coach wrote after one
      // was started too: nowhere else lists it while the sport has a programme.
      db
        .select()
        .from(programDrafts)
        .where(
          and(
            eq(programDrafts.userId, userId),
            eq(programDrafts.sport, sport),
            eq(programDrafts.standalone, false),
            inArray(programDrafts.status, ["editing", "ready"]),
          ),
        )
        .orderBy(desc(programDrafts.updatedAt))
        .limit(10),
      listOpenProposals(db, userId, sport),
      listOpenRequests(db, userId, 20, sport),
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
            eq(coachWeeklyReviews.sport, sport),
            eq(coachWeeklyReviews.outcome, "automatic"),
            gte(coachWeeklyReviews.completedAt, since),
          ),
        )
        .orderBy(desc(coachWeeklyReviews.completedAt))
        .limit(3),
      // Both counts in one statement: the Past requests and changes row says only how many.
      db
        .select({
          requests: sql<number>`(select count(*) from ${coachProgramRequests} where ${and(
            eq(coachProgramRequests.userId, userId),
            eq(coachProgramRequests.sport, sport),
            notInArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
          )})`.mapWith(Number),
          changes: sql<number>`(select count(*) from ${programDrafts} where ${and(
            eq(programDrafts.userId, userId),
            eq(programDrafts.sport, sport),
            isNotNull(programDrafts.baseProgramId),
            inArray(programDrafts.status, [...HISTORY_DRAFT_STATUSES]),
          )})`.mapWith(Number),
        })
        .from(sql`(select 1) as one`),
      db
        .select({ completedAt: coachWeeklyReviews.completedAt })
        .from(coachWeeklyReviews)
        .where(and(eq(coachWeeklyReviews.userId, userId), eq(coachWeeklyReviews.sport, sport)))
        .orderBy(desc(coachWeeklyReviews.completedAt))
        .limit(1),
      athleteReviewStatus(db, userId, new Date(), sport),
      // Only a strength change is read from the cycle the athlete is in.
      sport === "strength" ? getSchedule(db, userId) : null,
    ]);
  const openDrafts = new Set(drafts.map((draft) => draft.id));
  const asks = new Map<string, string[]>();
  // What each ask came to, in the coach's short words: "Add squat practice".
  const answers = new Map<string, string[]>();
  for (const request of open)
    if (request.state === "proposed" && request.draftId && openDrafts.has(request.draftId)) {
      asks.set(request.draftId, [...(asks.get(request.draftId) ?? []), request.quote]);
      if (request.summary)
        answers.set(request.draftId, [...(answers.get(request.draftId) ?? []), request.summary]);
    }

  const currentCycle = schedule ? progress(schedule.state).currentCycle : 1;
  // The title only needs a derived summary without a stored headline. Several such drafts
  // can share their base; keep its in-flight read within this transaction, not across requests.
  const bases = new Map<string, ReturnType<typeof readProgramBlueprint>>();
  const readBase = (programId: string) => {
    let pending = bases.get(programId);
    if (!pending) {
      pending = readProgramBlueprint(db, userId, programId);
      bases.set(programId, pending);
    }
    return pending;
  };
  const proposals = await Promise.all(
    drafts.map(async (draft) => {
      // A new programme rather than a change: nothing to compare it with, so it is named.
      const fresh = draft.baseProgramId === null;
      const base = draft.headline || fresh ? null : await readBase(draft.baseProgramId!);
      const summarised = base
        ? summariseProgramDiff(diffPrograms(base.blueprint, draft.blueprint), {
            fromWeek: schedule?.program.id === draft.baseProgramId ? currentCycle : 1,
          })
        : null;
      // "No programme changes" is no name for a row that is waiting on an answer.
      const summary =
        summarised && (!summarised.empty || summarised.descriptionChanged)
          ? changeSummaryLine(summarised)
          : null;
      return {
        id: draft.id,
        title:
          draft.headline ||
          (fresh ? draft.blueprint.name : summary) ||
          (draft.source === "manual" ? "Your edit" : "Proposed change"),
        fresh,
        fromCoach: draft.source !== "manual",
        asks: asks.get(draft.id) ?? [],
        answers: answers.get(draft.id) ?? [],
        rationale: draft.rationale || null,
        // A change that only adds is led by +, one that only swaps by ⇄ (board AI coach).
        lead: leadOf(summarised),
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
      title: row.headline || "Programme updated",
      when: formatDay(row.completedAt, timeZone),
    })),
    history: { requests: counts?.requests ?? 0, changes: counts?.changes ?? 0 },
    waiting: proposals.length + legacy.length + questions.length,
    sport,
    review: {
      // Only the server that can start the coach offers to, and only while the coach is on;
      // elsewhere the card would promise something no tap could deliver.
      offered:
        coachOn &&
        process.env.COACH_WORKFLOW_ENABLED === "true" &&
        canRunCoachJobs() &&
        isCoachServiceConfigured(),
      canAsk: reviewStatus.canAsk,
      running: reviewStatus.running,
      waiting: reviewStatus.waiting ? { attempted: reviewStatus.waiting.attempted } : null,
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

/**
 * What waits on the athlete about this programme, under one heading (Changes to review, Needs
 * your answer, New programme to review), or nothing at all when nothing does.
 */
export function ProgrammeWaiting({
  data,
  base = "/plan",
}: {
  data: ProgrammeChangesData;
  base?: string;
}) {
  if (data.waiting === 0) return null;
  return (
    <Section title="Waiting for you">
      {data.proposals.length > 0 && (
        <List>
          {data.proposals.map((proposal) => (
            <li key={proposal.id}>
              <LinkRow
                href={`${base}/drafts/${proposal.id}` as Route}
                title={proposal.title}
                // The athlete's own words in their marks, as the change's ask tag shows them.
                subtitle={
                  proposal.asks.length
                    ? proposal.asks.map((quote) => `“${quote}”`).join(", ")
                    : proposal.fresh
                      ? "New programme to review"
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
  );
}

/**
 * The rest of the programme's dealings with the coach: its asks still with the coach, what the
 * coach changed on its own this week, asking for a change or a review, and the way to
 * everything settled, which is this programme's past requests and changes.
 */
export function ProgrammeCoach({
  data,
  base = "/plan",
  request = null,
}: {
  data: ProgrammeChangesData;
  base?: string;
  /** Asking the coach for a change, where the coach is on to read it (ADR 0058). */
  request?: { noteId: string } | null;
}) {
  const past = data.history.requests + data.history.changes;
  return (
    <>
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

      {request && <RequestChange sport={data.sport} noteId={request.noteId} />}
      <RequestReview availability={data.review} sport={data.sport} />

      {past > 0 && (
        <List>
          <li>
            <LinkRow
              href={`${base}/history?sport=${data.sport}` as Route}
              title="Past requests and changes"
              subtitle={[
                data.history.requests > 0 && plural(data.history.requests, "request"),
                data.history.changes > 0 && plural(data.history.changes, "change"),
              ]
                .filter(Boolean)
                .join(FACT_SEPARATOR)}
            />
          </li>
        </List>
      )}
    </>
  );
}

/** The strength programme's Changes tab: all of the above, and one line when there is none. */
export function ProgrammeChanges({
  data,
  base = "/plan",
  request = null,
}: {
  data: ProgrammeChangesData;
  base?: string;
  request?: { noteId: string } | null;
}) {
  const nothing =
    !data.proposals.length &&
    !data.legacy.length &&
    !data.questions.length &&
    !data.withCoach.length &&
    !data.recent.length;
  return (
    <div className="space-y-6">
      <ProgrammeWaiting data={data} base={base} />
      {nothing && (
        <Card>
          <p className="text-sm text-ink-muted">Nothing is waiting for you.</p>
        </Card>
      )}
      <ProgrammeCoach data={data} base={base} request={request} />
    </div>
  );
}
