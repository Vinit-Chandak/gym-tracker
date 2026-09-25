import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  coachChangeRecords,
  coachJobs,
  coachJobAttempts,
  coachPreferences,
  coachWeeklyReviews,
  equipmentInstances,
  equipmentTypes,
  gyms,
  profiles,
  programDrafts,
  programs,
  sessionPlans,
  setLogs,
  exercises,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { logTestRun } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { coachIntakeSchema, MAX_COACH_FILE_BYTES } from "@/domain/coaching-workflow";
import { lastCoachBoundary } from "@/domain/coach-cadence";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import {
  answerCoachQuestions,
  confirmIntake,
  latestIntake,
  saveIntake,
  setTrainingMode,
} from "./coach-intakes";
import {
  acceptCoachJobResult,
  claimCoachJob,
  enqueueCoachJob,
  getCoachJob,
  requestGymChange,
  requestProgramCreation,
  dispatchCoachPage,
  enqueueDailySession,
  queuedCoachJobs,
  reconcileCoachJobs,
  requeueCoachJob,
} from "./coaching-jobs";
import { coachJobContext } from "./coaching-context";
import { assertLiveAttempt, lookupExercises } from "./coach-lookups";
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
import {
  finishSession,
  getSessionDetail,
  startAdHocSession,
  startPlannedSession,
} from "./sessions";
import { planningContext, planningGym } from "./coach-plans";
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
async function athlete(kind: "gym" | "home" = "gym") {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  return withUser(t.db, user.id, async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: user.id, name: "My gym", slug: "my-gym", kind, isDefault: true })
      .returning();
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        goal: "Become stronger with one training day",
        sessionsPerWeek: 1,
        minutesPerSession: 45,
        trainingLocation: kind,
        heightCm: 178,
        weightKg: 74.5,
        ageYears: 31,
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
  headline: "A six-day block built around your confirmed training time.",
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
  expect(a.intake.answers.runsPerWeek).toBeNull();
  expect(a.intake.answers.recentTraining).toBe("");
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
  await as(a, (tx) =>
    tx
      .update(profiles)
      .set({ bodyWeightKg: 82, heightCm: 181, dateOfBirth: "1995-01-01" })
      .where(eq(profiles.id, a.user.id)),
  );
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
  expect(ctx.athlete).toMatchObject({ bodyWeightKg: 82, heightCm: 181, age: expect.any(Number) });
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
it("keeps a newly generated draft usable when its result also updates the concise memo", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
      ...result(a),
      memory: {
        expectedRevision: 0,
        upsert: [
          {
            id: crypto.randomUUID(),
            category: "experiment",
            status: "hypothesis",
            text: "Reassess the starting exercise range after two logged sessions.",
            sourceIds: [`intake:${a.intake.id}`],
            reviewAfter: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
          },
        ],
      },
    }),
  );
  const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
  await expect(
    as(a, (tx) =>
      activateProgramDraft(tx, a.user.id, draft!.id, {
        expectedRevision: draft!.revision,
        startDate: "2026-09-14",
        transition: "new_block",
      }),
    ),
  ).resolves.toMatchObject({ alreadyActivated: false });
});
it.each(["bodyweight-squat", "goblet-squat"])(
  "creates, prepares and starts %s sessions at home with real slot identities",
  async (exerciseSlug) => {
    const a = await athlete("home");
    let equipmentInstanceId: string | null = null;
    if (exerciseSlug === "goblet-squat") {
      const [type] = await t.db
        .select()
        .from(equipmentTypes)
        .where(eq(equipmentTypes.slug, "dumbbells"));
      const [equipment] = await as(a, (tx) =>
        tx
          .insert(equipmentInstances)
          .values({
            userId: a.user.id,
            gymId: a.gym.id,
            equipmentTypeId: type!.id,
            name: "Home dumbbells",
            resistanceMode: "free_weight",
            unit: "kg",
            loadIncrement: 2,
          })
          .returning(),
      );
      equipmentInstanceId = equipment!.id;
    }
    const homeBlueprint = structuredClone(blueprint);
    homeBlueprint.days[0]!.exercises[0]!.exerciseSlug = exerciseSlug;
    homeBlueprint.days[0]!.exercises[0]!.fallbacks = [];
    const opening = result(a).openingPlan;
    const { job } = await request(a);
    const creation = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
    const accepted = await as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, creation!.attemptId!, {
        ...result(a),
        blueprint: homeBlueprint,
        openingPlan: {
          ...opening,
          exercises: [{ ...opening.exercises[0]!, exerciseSlug, equipmentInstanceId }],
        },
      }),
    );
    const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
    await as(a, (tx) =>
      activateProgramDraft(tx, a.user.id, draft!.id, {
        expectedRevision: draft!.revision,
        startDate: "2026-09-14",
        transition: "new_block",
      }),
    );
    const schedule = await as(a, (tx) => getSchedule(tx, a.user.id));
    const first = await as(a, (tx) =>
      startPlannedSession(tx, a.user.id, {
        gymId: a.gym.id,
        programDayId: schedule!.days[0]!.id,
        cycleIndex: 1,
      }),
    );
    await as(a, (tx) =>
      finishSession(tx, a.user.id, first.sessionId, { notes: null, bodyWeightKg: null }),
    );
    await as(a, (tx) =>
      recordSlotEvent(
        tx,
        a.user.id,
        schedule!.program.id,
        { cycleIndex: 1, dayIndex: 1 },
        "session",
        "completed",
        {
          occurredOn: "2026-09-14",
          workoutSessionId: first.sessionId,
        },
      ),
    );
    const prep = await as(a, (tx) => enqueueDailySession(tx, a.user.id, lastCoachBoundary().date));
    expect(prep!.job.target).toMatchObject({ gymId: a.gym.id, cycleIndex: 2, dayIndex: 1 });
    const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, prep!.job.id));
    const ctx = await as(a, (tx) =>
      coachJobContext(tx, a.user.id, prep!.job.id, claim!.attemptId!),
    );
    const next = ctx.nextSession;
    expect(next?.reason).toBeNull();
    if (!next || next.reason !== null) throw new Error("Missing home planning context");
    expect(next.gym).toMatchObject({ id: a.gym.id, kind: "home" });
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0]!.slotId).toBeTruthy();
    expect(next.exercises[0]!.atThisGym.status).toBe("direct");
    expect(next.exercises[0]!.atThisGym.machine?.id ?? null).toBe(equipmentInstanceId);
    // The library and the machines are looked up by the live attempt, not sent (ADR 0029).
    expect("catalogue" in ctx || "equipment" in ctx).toBe(false);
    expect("library" in next || "machines" in next.gym).toBe(false);
    expect(ctx.lookups.defaultGymId).toBe(a.gym.id);
    const found = await as(a, async (tx) => {
      await assertLiveAttempt(tx, a.user.id, prep!.job.id, claim!.attemptId!);
      return lookupExercises(tx, a.user.id, {
        q: "high bar squats",
        gymId: a.gym.id,
        limit: 5,
        offset: 0,
      });
    });
    expect(found.items[0]).toMatchObject({ slug: "high-bar-squat", available: false });
    await expect(
      as(a, (tx) => assertLiveAttempt(tx, a.user.id, prep!.job.id, crypto.randomUUID())),
    ).rejects.toThrow(/current claimed attempt/);
    const plan = {
      summary: "Continue the home programme.",
      exercises: [
        {
          ...opening.exercises[0]!,
          exerciseSlug,
          equipmentInstanceId,
          sets: Array.from(
            { length: next.exercises[0]!.prescription!.sets },
            () => opening.exercises[0]!.sets[0]!,
          ),
        },
      ],
    };
    await expect(
      as(a, (tx) =>
        acceptCoachJobResult(tx, a.user.id, prep!.job.id, claim!.attemptId!, {
          outcome: "session",
          rationale: "Use the available home equipment.",
          plan,
        }),
      ),
    ).rejects.toThrow(/plan is not valid|pending.*slot|every.*slot|program proposal/i);
    expect(
      await as(a, (tx) =>
        acceptCoachJobResult(tx, a.user.id, prep!.job.id, claim!.attemptId!, {
          outcome: "session",
          rationale: "Use the available home equipment.",
          plan: {
            ...plan,
            exercises: [{ ...plan.exercises[0]!, slotId: next.exercises[0]!.slotId }],
          },
        }),
      ),
    ).toMatchObject({ accepted: true });
    const second = await as(a, (tx) =>
      startPlannedSession(tx, a.user.id, {
        gymId: a.gym.id,
        programDayId: schedule!.days[0]!.id,
        cycleIndex: 2,
      }),
    );
    const detail = await as(a, (tx) => getSessionDetail(tx, a.user.id, second.sessionId));
    expect(detail?.coachPlan?.summary).toBeNull();
    expect(detail?.exercises[0]?.suggestion?.kind).toBe("coach");
  },
);

it("honors a default home alongside gyms and exposes unavailable slots for substitution", async () => {
  const a = await athlete("home");
  await as(a, (tx) =>
    tx.insert(gyms).values({ userId: a.user.id, name: "Another gym", slug: "another-gym" }),
  );
  expect((await as(a, (tx) => planningGym(tx, a.user.id)))?.id).toBe(a.gym.id);
  const manual = await as(a, (tx) => saveManualDraft(tx, a.user.id, blueprint));
  const ready = await as(a, (tx) => refreshProgramDraft(tx, a.user.id, manual.id, manual.revision));
  await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, ready.id, {
      expectedRevision: ready.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  const ctx = await as(a, (tx) => planningContext(tx, a.user.id));
  expect(ctx.reason).toBeNull();
  if (ctx.reason !== null) throw new Error("Missing home planning context");
  expect(ctx.gym.id).toBe(a.gym.id);
  expect(ctx.exercises[0]!.slotId).toBeTruthy();
  expect(ctx.exercises[0]!.atThisGym.status).toBe("unavailable");
  await as(a, (tx) => tx.update(gyms).set({ isActive: false }).where(eq(gyms.id, a.gym.id)));
  expect(await as(a, (tx) => planningContext(tx, a.user.id, { gymId: a.gym.id }))).toEqual({
    reason: "no_gym",
  });
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
it("takes a CSV export up to five megabytes, and refuses bytes that are not what they claim", async () => {
  const a = await athlete();
  const csv = Buffer.from("Date,Exercise,Weight,Reps\n2026-06-13,Bench Press,70,5\n");
  const file = await as(a, (tx) =>
    saveCoachAttachment(tx, a.user.id, "fitnotes-export.csv", "text/csv", csv),
  );
  expect(file).toMatchObject({ name: "fitnotes-export.csv", mimeType: "text/csv" });

  await expect(
    as(a, (tx) =>
      saveCoachAttachment(tx, a.user.id, "sneaky.csv", "text/csv", Buffer.from([0x00, 0x01, 0x02])),
    ),
  ).rejects.toThrow(/correct file type/);
  await expect(
    as(a, (tx) =>
      saveCoachAttachment(
        tx,
        a.user.id,
        "huge.csv",
        "text/csv",
        Buffer.alloc(MAX_COACH_FILE_BYTES + 1, 0x61),
      ),
    ),
  ).rejects.toThrow(/5 MB/);
});
it("routes an unsupported weekly increase to review, preserves position and queues preparation", async () => {
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
    headline: "One more set on the press.",
    blueprint: revised,
    openingPlan: null,
    rationale: "One additional set based on completed evidence.",
    evidence: [],
    uncertainties: [],
    coverage: [
      { sport: "strength", decision: "changed", reason: "One set added on completed evidence." },
    ],
  };
  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, output)),
  ).toMatchObject({ accepted: true });
  const schedule = await as(a, (tx) => getSchedule(tx, a.user.id));
  expect(schedule?.program.id).toBe(initial.programId);
  expect(schedule?.state.events.length).toBeGreaterThan(0);
  const reviews = await as(a, (tx) => tx.select().from(coachWeeklyReviews));
  expect(reviews).toHaveLength(1);
  expect(reviews[0]?.outcome).toBe("proposal");
  expect(
    (await as(a, (tx) => tx.select().from(coachJobs))).some(
      (j) => j.kind === "prepare_session" && j.target.programId === schedule?.program.id,
    ),
  ).toBe(true);
  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, output)),
  ).toMatchObject({ duplicate: true });
  const proposed = await as(a, (tx) => getProgramDraft(tx, a.user.id, reviews[0]!.draftId!));
  const activated = await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, proposed!.id, {
      expectedRevision: proposed!.revision,
      startDate: "2026-09-14",
      transition: "continue",
    }),
  );
  const continued = await as(a, (tx) => getSchedule(tx, a.user.id));
  expect(continued?.program.id).toBe(activated.programId);
  expect(continued?.state.events.length).toBe(schedule?.state.events.length);
  expect((await as(a, (tx) => tx.select().from(coachChangeRecords))).length).toBe(1);
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
      headline: "Moves your press day to Wednesday.",
      blueprint: revised,
      openingPlan: null,
      rationale: "Proposed schedule change for your review.",
      coverage: [
        { sport: "strength", decision: "changed", reason: "Proposed a new split for review." },
      ],
    }),
  );
  expect((await as(a, (tx) => getSchedule(tx, a.user.id)))?.program.id).toBe(active.programId);
  expect((await as(a, (tx) => tx.select().from(coachWeeklyReviews)))[0]?.outcome).toBe("proposal");
});
it("prepares the gym already chosen, and supersedes an older changed-gym request", async () => {
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
  const first = await as(a, (tx) => requestGymChange(tx, a.user.id, other!.id));
  const claimed = await as(a, (tx) => claimCoachJob(tx, a.user.id, first.job!.id));
  expect(claimed).toBeTruthy();
  // Asking for the gym already chosen is a re-plan, not a no-op: the machines, the history
  // and the notes it reads can all have moved since the last run.
  const second = await as(a, (tx) => requestGymChange(tx, a.user.id, a.gym.id));
  expect(second.created).toBe(true);
  expect(second.job.target.gymId).toBe(a.gym.id);
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
it("answers gym-or-home with a location, and reviews on a day the athlete does not train", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const confirmed = await withUser(t.db, user.id, async (tx) => {
    // No location of any kind yet: the athlete says "home" and never sees a list.
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        goal: "Get going at home",
        sessionsPerWeek: 3,
        minutesPerSession: 40,
        preferredDays: [1, 3, 5],
        preferredRunDays: [7],
        runsPerWeek: 1,
        trainingLocation: "home",
        heightCm: 170,
        weightKg: 62,
        ageYears: 28,
      }),
      null,
    );
    expect(intake.answers.gymId).toBeNull();
    await confirmIntake(tx, user.id, intake.id);
    return latestIntake(tx, user.id);
  });
  const [home] = await withUser(t.db, user.id, (tx) =>
    tx.select().from(gyms).where(eq(gyms.userId, user.id)),
  );
  expect(home).toMatchObject({ kind: "home", name: "Home" });
  expect(confirmed!.answers.gymId).toBe(home!.id);
  const [preference] = await withUser(t.db, user.id, (tx) =>
    tx.select().from(coachPreferences).where(eq(coachPreferences.userId, user.id)),
  );
  // Monday, Wednesday and Friday lift; Sunday runs. Saturday is the only untouched day.
  expect(preference!.reviewWeekday).toBe(6);
});

/**
 * The review waits for a day that was actually quiet.
 *
 * The programme is a sequence, not a timetable, so the weekday it nominally rests on stops
 * being the athlete's rest day the first time a session slides. What the log says happened is
 * the only thing that still knows.
 */
const DAY = 86_400_000;

/** Every page, because the test database holds every athlete these tests have made. */
async function dispatchEveryone(now: Date) {
  let after: string | null = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof dispatchCoachPage>> = await dispatchCoachPage(
      t.db,
      after,
      now,
    );
    if (!page.nextCursor) return;
    after = page.nextCursor;
  }
}

/** Noon of the last complete UTC day before a batch boundary. */
function theDayBefore(boundary: Date): Date {
  const day = new Date(boundary);
  day.setUTCDate(day.getUTCDate() - 1);
  day.setUTCHours(12, 0, 0, 0);
  return day;
}

async function reviewing() {
  const a = await athlete();
  const { draft } = await generated(a);
  await as(a, (tx) =>
    activateProgramDraft(tx, a.user.id, draft.id, {
      expectedRevision: draft.revision,
      startDate: "2026-09-14",
      transition: "new_block",
    }),
  );
  // Fixed here so "the day just finished" is the same day the test is reasoning about.
  await as(a, (tx) =>
    tx.update(profiles).set({ timeZone: "UTC" }).where(eq(profiles.id, a.user.id)),
  );
  return {
    ...a,
    anchor: (at: Date) =>
      as(a, (tx) =>
        tx
          .update(coachPreferences)
          .set({ reviewAnchorAt: at })
          .where(eq(coachPreferences.userId, a.user.id)),
      ),
    ran: (at: Date) =>
      as(a, (tx) =>
        logTestRun(tx, a.user.id, { startedAt: at, durationSeconds: 1800, distanceMeters: 5000 }),
      ),
    /** A session on this day. `work` decides whether anything was actually lifted in it. */
    trained: async (at: Date, work: "working" | "warmup") => {
      await as(a, async (tx) => {
        const [exercise] = await tx.select({ id: exercises.id }).from(exercises).limit(1);
        const [session] = await tx
          .insert(workoutSessions)
          .values({ userId: a.user.id, gymId: a.gym.id, startedAt: at, completedAt: at })
          .returning({ id: workoutSessions.id });
        const [slot] = await tx
          .insert(workoutExercises)
          .values({
            userId: a.user.id,
            workoutSessionId: session!.id,
            exerciseId: exercise!.id,
            orderIndex: 1,
          })
          .returning({ id: workoutExercises.id });
        await tx.insert(setLogs).values({
          userId: a.user.id,
          workoutExerciseId: slot!.id,
          setIndex: 1,
          setType: work,
          weight: 20,
          reps: 10,
          rir: 2,
        });
      });
    },
    requested: (at: Date) =>
      as(a, (tx) =>
        tx
          .update(coachPreferences)
          .set({ reviewRequestedAt: at })
          .where(eq(coachPreferences.userId, a.user.id)),
      ),
    reviews: async () =>
      (await as(a, (tx) => tx.select().from(coachJobs))).filter(
        (job) => job.kind === "review_program",
      ),
  };
}

it("files only the questions the coach asked, then retires the request that asked them", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const asked = "How many days a week can you actually train?";
  await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
      outcome: "needs_input",
      questions: [asked, "Does your gym have a hack squat?"],
      rationale: "The intake and the plan the athlete pasted disagree about the days.",
      evidence: [],
      uncertainties: [],
    }),
  );
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.status).toBe("needs_input");

  const answered = await as(a, (tx) =>
    answerCoachQuestions(tx, a.user.id, job.id, [
      { question: asked, answer: "Five, and Sunday is always off." },
      { question: "Does your gym have a hack squat?", answer: "" },
      { question: "Something the coach never asked", answer: "Ignore this." },
    ]),
  );
  expect(answered.answers.clarifications).toEqual([
    { question: asked, answer: "Five, and Sunday is always off." },
  ]);
  expect(answered.revision).toBe(a.intake.revision + 1);

  // Confirming the answers finishes with the request that asked, so saved work stops
  // offering a link to a question that has been answered.
  await as(a, (tx) => confirmIntake(tx, a.user.id, answered.id));
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.status).toBe("superseded");
  await expect(
    as(a, (tx) => answerCoachQuestions(tx, a.user.id, job.id, [{ question: asked, answer: "No" }])),
  ).rejects.toThrow(/not waiting on an answer/);
});

it("writes the body the athlete described to the coach onto their profile", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const saved = await withUser(t.db, user.id, async (tx) => {
    const intake = await saveIntake(
      tx,
      user.id,
      coachIntakeSchema.parse({
        goal: "Get stronger",
        sessionsPerWeek: 3,
        minutesPerSession: 45,
        trainingLocation: "home",
        heightCm: 181,
        weightKg: 77.25,
        ageYears: 29,
      }),
      null,
    );
    await confirmIntake(tx, user.id, intake.id);
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, user.id));
    return profile;
  });
  // The age is deliberately absent: a number of years is not a date of birth.
  expect(saved).toMatchObject({
    heightCm: 181,
    bodyWeightKg: 77.25,
    trainingGoal: "get_stronger",
    dateOfBirth: null,
  });
});

it("reviews on the first quiet day after a week, not on a weekday chosen in advance", async () => {
  const a = await reviewing();
  const base = lastCoachBoundary().at;

  // Six days on, nothing is owed however quiet the day before was.
  await a.anchor(new Date(base.getTime() - 6 * DAY));
  await dispatchEveryone(base);
  expect(await a.reviews()).toHaveLength(0);

  // Eight days on, but the athlete ran yesterday: the review keeps waiting.
  const second = new Date(base.getTime() + DAY);
  await a.anchor(new Date(second.getTime() - 8 * DAY));
  await a.ran(theDayBefore(second));
  await dispatchEveryone(second);
  expect(await a.reviews()).toHaveLength(0);

  // Eight days on with nothing logged yesterday, and it reads every day since the last one.
  const third = new Date(base.getTime() + 2 * DAY);
  const anchor = new Date(third.getTime() - 8 * DAY);
  await a.anchor(anchor);
  await dispatchEveryone(third);
  const reviews = await a.reviews();
  expect(reviews).toHaveLength(1);
  expect(reviews[0]?.target).toMatchObject({
    reviewStart: anchor.toISOString(),
    reviewEnd: third.toISOString(),
  });
});

it("counts a mobility day as the rest day it is, and a day with real work as training", async () => {
  const a = await reviewing();
  const base = lastCoachBoundary().at;

  // A rest-and-mobility slot is a real card and opening it writes a session row. Nothing was
  // lifted in it, so the day was quiet and the review it had been waiting for belongs on it.
  await a.anchor(new Date(base.getTime() - 8 * DAY));
  await a.trained(theDayBefore(base), "warmup");
  await dispatchEveryone(base);
  expect(await a.reviews()).toHaveLength(1);

  // One working set on the day before, and the review waits as it always did.
  const b = await reviewing();
  const next = new Date(base.getTime() + DAY);
  await b.anchor(new Date(next.getTime() - 8 * DAY));
  await b.trained(theDayBefore(next), "working");
  await dispatchEveryone(next);
  expect(await b.reviews()).toHaveLength(0);
});

it("hears a request for something only a review can grant without waiting out the week", async () => {
  const a = await reviewing();
  const base = lastCoachBoundary().at;

  // Three days in, with the athlete training daily: nothing would otherwise be owed.
  const anchor = new Date(base.getTime() - 3 * DAY);
  await a.anchor(anchor);
  await a.trained(theDayBefore(base), "working");
  await dispatchEveryone(base);
  expect(await a.reviews()).toHaveLength(0);

  await a.requested(new Date(anchor.getTime() + DAY));
  const next = new Date(base.getTime() + DAY);
  await dispatchEveryone(next);
  const reviews = await a.reviews();
  expect(reviews).toHaveLength(1);
  expect(reviews[0]?.target).toMatchObject({ reviewStart: anchor.toISOString() });
});

it("stops waiting for a quiet day once the athlete has trained for ten days straight", async () => {
  const a = await reviewing();
  const boundary = lastCoachBoundary().at;
  await a.anchor(new Date(boundary.getTime() - 10 * DAY));
  await a.ran(theDayBefore(boundary));
  await dispatchEveryone(boundary);
  expect(await a.reviews()).toHaveLength(1);
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
  // The gym already chosen spends an ask like any other: re-preparing costs the coach
  // exactly what changing gym costs it, so it is bounded by the same three.
  expect((await as(a, (tx) => requestGymChange(tx, a.user.id, a.gym.id))).created).toBe(true);
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
        headline: "One more set on future training.",
        blueprint: revised,
        openingPlan: null,
        rationale: "Add one set to future training.",
        evidence: [],
        uncertainties: [],
        coverage: [
          { sport: "strength", decision: "changed", reason: "One set added to future training." },
        ],
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

/**
 * An athlete who lifts on some days and runs on others.
 *
 * A run used to count against the sessions a week and had to fall on a lifting day, so an
 * athlete who lifts Monday and runs Wednesday could not be programmed for at all: the coach's
 * only way through was to staple the run onto the Monday it did not belong to, lengthening the
 * one day whose time the athlete had agreed. Runs are now counted and placed on their own.
 */
async function runningAthlete(answers: Record<string, unknown>) {
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
        goal: "Lift twice and keep two easy runs",
        sessionsPerWeek: 1,
        minutesPerSession: 45,
        trainingLocation: "gym",
        heightCm: 178,
        weightKg: 74.5,
        ageYears: 31,
        gymId: gym!.id,
        ...answers,
      }),
      null,
    );
    await confirmIntake(tx, user.id, intake.id);
    return { user, gym: gym!, intake };
  });
}

/** The lifting day, plus a run day of its own on Wednesday. */
function withRunDay(): ProgramBlueprint {
  return {
    ...blueprint,
    days: [
      { ...blueprint.days[0]!, dayIndex: 1, dayOfWeek: 1 },
      {
        ...blueprint.days[0]!,
        dayIndex: 2,
        dayOfWeek: 3,
        name: "Easy run",
        includesLifting: false,
        includesRun: true,
        exercises: [],
      },
    ],
    runs: Array.from({ length: blueprint.weeks }, (_, week) => ({
      weekIndex: week + 1,
      dayOfWeek: 3,
      duration: [25, 40] as [number, number],
      rpe: [3, 5] as [number, number],
      paceNote: "Easy, conversational.",
      progressionNote: "Hold the distance while it settles.",
      stopRule: "Stop if the ache worsens as the run goes on.",
    })),
  };
}

it("takes a run on a day of its own, counted against the runs the athlete confirmed", async () => {
  const a = await runningAthlete({ runsPerWeek: 1, preferredRunDays: [3] });
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
      ...result(a),
      blueprint: withRunDay(),
    }),
  );
  expect(accepted.accepted).toBe(true);
  const draft = await as(a, (tx) => getProgramDraft(tx, a.user.id, accepted.draftId!));
  expect(draft!.blueprint.days.filter((day) => day.includesRun)).toHaveLength(1);
  expect(draft!.blueprint.days.find((day) => day.includesRun)!.dayOfWeek).toBe(3);
});

it("refuses runs on a weekday the athlete did not name", async () => {
  const a = await runningAthlete({ runsPerWeek: 1, preferredRunDays: [6] });
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
        ...result(a),
        blueprint: withRunDay(),
      }),
    ),
  ).rejects.toThrow(/running must match/i);
});

it("refuses more runs than the athlete asked for", async () => {
  const a = await runningAthlete({ runsPerWeek: 0 });
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  await expect(
    as(a, (tx) =>
      acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
        ...result(a),
        blueprint: withRunDay(),
      }),
    ),
  ).rejects.toThrow(/running must match/i);
});

it("leaves the running to the coach when the athlete did not say", async () => {
  const a = await runningAthlete({});
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  const accepted = await as(a, (tx) =>
    acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, {
      ...result(a),
      blueprint: withRunDay(),
    }),
  );
  expect(accepted.accepted).toBe(true);
});

/**
 * Drives a job to the terminal `failed` state the way the server really gets there: three
 * attempts, each abandoned by letting its lease run out.
 */
async function exhaust(a: Athlete, jobId: string) {
  let clock = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    await as(a, (tx) => claimCoachJob(tx, a.user.id, jobId, new Date(clock)));
    await as(a, (tx) =>
      tx
        .update(coachJobs)
        .set({ leaseUntil: new Date(clock - 1000) })
        .where(eq(coachJobs.id, jobId)),
    );
    // Reconciling returns it to the queue behind a one-minute backoff, so the next claim has
    // to happen past that — which is exactly what the real queue does between batches.
    await as(a, (tx) => reconcileCoachJobs(tx, a.user.id, new Date(clock)));
    clock += 65_000;
  }
  return clock;
}

/**
 * The failed row is the tombstone: it holds the dedupe key, so the work cannot be re-queued.
 * This is why a requeue has to exist at all — nothing else can reach the job again.
 */
it("cannot re-enqueue a failed job, because its dedupe key is still taken", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const key = (await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))!.dedupeKey;
  await exhaust(a, job.id);
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.status).toBe("failed");

  const again = await as(a, (tx) =>
    enqueueCoachJob(tx, a.user.id, {
      kind: "create_program",
      trigger: "onboarding",
      dedupeKey: key,
      target: { programId: null },
    }),
  );
  expect(again.created).toBe(false);
  expect(again.job.id).toBe(job.id);
});

/**
 * The trap this design exists to avoid: 0015's receipt trigger writes one row per
 * `(job_id, attempts)` under a unique index, so a requeue that rewound `attempts` would make
 * the next claim collide with a receipt already written and the job would be unclaimable for
 * good. The budget moves instead, and the counter keeps climbing.
 */
it("requeues a failed job into a claimable one, numbering its receipts onward", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const clock = await exhaust(a, job.id);
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.attempts).toBe(3);

  const requeued = await as(a, (tx) =>
    requeueCoachJob(tx, a.user.id, job.id, new Date(clock + 1000)),
  );
  expect(requeued).toMatchObject({ status: "queued", attempts: 3, attemptBudget: 6 });
  expect(requeued?.attemptId).toBeNull();
  expect(requeued?.completedAt).toBeNull();

  // The due queue offers it again: `attempts < attempt_budget` now, where it was not before.
  const due = await queuedCoachJobs(t.db, new Date(clock + 2000));
  expect(due.map((entry) => entry.id)).toContain(job.id);

  // And the claim goes through — the receipt it writes is number four, not a repeat of one.
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id, new Date(clock + 2000)));
  expect(claim?.attempts).toBe(4);
  const receipts = await as(a, (tx) =>
    tx.select().from(coachJobAttempts).where(eq(coachJobAttempts.jobId, job.id)),
  );
  expect(receipts.map((entry) => entry.number).sort()).toEqual([1, 2, 3, 4]);
});

/** A completed effect is never applied twice: `where status = 'failed'` simply misses. */
it("refuses to requeue a job that already succeeded, or one being worked on", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const claim = await as(a, (tx) => claimCoachJob(tx, a.user.id, job.id));
  // Claimed: a live attempt is not yanked out from under its worker.
  expect(await as(a, (tx) => requeueCoachJob(tx, a.user.id, job.id))).toBeNull();

  expect(
    await as(a, (tx) => acceptCoachJobResult(tx, a.user.id, job.id, claim!.attemptId!, result(a))),
  ).toMatchObject({ accepted: true });
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.status).toBe("succeeded");
  // Succeeded: the programme draft it wrote must not be written a second time.
  expect(await as(a, (tx) => requeueCoachJob(tx, a.user.id, job.id))).toBeNull();
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.status).toBe("succeeded");
});

/** Two requeues racing: the compare-and-swap means exactly one of them moves the row. */
it("requeues a failed job once, however many times it is asked", async () => {
  const a = await athlete();
  const { job } = await request(a);
  const clock = await exhaust(a, job.id);
  const first = await as(a, (tx) => requeueCoachJob(tx, a.user.id, job.id, new Date(clock)));
  const second = await as(a, (tx) => requeueCoachJob(tx, a.user.id, job.id, new Date(clock)));
  expect(first).not.toBeNull();
  expect(second).toBeNull();
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.attemptBudget).toBe(6);
});

/** Another athlete's failed job is not this athlete's to revive. */
it("will not requeue a job belonging to someone else", async () => {
  const a = await athlete();
  const b = await athlete();
  const { job } = await request(a);
  await exhaust(a, job.id);
  expect(await as(b, (tx) => requeueCoachJob(tx, b.user.id, job.id))).toBeNull();
  expect((await as(a, (tx) => getCoachJob(tx, a.user.id, job.id)))?.status).toBe("failed");
});
