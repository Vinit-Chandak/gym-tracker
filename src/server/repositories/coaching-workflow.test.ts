import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  coachJobs,
  coachJobAttempts,
  coachPreferences,
  coachWeeklyReviews,
  gyms,
  profiles,
  programDrafts,
  programs,
  sessionPlans,
  setLogs,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { firstWeeklyReviewPeriod, lastCoachBoundary } from "@/domain/coach-cadence";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { confirmIntake, latestIntake, saveIntake, setTrainingMode } from "./coach-intakes";
import {
  acceptCoachJobResult,
  claimCoachJob,
  enqueueCoachJob,
  requestGymChange,
  requestProgramCreation,
  dispatchCoachPage,
  enqueueDailySession,
  queuedCoachJobs,
} from "./coaching-jobs";
import { coachJobContext } from "./coaching-context";
import {
  activateProgramDraft,
  getProgramDraft,
  refreshProgramDraft,
  saveManualDraft,
  copyProgramToDraft,
  archiveActiveProgram,
} from "./program-drafts";
import {
  getCoachAttachment,
  listCoachAttachments,
  removeCoachAttachment,
  saveCoachAttachment,
} from "./coach-attachments";
import { getSchedule, recordSlotEvent } from "./schedule";
import { readProgramBlueprint } from "./programs";
import {
  createCustomExercise,
  routineFromWorkout,
  saveRoutine,
  startSavedRoutine,
} from "./manual-training";
import { finishSession, getSessionDetail, startAdHocSession } from "./sessions";
import { handleCoachServiceRequest } from "@/server/coach-service";
import { todayWorkflowState } from "./coaching-today";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});
const blueprint: ProgramBlueprint = {
  ...STRENGTH_AESTHETICS_HYBRID_8WK,
  slug: "test-personal-plan",
  name: "My own plan",
  weeks: 2,
  runs: [],
  days: [
    {
      ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
      dayIndex: 1,
      includesRun: false,
      exercises: [STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!.exercises[0]!],
    },
  ],
};
async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  return withUser(t.db, user.id, async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: user.id, name: "My gym", slug: "my-gym", isDefault: true })
      .returning();
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        goal: "Become stronger with one training day",
        sessionsPerWeek: 1,
        minutesPerSession: 45,
        reviewWeekday: 7,
        gymId: gym!.id,
        prompt: "A custom programme, not the founder template.",
      }),
      null,
    );
    await confirmIntake(tx, user.id, intake.id);
    return { user, gym: gym!, intake };
  });
}
type Athlete = Awaited<ReturnType<typeof athlete>>;
const as = <T>(a: Athlete, work: Parameters<typeof withUser<T>>[2]) =>
  withUser(t.db, a.user.id, work);
async function request(a: Athlete) {
  return as(a, (tx) => requestProgramCreation(tx, a.user.id, a.intake.id, crypto.randomUUID()));
}
const result = (a: Athlete) => ({
  outcome: "program",
  blueprint,
  openingPlan: {
    dayIndex: 1,
    gymId: a.gym.id,
    summary: "Find a comfortable starting load.",
    exercises: [
      {
        orderIndex: 1,
        action: "keep",
        exerciseSlug: blueprint.days[0]!.exercises[0]!.exerciseSlug,
        note: "Choose a load leaving three reps in reserve; record what you used.",
        sets: [{ reps: 5, weight: null, rir: 3 }],
      },
    ],
  },
  rationale: "Matches the confirmed goal and available equipment.",
  evidence: [],
  uncertainties: ["No comparable training history yet."],
});
async function generated(a: Athlete) {
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, result(a)),
  );
  const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
  return { job, claim: claim!, draft: draft! };
}

it("keeps unknown intake values, detects competing edits and preserves confirmed answers", async () => {
  const a = await athlete();
  expect(a.intake.answers.weightKg).toBeNull();
  expect(a.intake.answers.baselines).toEqual([]);
  const edited = await as(a, (tx) =>
    saveIntake(tx, a.user.id, { ...a.intake.answers, prompt: "Changed brief" }, a.intake.revision),
  );
  expect(edited.id).not.toBe(a.intake.id);
  expect(edited.confirmedAt).toBeNull();
  const saved = await as(a, (tx) =>
    saveIntake(tx, a.user.id, { ...edited.answers, prompt: "Another edit" }, edited.revision),
  );
  expect(saved.revision).toBeGreaterThan(edited.revision);
  await expect(
    as(a, (tx) => saveIntake(tx, a.user.id, edited.answers, edited.revision)),
  ).rejects.toThrow(/another device/);
});
it("claims once, accepts an exact duplicate once, and activates an opening session atomically", async () => {
  const a = await athlete(),
    key = crypto.randomUUID();
  const one = await as(a, (tx) => requestProgramCreation(tx, a.user.id, a.intake.id, key));
  const same = await as(a, (tx) => requestProgramCreation(tx, a.user.id, a.intake.id, key));
  expect(same.job.id).toBe(one.job.id);
  const claims = await Promise.all([
    as(a, (tx) => claimCoachJob(tx, a.user.id, one.job.id)),
    as(a, (tx) => claimCoachJob(tx, a.user.id, one.job.id)),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const claim = claims.find(Boolean)!;
  const ctx = await as(a, (tx) => coachJobContext(tx, a.user.id, one.job.id, claim.attemptId!));
  expect(ctx.confirmedIntake?.answers.goal).toBe(a.intake.answers.goal);
  expect(ctx.program).toBeNull();
  expect(ctx.policy.rules.length).toBeGreaterThan(0);
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, one.job.id, claim.attemptId!, result(a)),
  );
  expect(accepted.accepted).toBe(true);
  expect(
    await as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, one.job.id, claim.attemptId!, result(a)),
    ),
  ).toMatchObject({ accepted: true, duplicate: true });
  const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
  const activations = await Promise.all(
    [1, 2].map(() =>
      as(a, (tx) =>
        activateProgramDraft(tx, a.user.id, draft!.id, {
          expectedRevision: draft!.revision,
          startDate: "2026-09-14",
          transition: "new_block",
        }),
      ),
    ),
  );
  expect(activations[0]!.programId).toBe(activations[1]!.programId);
  expect(
    await as(a, (tx) => tx.select().from(programs).where(eq(programs.status, "active"))),
  ).toHaveLength(1);
  const [opening] = await as(a, (tx) => tx.select().from(sessionPlans));
  expect(opening?.exercises[0]?.slotId).toBeTruthy();
  expect(opening?.exercises[0]?.sets[0]?.weight).toBeNull();
});
it("rejects stale generation and opening sessions that omit a slot before saving a draft", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
        ...result(a),
        openingPlan: { ...result(a).openingPlan, exercises: [] },
      }),
    ),
  ).rejects.toThrow(/every exercise/);
  expect(await as(a, (tx) => tx.select().from(programDrafts))).toHaveLength(0);
  await as(a, (tx) => startAdHocSession(tx, a.user.id, { gymId: a.gym.id }));
  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, result(a))),
  ).toMatchObject({ accepted: false });
  expect((await as(a, (tx) => tx.select().from(coachJobs)))[0]?.status).toBe("superseded");
});
it("reconciles an expired attempt and refuses its old token after reclaim", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const expired = new Date(Date.now() - 1000);
  await as(a, (tx) =>
    tx.update(coachJobs).set({ leaseUntil: expired }).where(eq(coachJobs.id, job.id)),
  );
  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, result(a))),
  ).toMatchObject({ accepted: false });
  const next = await as(a, (tx) =>
    claimCoachJob(tx, a.user.id, job.id, new Date(Date.now() + 65_000)),
  );
  expect(next?.attemptId).not.toBe(claim!.attemptId);
  expect(next?.attempts).toBe(2);
  const receipts = await as(a, (tx) => tx.select().from(coachJobAttempts));
  expect(receipts).toHaveLength(2);
  expect(receipts.find((entry) => entry.id === claim!.attemptId)).toMatchObject({
    status: "retry_queued",
    error: expect.stringMatching(/timed out/),
    finishedAt: expect.any(Date),
  });
  expect(receipts.find((entry) => entry.id === next!.attemptId)).toMatchObject({
    status: "claimed",
    number: 2,
  });
  await expect(
    as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, result(a))),
  ).rejects.toThrow(/current attempt/);
});
it("protects reports and drafts across accounts, and removes reports from future access", async () => {
  const a = await athlete(),
    b = await athlete();
  const file = await as(a, (tx) =>
    saveCoachAttachment(
      tx,
      a.user.id,
      "report.txt",
      "text/plain",
      Buffer.from("Athlete-supplied report."),
    ),
  );
  expect(await as(b, (tx) => listCoachAttachments(tx, b.user.id))).toEqual([]);
  await expect(as(b, (tx) => getCoachAttachment(tx, b.user.id, file.id))).rejects.toThrow(
    /not found/,
  );
  const { draft } = await generated(a);
  expect(await as(b, (tx) => getProgramDraft(tx, b.user.id, draft.id))).toBeNull();
  await as(a, (tx) => removeCoachAttachment(tx, a.user.id, file.id));
  await expect(as(a, (tx) => getCoachAttachment(tx, a.user.id, file.id))).rejects.toThrow(
    /not found/,
  );
  expect((await as(a, (tx) => getProgramDraft(tx, a.user.id, draft.id)))?.status).toBe(
    "superseded",
  );
});
it("applies a weekly prescription revision once, carries position, then queues preparation", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  const initial = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  await as(a, (tx) =>
    recordSlotEvent(
      tx,
      a.user.id,
      initial.programId,
      { cycleIndex: 1, dayIndex: 1 },
      "session",
      "skipped",
      { occurredOn: "2026-09-14" },
    ),
  );
  const current = await as(a, (tx) => readProgramBlueprint(tx, a.user.id, initial.programId));
  const revised = structuredClone(current!.blueprint);
  revised.days[0]!.exercises[0]!.sets += 1;
  const boundary = lastCoachBoundary();
  const periodStart = new Date(boundary.at.getTime() - 7 * 86_400_000).toISOString();
  const { job } = await as(a, (tx) =>
    enqueueCoachJob(tx, a.user.id, {
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: "review:test",
      intakeId: a.intake.id,
      target: {
        programId: initial.programId,
        reviewStart: periodStart,
        reviewEnd: boundary.at.toISOString(),
        batchDate: boundary.date,
      },
    }),
  );
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const output = {
    outcome: "program",
    blueprint: revised,
    openingPlan: null,
    rationale: "One additional set based on completed evidence.",
    evidence: [],
    uncertainties: [],
  };
  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, output)),
  ).toMatchObject({ accepted: true });
  const schedule = await as(a, (tx) => getSchedule(tx, a.user.id));
  expect(schedule?.program.id).not.toBe(initial.programId);
  expect(schedule?.state.events.length).toBeGreaterThan(0);
  const reviews = await as(a, (tx) => tx.select().from(coachWeeklyReviews));
  expect(reviews).toHaveLength(1);
  expect(reviews[0]?.outcome).toBe("automatic");
  expect(
    (await as(a, (tx) => tx.select().from(coachJobs))).some(
      (j) => j.kind === "prepare_session" && j.target.programId === schedule?.program.id,
    ),
  ).toBe(true);
  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, output)),
  ).toMatchObject({ duplicate: true });
});
it("requires review for structural changes and leaves the active programme intact", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  const active = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  const current = await as(a, (tx) => readProgramBlueprint(tx, a.user.id, active.programId));
  const revised = structuredClone(current!.blueprint);
  revised.days[0]!.dayOfWeek = (revised.days[0]!.dayOfWeek % 7) + 1;
  const boundary = lastCoachBoundary();
  const { job } = await as(a, (tx) =>
    enqueueCoachJob(tx, a.user.id, {
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: "structural:test",
      intakeId: a.intake.id,
      target: {
        programId: active.programId,
        reviewStart: new Date(boundary.at.getTime() - 604800000).toISOString(),
        reviewEnd: boundary.at.toISOString(),
        batchDate: boundary.date,
      },
    }),
  );
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
      outcome: "program",
      blueprint: revised,
      openingPlan: null,
      rationale: "Proposed schedule change for your review.",
    }),
  );
  expect((await as(a, (tx) => getSchedule(tx, a.user.id)))?.program.id).toBe(active.programId);
  expect((await as(a, (tx) => tx.select().from(coachWeeklyReviews)))[0]?.outcome).toBe("proposal");
});
it("treats a same-gym request as a no-op and supersedes an older changed-gym request", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  expect(await as(a, (tx) => requestGymChange(tx, a.user.id, a.gym.id))).toEqual({
    job: null,
    created: false,
  });
  const [other] = await as(a, (tx) =>
    tx.insert(gyms).values({ userId: a.user.id, name: "Other gym", slug: "other" }).returning(),
  );
  const first = await as(a, (tx) => requestGymChange(tx, a.user.id, other!.id));
  const claimed = await as(a, (tx) => claimCoachJob(tx, a.user.id, first.job!.id));
  expect(claimed).toBeTruthy();
  const second = await as(a, (tx) => requestGymChange(tx, a.user.id, a.gym.id));
  expect(second.job!.target.intentId).not.toBe(first.job!.target.intentId);
  expect(
    (await as(a, (tx) => tx.select().from(coachJobs).where(eq(coachJobs.id, first.job!.id))))[0]
      ?.status,
  ).toBe("superseded");
});
it("keeps saved-routine targets frozen and never copies completed set logs", async () => {
  const a = await athlete();
  await as(a, (tx) => setTrainingMode(tx, a.user.id, "manual"));
  const routine = await as(a, (tx) => saveRoutine(tx, a.user.id, "My routine", blueprint.days[0]));
  const session = await as(a, (tx) => startSavedRoutine(tx, a.user.id, routine.id, a.gym.id));
  const detail = await as(a, (tx) => getSessionDetail(tx, a.user.id, session.sessionId));
  expect(detail?.exercises[0]?.planned?.programExerciseId).toBeNull();
  expect(detail?.exercises[0]?.planned?.sets).toBe(blueprint.days[0]!.exercises[0]!.sets);
  expect(detail?.exercises[0]?.sets).toEqual([]);
  await as(a, (tx) =>
    finishSession(tx, a.user.id, session.sessionId, { notes: null, bodyWeightKg: null }),
  );
  const repeat = await as(a, (tx) =>
    routineFromWorkout(tx, a.user.id, session.sessionId, "Repeat"),
  );
  const next = await as(a, (tx) => startSavedRoutine(tx, a.user.id, repeat.id, a.gym.id));
  expect(next.sessionId).not.toBe(session.sessionId);
  expect(await as(a, (tx) => tx.select().from(setLogs))).toEqual([]);
  expect(
    await as(a, (tx) => tx.select().from(programs).where(eq(programs.status, "active"))),
  ).toEqual([]);
});
it("cascades new coaching data when Auth is deleted and allows a fresh identity for the email", async () => {
  const a = await athlete();
  await generated(a);
  await as(a, (tx) =>
    saveCoachAttachment(tx, a.user.id, "brief.txt", "text/plain", Buffer.from("Private brief")),
  );
  await t.client.query("delete from auth.users where id=$1", [a.user.id]);
  expect(await t.db.select().from(coachJobs).where(eq(coachJobs.userId, a.user.id))).toEqual([]);
  expect(
    await t.db.select().from(programDrafts).where(eq(programDrafts.userId, a.user.id)),
  ).toEqual([]);
  expect(await listCoachAttachments(t.db, a.user.id)).toEqual([]);
  expect(
    await t.db.select().from(coachJobAttempts).where(eq(coachJobAttempts.userId, a.user.id)),
  ).toEqual([]);
  const fresh = await t.createAuthUser(a.user.email);
  expect(fresh.id).not.toBe(a.user.id);
  expect(await withUser(t.db, fresh.id, (tx) => latestIntake(tx, fresh.id))).toBeNull();
});
it("waits seven full days before the first selected rest-day review", () => {
  const enabled = new Date("2026-09-12T12:00:00Z");
  const period = firstWeeklyReviewPeriod(enabled, 6);
  expect(new Date(period.end).getTime() - enabled.getTime()).toBeGreaterThanOrEqual(604800000);
  expect(period.reviewDate).toBe("2026-09-26");
});

it("enforces bearer authentication, rollout, live attempts and account isolation through HTTP", async () => {
  vi.stubEnv("COACH_SERVICE_TOKEN", "synthetic-workflow-token");
  vi.stubEnv("COACH_WORKFLOW_ENABLED", "true");
  const a = await athlete(),
    b = await athlete();
  const { job } = await request(a);
  const call = (
    path: string[],
    method = "GET",
    body?: unknown,
    attempt?: string,
    token = "synthetic-workflow-token",
  ) =>
    handleCoachServiceRequest(
      t.db,
      new Request(
        `https://app.test/api/coach/service/${path.join("/")}${attempt ? `?attemptId=${attempt}` : ""}`,
        {
          method,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      ),
      path,
    );
  try {
    expect((await call(["workflow", "queue"], "GET", undefined, undefined, "wrong")).status).toBe(
      401,
    );
    expect((await call(["due"])).status).toBe(409);
    const contract = await call(["workflow", "contract"]);
    expect(contract.status).toBe(200);
    expect((await contract.json()).result.oneOf).toBeDefined();
    const root = ["workflow", "users", a.user.id, "jobs", job.id];
    const claimed = await call([...root, "claim"], "POST");
    const { job: claim } = await claimed.json();
    expect(claim.attemptId).toBeTruthy();
    const context = await call([...root, "context"], "GET", undefined, claim.attemptId);
    expect(context.status).toBe(200);
    expect((await context.json()).confirmedIntake.id).toBe(a.intake.id);
    const inaccessible = await call(
      ["workflow", "users", b.user.id, "jobs", job.id, "context"],
      "GET",
      undefined,
      claim.attemptId,
    );
    expect(inaccessible.status).toBe(409);
    const malformed = await call(
      [...root, "result"],
      "POST",
      { outcome: "session", plan: {} },
      claim.attemptId,
    );
    expect(malformed.status).toBe(422);
    const accepted = await call([...root, "result"], "POST", result(a), claim.attemptId);
    expect((await accepted.json()).accepted).toBe(true);
    expect(
      (await call([...root, "fail"], "POST", { error: "Late failure" }, claim.attemptId)).status,
    ).toBe(409);
    vi.stubEnv("COACH_WORKFLOW_ENABLED", "false");
    expect((await call(["workflow", "queue"])).status).toBe(503);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("rejects a generated frequency that contradicts the confirmed intake", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const output = result(a);
  output.blueprint = {
    ...output.blueprint,
    days: [...output.blueprint.days, { ...output.blueprint.days[0]!, dayIndex: 2, dayOfWeek: 5 }],
  };
  await expect(
    as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, output)),
  ).rejects.toThrow(/frequency/);
  expect(await as(a, (tx) => tx.select().from(programDrafts))).toEqual([]);
});

it("keeps manual RIR unknown, checks fresh evidence, copies future versions and archives safely", async () => {
  const a = await athlete();
  await as(a, (tx) => setTrainingMode(tx, a.user.id, "manual"));
  const manual = structuredClone(blueprint);
  manual.days[0]!.exercises[0]!.rir = null;
  const draft = await as(a, (tx) => saveManualDraft(tx, a.user.id, manual));
  const ready = await as(a, (tx) => refreshProgramDraft(tx, a.user.id, draft.id, draft.revision));
  await as(a, (tx) =>
    tx.update(profiles).set({ displayName: "Updated name" }).where(eq(profiles.id, a.user.id)),
  );
  await expect(
    as(a, (tx) =>
      activateProgramDraft(tx, a.user.id, ready.id, {
        expectedRevision: ready.revision,
        startDate: "2026-09-14",
        transition: "new_block",
      }),
    ),
  ).rejects.toThrow(/data changed/);
  const checked = await as(a, (tx) => refreshProgramDraft(tx, a.user.id, ready.id, ready.revision));
  const active = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, checked.id, {
      expectedRevision: checked.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  expect(
    (await as(a, (tx) => readProgramBlueprint(tx, a.user.id, active.programId)))?.blueprint.days[0]
      ?.exercises[0]?.rir,
  ).toBeNull();
  const copy = await as(a, (tx) => copyProgramToDraft(tx, a.user.id, active.programId, true));
  expect(copy.blueprint.slug).not.toBe(manual.slug);
  expect(copy.blueprint.days[0]?.exercises[0]?.lineageId).toBeUndefined();
  const session = await as(a, (tx) => startAdHocSession(tx, a.user.id, { gymId: a.gym.id }));
  await expect(
    as(a, (tx) => archiveActiveProgram(tx, a.user.id, active.programId)),
  ).rejects.toThrow(/workout/);
  await as(a, (tx) =>
    finishSession(tx, a.user.id, session.sessionId, { notes: null, bodyWeightKg: null }),
  );
  await as(a, (tx) => archiveActiveProgram(tx, a.user.id, active.programId));
  expect(await as(a, (tx) => getSchedule(tx, a.user.id))).toBeNull();
  expect(await as(a, (tx) => readProgramBlueprint(tx, a.user.id, active.programId))).not.toBeNull();
});

it("keeps custom exercise muscle coverage unknown and isolates the library", async () => {
  const a = await athlete(),
    b = await athlete();
  const custom = await as(a, (tx) =>
    createCustomExercise(tx, a.user.id, {
      name: "My movement",
      category: "strength",
      modality: "bodyweight",
      measurement: "reps",
      primaryMuscles: [],
      equipmentInstanceId: null,
    }),
  );
  expect(custom.primaryMuscles).toEqual([]);
  const day = structuredClone(blueprint.days[0]!);
  day.exercises[0]!.exerciseSlug = custom.slug;
  await expect(as(b, (tx) => saveRoutine(tx, b.user.id, "Foreign routine", day))).rejects.toThrow(
    /exercise|library/i,
  );
  expect(
    (await as(a, (tx) => saveRoutine(tx, a.user.id, "Own routine", day))).day.exercises[0]
      ?.exerciseSlug,
  ).toBe(custom.slug);
});

it("shows the newest gym request and its selected Start location on Today", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  const active = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  const [other] = await as(a, (tx) =>
    tx.insert(gyms).values({ userId: a.user.id, name: "Second gym", slug: "second" }).returning(),
  );
  const change = await as(a, (tx) =>
    requestGymChange(tx, a.user.id, other!.id, "Travelling today"),
  );
  expect(change.job!.target.reason).toBe("Travelling today");
  const today = await as(a, (tx) =>
    todayWorkflowState(tx, a.user.id, {
      enabled: true,
      timeZone: "Asia/Kolkata",
      programId: active.programId,
      ref: { cycleIndex: 1, dayIndex: 1 },
      gymId: a.gym.id,
    }),
  );
  expect(today).toMatchObject({
    workflow: true,
    selectedGymId: other!.id,
    requestsLeft: 1,
    pending: { gymId: other!.id },
  });
});

it("drains more than 500 eligible athletes without a page ceiling or invented jobs", async () => {
  const ids: string[] = [];
  for (let index = 0; index < 502; index++) {
    const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
    ids.push(user.id);
    await withUser(t.db, user.id, async (tx) => {
      await tx.update(profiles).set({ aiCoachEnabled: true }).where(eq(profiles.id, user.id));
      await tx.insert(coachPreferences).values({ userId: user.id, mode: "coach" });
    });
  }
  let cursor: string | null = null,
    pages = 0;
  do {
    const page = await dispatchCoachPage(t.db, cursor);
    expect(page.errors).toEqual([]);
    if (page.nextCursor) expect(page.nextCursor).not.toBe(cursor);
    cursor = page.nextCursor;
    pages++;
    expect(pages).toBeLessThan(20);
  } while (cursor);
  expect(pages).toBeGreaterThan(10);
  // Athletes without an active programme are covered by dispatch without invented work.
  for (const id of ids)
    expect(await withUser(t.db, id, (tx) => tx.select().from(coachJobs))).toEqual([]);
});

it("shares three explicit requests across creation and gym changes, and resets by local day", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  const [other] = await as(a, (tx) =>
    tx.insert(gyms).values({ userId: a.user.id, name: "Other gym", slug: "other" }).returning(),
  );
  await as(a, (tx) => requestGymChange(tx, a.user.id, other!.id));
  await as(a, (tx) => requestGymChange(tx, a.user.id, a.gym.id));
  expect(await as(a, (tx) => requestGymChange(tx, a.user.id, a.gym.id))).toEqual({
    job: null,
    created: false,
  });
  await expect(request(a)).rejects.toThrow(/share three/);
  await expect(as(a, (tx) => requestGymChange(tx, a.user.id, other!.id))).rejects.toThrow(
    /share three/,
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.now() + 86_400_000));
  try {
    expect((await as(a, (tx) => requestGymChange(tx, a.user.id, other!.id))).created).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("claims the weekly review before a pending preparation job", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  const active = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  const prep = await as(a, (tx) => enqueueDailySession(tx, a.user.id, lastCoachBoundary().date));
  const review = await as(a, (tx) =>
    enqueueCoachJob(tx, a.user.id, {
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: "review:priority",
      intakeId: a.intake.id,
      target: { programId: active.programId },
    }),
  );
  expect(await as(a, (tx) => claimCoachJob(tx, a.user.id, prep!.job.id))).toBeNull();
  expect((await queuedCoachJobs(t.db)).filter((job) => job.userId === a.user.id)).toEqual([
    { id: review.job.id, userId: a.user.id, kind: "review_program" },
  ]);
  expect((await as(a, (tx) => claimCoachJob(tx, a.user.id, review.job.id)))?.id).toBe(
    review.job.id,
  );
});

it("pauses generation independently and routes automatic revisions to review during rollout", async () => {
  const a = await athlete();
  const { draft } = await generated(a);
  const active = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  vi.stubEnv("COACH_GENERATION_ENABLED", "false");
  vi.stubEnv("COACH_AUTOMATIC_REVIEWS_ENABLED", "false");
  try {
    await expect(request(a)).rejects.toThrow(/temporarily paused/);
    const current = await as(a, (tx) => readProgramBlueprint(tx, a.user.id, active.programId));
    const revised = structuredClone(current!.blueprint);
    revised.days[0]!.exercises[0]!.sets += 1;
    const boundary = lastCoachBoundary();
    const { job } = await as(a, (tx) =>
      enqueueCoachJob(tx, a.user.id, {
        kind: "review_program",
        trigger: "weekly",
        dedupeKey: "review:rollout",
        intakeId: a.intake.id,
        target: {
          programId: active.programId,
          reviewStart: new Date(boundary.at.getTime() - 604800000).toISOString(),
          reviewEnd: boundary.at.toISOString(),
          batchDate: boundary.date,
        },
      }),
    );
    const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
    const accepted = await as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
        outcome: "program",
        blueprint: revised,
        openingPlan: null,
        rationale: "Add one set to future training.",
        evidence: [],
        uncertainties: [],
      }),
    );
    expect(accepted.accepted).toBe(true);
    expect((await as(a, (tx) => getSchedule(tx, a.user.id)))?.program.id).toBe(active.programId);
    expect((await as(a, (tx) => tx.select().from(coachWeeklyReviews)))[0]?.outcome).toBe(
      "proposal",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
