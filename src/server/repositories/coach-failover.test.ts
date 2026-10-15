import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { coachJobAttempts, coachJobs, gyms, coachPrimaryBatches } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { coachIntakeSchema, COACH_CONTRACT_VERSION } from "@/domain/coaching-workflow";
import { confirmIntake, saveIntake } from "./coach-intakes";
import {
  claimCoachJob,
  getCoachJob,
  requestProgramCreation,
  queuedCoachJobs,
} from "./coaching-jobs";
import {
  backupCoachJobs,
  backupDispatchStanding,
  completeCoachBatch,
  touchPrimaryBatch,
} from "./coach-failover";
import { handleCoachWorkflow } from "@/server/coach-workflow-service";

let t: TestDatabase;
const beginning = new Date("2026-10-14T23:30:00Z");
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(beginning);
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  vi.stubEnv("COACH_BACKUP_ENABLED", "true");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const clock = (minutes: number) =>
  vi.setSystemTime(new Date(beginning.getTime() + minutes * 60000));
async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const queued = await withUser(t.db, user.id, async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: user.id, name: "Home", slug: "home", kind: "home", isDefault: true })
      .returning();
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        goal: "Get stronger",
        sessionsPerWeek: 1,
        minutesPerSession: 30,
        trainingLocation: "home",
        gymId: gym!.id,
        heightCm: 180,
        weightKg: 75,
        ageYears: 30,
      }),
      null,
    );
    await confirmIntake(tx, user.id, intake.id);
    return requestProgramCreation(tx, user.id, intake.id, crypto.randomUUID());
  });
  return { userId: user.id, jobId: queued.job.id };
}
const claim = (a: Awaited<ReturnType<typeof athlete>>, provider: "claude" | "chatgpt") =>
  withUser(t.db, a.userId, (tx) => claimCoachJob(tx, a.userId, a.jobId, new Date(), provider));
async function call(
  a: Awaited<ReturnType<typeof athlete>>,
  attempt: string,
  operation: string,
  provider: "claude" | "chatgpt",
  body?: unknown,
) {
  const path = ["users", a.userId, "jobs", a.jobId, operation];
  return handleCoachWorkflow(
    t.db,
    new Request(
      `https://app.test/api/coach/service/workflow/${path.join("/")}?attemptId=${attempt}`,
      {
        method: "POST",
        headers: {
          "X-Coach-Contract-Version": String(COACH_CONTRACT_VERSION),
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    path,
    { provider },
  );
}

it("does not take over a missing run early, then claims the same durable request", async () => {
  const a = await athlete();
  clock(9);
  expect(await claim(a, "chatgpt")).toBeNull();
  clock(10);
  const backup = await claim(a, "chatgpt");
  expect(backup).toMatchObject({
    id: a.jobId,
    workerProvider: "chatgpt",
    attempts: 1,
    attemptBudget: 3,
  });
  expect(await claim(a, "claude")).toBeNull();
  expect((await queuedCoachJobs(t.db)).some((job) => job.id === a.jobId)).toBe(false);
});
it("keeps healthy primary attempts, retires silent ones, and rejects late Claude writes", async () => {
  const a = await athlete();
  const primary = (await claim(a, "claude"))!;
  clock(8);
  expect((await call(a, primary.attemptId!, "heartbeat", "claude")).status).toBe(200);
  clock(10);
  expect(await claim(a, "chatgpt")).toBeNull();
  clock(18);
  const backup = (await claim(a, "chatgpt"))!;
  expect(backup.attemptId).not.toBe(primary.attemptId);
  expect(backup.attempts).toBe(2);
  const result = {
    outcome: "needs_input",
    questions: ["Which days can you train?"],
    rationale: "Need confirmed availability.",
    evidence: [],
    uncertainties: [],
  };
  expect((await call(a, primary.attemptId!, "result", "claude", result)).status).toBe(403);
  const accepted = await call(a, backup.attemptId!, "result", "chatgpt", result);
  expect(await accepted.json()).toMatchObject({ accepted: true });
  const stored = await withUser(t.db, a.userId, (tx) => getCoachJob(tx, a.userId, a.jobId));
  expect(stored?.status).toBe("needs_input");
  expect(await claim(a, "chatgpt")).toBeNull();
  const receipts = await withUser(t.db, a.userId, (tx) =>
    tx.select().from(coachJobAttempts).where(eq(coachJobAttempts.jobId, a.jobId)),
  );
  expect(receipts.map((row) => row.number).sort()).toEqual([1, 2]);
  expect(receipts.find((row) => row.id === primary.attemptId)?.status).toBe("retry_queued");
});
it("has one bounded backup budget even after the primary exhausted all its attempts", async () => {
  const a = await athlete();
  for (let number = 1; number <= 3; number++) {
    clock(number * 2);
    const primary = (await claim(a, "claude"))!;
    expect(primary.attempts).toBe(number);
    expect(
      (
        await call(a, primary.attemptId!, "fail", "claude", {
          error: "Subscription unavailable",
          retryable: true,
        })
      ).status,
    ).toBe(200);
  }
  clock(15);
  expect(await claim(a, "chatgpt")).toBeNull();
  for (let number = 4; number <= 6; number++) {
    clock(16 + (number - 4) * 2);
    const backup = (await claim(a, "chatgpt"))!;
    expect(backup).toMatchObject({ attempts: number, attemptBudget: 6 });
    await call(a, backup.attemptId!, "fail", "chatgpt", {
      error: "Temporary tool failure",
      retryable: true,
    });
  }
  clock(60);
  expect(await claim(a, "chatgpt")).toBeNull();
  expect(
    (await withUser(t.db, a.userId, (tx) => getCoachJob(tx, a.userId, a.jobId)))?.attemptBudget,
  ).toBe(6);
});
it("does not let one athlete's primary progress keep another athlete's request waiting", async () => {
  const a = await athlete(),
    b = await athlete();
  const primaryB = (await claim(b, "claude"))!;
  clock(9);
  await call(b, primaryB.attemptId!, "heartbeat", "claude");
  clock(10);
  expect(await claim(a, "chatgpt")).not.toBeNull();
  expect(await claim(b, "chatgpt")).toBeNull();
});
it("keeps pagination even when a page has no eligible work", async () => {
  const a = await athlete();
  expect((await backupCoachJobs(t.db, null)).jobs.some((job) => job.id === a.jobId)).toBe(false);
  clock(11);
  expect((await backupCoachJobs(t.db, null)).jobs.some((job) => job.id === a.jobId)).toBe(true);
});
it("does not allow a browser role to manufacture a primary batch heartbeat", async () => {
  const a = await athlete();
  await expect(withUser(t.db, a.userId, (tx) => touchPrimaryBatch(tx))).rejects.toThrow();
  await touchPrimaryBatch(t.db);
  expect(await withUser(t.db, a.userId, (tx) => tx.select().from(coachPrimaryBatches))).not.toEqual(
    [],
  );
});
it("blocks daily dispatch until ten minutes past the boundary or the primary's latest progress", async () => {
  await t.db.delete(coachPrimaryBatches).where(eq(coachPrimaryBatches.batchDate, "2026-10-15"));
  clock(9);
  expect((await backupDispatchStanding(t.db)).eligible).toBe(false);
  clock(10);
  expect((await backupDispatchStanding(t.db)).eligible).toBe(true);
  await touchPrimaryBatch(t.db);
  clock(19);
  expect((await backupDispatchStanding(t.db)).eligible).toBe(false);
  clock(20);
  expect((await backupDispatchStanding(t.db)).eligible).toBe(true);
});
it("fails closed when the owner pauses the backup", async () => {
  const a = await athlete();
  clock(11);
  vi.stubEnv("COACH_BACKUP_ENABLED", "false");
  expect(await claim(a, "chatgpt")).toBeNull();
});
it("does not redispatch a completed daily batch when its worker naturally goes quiet", async () => {
  await completeCoachBatch(t.db, "claude");
  clock(120);
  expect(await backupDispatchStanding(t.db)).toMatchObject({ eligible: false, completed: true });
  // Explicit work still falls back after its own timeout, independently of daily completion.
  const a = await athlete();
  clock(130);
  expect(await claim(a, "chatgpt")).not.toBeNull();
});
it("prevents a browser REST session from forging provider assignment or progress", async () => {
  const a = await athlete();
  await t.db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claim.sub', ${a.userId}, true), set_config('app.server_write', '', true), set_config('role', 'authenticated', true)`,
    );
    const rows = await tx
      .update(coachJobs)
      .set({ workerProvider: "chatgpt", primaryProgressAt: new Date() })
      .where(eq(coachJobs.id, a.jobId))
      .returning();
    expect(rows).toEqual([]);
  });
  expect(
    (await t.db.select().from(coachJobs).where(eq(coachJobs.id, a.jobId)))[0]?.workerProvider,
  ).toBe("claude");
});
it("does not change another athlete's job when given a mismatched user id", async () => {
  const a = await athlete(),
    b = await athlete();
  clock(11);
  expect(
    await withUser(t.db, b.userId, (tx) =>
      claimCoachJob(tx, b.userId, a.jobId, new Date(), "chatgpt"),
    ),
  ).toBeNull();
  expect(
    (
      await t.db
        .select()
        .from(coachJobs)
        .where(and(eq(coachJobs.id, a.jobId), eq(coachJobs.userId, a.userId)))
    )[0]?.backupTakenAt,
  ).toBeNull();
});
