import { z } from "zod";

import { evidenceIdSchema, isAthleteTextSource } from "./coach-memory";

/**
 * Something the athlete asked for that only the programme can grant.
 *
 * A note is a message; this is the ask inside it. One note can hold two — "Bayesian curls,
 * and more direct core work" — and a single read receipt cannot say that one was proposed
 * and the other needs a question answered. So each ask gets its own row, its own outcome and
 * its own history, anchored to the athlete's exact words so nobody has to trust a paraphrase.
 *
 * A remembered preference is not an answer. Memory records what is true about the athlete;
 * this records what they wanted done, and it stays open until something is done or a reason
 * is given.
 */

export const REQUEST_STATES = [
  /** Saved and waiting for the next scheduled daily coach run. */
  "waiting",
  /** The coach needs one specific thing answered before it can decide. */
  "needs_answer",
  /** A change exists and is waiting for approval. */
  "proposed",
  /** Not now, with a date it comes back. */
  "deferred",
  /** Considered and not recommended, with a reason. */
  "not_recommended",
  /** The active programme already does this. */
  "already_satisfied",
  /** The proposal was approved and activated. */
  "applied",
  /** The athlete said no. */
  "declined",
  /** The athlete withdrew it, or a newer request replaced it. */
  "withdrawn",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

/**
 * The outcomes a coaching run may submit.
 *
 * `applied` is the server's to give, in the transaction that activates the programme: a
 * request is not granted because a model said so, and a session that happens to contain the
 * exercise is not a programme change. `declined` and `withdrawn` are the athlete's.
 */
export const COACH_DECISION_STATES = [
  "needs_answer",
  "proposed",
  "deferred",
  "not_recommended",
  "already_satisfied",
] as const;
export type CoachDecisionState = (typeof COACH_DECISION_STATES)[number];

/** States that keep a request on the athlete's list; the rest are settled. */
export const OPEN_REQUEST_STATES: readonly RequestState[] = [
  "waiting",
  "needs_answer",
  "proposed",
  "deferred",
];

/** Furthest ahead a deferral may be parked, matching the memo's own reassessment ceiling. */
export const MAX_DEFERRAL_DAYS = 56;
/** How many open requests one job is asked to decide; the rest wait, they are never lost. */
export const REQUESTS_PER_JOB = 20;
/** Requests one result may open, so a single run cannot flood the list. */
export const MAX_NEW_REQUESTS = 10;

export const openRequestSchema = z.object({
  /** Minted by the run so its own decisions can refer to it before the row exists. */
  id: z.uuid(),
  sourceId: evidenceIdSchema.refine(
    isAthleteTextSource,
    "A request comes from the athlete's own note.",
  ),
  /** The athlete's exact words, so the ask is never only a paraphrase. */
  quote: z.string().trim().min(1).max(500),
  /** What is being asked, in one line the athlete will recognise. */
  summary: z.string().trim().min(1).max(200),
});
export type OpenRequestInput = z.infer<typeof openRequestSchema>;

export const requestDecisionSchema = z
  .object({
    requestId: z.uuid(),
    state: z.enum(COACH_DECISION_STATES),
    /** The question, the reason, or where the programme already covers it. */
    detail: z.string().trim().min(1).max(500),
    /** What has to be true for a deferral to be reconsidered, beside its date. */
    condition: z.string().trim().max(200).default(""),
    /** When a deferral comes back. Required of a deferral and of nothing else. */
    reconsiderAfter: z.iso.date().nullable().default(null),
    /** Operation IDs from the programme diff this decision claims to have produced. */
    changeRefs: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  })
  .refine(
    (decision) => decision.state !== "deferred" || decision.reconsiderAfter !== null,
    "A deferred request needs the date it will be looked at again.",
  )
  .refine(
    (decision) => decision.state !== "proposed" || decision.changeRefs.length > 0,
    "A proposed request must name the changes it produced.",
  );
export type RequestDecisionInput = z.infer<typeof requestDecisionSchema>;

export const requestPatchSchema = z.object({
  open: z.array(openRequestSchema).max(MAX_NEW_REQUESTS).default([]),
  decisions: z
    .array(requestDecisionSchema)
    .max(REQUESTS_PER_JOB + MAX_NEW_REQUESTS)
    .default([]),
});
export type RequestPatch = z.infer<typeof requestPatchSchema>;

/** A deferral must land inside the window the memo uses, so nothing is parked indefinitely. */
export function validateDeferral(reconsiderAfter: string, now: Date): void {
  const today = now.toISOString().slice(0, 10);
  const ceiling = new Date(now.getTime() + MAX_DEFERRAL_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (reconsiderAfter <= today || reconsiderAfter > ceiling)
    throw new Error(
      `Set the reconsideration date after today and within ${MAX_DEFERRAL_DAYS} days.`,
    );
}
