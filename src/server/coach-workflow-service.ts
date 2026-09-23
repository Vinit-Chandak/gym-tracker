import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { coachJobs } from "@/db/schema";
import type { Db } from "@/db/types";
import { withUser } from "@/db/with-user";
import { coachRollout } from "@/lib/coach-rollout";
import {
  coachJobResultSchema,
  COACH_CONTRACT_VERSION,
  isSupportedContract,
  SUPPORTED_CONTRACT_VERSIONS,
} from "@/domain/coaching-workflow";
import { getCoachAttachment } from "./repositories/coach-attachments";
import { assertLiveAttempt, lookupExercises, lookupMachines } from "./repositories/coach-lookups";
import { coachJobContext } from "./repositories/coaching-context";
import {
  acceptCoachJobResult,
  claimCoachJob,
  dispatchCoachPage,
  getCoachJob,
  queuedCoachJobs,
} from "./repositories/coaching-jobs";
import { recordAttemptDiagnostics } from "./repositories/coach-diagnostics";
import { assertCoachEnabled, CoachingError } from "./repositories/coaching-state";
import { PlanValidationError } from "./repositories/coach-plans";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });

const optional = (value: string | null) =>
  value === null || value.trim() === "" ? undefined : value;
const exerciseLookup = z.object({
  q: z.string().trim().max(120).optional(),
  muscle: z.string().trim().max(40).optional(),
  pattern: z.string().trim().max(60).optional(),
  gymId: z.uuid().nullable().default(null),
  availableOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
/** Called only after the existing coach service's constant-time bearer authentication. */
export async function handleCoachWorkflow(
  db: Db,
  request: Request,
  path: string[],
): Promise<Response> {
  if (process.env.COACH_WORKFLOW_ENABLED !== "true")
    return json({ error: "The new coaching workflow is not enabled on this server." }, 503);
  try {
    const method = request.method;
    if (path.length === 1 && path[0] === "contract" && method === "GET")
      return json({
        version: COACH_CONTRACT_VERSION,
        supportedVersions: SUPPORTED_CONTRACT_VERSIONS,
        result: z.toJSONSchema(coachJobResultSchema, { io: "input", unrepresentable: "any" }),
      });
    /**
     * A worker says which contract it speaks before it is given anything to do.
     *
     * The version has always travelled in the context; what it lacked was somewhere to be
     * checked. Declaring it on the request means a stale clone is turned away before an
     * attempt is spent — and, at cutover, that a v3 worker draining an old queue cannot claim
     * a job whose target it has no way to describe (§8.5, AT-API-07).
     */
    const declared = request.headers.get("x-coach-contract-version");
    if (declared !== null) {
      const version = Number(declared);
      if (!Number.isInteger(version) || !isSupportedContract(version))
        return json(
          {
            error: "upgrade_required",
            detail: `This worker declares contract ${declared}; this server speaks ${COACH_CONTRACT_VERSION}. Re-run on the repository's default branch and read the current skill before claiming anything.`,
            version: COACH_CONTRACT_VERSION,
            supportedVersions: SUPPORTED_CONTRACT_VERSIONS,
          },
          409,
        );
    }
    if (path.length === 1 && path[0] === "dispatch" && method === "POST") {
      if (!coachRollout().dispatcher) return json({ error: "Scheduled dispatch is paused." }, 503);
      const body = z
        .object({ after: z.uuid().nullable().default(null) })
        .parse(await request.json());
      const started = performance.now();
      const page = await dispatchCoachPage(db, body.after);
      console.info(
        "coach.dispatch",
        JSON.stringify({
          evaluated: page.evaluated,
          pending: page.jobs.length,
          errors: page.errors.length,
          hasMore: !!page.nextCursor,
          durationMs: Math.round(performance.now() - started),
        }),
      );
      return json(page);
    }
    if (path.length === 1 && path[0] === "queue" && method === "GET")
      return json({ jobs: await queuedCoachJobs(db) });
    if (path[0] !== "users" || path[2] !== "jobs")
      return json({ error: "Unknown workflow route." }, 404);
    const userId = z.uuid().parse(path[1]),
      id = z.uuid().parse(path[3]);
    const operation = path[4];
    if (path.length === 5 && operation === "claim" && method === "POST")
      return json(
        await withUser(db, userId, async (tx) => ({ job: await claimCoachJob(tx, userId, id) })),
      );
    const attemptId = z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    if (path.length === 5 && operation === "context" && method === "GET") {
      const started = performance.now();
      const context = await withUser(db, userId, (tx) =>
        coachJobContext(tx, userId, id, attemptId),
      );
      const serialized = JSON.stringify(context);
      console.info(
        "coach.context",
        JSON.stringify({
          jobId: id,
          bytes: Buffer.byteLength(serialized),
          durationMs: Math.round(performance.now() - started),
        }),
      );
      return new Response(serialized, {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    /**
     * Lookups the live attempt makes while it works (ADR 0029): the exercise library searched
     * by the athlete's own words, and the machines at one of their locations. Neither is in
     * the context any more; both answer only the attempt holding the job's lease.
     */
    if (path.length === 5 && operation === "exercises" && method === "GET") {
      const params = new URL(request.url).searchParams;
      const query = exerciseLookup.parse({
        q: optional(params.get("q")),
        muscle: optional(params.get("muscle")),
        pattern: optional(params.get("pattern")),
        gymId: optional(params.get("gymId")) ?? null,
        availableOnly: optional(params.get("available")),
        limit: optional(params.get("limit")),
        offset: optional(params.get("offset")),
      });
      return json(
        await withUser(
          db,
          userId,
          async (tx) => {
            await assertCoachEnabled(tx, userId);
            await assertLiveAttempt(tx, userId, id, attemptId);
            return lookupExercises(tx, userId, query);
          },
          { readOnly: true },
        ),
      );
    }
    if (path.length === 5 && operation === "machines" && method === "GET") {
      const gymId = z.uuid().parse(new URL(request.url).searchParams.get("gymId"));
      return json(
        await withUser(
          db,
          userId,
          async (tx) => {
            await assertCoachEnabled(tx, userId);
            await assertLiveAttempt(tx, userId, id, attemptId);
            return lookupMachines(tx, userId, gymId);
          },
          { readOnly: true },
        ),
      );
    }
    if (path.length === 6 && operation === "attachments" && method === "GET") {
      const fileId = z.uuid().parse(path[5]);
      const file = await withUser(db, userId, async (tx) => {
        await assertCoachEnabled(tx, userId);
        const job = await getCoachJob(tx, userId, id);
        if (
          !job ||
          job.status !== "claimed" ||
          job.attemptId !== attemptId ||
          !job.leaseUntil ||
          job.leaseUntil <= new Date()
        )
          throw new CoachingError("The report is only available to the current claimed attempt.");
        return getCoachAttachment(tx, userId, fileId);
      });
      return new Response(Buffer.from(file.content, "base64"), {
        headers: {
          ...headers,
          "Content-Type": file.mimeType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        },
      });
    }
    if (path.length === 5 && operation === "result" && method === "POST") {
      const result = coachJobResultSchema.parse(await request.json());
      return json(
        await withUser(db, userId, (tx) => acceptCoachJobResult(tx, userId, id, attemptId, result)),
      );
    }
    if (path.length === 5 && operation === "fail" && method === "POST") {
      const body = z
        .object({ error: z.string().trim().min(1).max(500), retryable: z.boolean().default(false) })
        .parse(await request.json());
      return json(
        await withUser(db, userId, async (tx) => {
          await assertCoachEnabled(tx, userId);
          const job = await getCoachJob(tx, userId, id);
          if (
            !job ||
            job.status !== "claimed" ||
            job.attemptId !== attemptId ||
            !job.leaseUntil ||
            job.leaseUntil <= new Date()
          )
            throw new CoachingError("This is not the current live attempt.");
          const retry = body.retryable && job.attempts < job.attemptBudget;
          await tx
            .update(coachJobs)
            .set({
              status: retry ? "queued" : "failed",
              error: body.error,
              leaseUntil: null,
              nextAttemptAt: new Date(Date.now() + 60_000),
              completedAt: retry ? null : new Date(),
            })
            .where(and(eq(coachJobs.id, id), eq(coachJobs.userId, userId)));
          await recordAttemptDiagnostics(tx, userId, {
            jobId: id,
            attemptId,
            kind: job.kind,
            outcome: retry ? "failed_retryable" : "failed",
            diagnostics: { attempt: job.attempts },
            error: body.error,
          });
          return { accepted: true, retry };
        }),
      );
    }
    return json({ error: "Unknown workflow route." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "Invalid coaching request.", issues: error.issues }, 422);
    // A validation refusal names everything wrong with the result, not just the first thing
    // found: a worker with two corrections to spend cannot use them on a list it is shown one
    // entry at a time. `error` stays the first issue for readers that only read that.
    if (error instanceof CoachingError)
      return json(
        error.issues.length > 1
          ? { error: error.message, issues: error.issues }
          : { error: error.message },
        error.status,
      );
    if (error instanceof PlanValidationError)
      return json({ error: error.message, issues: error.issues }, 422);
    throw error;
  }
}
