import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiTokens,
  dailyRecovery,
  equipmentInstances,
  exercises,
  profiles,
  runs,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { estimated1RM, liftingAdherence, trainingAnalytics } from "@/domain/analytics";
import { handleCoachRequest } from "@/server/coach-api";
import { comparableHistory, sessionHistories } from "@/server/queries/comparable";
import { parseDateRange } from "@/server/validation/date-range";
import {
  authenticateCoachToken,
  createCoachToken,
  listCoachTokens,
  revokeCoachToken,
} from "./coach-tokens";
import { listGyms } from "./gyms";
import { getSchedule } from "./schedule";
import { readTrainingData } from "./training-data";
import {
  addExerciseToSession,
  finishSession,
  logSet,
  SetConflictError,
  startAdHocSession,
} from "./sessions";

let t: TestDatabase, alice: { id: string; email: string }, bob: { id: string; email: string };
let token: string, benchId: string, latId: string, machineId: string;
const range = parseDateRange({ from: "2026-09-01", to: "2026-09-30" }, "Asia/Kolkata");
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  alice = await t.createAuthUser("analytics@example.com");
  bob = await t.createAuthUser("other@example.com");
  await withUser(t.db, alice.id, (tx) => seedTestUserData(tx, alice));
  // The coach API reports the account's own zone, so pin one that is not the default.
  await withUser(t.db, alice.id, (tx) =>
    tx.update(profiles).set({ timeZone: "Asia/Kolkata" }).where(eq(profiles.id, alice.id)),
  );
  const allExercises = await t.db.select().from(exercises);
  benchId = allExercises.find((e) => e.slug === "barbell-bench-press")!.id;
  latId = allExercises.find((e) => e.slug === "lat-pulldown")!.id;
  await withUser(t.db, alice.id, async (tx) => {
    const gyms = await listGyms(tx, alice.id),
      gymA = gyms.find((g) => g.slug === "anytime-fitness")!,
      gymB = gyms.find((g) => g.slug === "samsung-gym")!;
    const [machineA] = await tx
      .select()
      .from(equipmentInstances)
      .where(
        and(eq(equipmentInstances.gymId, gymA.id), eq(equipmentInstances.name, "Cable station")),
      );
    const [machineB] = await tx
      .insert(equipmentInstances)
      .values({
        userId: alice.id,
        gymId: gymB.id,
        equipmentTypeId: machineA!.equipmentTypeId,
        name: "Different cable",
        resistanceMode: "selectorized",
        unit: "kg",
      })
      .returning();
    machineId = machineA!.id;
    for (const [i, gym] of [gymA, gymB].entries()) {
      const session = await startAdHocSession(tx, alice.id, { gymId: gym.id });
      // Sunday UTC is already Monday in the user's time zone.
      await tx
        .update(workoutSessions)
        .set({
          startedAt: new Date(i === 0 ? "2026-09-06T19:00:00Z" : "2026-09-14T00:00:00Z"),
          sleepHours: i === 0 ? 7 : null,
          backPainPre: i,
        })
        .where(eq(workoutSessions.id, session.sessionId));
      for (const [exerciseId, equipmentInstanceId] of [
        [benchId, null],
        [latId, i === 0 ? machineA!.id : machineB!.id],
      ] as const) {
        const slot = await addExerciseToSession(tx, alice.id, session.sessionId, {
          exerciseId,
          equipmentInstanceId,
        });
        await logSet(tx, alice.id, {
          workoutExerciseId: slot.workoutExerciseId,
          setIndex: 1,
          setType: "working",
          weight: i === 0 ? 60 : 65,
          reps: 5,
          rir: 2,
          durationSeconds: null,
        });
        await logSet(tx, alice.id, {
          workoutExerciseId: slot.workoutExerciseId,
          setIndex: 2,
          setType: "warmup",
          weight: 20,
          reps: 10,
          rir: 5,
          durationSeconds: null,
        });
      }
      await finishSession(tx, alice.id, session.sessionId, { notes: null, bodyWeightKg: null });
    }
    await tx.insert(runs).values({
      userId: alice.id,
      mode: "outdoor",
      startedAt: new Date("2026-09-08T00:00:00Z"),
      durationSeconds: 1800,
      distanceMeters: 5000,
      shinLeftPost: 0,
    });
    await tx
      .insert(dailyRecovery)
      .values({ userId: alice.id, date: "2026-09-30", sleepHours: 8, shinLeft: 2 });
    token = (await createCoachToken(tx, alice.id, "Test coach", 90)).token;
  });
});
afterAll(async () => {
  await t.close();
});

describe("history and analytics", () => {
  it("batches histories without changing equipment scope or chronology", async () => {
    await withUser(t.db, alice.id, async (tx) => {
      const queries = [
        {
          userId: alice.id,
          exerciseId: benchId,
          loadPortability: "global" as const,
          equipmentInstanceId: null,
        },
        {
          userId: alice.id,
          exerciseId: latId,
          loadPortability: "equipment_specific" as const,
          equipmentInstanceId: machineId,
        },
      ];
      const batched = await sessionHistories(tx, queries);
      for (const [i, query] of queries.entries())
        expect(batched[i]!.history).toEqual(await comparableHistory(tx, query));
      expect(batched[0]!.history).toHaveLength(2);
      expect(batched[1]!.history).toHaveLength(1);
    });
  });
  it("keeps machines separate, groups global lifts, counts local weeks and preserves missing measurements", async () => {
    const data = await withUser(t.db, alice.id, (tx) => readTrainingData(tx, alice.id, range));
    expect(data.recovery).toHaveLength(1);
    const result = trainingAnalytics(data, "Asia/Kolkata", range.from, range.to);
    expect(result.workouts).toBe(2);
    expect(result.runs).toBe(1);
    const bench = result.series.filter((s) => s.exerciseId === benchId);
    expect(bench).toHaveLength(1);
    expect(bench[0]!.load.map((p) => p.value)).toEqual([60, 65]);
    expect(bench[0]!.estimated1RM[0]!.value).toBe(70);
    expect(result.series.filter((s) => s.exerciseId === latId)).toHaveLength(2);
    // Monday-anchored weeks: the 7 Sep session and the 8 Sep run share one, the 14 Sep the next.
    expect(result.weeks.find((w) => w.date === "2026-09-07")?.muscles.chest).toBe(1);
    expect(result.weeks.find((w) => w.date === "2026-09-14")?.muscles.chest).toBe(1);
    expect(result.weeks.find((w) => w.date === "2026-09-07")?.runKm).toBe(5);
    expect(result.weeks.find((w) => w.date === "2026-08-31")?.workouts).toBe(0);
    expect(result.recovery.some((r) => r.sleep === null)).toBe(true);
    expect(result.recovery.find((r) => r.source === "Run (after)")?.leftShin).toBe(0);
  });
  it("excludes rest slots from programme adherence", async () => {
    const schedule = await withUser(t.db, alice.id, (tx) => getSchedule(tx, alice.id));
    const result = liftingAdherence(schedule)!;
    expect(result.total).toBe(48);
    expect(result.completed).toBe(0);
    expect(result.completionRate).toBeNull();
  });
  it("does not estimate stack, bodyweight or high-rep maximums", () => {
    expect(estimated1RM(60, 1, "barbell", "kg")).toBe(60);
    expect(estimated1RM(60, 11, "barbell", "kg")).toBeNull();
    expect(estimated1RM(60, 5, "machine", "kg")).toBeNull();
    expect(estimated1RM(0, 5, "bodyweight", "kg")).toBeNull();
  });
  it("returns no other account's history even with another user ID passed to the repository", async () => {
    const data = await withUser(t.db, bob.id, (tx) => readTrainingData(tx, alice.id, range));
    expect(data.workouts).toEqual([]);
    expect(data.runs).toEqual([]);
    expect(data.recovery).toEqual([]);
  });
});

const request = (endpoint: string, credential = token) =>
  handleCoachRequest(
    t.db,
    new Request(`https://example.test/api/coach/${endpoint}?from=2026-09-01&to=2026-09-30`, {
      headers: { Authorization: `Bearer ${credential}` },
    }),
    endpoint.split("/"),
  );
describe("read-only coach API", () => {
  it("stores only token hashes and hides them from management reads", async () => {
    const rows = await t.db.select().from(apiTokens);
    expect(rows[0]!.tokenHash).toHaveLength(64);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(
      (await withUser(t.db, alice.id, (tx) => listCoachTokens(tx, alice.id)))[0],
    ).not.toHaveProperty("tokenHash");
  });
  it("serves all documented endpoints as private JSON with raw machine identity", async () => {
    for (const endpoint of [
      "summary",
      "workouts",
      "running",
      "recovery",
      "program/current",
      `exercises/${latId}/history`,
    ]) {
      const response = await request(endpoint);
      expect(response.status, endpoint).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.json();
      expect(body.timeZone).toBe("Asia/Kolkata");
      if (endpoint === "workouts") expect(body.workouts).toHaveLength(2);
      if (endpoint.includes("/history")) expect(body.performances).toHaveLength(2);
      if (endpoint === "program/current") expect(body.program.days).toHaveLength(7);
    }
  });
  it("requires a valid Bearer token, never cookies or token query strings", async () => {
    expect(
      (await request("summary", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).status,
    ).toBe(401);
    expect(
      (
        await handleCoachRequest(
          t.db,
          new Request(`https://example.test/api/coach/summary?token=${token}`),
          ["summary"],
        )
      ).status,
    ).toBe(401);
  });
  it("rejects malformed filters and enforces pagination", async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const response = await handleCoachRequest(
      t.db,
      new Request("https://example.test/api/coach/workouts?from=2026-09-01&to=2026-09-30&limit=1", {
        headers,
      }),
      ["workouts"],
    );
    const body = await response.json();
    expect(body.workouts).toHaveLength(1);
    expect(body.hasMore).toBe(true);
    expect(
      (
        await handleCoachRequest(
          t.db,
          new Request("https://example.test/api/coach/summary?from=2026-02-30", { headers }),
          ["summary"],
        )
      ).status,
    ).toBe(400);
    expect((await request("missing")).status).toBe(404);
  });
  it("rejects writes inside a coach data transaction", async () => {
    await expect(
      withUser(
        t.db,
        alice.id,
        (tx) => tx.insert(dailyRecovery).values({ userId: alice.id, date: "2026-10-01" }),
        { readOnly: true },
      ),
    ).rejects.toThrow();
  });
  it("isolates token ownership, expires tokens and revokes immediately", async () => {
    const result = await withUser(t.db, bob.id, (tx) => createCoachToken(tx, bob.id, "Other", 30));
    expect((await (await request("workouts", result.token)).json()).workouts).toEqual([]);
    expect(
      await authenticateCoachToken(t.db, result.token, new Date(Date.now() + 31 * 86_400_000)),
    ).toBeNull();
    const bobToken = (await withUser(t.db, bob.id, (tx) => listCoachTokens(tx, bob.id)))[0]!;
    await withUser(t.db, alice.id, (tx) => revokeCoachToken(tx, alice.id, bobToken.id));
    expect(await authenticateCoachToken(t.db, result.token)).toBe(bob.id);
    await withUser(t.db, bob.id, (tx) => revokeCoachToken(tx, bob.id, bobToken.id));
    expect((await request("summary", result.token)).status).toBe(401);
  });
});

it("retries a lost acknowledgement idempotently and rejects a stale conflicting set", async () => {
  await withUser(t.db, alice.id, async (tx) => {
    const [gym] = await listGyms(tx, alice.id);
    const session = await startAdHocSession(tx, alice.id, { gymId: gym!.id });
    const slot = await addExerciseToSession(tx, alice.id, session.sessionId, {
      exerciseId: benchId,
      equipmentInstanceId: null,
    });
    const input = {
      workoutExerciseId: slot.workoutExerciseId,
      expectedCompletedAt: null,
      setIndex: 1,
      setType: "working" as const,
      weight: 60,
      reps: 5,
      rir: 2,
      durationSeconds: null,
    };
    const first = await logSet(tx, alice.id, input),
      retried = await logSet(tx, alice.id, input);
    await expect(
      logSet(tx, alice.id, { ...input, expectedExerciseId: latId }),
    ).rejects.toBeInstanceOf(SetConflictError);
    expect(retried.id).toBe(first.id);
    expect(retried.completedAt).toEqual(first.completedAt);
    await expect(logSet(tx, alice.id, { ...input, weight: 65 })).rejects.toBeInstanceOf(
      SetConflictError,
    );
  });
});
