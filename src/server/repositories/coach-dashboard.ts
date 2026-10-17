import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";

import type { ProposalCard } from "@/app/(app)/profile/programme/proposals";
import type { ReviewAvailability } from "@/app/(app)/profile/programme/request-review";
import type { RequestView } from "@/components/coaching/request-list";
import { coachJobs, coachProgramRequests, coachWeeklyReviews, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import { jobProgress, type JobProgress } from "@/domain/coaching-workflow";
import { todayInTimeZone } from "@/domain/program-calendar";
import { OPEN_REQUEST_STATES } from "@/domain/program-request";
import { formatDay, formatIsoDay } from "@/lib/format";
import { athleteReviewStatus, settleCoachJobs } from "./coaching-jobs";
import { listOpenProposals } from "./program-revisions";
import { activeSportProgrammes } from "./sport-programmes";

export type CoachDashboardRequest = RequestView & { sport: ActivitySport | null };
export type CoachDashboardProposal = {
  id: string;
  title: string;
  sport: ActivitySport;
  kind: "programme" | "session" | "change";
  fromCoach: boolean;
  status: "editing" | "ready";
  rationale: string | null;
};

export type CoachDashboard = {
  programmes: {
    id: string;
    name: string;
    sport: ActivitySport;
    review: ReviewAvailability;
    pending: number;
  }[];
  proposals: CoachDashboardProposal[];
  requests: CoachDashboardRequest[];
  recentChanges: { id: string; title: string; sport: ActivitySport; when: string }[];
  history: {
    requests: CoachDashboardRequest[];
    changes: {
      id: string;
      title: string;
      sport: ActivitySport;
      when: string;
      status: "activated" | "rejected";
      kind: CoachDashboardProposal["kind"];
      outcome: string;
    }[];
  };
  legacy: ProposalCard[];
  jobs: {
    id: string;
    sport: ActivitySport;
    scope: "programme" | "session";
    kind: "create_program" | "prepare_session" | "review_program";
    status: "queued" | "claimed" | "needs_input" | "failed";
    progress: JobProgress | null;
    when: string;
    error: string | null;
  }[];
  expiredJobs: boolean;
  waiting: number;
};

export type CoachDashboardOptions = {
  timeZone: string;
  enabled: boolean;
  workflow: boolean;
  configured: boolean;
  canRequest: boolean;
};

const kindOf = (draft: { standalone: boolean; baseProgramId: string | null }) =>
  draft.standalone ? "session" : draft.baseProgramId ? "change" : "programme";

/**
 * A coach inbox spans every sport. It includes creation and saved-session drafts as well as
 * changes to existing programmes; otherwise a first running programme has nowhere to appear.
 * Only closed history is capped. An open question or draft never disappears behind a limit.
 * The returned dates are display strings so clients need no database or server-only imports.
 */
export async function loadCoachDashboard(
  db: DbOrTx,
  userId: string,
  options: CoachDashboardOptions,
  now = new Date(),
): Promise<CoachDashboard> {
  const { timeZone } = options;
  const year = todayInTimeZone(timeZone, now).slice(0, 4);
  const day = (date: Date) => formatDay(date, timeZone, year);
  const jobSport = sql`coalesce(${coachJobs.target}->>'sport', 'strength')`;
  const jobScope = sql`coalesce(${coachJobs.target}->>'scope', 'programme')`;
  const [active, drafts, open, pastRequests, pastDrafts, recent, reviews, legacy, rawJobs] =
    await Promise.all([
      activeSportProgrammes(db, userId),
      db
        .select()
        .from(programDrafts)
        .where(
          and(
            eq(programDrafts.userId, userId),
            inArray(programDrafts.status, ["editing", "ready"]),
          ),
        )
        .orderBy(desc(programDrafts.updatedAt)),
      db
        .select()
        .from(coachProgramRequests)
        .where(
          and(
            eq(coachProgramRequests.userId, userId),
            inArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
          ),
        )
        .orderBy(desc(coachProgramRequests.createdAt)),
      db
        .select()
        .from(coachProgramRequests)
        .where(
          and(
            eq(coachProgramRequests.userId, userId),
            notInArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
          ),
        )
        .orderBy(desc(coachProgramRequests.updatedAt))
        .limit(30),
      db
        .select()
        .from(programDrafts)
        .where(
          and(
            eq(programDrafts.userId, userId),
            inArray(programDrafts.status, ["activated", "rejected"]),
          ),
        )
        .orderBy(desc(programDrafts.updatedAt))
        .limit(30),
      db
        .select({
          id: programDrafts.id,
          title: programDrafts.headline,
          name: programDrafts.blueprint,
          sport: programDrafts.sport,
          completedAt: coachWeeklyReviews.completedAt,
        })
        .from(coachWeeklyReviews)
        .innerJoin(
          programDrafts,
          and(eq(programDrafts.id, coachWeeklyReviews.draftId), eq(programDrafts.userId, userId)),
        )
        .where(
          and(
            eq(coachWeeklyReviews.userId, userId),
            eq(coachWeeklyReviews.outcome, "automatic"),
            eq(programDrafts.status, "activated"),
            gte(coachWeeklyReviews.completedAt, new Date(now.getTime() - 7 * 86_400_000)),
          ),
        )
        .orderBy(desc(coachWeeklyReviews.completedAt))
        .limit(12),
      db
        .selectDistinctOn([coachWeeklyReviews.sport], {
          sport: coachWeeklyReviews.sport,
          completedAt: coachWeeklyReviews.completedAt,
        })
        .from(coachWeeklyReviews)
        .where(eq(coachWeeklyReviews.userId, userId))
        .orderBy(coachWeeklyReviews.sport, desc(coachWeeklyReviews.completedAt)),
      listOpenProposals(db, userId),
      // Take the latest word on each scope, rather than a fixed number of recent jobs. A busy
      // lifting programme must not push an unanswered swimming creation out of the inbox.
      db
        .selectDistinctOn([jobSport, coachJobs.kind, jobScope])
        .from(coachJobs)
        .where(eq(coachJobs.userId, userId))
        .orderBy(jobSport, coachJobs.kind, jobScope, desc(coachJobs.createdAt)),
    ]);

  const proposals: CoachDashboardProposal[] = drafts.map((draft) => ({
    id: draft.id,
    title: draft.headline || draft.blueprint.name,
    sport: draft.sport,
    kind: kindOf(draft),
    fromCoach: draft.source !== "manual",
    status: draft.status as "editing" | "ready",
    rationale: draft.rationale || null,
  }));
  const openDrafts = new Map(drafts.map((draft) => [draft.id, draft]));
  const requests: CoachDashboardRequest[] = open.map((request) => {
    const draft = request.draftId ? openDrafts.get(request.draftId) : null;
    // A closed, superseded or differently scoped proposal cannot still be reviewed. Its ask
    // stays visible with the coach until reconciliation records the next real outcome.
    const proposed = request.state === "proposed";
    const validDraft = Boolean(draft && draft.sport === request.sport && !draft.standalone);
    return {
      id: request.id,
      sport: request.sport,
      quote: request.quote,
      state: proposed && !validDraft ? "waiting" : request.state,
      detail: request.detail,
      condition: request.condition,
      reconsiderAfter: request.reconsiderAfter,
      draftId: proposed && !validDraft ? null : request.draftId,
    };
  });

  const offered = options.enabled && options.workflow && options.configured && options.canRequest;
  const programmes = await Promise.all(
    active.map(async (programme) => {
      const status = await athleteReviewStatus(db, userId, now, programme.sport);
      const last = reviews.find((review) => review.sport === programme.sport);
      return {
        id: programme.id,
        name: programme.name,
        sport: programme.sport,
        pending:
          proposals.filter((proposal) => proposal.sport === programme.sport).length +
          requests.filter(
            (request) => request.sport === programme.sport && request.state === "needs_answer",
          ).length +
          legacy.filter((proposal) => proposal.programId === programme.id).length,
        review: {
          offered,
          canAsk: status.canAsk,
          running: status.running,
          waiting: status.waiting ? { attempted: status.waiting.attempted } : null,
          nextOn: status.nextAt ? formatIsoDay(todayInTimeZone(timeZone, status.nextAt)) : null,
          lastOn: last ? day(last.completedAt) : null,
        },
      };
    }),
  );

  const settledJobs = settleCoachJobs(
    rawJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    now,
  );
  // A later strength success cannot hide an unresolved running failure. Programme creation
  // and reusable-session creation are separate work even when they share sport and job kind.
  const jobs: CoachDashboard["jobs"] = settledJobs.jobs.flatMap((job) => {
    if (job.status === "succeeded" || job.status === "superseded") return [];
    return [
      {
        id: job.id,
        sport: job.target.sport ?? "strength",
        scope: job.target.scope ?? "programme",
        kind: job.kind,
        status: job.status,
        progress: jobProgress(job, now),
        when: day(job.createdAt),
        error: job.error,
      },
    ];
  });

  return {
    programmes,
    proposals,
    requests,
    recentChanges: recent.map((change) => ({
      id: change.id,
      title: change.title || change.name.name,
      sport: change.sport,
      when: day(change.completedAt),
    })),
    history: {
      requests: pastRequests.map((request) => ({
        id: request.id,
        sport: request.sport,
        quote: request.quote,
        state: request.state,
        detail: request.detail,
        condition: request.condition,
        reconsiderAfter: request.reconsiderAfter,
        draftId: request.state === "applied" ? request.draftId : null,
        settledOn: day(request.resolvedAt ?? request.updatedAt),
      })),
      changes: pastDrafts.map((draft) => ({
        id: draft.id,
        title: draft.headline || draft.blueprint.name,
        sport: draft.sport,
        when: day(draft.closedAt ?? draft.updatedAt),
        status: draft.status as "activated" | "rejected",
        kind: kindOf(draft),
        outcome:
          draft.status === "activated"
            ? draft.standalone
              ? "Session saved"
              : "Applied"
            : draft.closedAs === "revised"
              ? "Sent back for changes"
              : draft.closedAs === "discarded"
                ? "Discarded"
                : "Declined",
      })),
    },
    legacy: legacy.map((proposal) => ({
      id: proposal.id,
      summary: proposal.summary,
      rationale: proposal.rationale,
      lines: proposal.lines,
      createdAt: day(proposal.createdAt),
      fromCoach: proposal.source === "ai",
    })),
    jobs,
    expiredJobs: settledJobs.expired,
    waiting:
      proposals.length +
      requests.filter((request) => request.state === "needs_answer").length +
      legacy.length +
      jobs.filter((job) => job.status === "needs_input").length,
  };
}
