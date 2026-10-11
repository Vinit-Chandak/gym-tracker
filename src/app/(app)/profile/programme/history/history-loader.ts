import { and, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { coachProgramRequests, programDrafts, programs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { changeSummaryLine, summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";
import { todayInTimeZone } from "@/domain/program-calendar";
import { OPEN_REQUEST_STATES } from "@/domain/program-request";
import { formatIsoDate } from "@/lib/format";
import { readProgramBlueprint } from "@/server/repositories/programs";

import { HISTORY_DRAFT_STATUSES } from "../changes";

/** How a past change ended, in a word or two. */
export function outcomeOf(draft: {
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

export type HistoryChange = {
  id: string;
  /** What it did: the coach's headline, the block it started, or what the difference adds up to. */
  title: string;
  /** Which programme, and how it ended. */
  subtitle: string;
  /** The day it was settled, with its year when that is not this one. */
  on: string;
};

/**
 * Everything settled, a line each, as the history page lists it.
 *
 * Every change used to read "Programme change · Your edit" with a day and a month, so twenty-four
 * of them over a year were one line twenty-four times (year audit, October 2026). Each now says
 * what it did, to which programme, and when — the year included once it is not this one.
 *
 * What it did comes from the stored data, never the coach's prose: a change that started a new
 * block (a new programme family) says which programme it started in place of which; a change
 * to the running programme says what its difference comes to, as the Changes tab says it of a
 * proposal still waiting ("Swaps 2 exercises, changes runs on 2 days"). A headline the coach
 * wrote still leads where there is one.
 */
export async function loadProgrammeHistory(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  now: Date = new Date(),
) {
  const base = alias(programs, "base_program");
  const started = alias(programs, "started_program");
  const [requests, drafts] = await Promise.all([
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
      .select({
        id: programDrafts.id,
        status: programDrafts.status,
        closedAs: programDrafts.closedAs,
        closedAt: programDrafts.closedAt,
        updatedAt: programDrafts.updatedAt,
        source: programDrafts.source,
        headline: programDrafts.headline,
        blueprint: programDrafts.blueprint,
        baseProgramId: programDrafts.baseProgramId,
        baseName: base.name,
        baseFamilyId: base.familyId,
        startedFamilyId: started.familyId,
        // Plain SQL, qualified by hand: inside a select list Drizzle drops table qualifiers, and
        // `draft_id = id` compared the review with itself, so no change ever read as applied
        // by the coach.
        automatic: sql<boolean>`exists (
          select 1 from coach_weekly_reviews r
          where r.user_id = program_drafts.user_id
            and r.draft_id = program_drafts.id
            and r.outcome = 'automatic'
        )`,
      })
      .from(programDrafts)
      .leftJoin(base, and(eq(base.id, programDrafts.baseProgramId), eq(base.userId, userId)))
      .leftJoin(
        started,
        and(eq(started.id, programDrafts.activatedProgramId), eq(started.userId, userId)),
      )
      .where(
        and(
          eq(programDrafts.userId, userId),
          isNotNull(programDrafts.baseProgramId),
          inArray(programDrafts.status, [...HISTORY_DRAFT_STATUSES]),
        ),
      )
      .orderBy(desc(programDrafts.updatedAt))
      .limit(20),
  ]);

  const year = todayInTimeZone(timeZone, now).slice(0, 4);
  const dayOf = (instant: Date) => formatIsoDate(todayInTimeZone(timeZone, instant), year);

  // Several changes can share a base; each is read once.
  const bases = new Map<string, ReturnType<typeof readProgramBlueprint>>();
  const readBase = (programId: string) => {
    let pending = bases.get(programId);
    if (!pending) {
      pending = readProgramBlueprint(db, userId, programId);
      bases.set(programId, pending);
    }
    return pending;
  };

  const changes: HistoryChange[] = [];
  for (const draft of drafts) {
    const outcome = outcomeOf(draft);
    const to = draft.blueprint.name;
    const from = draft.baseName;
    const on = dayOf(draft.closedAt ?? draft.updatedAt);
    // Started as a new block: a family of its own, so not a change to the one it replaced.
    if (
      draft.startedFamilyId &&
      draft.baseFamilyId &&
      draft.startedFamilyId !== draft.baseFamilyId
    ) {
      const again = from === to;
      changes.push({
        id: draft.id,
        title: draft.headline || (again ? `New block of ${to}` : `Started ${to}`),
        subtitle: again || !from ? outcome : `In place of ${from} · ${outcome}`,
        on,
      });
      continue;
    }
    let what = draft.headline;
    if (!what) {
      const current = await readBase(draft.baseProgramId!);
      // A settled change is the record of what it did, so its difference is shown whole.
      what = current
        ? changeSummaryLine(summariseProgramDiff(diffPrograms(current.blueprint, draft.blueprint)))
        : "Programme change";
    }
    const programme = !from || from === to ? to : `${from} → ${to}`;
    changes.push({ id: draft.id, title: what, subtitle: `${programme} · ${outcome}`, on });
  }

  return {
    requests: requests.map((request) => ({
      id: request.id,
      quote: request.quote,
      state: request.state,
      // A settled ask says what it came to: done, with a link to the change (listed below
      // with its own line), or the coach's reason when it was not recommended or already
      // there.
      detail: ["not_recommended", "already_satisfied"].includes(request.state)
        ? request.detail
        : "",
      condition: request.condition,
      reconsiderAfter: request.reconsiderAfter,
      draftId: request.state === "applied" ? request.draftId : null,
      settledOn: dayOf(request.resolvedAt ?? request.updatedAt),
    })),
    changes,
  };
}
