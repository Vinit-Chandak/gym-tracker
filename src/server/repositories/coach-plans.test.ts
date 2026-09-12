import { and, eq, inArray, ne } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  coachRequests,
  equipmentInstances,
  equipmentTypes,
  gyms as gymsTable,
  profiles,
  sessionPlans,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { parseProgramBlueprint } from "@/domain/program-blueprint";
import { handleCoachServiceRequest } from "@/server/coach-service";

import {
  activePlanForSlot,
  CoachRequestLimitError,
  createCoachRequest,
  getCoachMemo,
  lastFailure,
  listDueUsers,
  markRequestFailed,
  pendingRequest,
  plannedRunForToday,
  PlanValidationError,
  planningContext,
  recentAttempts,
  recordAttempt,
  recordRoutineRun,
  REPLAN_DAILY_LIMIT,
  storePlan,
  todayCoachState,
  voidPlanForSlot,
} from "./coach-plans";
import { listGyms } from "./gyms";
import { createProgramFromBlueprint } from "./programs";
import { createRun } from "./runs";
import { getSchedule, recordSlotEvent } from "./schedule";
import { discardSession, finishSession, getSessionDetail, startPlannedSession } from "./sessions";

const TZ = "Asia/Kolkata";
const TOKEN = "test-service-token-0123456789";

let t: TestDatabase;
let alice: { id: string; email: string };
let bob: { id: string; email: string };
let anytimeId: string;
let samsungId: string;

type Context = Extract<Awaited<ReturnType<typeof planningContext>>, { reason: null }>;

async function context(gymId?: string): Promise<Context> {
  const result = await withUser(t.db, alice.id, (tx) => planningContext(tx, alice.id, { gymId }));
  if (result.reason) throw new Error(`no context: ${result.reason}`);
  return result;
}

function slotOf(ctx: Context, slug: string): string {
  const slot = ctx.exercises.find((e) => e.planned.slug === slug);
  if (!slot) throw new Error(`no slot for ${slug}`);
  return slot.slotId;
}

function machineOf(ctx: Context, name: string): string {
  const machine = ctx.gym.machines.find((m) => m.name === name);
  if (!machine) throw new Error(`no machine ${name}`);
  return machine.id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  alice = await t.createAuthUser("coached@example.com");
  bob = await t.createAuthUser("uncoached@example.com");
  await withUser(t.db, alice.id, (tx) => seedTestUserData(tx, alice));
  await withUser(t.db, bob.id, (tx) => seedTestUserData(tx, bob));
  await t.db
    .update(profiles)
    .set({ aiCoachEnabled: true, timeZone: TZ, displayName: "Alice" })
    .where(eq(profiles.id, alice.id));
  const gyms = await withUser(t.db, alice.id, (tx) => listGyms(tx, alice.id));
  anytimeId = gyms.find((g) => g.slug === "anytime-fitness")!.id;
  samsungId = gyms.find((g) => g.slug === "samsung-gym")!.id;
});

afterAll(async () => {
  await t.close();
});

describe("who is due", () => {
  it("lists only accounts with the coach on, with their default gym and next lifting slot", async () => {
    const due = await listDueUsers(t.db);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      userId: alice.id,
      timeZone: TZ,
      gymId: anytimeId,
      gymName: "Anytime Fitness",
      slot: { cycleIndex: 1, dayIndex: 1, dayName: "Lower A" },
    });
  });
});

describe("planning context", () => {
  it("describes the next session at the gym, with the rule's baseline and the library resolved there", async () => {
    const ctx = await context();
    expect(ctx.athlete).toMatchObject({ id: alice.id, name: "Alice", timeZone: TZ });
    expect(ctx.slot).toMatchObject({ cycleIndex: 1, dayIndex: 1, name: "Lower A" });
    expect(ctx.gym.name).toBe("Anytime Fitness");
    expect(ctx.exercises).toHaveLength(6);
    const squat = ctx.exercises[0]!;
    expect(squat.planned.slug).toBe("high-bar-squat");
    expect(squat.prescription?.reps).toEqual([4, 6]);
    expect(squat.rule?.kind).toBe("start");
    expect(squat.atThisGym.status).toBe("direct");
    const legPress = ctx.exercises.find((e) => e.planned.slug === "leg-press-45")!;
    expect(legPress.atThisGym.machine?.name).toBe("45° leg press");
    const extension = ctx.exercises.find((e) => e.planned.slug === "leg-extension")!;
    expect(extension.atThisGym.status).toBe("unknown");
    expect(
      ctx.library.find((e) => e.slug === "leg-press-horizontal")?.atThisGym?.machine?.name,
    ).toBe("Horizontal leg press");
    expect(ctx.library.find((e) => e.slug === "lying-leg-curl")?.atThisGym).toBeNull();
    expect(ctx.memo).toEqual({ overview: "", userNotes: "", overviewUpdatedAt: null });
    expect(ctx.recent.workouts).toEqual([]);
    expect(ctx.limits.summary).toBe(400);
  });

  it("plans at another gym when asked", async () => {
    const ctx = await context(samsungId);
    expect(ctx.gym.name).toBe("Samsung Gym");
    expect(ctx.gym.machines).toEqual([]);
  });
});

describe("storing a plan", () => {
  let ctx: Context;
  beforeAll(async () => {
    ctx = await context();
  });

  const store = (plan: unknown, slot = { cycleIndex: 1, dayIndex: 1 }, gymId = anytimeId) =>
    withUser(t.db, alice.id, (tx) =>
      storePlan(tx, alice.id, { slot, gymId, trigger: "nightly", plan }),
    );

  it("rejects exercises, machines and slots the athlete does not have", async () => {
    await expect(
      store({ summary: "x", exercises: [{ exerciseSlug: "no-such-move", sets: [] }] }),
    ).rejects.toMatchObject({
      issues: [{ path: "exercises.0.exerciseSlug" }],
    });

    const [type] = await t.db.select({ id: equipmentTypes.id }).from(equipmentTypes).limit(1);
    const [elsewhere] = await withUser(t.db, alice.id, (tx) =>
      tx
        .insert(equipmentInstances)
        .values({
          userId: alice.id,
          gymId: samsungId,
          equipmentTypeId: type!.id,
          name: "Samsung machine",
          resistanceMode: "selectorized",
        })
        .returning({ id: equipmentInstances.id }),
    );
    await expect(
      store({
        summary: "x",
        exercises: [
          {
            slotId: slotOf(ctx, "high-bar-squat"),
            exerciseSlug: "high-bar-squat",
            equipmentInstanceId: elsewhere!.id,
            sets: [],
          },
        ],
      }),
    ).rejects.toMatchObject({ issues: [{ path: "exercises.0.equipmentInstanceId" }] });

    const schedule = await withUser(t.db, alice.id, (tx) => getSchedule(tx, alice.id));
    const otherDay = schedule!.days.find((d) => d.name === "Upper A")!;
    const [foreignSlot] = await withUser(t.db, alice.id, (tx) =>
      tx.query.programExercises.findMany({
        where: (pe, { eq }) => eq(pe.programDayId, otherDay.id),
        limit: 1,
      }),
    );
    await expect(
      store({
        summary: "x",
        exercises: [{ slotId: foreignSlot!.id, exerciseSlug: "barbell-bench-press", sets: [] }],
      }),
    ).rejects.toMatchObject({ issues: [{ path: "exercises.0.slotId" }] });

    await expect(
      store(
        { summary: "x", exercises: [{ exerciseSlug: "high-bar-squat", sets: [] }] },
        { cycleIndex: 1, dayIndex: 7 },
      ),
    ).rejects.toThrow(PlanValidationError);
    await expect(
      store(
        { summary: "x", exercises: [{ exerciseSlug: "high-bar-squat", sets: [] }] },
        { cycleIndex: 1, dayIndex: 1 },
        samsungId,
      ),
    ).resolves.toBeTruthy();
  });

  it("stores a plan, rewrites the memo, and supersedes the previous plan for the slot", async () => {
    const first = await store(planFor(ctx, "First plan"));
    expect(first.status).toBe("active");
    expect(first.exercises[1]).toMatchObject({
      action: "substitute",
      exerciseSlug: "leg-press-horizontal",
      equipmentInstanceName: "Horizontal leg press",
    });
    expect(first.exercises[1]?.exerciseId).toBeTruthy();
    expect((await withUser(t.db, alice.id, (tx) => getCoachMemo(tx, alice.id))).overview).toBe(
      "Profile: Alice, squats twice a week.",
    );

    const second = await store(planFor(ctx, "Second plan"));
    const active = await withUser(t.db, alice.id, (tx) =>
      activePlanForSlot(tx, alice.id, first.programId, { cycleIndex: 1, dayIndex: 1 }),
    );
    expect(active?.id).toBe(second.id);
    const [old] = await withUser(t.db, alice.id, (tx) =>
      tx.select().from(sessionPlans).where(eq(sessionPlans.id, first.id)),
    );
    expect(old?.status).toBe("superseded");
  });

  it("is invisible to other accounts", async () => {
    const rows = await withUser(t.db, bob.id, (tx) => tx.select().from(sessionPlans));
    expect(rows).toEqual([]);
    const own = await withUser(t.db, alice.id, (tx) => tx.select().from(sessionPlans));
    expect(own.length).toBeGreaterThan(0);
  });
});

describe("a session that starts from a plan", () => {
  let ctx: Context;
  let lowerAId: string;
  beforeAll(async () => {
    ctx = await context();
    lowerAId = ctx.slot.programDayId;
    await withUser(t.db, alice.id, (tx) =>
      storePlan(tx, alice.id, {
        slot: { cycleIndex: 1, dayIndex: 1 },
        gymId: anytimeId,
        trigger: "replan",
        plan: planFor(ctx, "Consumed plan"),
      }),
    );
  });

  it("leaves the plan waiting when the session starts at another gym", async () => {
    const { sessionId } = await withUser(t.db, alice.id, (tx) =>
      startPlannedSession(tx, alice.id, {
        gymId: samsungId,
        programDayId: lowerAId,
        cycleIndex: 1,
      }),
    );
    const detail = await withUser(t.db, alice.id, (tx) =>
      getSessionDetail(tx, alice.id, sessionId),
    );
    expect(detail?.coachPlan).toBeNull();
    expect(detail?.exercises.every((e) => e.suggestion?.kind !== "coach")).toBe(true);
    await withUser(t.db, alice.id, (tx) => discardSession(tx, alice.id, sessionId));
    const state = await withUser(t.db, alice.id, (tx) =>
      todayCoachState(tx, alice.id, {
        enabled: true,
        timeZone: TZ,
        programId: ctx.programme.id,
        ref: { cycleIndex: 1, dayIndex: 1 },
        gymId: samsungId,
      }),
    );
    expect(state.plan?.status).toBe("active");
    expect(state.matchesGym).toBe(false);
    expect(state.plan?.gymName).toBe("Anytime Fitness");
  });

  it("applies the plan at its gym: targets, substitution, drop and addition", async () => {
    const { sessionId } = await withUser(t.db, alice.id, (tx) =>
      startPlannedSession(tx, alice.id, {
        gymId: anytimeId,
        programDayId: lowerAId,
        cycleIndex: 1,
      }),
    );
    const detail = await withUser(t.db, alice.id, (tx) =>
      getSessionDetail(tx, alice.id, sessionId),
    );
    if (!detail) throw new Error("no detail");
    expect(detail.coachPlan?.summary).toBe("Consumed plan");
    expect(detail.coachPlan?.warmup).toEqual(["Bike 4 min", "Squat ramp 40×6, 50×3"]);
    expect(detail.exercises).toHaveLength(7);

    const squat = detail.exercises[0]!;
    expect(squat.exercise.slug).toBe("high-bar-squat");
    expect(squat.suggestion?.kind).toBe("coach");
    expect(squat.suggestion?.sets.map((s) => [s.setIndex, s.weight, s.reps, s.rir])).toEqual([
      [1, 60, 5, 2],
      [2, 60, 5, 2],
      [3, 60, 5, 1],
    ]);
    expect(squat.coachNote).toBe("Add 2.5 kg after clean sets.");
    expect(squat.coachRestSeconds).toBe(200);

    const press = detail.exercises[1]!;
    expect(press.exercise.slug).toBe("leg-press-horizontal");
    expect(press.equipment?.name).toBe("Horizontal leg press");
    expect(press.substitutionReason).toMatch(/^Coach plan: /);
    expect(press.planned?.plannedExerciseName).toBe("45° leg press");

    const curl = detail.exercises[2]!;
    expect(curl.exercise.slug).toBe("seated-leg-curl");
    expect(curl.suggestion?.kind).toBe("start");

    const crunch = detail.exercises.find((e) => e.exercise.slug === "cable-crunch")!;
    expect(crunch.skippedAt).not.toBeNull();
    expect(crunch.notes).toBe("Back is sore today.");

    const added = detail.exercises[6]!;
    expect(added.exercise.slug).toBe("face-pull");
    expect(added.equipment?.name).toBe("Cable station");
    expect(added.substitutionReason).toBe("Added by the coach's plan");
    expect(added.suggestion?.kind).toBe("coach");

    const [plan] = await withUser(t.db, alice.id, (tx) =>
      tx.select().from(sessionPlans).where(eq(sessionPlans.workoutSessionId, sessionId)),
    );
    expect(plan?.status).toBe("consumed");

    const today = await withUser(t.db, alice.id, (tx) =>
      todayCoachState(tx, alice.id, {
        enabled: true,
        timeZone: TZ,
        programId: ctx.programme.id,
        ref: { cycleIndex: 1, dayIndex: 1 },
        gymId: anytimeId,
      }),
    );
    expect(today.plan?.id).toBe(plan?.id);
    expect(today.failure).toBeNull();

    // An empty session gives the plan back; the next start at the same gym uses it again.
    await withUser(t.db, alice.id, (tx) => discardSession(tx, alice.id, sessionId));
    const active = await withUser(t.db, alice.id, (tx) =>
      activePlanForSlot(tx, alice.id, ctx.programme.id, { cycleIndex: 1, dayIndex: 1 }),
    );
    expect(active?.id).toBe(plan?.id);
    expect(active?.workoutSessionId).toBeNull();
  });

  it("refuses a plan for a slot that is no longer pending", async () => {
    const { sessionId } = await withUser(t.db, alice.id, (tx) =>
      startPlannedSession(tx, alice.id, {
        gymId: anytimeId,
        programDayId: lowerAId,
        cycleIndex: 1,
      }),
    );
    await withUser(t.db, alice.id, async (tx) => {
      await finishSession(tx, alice.id, sessionId, { notes: null, bodyWeightKg: null });
      await recordSlotEvent(
        tx,
        alice.id,
        ctx.programme.id,
        { cycleIndex: 1, dayIndex: 1 },
        "session",
        "completed",
        {
          occurredOn: "2026-09-08",
          workoutSessionId: sessionId,
        },
      );
    });
    await expect(
      withUser(t.db, alice.id, (tx) =>
        storePlan(tx, alice.id, {
          slot: { cycleIndex: 1, dayIndex: 1 },
          gymId: anytimeId,
          trigger: "nightly",
          plan: { summary: "late", exercises: [{ exerciseSlug: "high-bar-squat", sets: [] }] },
        }),
      ),
    ).rejects.toThrow(/no longer pending/);
    const due = await listDueUsers(t.db);
    expect(due[0]?.slot).toMatchObject({ cycleIndex: 1, dayIndex: 2, dayName: "Upper A" });
  });
});

describe("requests", () => {
  const requestsLeft = async (programId: string) =>
    (
      await withUser(t.db, alice.id, (tx) =>
        todayCoachState(tx, alice.id, {
          enabled: true,
          timeZone: TZ,
          programId,
          ref: { cycleIndex: 1, dayIndex: 1 },
          gymId: anytimeId,
        }),
      )
    ).requestsLeft;

  it("gives back an ask whose run never started", async () => {
    const schedule = await withUser(t.db, alice.id, (tx) => getSchedule(tx, alice.id));
    const programId = schedule!.program.id;
    const before = await requestsLeft(programId);
    const asked = await withUser(t.db, alice.id, (tx) =>
      createCoachRequest(tx, alice.id, { gymId: anytimeId, reason: null, timeZone: TZ }),
    );
    expect(await requestsLeft(programId)).toBe(before - 1);
    // The routine could not be started at all — the owner's runs are gone for the day, or the
    // trigger would not take the app's token. The athlete got nothing, so they keep the ask.
    await withUser(t.db, alice.id, (tx) =>
      markRequestFailed(tx, alice.id, asked.id, "The coach has used up today's runs."),
    );
    expect(await requestsLeft(programId)).toBe(before);

    // A run that did start and then failed is a run the athlete had: that one is spent.
    const second = await withUser(t.db, alice.id, (tx) =>
      createCoachRequest(tx, alice.id, { gymId: anytimeId, reason: null, timeZone: TZ }),
    );
    await withUser(t.db, alice.id, (tx) =>
      recordRoutineRun(tx, alice.id, second.id, {
        sessionId: "session_started",
        sessionUrl: "https://claude.ai/code/session_started",
      }),
    );
    await withUser(t.db, alice.id, (tx) =>
      markRequestFailed(tx, alice.id, second.id, "The coach could not finish."),
    );
    expect(await requestsLeft(programId)).toBe(before - 1);
    // Leave the day's allowance as this test found it, for the ones that follow.
    await t.db.delete(coachRequests).where(inArray(coachRequests.id, [asked.id, second.id]));
  });

  it("never spends the day's allowance on a run the coach made itself", async () => {
    const schedule = await withUser(t.db, alice.id, (tx) => getSchedule(tx, alice.id));
    const programId = schedule!.program.id;
    const before = await requestsLeft(programId);
    // A nightly run, and a re-plan run the coach records itself. Neither is an ask the athlete
    // made, so neither may cost them one.
    for (const trigger of ["nightly", "replan"] as const) {
      await withUser(t.db, alice.id, (tx) =>
        recordAttempt(tx, alice.id, { trigger, gymId: anytimeId, status: "planned" }),
      );
    }
    expect(await requestsLeft(programId)).toBe(before);
  });

  it("allows a few a day, then stops", async () => {
    const make = () =>
      withUser(t.db, alice.id, (tx) =>
        createCoachRequest(tx, alice.id, { gymId: anytimeId, reason: "Gym changed", timeZone: TZ }),
      );
    const schedule = await withUser(t.db, alice.id, (tx) => getSchedule(tx, alice.id));
    const before = await requestsLeft(schedule!.program.id);
    const first = await make();
    expect(await requestsLeft(schedule!.program.id)).toBe(before - 1);
    for (let i = 1; i < REPLAN_DAILY_LIMIT; i++) await make();
    await expect(make()).rejects.toThrow(CoachRequestLimitError);

    await withUser(t.db, alice.id, (tx) =>
      recordRoutineRun(tx, alice.id, first.id, {
        sessionId: "session_1",
        sessionUrl: "https://claude.ai/code/session_1",
      }),
    );
    const pending = await withUser(t.db, alice.id, (tx) => pendingRequest(tx, alice.id));
    expect(pending?.status).toBe("requested");
    expect(
      await withUser(t.db, alice.id, (tx) =>
        markRequestFailed(tx, alice.id, pending!.id, "no gym"),
      ),
    ).toBe(true);
    expect(
      await withUser(t.db, alice.id, (tx) => markRequestFailed(tx, alice.id, pending!.id, "again")),
    ).toBe(false);
    const next = await withUser(t.db, alice.id, (tx) => pendingRequest(tx, alice.id));
    expect(next?.id).not.toBe(pending?.id);
    expect(next?.status).toBe("requested");
  });
});

describe("service API", () => {
  const call = (path: string, init: RequestInit & { token?: string | null } = {}) => {
    const { token = TOKEN, ...rest } = init;
    return handleCoachServiceRequest(
      t.db,
      new Request(`https://app.test/api/coach/service/${path}`, {
        ...rest,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(rest.body ? { "content-type": "application/json" } : {}),
        },
      }),
      path.split("?")[0]!.split("/"),
    );
  };

  afterEach(() => {
    process.env.COACH_SERVICE_TOKEN = TOKEN;
  });

  it("refuses without the configured token", async () => {
    delete process.env.COACH_SERVICE_TOKEN;
    expect((await call("due")).status).toBe(503);
    process.env.COACH_SERVICE_TOKEN = TOKEN;
    expect((await call("due", { token: null })).status).toBe(401);
    expect((await call("due", { token: "wrong-token-0123456789" })).status).toBe(401);
  });

  it("serves the due list, the context of coached athletes only, and stores plans", async () => {
    const due = await call("due");
    expect(due.status).toBe(200);
    const dueBody = (await due.json()) as { users: { userId: string }[] };
    expect(dueBody.users.map((u) => u.userId)).toEqual([alice.id]);

    expect((await call(`users/${bob.id}/context`)).status).toBe(403);
    expect((await call("users/not-a-uuid/context")).status).toBe(403);
    const ctxResponse = await call(`users/${alice.id}/context`);
    expect(ctxResponse.status).toBe(200);
    const ctx = (await ctxResponse.json()) as Context;
    expect(ctx.slot.name).toBe("Upper A");

    const bad = await call(`users/${alice.id}/plans`, {
      method: "POST",
      body: JSON.stringify({ summary: "x", exercises: [] }),
    });
    expect(bad.status).toBe(400);

    const rejected = await call(`users/${alice.id}/plans`, {
      method: "POST",
      body: JSON.stringify({
        slot: { cycleIndex: 1, dayIndex: 2 },
        gymId: anytimeId,
        summary: "x",
        exercises: [{ exerciseSlug: "not-real", sets: [] }],
      }),
    });
    expect(rejected.status).toBe(422);
    expect(((await rejected.json()) as { issues: { path: string }[] }).issues[0]?.path).toBe(
      "exercises.0.exerciseSlug",
    );

    const request = await withUser(t.db, alice.id, async (tx) => {
      // Limit was hit above; make room for one more today.
      await tx.delete((await import("@/db/schema")).coachRequests);
      return createCoachRequest(tx, alice.id, { gymId: anytimeId, reason: null, timeZone: TZ });
    });
    const stored = await call(`users/${alice.id}/plans`, {
      method: "POST",
      body: JSON.stringify({
        slot: { cycleIndex: 1, dayIndex: 2 },
        gymId: anytimeId,
        trigger: "replan",
        requestId: request.id,
        summary: "Bench day.",
        exercises: [
          {
            slotId: slotOf(ctx, "barbell-bench-press"),
            exerciseSlug: "barbell-bench-press",
            sets: [{ weight: 60, reps: 5, rir: 2 }],
          },
        ],
      }),
    });
    expect(stored.status).toBe(201);
    const pending = await withUser(t.db, alice.id, (tx) => pendingRequest(tx, alice.id));
    expect(pending).toBeNull();

    const fresh = await withUser(t.db, alice.id, (tx) =>
      createCoachRequest(tx, alice.id, { gymId: anytimeId, reason: null, timeZone: TZ }),
    );
    const failed = await call(`users/${alice.id}/requests/${fresh.id}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: "The gym has no machines registered." }),
    });
    expect(failed.status).toBe(200);
    expect(
      (
        await call(`users/${alice.id}/requests/${fresh.id}/fail`, {
          method: "POST",
          body: JSON.stringify({ error: "again" }),
        })
      ).status,
    ).toBe(404);
    expect((await call("nothing/here")).status).toBe(404);
  });
});

/** A plan for Lower A at Anytime Fitness that exercises every action the app supports. */
function planFor(ctx: Context, summary: string) {
  return {
    summary,
    warmup: ["Bike 4 min", "Squat ramp 40×6, 50×3"],
    exercises: [
      {
        slotId: slotOf(ctx, "high-bar-squat"),
        action: "keep",
        exerciseSlug: "high-bar-squat",
        note: "Add 2.5 kg after clean sets.",
        sets: [
          { weight: 60, reps: 5, rir: 2 },
          { weight: 60, reps: 5, rir: 2 },
          { weight: 60, reps: 5, rir: 1 },
        ],
        restSeconds: 200,
      },
      {
        slotId: slotOf(ctx, "leg-press-45"),
        action: "substitute",
        exerciseSlug: "leg-press-horizontal",
        equipmentInstanceId: machineOf(ctx, "Horizontal leg press"),
        note: "Horizontal press today.",
        sets: [{ weight: 100, reps: 10, rir: 2 }],
      },
      {
        slotId: slotOf(ctx, "seated-leg-curl"),
        action: "keep",
        exerciseSlug: "seated-leg-curl",
        sets: [],
      },
      {
        slotId: slotOf(ctx, "leg-extension"),
        action: "keep",
        exerciseSlug: "leg-extension",
        sets: [],
      },
      {
        slotId: slotOf(ctx, "smith-machine-calf-raise"),
        action: "keep",
        exerciseSlug: "smith-machine-calf-raise",
        sets: [],
      },
      {
        slotId: slotOf(ctx, "cable-crunch"),
        action: "drop",
        exerciseSlug: "cable-crunch",
        note: "Back is sore today.",
        sets: [],
      },
      {
        slotId: null,
        action: "keep",
        exerciseSlug: "face-pull",
        equipmentInstanceId: machineOf(ctx, "Cable station"),
        note: "Light, for the shoulders.",
        sets: [{ weight: 15, reps: 15, rir: 2 }],
      },
    ],
    memo: "Profile: Alice, squats twice a week.",
  };
}

describe("a day that lifts and runs", () => {
  let ctx: Context;
  let programId: string;

  beforeAll(async () => {
    const schedule = await withUser(t.db, alice.id, (tx) => getSchedule(tx, alice.id));
    programId = schedule!.program.id;
    await withUser(t.db, alice.id, async (tx) => {
      // Upper A out of the way, so the next slot is the one that runs.
      await recordSlotEvent(
        tx,
        alice.id,
        programId,
        { cycleIndex: 1, dayIndex: 2 },
        "session",
        "completed",
        {
          occurredOn: "2026-09-09",
        },
      );
      for (const [days, minutes] of [
        [9, 22],
        [5, 24],
        [2, 25],
      ] as const) {
        await createRun(tx, alice.id, {
          mode: "outdoor",
          startedAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          durationSeconds: minutes * 60,
          distanceMeters: minutes * 150,
          rpe: 3,
          shinLeftPre: 1,
          shinRightPre: 1,
          shinLeftDuring: null,
          shinRightDuring: null,
          shinLeftPost: 2,
          shinRightPost: 1,
          programRunId: null,
          notes: null,
        });
      }
    });
    ctx = await context();
  });

  it("plans the running day, with the programme's own run and the load behind it", async () => {
    expect(ctx.slot).toMatchObject({
      dayIndex: 3,
      name: "Easy Run + Arms",
      includesLifting: true,
      includesRun: true,
    });
    expect(ctx.slot.programRunId).toBeTruthy();
    expect(ctx.slot.runTarget).toMatchObject({ durationMinMinutes: expect.any(Number) });
    expect(ctx.running.history).toHaveLength(3);
    expect(ctx.running.history[0]?.durationMinutes).toBe(25);
    expect(ctx.running.weeks).toHaveLength(4);
    expect(ctx.running.weeks[0]?.minutes).toBeGreaterThan(0);
    expect(ctx.volume).toHaveLength(4);
    // The coach's own last calls, so it can tell whether they worked.
    expect(ctx.lastPlans.length).toBeGreaterThan(0);
    expect(ctx.lastPlans[0]).toMatchObject({
      trigger: expect.any(String),
      status: expect.any(String),
    });
  });

  it("stores the run beside the lifting, against the programme's planned run", async () => {
    const plan = await withUser(t.db, alice.id, (tx) =>
      storePlan(tx, alice.id, {
        slot: { cycleIndex: 1, dayIndex: 3 },
        gymId: anytimeId,
        trigger: "nightly",
        plan: {
          summary: "Easy 25 then arms.",
          run: {
            durationMinutes: 25,
            rpe: 3,
            paceNote: "Nose-breathing pace.",
            stopRule: "Stop if either shin goes past 3.",
            programRunId: ctx.slot.programRunId,
          },
          exercises: [
            {
              slotId: slotOf(ctx, "preacher-curl"),
              exerciseSlug: "preacher-curl",
              sets: [{ weight: 20, reps: 10, rir: 1 }],
            },
          ],
        },
      }),
    );
    expect(plan.run).toMatchObject({
      mode: "outdoor",
      durationMinutes: 25,
      rpe: 3,
      programRunId: ctx.slot.programRunId,
      stopRule: "Stop if either shin goes past 3.",
    });
    expect(plan.exercises[0]?.slotLineageId).toBeTruthy();
    const today = await withUser(t.db, alice.id, (tx) => plannedRunForToday(tx, alice.id));
    expect(today).toMatchObject({
      planId: plan.id,
      dayName: "Easy Run + Arms",
      summary: "Easy 25 then arms.",
    });
    expect(today?.run.durationMinutes).toBe(25);
    await withUser(t.db, alice.id, async (tx) => {
      const schedule = await getSchedule(tx, alice.id);
      expect(await plannedRunForToday(tx, alice.id, schedule)).toEqual(today);
      expect(await plannedRunForToday(tx, alice.id, null)).toBeNull();
    });
  });

  it("refuses a run the programme does not have, and a run on a day that does not run", async () => {
    await expect(
      withUser(t.db, alice.id, (tx) =>
        storePlan(tx, alice.id, {
          slot: { cycleIndex: 1, dayIndex: 3 },
          gymId: anytimeId,
          trigger: "nightly",
          plan: {
            summary: "x",
            run: { durationMinutes: 25, programRunId: "00000000-0000-4000-8000-000000000000" },
          },
        }),
      ),
    ).rejects.toMatchObject({ issues: [{ path: "run.programRunId" }] });
    await expect(
      withUser(t.db, alice.id, (tx) =>
        storePlan(tx, alice.id, {
          slot: { cycleIndex: 1, dayIndex: 4 },
          gymId: anytimeId,
          trigger: "nightly",
          plan: { summary: "x", run: { durationMinutes: 25 } },
        }),
      ),
    ).rejects.toThrow(/no run in the programme/);
  });

  it("stores what it noticed about the plan, without refusing it", async () => {
    const plan = await withUser(t.db, alice.id, (tx) =>
      storePlan(tx, alice.id, {
        slot: { cycleIndex: 1, dayIndex: 3 },
        gymId: anytimeId,
        trigger: "nightly",
        plan: {
          summary: "A long way out.",
          // 25 minutes to 50 is a jump the athlete should see before they run it.
          run: { durationMinutes: 50, programRunId: ctx.slot.programRunId },
          exercises: [
            {
              slotId: slotOf(ctx, "preacher-curl"),
              exerciseSlug: "preacher-curl",
              sets: [{ weight: 20, reps: 10, rir: 1 }],
            },
          ],
        },
      }),
    );
    expect(plan.status).toBe("active");
    expect(plan.warnings.map((warning) => warning.code)).toContain("run_jump");
    // Unmentioned exercises stay in the workout, so this is not a one-set day.
    expect(plan.warnings.map((warning) => warning.code)).not.toContain("volume_drift");
  });

  it("drops the plan when the slot is skipped instead of trained", async () => {
    await withUser(t.db, alice.id, (tx) =>
      voidPlanForSlot(tx, alice.id, programId, { cycleIndex: 1, dayIndex: 3 }),
    );
    expect(
      await withUser(t.db, alice.id, (tx) =>
        activePlanForSlot(tx, alice.id, programId, { cycleIndex: 1, dayIndex: 3 }),
      ),
    ).toBeNull();
    expect(await withUser(t.db, alice.id, (tx) => plannedRunForToday(tx, alice.id))).toBeNull();
  });
});

describe("a day that only runs", () => {
  let runner: { id: string; email: string };
  let outdoorId: string;

  beforeAll(async () => {
    runner = await t.createAuthUser("runner@example.com");
    await withUser(t.db, runner.id, (tx) => seedTestUserData(tx, runner));
    await t.db
      .update(profiles)
      .set({ aiCoachEnabled: true, timeZone: TZ, displayName: "Runner" })
      .where(eq(profiles.id, runner.id));
    const gyms = await withUser(t.db, runner.id, (tx) => listGyms(tx, runner.id));
    outdoorId = gyms.find((g) => g.slug === "outdoor")!.id;
    // Nowhere to lift: the only place left on the account is the one they run from.
    await t.db
      .update(gymsTable)
      .set({ isActive: false })
      .where(and(eq(gymsTable.userId, runner.id), ne(gymsTable.id, outdoorId)));
    await withUser(t.db, runner.id, (tx) =>
      createProgramFromBlueprint(tx, runner.id, RUN_ONLY_BLUEPRINT, { startDate: "2026-09-07" }),
    );
  });

  it("is due, and plans at a place that is not a gym", async () => {
    const due = await listDueUsers(t.db);
    expect(due.find((entry) => entry.userId === runner.id)).toMatchObject({
      gymName: "Outdoor",
      slot: { dayIndex: 1, dayName: "Easy run", lifts: false, runs: true },
    });
    const ctx = await withUser(t.db, runner.id, (tx) => planningContext(tx, runner.id));
    if (ctx.reason) throw new Error(ctx.reason);
    expect(ctx.gym.name).toBe("Outdoor");
    expect(ctx.exercises).toEqual([]);
    expect(ctx.slot.programRunId).toBeTruthy();
  });

  it("takes a run and nothing else", async () => {
    const ctx = await withUser(t.db, runner.id, (tx) => planningContext(tx, runner.id));
    if (ctx.reason) throw new Error(ctx.reason);
    const store = (plan: unknown) =>
      withUser(t.db, runner.id, (tx) =>
        storePlan(tx, runner.id, {
          slot: { cycleIndex: 1, dayIndex: 1 },
          gymId: outdoorId,
          trigger: "nightly",
          plan,
        }),
      );
    await expect(
      store({
        summary: "Run and curls.",
        run: { durationMinutes: 20 },
        exercises: [{ exerciseSlug: "preacher-curl", sets: [] }],
      }),
    ).rejects.toThrow(/no lifting/);
    const plan = await store({
      summary: "Easy 20.",
      run: { durationMinutes: 20, rpe: 3, programRunId: ctx.slot.programRunId },
    });
    expect(plan.exercises).toEqual([]);
    expect(plan.run?.durationMinutes).toBe(20);
    expect(
      await withUser(t.db, runner.id, (tx) => plannedRunForToday(tx, runner.id)),
    ).toMatchObject({ dayName: "Easy run" });
  });
});

describe("what the coach tried", () => {
  it("records every attempt, and Today points at the last failure until one works", async () => {
    const state = () =>
      withUser(t.db, alice.id, (tx) =>
        todayCoachState(tx, alice.id, {
          enabled: true,
          timeZone: TZ,
          programId: "00000000-0000-4000-8000-000000000000",
          ref: { cycleIndex: 1, dayIndex: 3 },
          gymId: anytimeId,
        }),
      );
    await withUser(t.db, alice.id, (tx) =>
      recordAttempt(tx, alice.id, {
        trigger: "nightly",
        gymId: anytimeId,
        status: "failed",
        error: "The gym has no machines registered.",
        routineSessionUrl: "https://claude.ai/code/session_x",
      }),
    );
    expect(await withUser(t.db, alice.id, (tx) => lastFailure(tx, alice.id))).toMatchObject({
      trigger: "nightly",
      status: "failed",
      error: "The gym has no machines registered.",
    });
    expect((await state()).failure?.error).toBe("The gym has no machines registered.");

    await withUser(t.db, alice.id, (tx) =>
      recordAttempt(tx, alice.id, { trigger: "nightly", gymId: anytimeId, status: "planned" }),
    );
    // A night that worked ends the story; nothing is shown.
    expect(await withUser(t.db, alice.id, (tx) => lastFailure(tx, alice.id))).toBeNull();
    expect((await state()).failure).toBeNull();

    const attempts = await withUser(t.db, alice.id, (tx) => recentAttempts(tx, alice.id, 5));
    expect(attempts[0]).toMatchObject({ status: "planned", gymName: "Anytime Fitness" });
    expect(attempts.map((attempt) => attempt.status)).toContain("failed");
  });
});

/** A programme whose first slot only runs, for the days the coach prescribes nothing to lift. */
const RUN_ONLY_BLUEPRINT = parseProgramBlueprint({
  blueprintVersion: 1,
  slug: "run-only-test",
  name: "Run-only test plan",
  weeks: 2,
  days: [
    {
      dayIndex: 1,
      dayOfWeek: 1,
      name: "Easy run",
      includesLifting: false,
      includesRun: true,
      warmupSlug: "run",
      exercises: [],
    },
    {
      dayIndex: 2,
      dayOfWeek: 3,
      name: "Full body",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "lower",
      exercises: [
        { exerciseSlug: "high-bar-squat", sets: 3, reps: [5, 8], rir: [1, 2], rest: [120, 180] },
      ],
    },
  ],
  runs: [
    {
      weekIndex: 1,
      dayOfWeek: 1,
      duration: [20, 25],
      rpe: [3, 4],
      paceNote: "Conversational.",
      shinRule: "Stop if either shin goes past 3.",
    },
    { weekIndex: 2, dayOfWeek: 1, duration: [25, 30], rpe: [3, 4] },
  ],
});

describe("a day that runs", () => {
  it("will not take a plan that answers only the lifting, until the run is logged", async () => {
    const dana = await t.createAuthUser("runs-and-lifts@example.com");
    const fixture = await withUser(t.db, dana.id, (tx) => seedTestUserData(tx, dana));
    await t.db
      .update(profiles)
      .set({ aiCoachEnabled: true, timeZone: TZ })
      .where(eq(profiles.id, dana.id));
    const gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
    // Walk the programme on to the first day that both lifts and runs.
    const schedule = await withUser(t.db, dana.id, (tx) => getSchedule(tx, dana.id));
    const runningDay = schedule!.days.find((day) => day.includesRun && day.includesLifting)!;
    for (const day of schedule!.days) {
      if (day.dayIndex >= runningDay.dayIndex) break;
      await withUser(t.db, dana.id, (tx) =>
        recordSlotEvent(
          tx,
          dana.id,
          fixture.programId,
          { cycleIndex: 1, dayIndex: day.dayIndex },
          "session",
          "skipped",
          { occurredOn: "2026-09-08" },
        ),
      );
    }
    const ref = { cycleIndex: 1, dayIndex: runningDay.dayIndex };
    const context = await withUser(t.db, dana.id, (tx) => planningContext(tx, dana.id, { gymId }));
    if (context.reason) throw new Error(context.reason);
    expect(context.slot.includesRun).toBe(true);
    const liftingOnly = {
      slot: ref,
      gymId,
      trigger: "nightly" as const,
      plan: {
        summary: "Only half of the day.",
        exercises: [{ exerciseSlug: context.exercises[0]!.planned.slug, sets: [] }],
      },
    };
    await expect(
      withUser(t.db, dana.id, (tx) => storePlan(tx, dana.id, liftingOnly)),
    ).rejects.toThrow(/needs a run/);

    // Once the run has been logged there is nothing left to say about it, and the same plan
    // stands: the two halves of the day are answered separately.
    const logged = await withUser(t.db, dana.id, (tx) =>
      createRun(tx, dana.id, {
        mode: "outdoor",
        startedAt: new Date(),
        durationSeconds: 1500,
        distanceMeters: 4000,
        rpe: 3,
        shinLeftPre: null,
        shinRightPre: null,
        shinLeftDuring: null,
        shinRightDuring: null,
        shinLeftPost: null,
        shinRightPost: null,
        programRunId: null,
        notes: null,
      }),
    );
    await withUser(t.db, dana.id, (tx) =>
      recordSlotEvent(tx, dana.id, fixture.programId, ref, "run", "completed", {
        occurredOn: "2026-09-12",
        runId: logged.id,
      }),
    );
    const stored = await withUser(t.db, dana.id, (tx) => storePlan(tx, dana.id, liftingOnly));
    expect(stored.run).toBeNull();
  });
});

describe("a plan that lands mid-session", () => {
  it("keeps showing the plan the open session is being trained from", async () => {
    const carol = await t.createAuthUser("mid-session@example.com");
    const fixture = await withUser(t.db, carol.id, (tx) => seedTestUserData(tx, carol));
    await t.db
      .update(profiles)
      .set({ aiCoachEnabled: true, timeZone: TZ })
      .where(eq(profiles.id, carol.id));
    const gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
    const context = await withUser(t.db, carol.id, (tx) =>
      planningContext(tx, carol.id, { gymId }),
    );
    if (context.reason) throw new Error(context.reason);
    const store = (summary: string) =>
      withUser(t.db, carol.id, (tx) =>
        storePlan(tx, carol.id, {
          slot: { cycleIndex: context.slot.cycleIndex, dayIndex: context.slot.dayIndex },
          gymId,
          trigger: "nightly",
          plan: {
            summary,
            exercises: [{ exerciseSlug: context.exercises[0]!.planned.slug, sets: [] }],
          },
        }),
      );
    const training = await store("The plan the session was started from.");
    await withUser(t.db, carol.id, (tx) =>
      startPlannedSession(tx, carol.id, {
        gymId,
        programDayId: context.slot.programDayId,
        cycleIndex: context.slot.cycleIndex,
      }),
    );
    // A re-plan asked for before the session started can still land after it did. It cannot be
    // the plan being trained, so Today must not show it to someone mid-workout.
    const later = await store("Arrived after the session had started.");
    expect(later.id).not.toBe(training.id);
    const today = await withUser(t.db, carol.id, (tx) =>
      todayCoachState(tx, carol.id, {
        enabled: true,
        timeZone: TZ,
        programId: context.programme.id,
        ref: { cycleIndex: context.slot.cycleIndex, dayIndex: context.slot.dayIndex },
        gymId,
      }),
    );
    expect(today.plan?.id).toBe(training.id);
    expect(today.plan?.summary).toBe("The plan the session was started from.");
  });
});
