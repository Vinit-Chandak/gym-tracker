import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  coachNotes,
  coachProgramRequests,
  coachRequestDecisions,
  programDrafts,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { validateMemoryQuote } from "@/domain/coach-memory";
import {
  OPEN_REQUEST_STATES,
  REQUESTS_PER_JOB,
  requestPatchSchema,
  validateDeferral,
  type RequestPatch,
  type RequestState,
} from "@/domain/program-request";
import { athleteMemorySources } from "./coach-memory";
import { CoachingError } from "./coaching-state";

export type ProgramRequest = typeof coachProgramRequests.$inferSelect;

/** A request waiting on the coach rather than on the athlete. */
function actionable(today: string) {
  return or(
    eq(coachProgramRequests.state, "waiting"),
    and(
      eq(coachProgramRequests.state, "deferred"),
      lte(coachProgramRequests.reconsiderAfter, today),
    ),
  );
}

const resolvedNow = (state: RequestState, now: Date) =>
  OPEN_REQUEST_STATES.includes(state) ? null : now;

/** Everything still open, newest ask first, for the screens that show request status. */
export async function listOpenRequests(db: DbOrTx, userId: string, limit = 20) {
  return db
    .select()
    .from(coachProgramRequests)
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        inArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
      ),
    )
    .orderBy(desc(coachProgramRequests.createdAt))
    .limit(limit);
}

/** Recently settled asks, so an outcome does not vanish the moment it is given. */
export async function listSettledRequests(db: DbOrTx, userId: string, limit = 10) {
  return db
    .select()
    .from(coachProgramRequests)
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        sql`${coachProgramRequests.state} <> all(${sql.raw(
          `array[${OPEN_REQUEST_STATES.map((state) => `'${state}'`).join(",")}]`,
        )})`,
      ),
    )
    .orderBy(desc(coachProgramRequests.updatedAt))
    .limit(limit);
}

/** Whether the next daily run has an ask to answer, before any model is asked to look. */
export async function hasActionableRequests(db: DbOrTx, userId: string, today: string) {
  const [row] = await db
    .select({ id: coachProgramRequests.id })
    .from(coachProgramRequests)
    .where(and(eq(coachProgramRequests.userId, userId), actionable(today)))
    .limit(1);
  return Boolean(row);
}

/**
 * The requests this attempt is being asked to decide, and the record that it was.
 *
 * The claim is written on to each row, so a decision can only close what the run actually
 * read. Anything the athlete saves after this moment keeps `claimedAttemptId` null and waits
 * for the next daily run, rather than being marked handled by a run that never saw it.
 */
export async function claimRequestsForAttempt(
  db: DbOrTx,
  userId: string,
  jobId: string,
  attemptId: string,
  today: string,
) {
  const open = await db
    .select()
    .from(coachProgramRequests)
    .where(and(eq(coachProgramRequests.userId, userId), actionable(today)))
    .orderBy(asc(coachProgramRequests.createdAt), asc(coachProgramRequests.id))
    .limit(REQUESTS_PER_JOB + 1);
  const items = open.slice(0, REQUESTS_PER_JOB);
  if (items.length)
    await db
      .update(coachProgramRequests)
      .set({ claimedJobId: jobId, claimedAttemptId: attemptId })
      .where(
        and(
          eq(coachProgramRequests.userId, userId),
          inArray(
            coachProgramRequests.id,
            items.map((item) => item.id),
          ),
        ),
      );
  // Anything read by an earlier attempt of this job but not by this one is released, so a
  // retry after a lost lease is asked for the same work rather than a shrinking subset.
  await db
    .update(coachProgramRequests)
    .set({ claimedJobId: null, claimedAttemptId: null })
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.claimedJobId, jobId),
        items.length
          ? sql`${coachProgramRequests.id} <> all(${sql.raw(
              `array[${items.map((item) => `'${item.id}'::uuid`).join(",")}]`,
            )})`
          : undefined,
      ),
    );
  const answers = items.length
    ? await db
        .select({
          requestId: coachNotes.requestId,
          text: coachNotes.text,
          createdAt: coachNotes.createdAt,
        })
        .from(coachNotes)
        .where(
          and(
            eq(coachNotes.userId, userId),
            inArray(
              coachNotes.requestId,
              items.map((item) => item.id),
            ),
          ),
        )
        .orderBy(asc(coachNotes.createdAt))
    : [];
  return {
    items: items.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      quote: item.quote,
      summary: item.summary,
      state: item.state,
      detail: item.detail,
      condition: item.condition,
      reconsiderAfter: item.reconsiderAfter,
      askedAt: item.createdAt.toISOString(),
      /** What the athlete replied to a question, in their own words, oldest first. */
      answers: answers
        .filter((answer) => answer.requestId === item.id)
        .map((answer) => ({ text: answer.text, at: answer.createdAt.toISOString() })),
    })),
    hasMore: open.length > REQUESTS_PER_JOB,
  };
}

export type ClaimedRequests = Awaited<ReturnType<typeof claimRequestsForAttempt>>;

/**
 * Writes what a coaching run decided, and refuses a result that leaves an ask unanswered.
 *
 * Three things have to hold for a decision to mean anything: the request has to be this
 * athlete's and in this attempt's snapshot, every request in that snapshot has to receive
 * exactly one decision, and a decision that claims to have proposed a change has to name
 * operations the blueprint diff actually contains. Without the last one, "added Bayesian
 * curls" is a sentence rather than an exercise.
 */
export async function applyRequestPatch(
  db: DbOrTx,
  userId: string,
  input: {
    jobId: string;
    attemptId: string;
    kind: "create_program" | "prepare_session" | "review_program";
    patch: unknown;
    /** Operation IDs the accepted programme diff contains, or null when there is no diff. */
    changeOperationIds: ReadonlySet<string> | null;
    draftId: string | null;
    now: Date;
    today: string;
  },
): Promise<{ opened: number; decided: number; remaining: number }> {
  const patch: RequestPatch = requestPatchSchema.parse(input.patch ?? {});
  const { jobId, attemptId, now } = input;

  const claimed = await db
    .select()
    .from(coachProgramRequests)
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.claimedJobId, jobId),
        eq(coachProgramRequests.claimedAttemptId, attemptId),
      ),
    );

  // Newly discovered asks. The quote has to be the athlete's own words from a source they
  // own, so a request cannot be invented on their behalf.
  if (patch.open.length) {
    const sources = await athleteMemorySources(
      db,
      userId,
      patch.open.map((entry) => entry.sourceId),
    );
    for (const entry of patch.open) {
      try {
        validateMemoryQuote({ sourceId: entry.sourceId, text: entry.quote }, sources);
      } catch {
        throw new CoachingError(
          "Quote the athlete's exact words from one of their own notes when opening a request.",
          422,
        );
      }
      await db
        .insert(coachProgramRequests)
        .values({
          id: entry.id,
          userId,
          sourceId: entry.sourceId,
          quote: entry.quote,
          summary: entry.summary,
          state: "waiting",
          openedJobId: jobId,
          claimedJobId: jobId,
          claimedAttemptId: attemptId,
        })
        .onConflictDoNothing({ target: coachProgramRequests.id });
      const [stored] = await db
        .select({ id: coachProgramRequests.id })
        .from(coachProgramRequests)
        .where(and(eq(coachProgramRequests.id, entry.id), eq(coachProgramRequests.userId, userId)));
      if (!stored) throw new CoachingError("Use a fresh id for each request you open.", 422);
    }
  }

  const required = new Map<string, ProgramRequest | null>(
    claimed.map((request) => [request.id, request]),
  );
  for (const entry of patch.open) if (!required.has(entry.id)) required.set(entry.id, null);

  // A session job discovers asks; only a programme review decides them. Answering a programme
  // request with tomorrow's session would be the same silence in a different place.
  if (input.kind === "prepare_session" && patch.decisions.length)
    throw new CoachingError(
      "Session preparation cannot decide a programme request. It is assessed by the programme review in this same daily run.",
      422,
    );
  if (input.kind === "prepare_session")
    return { opened: patch.open.length, decided: 0, remaining: required.size };

  const seen = new Set<string>();
  for (const decision of patch.decisions) {
    if (!required.has(decision.requestId))
      throw new CoachingError(
        "Decide only the requests supplied to this attempt, or ones you opened in this result.",
        422,
      );
    if (seen.has(decision.requestId))
      throw new CoachingError("Give each request exactly one decision.", 422);
    seen.add(decision.requestId);
    if (decision.state === "deferred" && decision.reconsiderAfter) {
      try {
        validateDeferral(decision.reconsiderAfter, now);
      } catch (error) {
        throw new CoachingError(
          error instanceof Error ? error.message : "Invalid reconsideration date.",
          422,
        );
      }
    }
    if (decision.state === "proposed") {
      if (!input.draftId || !input.changeOperationIds)
        throw new CoachingError(
          "A proposed request needs the programme change it proposes. Submit the revised blueprint with it.",
          422,
        );
      const missing = decision.changeRefs.filter((ref) => !input.changeOperationIds!.has(ref));
      if (missing.length)
        throw new CoachingError(
          "A proposed request must name changes the revised programme actually contains.",
          422,
        );
    }
  }
  const undecided = [...required.keys()].filter((id) => !seen.has(id));
  if (undecided.length)
    throw new CoachingError(
      `Every request in this job needs a decision. ${undecided.length} still ${
        undecided.length === 1 ? "has none" : "have none"
      }.`,
      422,
    );

  for (const decision of patch.decisions) {
    await db
      .update(coachProgramRequests)
      .set({
        state: decision.state,
        detail: decision.detail,
        condition: decision.condition,
        reconsiderAfter: decision.state === "deferred" ? decision.reconsiderAfter : null,
        changeRefs: decision.changeRefs,
        draftId: decision.state === "proposed" ? input.draftId : null,
        decidedJobId: jobId,
        claimedJobId: null,
        claimedAttemptId: null,
        resolvedAt: resolvedNow(decision.state, now),
      })
      .where(
        and(
          eq(coachProgramRequests.id, decision.requestId),
          eq(coachProgramRequests.userId, userId),
        ),
      );
    await db.insert(coachRequestDecisions).values({
      userId,
      requestId: decision.requestId,
      jobId,
      state: decision.state,
      detail: decision.detail,
      changeRefs: decision.changeRefs,
      decidedAt: now,
    });
  }
  const remaining = await db
    .select({ id: coachProgramRequests.id })
    .from(coachProgramRequests)
    .where(and(eq(coachProgramRequests.userId, userId), actionable(input.today)));
  return {
    opened: patch.open.length,
    decided: patch.decisions.length,
    remaining: remaining.length,
  };
}

/**
 * The athlete approved the reviewed set: what was proposed is now what they train on.
 *
 * Applied is given here and nowhere else, in the same transaction that activates the draft,
 * because a proposal that failed to activate has not granted anything.
 */
export async function markRequestsApplied(
  db: DbOrTx,
  userId: string,
  draftId: string,
  now = new Date(),
) {
  const rows = await db
    .update(coachProgramRequests)
    .set({ state: "applied", resolvedAt: now })
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.draftId, draftId),
        eq(coachProgramRequests.state, "proposed"),
      ),
    )
    .returning({ id: coachProgramRequests.id, detail: coachProgramRequests.detail });
  for (const row of rows)
    await db.insert(coachRequestDecisions).values({
      userId,
      requestId: row.id,
      state: "applied",
      detail: row.detail,
      decidedAt: now,
    });
  return rows.length;
}

/**
 * The athlete said no, or asked for the proposal to be reworked.
 *
 * Declining settles the request with the athlete's own answer. Asking for revisions puts it
 * back in the queue for the next daily run instead, so the coach recomputes the proposal
 * rather than the athlete being left with a change they did not want.
 */
export async function releaseRequestsForDraft(
  db: DbOrTx,
  userId: string,
  draftId: string,
  outcome: "declined" | "waiting",
  detail: string,
  now = new Date(),
) {
  const rows = await db
    .update(coachProgramRequests)
    .set({
      state: outcome,
      detail,
      draftId: outcome === "declined" ? draftId : null,
      changeRefs: [],
      resolvedAt: resolvedNow(outcome, now),
    })
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.draftId, draftId),
        eq(coachProgramRequests.state, "proposed"),
      ),
    )
    .returning({ id: coachProgramRequests.id });
  for (const row of rows)
    await db.insert(coachRequestDecisions).values({
      userId,
      requestId: row.id,
      state: outcome,
      detail,
      decidedAt: now,
    });
  return rows.length;
}

/**
 * A proposal that no longer exists cannot be the answer to anything.
 *
 * A draft superseded by a newer review, or one whose programme moved on, would otherwise
 * leave its requests pointing at a change the athlete can no longer approve.
 */
export async function reopenOrphanedRequests(db: DbOrTx, userId: string, now = new Date()) {
  const stale = await db
    .select({ id: coachProgramRequests.id })
    .from(coachProgramRequests)
    .innerJoin(programDrafts, eq(programDrafts.id, coachProgramRequests.draftId))
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.state, "proposed"),
        inArray(programDrafts.status, ["rejected", "superseded"]),
      ),
    );
  if (!stale.length) return 0;
  await db
    .update(coachProgramRequests)
    .set({
      state: "waiting",
      detail: "The change it was waiting on is no longer available.",
      draftId: null,
      changeRefs: [],
      resolvedAt: null,
    })
    .where(
      and(
        eq(coachProgramRequests.userId, userId),
        inArray(
          coachProgramRequests.id,
          stale.map((row) => row.id),
        ),
      ),
    );
  for (const row of stale)
    await db.insert(coachRequestDecisions).values({
      userId,
      requestId: row.id,
      state: "waiting",
      detail: "The change it was waiting on is no longer available.",
      decidedAt: now,
    });
  return stale.length;
}

/**
 * The athlete's answer to a coach question, saved where every other note is saved.
 *
 * It travels as an ordinary message so the coach may quote it, and it names the question it
 * answers so the same request resumes rather than a second one being opened. Saving it starts
 * nothing: like any note, it waits for the next scheduled daily run.
 */
export async function answerProgramRequest(
  db: DbOrTx,
  userId: string,
  requestId: string,
  answer: string,
  noteId: string,
  now = new Date(),
) {
  const [request] = await db
    .select()
    .from(coachProgramRequests)
    .where(and(eq(coachProgramRequests.id, requestId), eq(coachProgramRequests.userId, userId)));
  if (!request) throw new CoachingError("That request is no longer waiting for an answer.", 404);
  if (request.state !== "needs_answer")
    throw new CoachingError("The coach is not waiting on an answer for this request.");
  await db
    .insert(coachNotes)
    .values({ id: noteId, userId, text: answer, requestId, createdAt: now })
    .onConflictDoNothing({ target: coachNotes.id });
  await db
    .update(coachProgramRequests)
    .set({ state: "waiting", detail: "Your answer is saved for the next daily coach run." })
    .where(
      and(
        eq(coachProgramRequests.id, requestId),
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.state, "needs_answer"),
      ),
    );
  await db.insert(coachRequestDecisions).values({
    userId,
    requestId,
    state: "waiting",
    detail: "Answered by the athlete.",
    decidedAt: now,
  });
  return { requestId };
}

/** The athlete no longer wants this; it stops coming back without being marked granted. */
export async function withdrawProgramRequest(
  db: DbOrTx,
  userId: string,
  requestId: string,
  now = new Date(),
) {
  const rows = await db
    .update(coachProgramRequests)
    .set({ state: "withdrawn", detail: "You withdrew this request.", resolvedAt: now })
    .where(
      and(
        eq(coachProgramRequests.id, requestId),
        eq(coachProgramRequests.userId, userId),
        inArray(coachProgramRequests.state, [...OPEN_REQUEST_STATES]),
      ),
    )
    .returning({ id: coachProgramRequests.id });
  if (!rows.length) throw new CoachingError("That request is already settled.");
  await db.insert(coachRequestDecisions).values({
    userId,
    requestId,
    state: "withdrawn",
    detail: "You withdrew this request.",
    decidedAt: now,
  });
  return rows[0]!;
}

/** Notes nobody has answered yet, so the screen can say what a saved note is waiting for. */
export async function countUnansweredNotes(db: DbOrTx, userId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(coachNotes)
    .where(and(eq(coachNotes.userId, userId), isNull(coachNotes.reviewedAt)));
  return row?.total ?? 0;
}
