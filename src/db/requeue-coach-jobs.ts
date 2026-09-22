import { config as loadEnv } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { MAX_JOB_ATTEMPTS } from "../domain/coaching-workflow";
import { getMigrationDatabaseUrl } from "../lib/env";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import { coachJobs } from "./schema";
import type { DbOrTx } from "./types";

/**
 * Puts failed coaching jobs back in the queue (ops, not a feature).
 *
 * A failed job keeps its row, and the row keeps its `dedupe_key`. `enqueueCoachJob` inserts
 * with `onConflictDoNothing` against `unique (user_id, dedupe_key)`, so the record of the
 * failure is exactly what stops the work being queued again: the next dispatch does not retry
 * that session, it silently declines to create anything for it. A whole class of jobs lost to
 * one bad deploy is therefore lost for good, however quickly the bug is fixed — there is no
 * date at which they come back.
 *
 * This is the way back, and it is deliberately an operator's tool rather than an endpoint.
 * The coaching worker talks to the app over HTTP with a service token; it has no database
 * credentials, so it structurally cannot reach this. That matters: a worker able to requeue
 * its own failure would retry forever, spending the owner's subscription on a job that cannot
 * succeed. Deciding that a failure is worth another try is a judgement about the world outside
 * the job — that a fix has shipped — and only a person is in a position to make it.
 *
 * Nothing is deleted and no counter is rewound. `attempts` keeps climbing, because 0015's
 * receipt trigger writes one `coach_job_attempts` row per `(job_id, attempts)`; the budget is
 * raised instead. A requeued job therefore still says, truthfully, how many attempts it has
 * had.
 *
 * Runs as the migration role, so it sees every account; nothing here goes through RLS, which
 * is why it lives beside the migrations rather than in the app.
 */

export type RequeueFilter = {
  /** One job by id. */
  jobId?: string;
  /** Every failed job of one athlete. */
  userId?: string;
  /** Only these kinds, e.g. just the session preparations. */
  kinds?: readonly ("create_program" | "prepare_session" | "review_program")[];
};

export type FailedJob = {
  id: string;
  userId: string;
  kind: string;
  dedupeKey: string;
  attempts: number;
  error: string | null;
};

function conditions(filter: RequeueFilter) {
  const where = [eq(coachJobs.status, "failed" as const)];
  if (filter.jobId) where.push(eq(coachJobs.id, filter.jobId));
  if (filter.userId) where.push(eq(coachJobs.userId, filter.userId));
  if (filter.kinds?.length) where.push(inArray(coachJobs.kind, [...filter.kinds]));
  return and(...where);
}

/** What a requeue would touch, without touching it. */
export async function listFailedJobs(db: DbOrTx, filter: RequeueFilter = {}): Promise<FailedJob[]> {
  return db
    .select({
      id: coachJobs.id,
      userId: coachJobs.userId,
      kind: coachJobs.kind,
      dedupeKey: coachJobs.dedupeKey,
      attempts: coachJobs.attempts,
      error: coachJobs.error,
    })
    .from(coachJobs)
    .where(conditions(filter))
    .orderBy(coachJobs.createdAt);
}

/**
 * Revives the matching rows, and only the ones still failed when the statement runs.
 *
 * `status = 'failed'` is in the `where`, so this is a compare-and-swap rather than a read
 * followed by a write: a job claimed between the listing above and this update is simply not
 * matched, and a job that has already succeeded can never be sent round again.
 */
export async function requeueFailedJobs(
  db: DbOrTx,
  filter: RequeueFilter = {},
  now = new Date(),
): Promise<FailedJob[]> {
  const requeued = await db
    .update(coachJobs)
    .set({
      status: "queued",
      attemptBudget: sql`${coachJobs.attempts} + ${MAX_JOB_ATTEMPTS}`,
      attemptId: null,
      leaseUntil: null,
      completedAt: null,
      nextAttemptAt: now,
      error: null,
      result: null,
      resultDigest: null,
    })
    .where(conditions(filter))
    .returning({
      id: coachJobs.id,
      userId: coachJobs.userId,
      kind: coachJobs.kind,
      dedupeKey: coachJobs.dedupeKey,
      attempts: coachJobs.attempts,
      error: coachJobs.error,
    });
  return requeued;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function describe(job: FailedJob): string {
  return `  ${job.kind} ${job.id} (${job.dedupeKey}, ${job.attempts} attempts)${
    job.error ? `\n    ${job.error}` : ""
  }`;
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  // Writing to production is the default nobody should get by accident: this reports what it
  // would change and stops, unless it is told to go ahead.
  const apply = process.argv.includes("--apply");
  const kinds = argument("kind")
    ?.split(",")
    .map((kind) => kind.trim())
    .filter(Boolean) as RequeueFilter["kinds"];
  const filter: RequeueFilter = { jobId: argument("job"), userId: argument("user"), kinds };
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  try {
    const db = drizzle(client, { schema });
    const target = describeTarget(url);
    if (!apply) {
      const pending = await listFailedJobs(db, filter);
      if (pending.length === 0) {
        console.log(`No failed jobs match. Target: ${target}.`);
        return;
      }
      console.log(`Would requeue ${pending.length} failed job(s):`);
      for (const job of pending) console.log(describe(job));
      console.log(`Target: ${target}. Nothing was changed — re-run with --apply to do it.`);
      return;
    }
    console.log(`Requeueing failed coaching jobs → ${target}`);
    const done = await requeueFailedJobs(db, filter);
    for (const job of done) console.log(describe(job));
    console.log(`  ${done.length} job(s) queued again.`);
    if (done.length > 0)
      console.log("Run the coach routine to pick them up; they are due immediately.");
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing the functions above must not touch anything.
if (process.argv[1]?.endsWith("requeue-coach-jobs.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
