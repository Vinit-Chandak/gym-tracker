import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { listFailedJobs, requeueFailedJobs } from "@/db/requeue-coach-jobs";
import { coachJobs } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { jobTargetSchema } from "@/domain/coaching-workflow";

/**
 * The operator's way back from a failure the server caused.
 *
 * These run against the raw database the way the script does — as the migration role, seeing
 * every account — because that is the whole point of the tool: a failure that stranded work
 * across several athletes is recovered in one command, and no athlete can reach it.
 */

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

async function job(
  userId: string,
  dedupeKey: string,
  status: "failed" | "succeeded" | "claimed" | "queued",
  kind: "prepare_session" | "review_program" = "prepare_session",
) {
  const [row] = await t.db
    .insert(coachJobs)
    .values({
      userId,
      kind,
      trigger: "daily",
      dedupeKey,
      status,
      attempts: 3,
      target: jobTargetSchema.parse({}),
      completedAt: status === "failed" || status === "succeeded" ? new Date() : null,
      error: status === "failed" ? "Something the server got wrong." : null,
    })
    .returning();
  return row!;
}

it("lists and revives only the failed jobs, leaving every other status alone", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const failed = await job(user.id, "occurrence:a", "failed");
  const succeeded = await job(user.id, "occurrence:b", "succeeded");
  const claimed = await job(user.id, "occurrence:c", "claimed");

  expect((await listFailedJobs(t.db, { userId: user.id })).map((row) => row.id)).toEqual([
    failed.id,
  ]);

  const done = await requeueFailedJobs(t.db, { userId: user.id });
  expect(done.map((row) => row.id)).toEqual([failed.id]);

  const after = await t.db.select().from(coachJobs).where(eq(coachJobs.userId, user.id));
  const byId = new Map(after.map((row) => [row.id, row]));
  expect(byId.get(failed.id)).toMatchObject({
    status: "queued",
    attempts: 3,
    attemptBudget: 6,
    attemptId: null,
    completedAt: null,
    error: null,
  });
  // A finished job keeps its result; an effect already applied is never applied again.
  expect(byId.get(succeeded.id)?.status).toBe("succeeded");
  expect(byId.get(claimed.id)?.status).toBe("claimed");
});

it("requeues a failed job only once", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  await job(user.id, "occurrence:once", "failed");
  expect(await requeueFailedJobs(t.db, { userId: user.id })).toHaveLength(1);
  expect(await requeueFailedJobs(t.db, { userId: user.id })).toHaveLength(0);
});

it("narrows to one job, one athlete or one kind", async () => {
  const one = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const two = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const session = await job(one.id, "occurrence:x", "failed", "prepare_session");
  await job(one.id, "review:x", "failed", "review_program");
  await job(two.id, "occurrence:y", "failed", "prepare_session");

  expect((await listFailedJobs(t.db, { jobId: session.id })).map((row) => row.id)).toEqual([
    session.id,
  ]);
  expect(await listFailedJobs(t.db, { userId: one.id })).toHaveLength(2);
  expect(
    (await listFailedJobs(t.db, { userId: one.id, kinds: ["prepare_session"] })).map(
      (row) => row.id,
    ),
  ).toEqual([session.id]);
  // No filter at all is every athlete's failed work, which is the whole-outage case.
  expect((await listFailedJobs(t.db)).length).toBeGreaterThanOrEqual(3);
});
