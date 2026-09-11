import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { previousComparablePerformance } from "@/server/queries/comparable";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  gyms,
  profiles,
  programDays,
  programExercises,
  programRuns,
  runs,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "./schema";
import { seedReferenceData } from "./seed/reference";
import { seedTestUserData } from "./test/fixtures";
import { createTestDatabase, type TestDatabase } from "./test/pglite";
import { withUser } from "./with-user";

let t: TestDatabase;
let alice: { id: string; email: string };
let bob: { id: string; email: string };

/** Drizzle wraps driver errors ("Failed query: …"); the Postgres message sits in `cause`. */
function messages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

async function expectDbFailure(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected the query to fail").toBeDefined();
  expect(messages(caught)).toMatch(pattern);
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  alice = await t.createAuthUser("alice@example.com");
  bob = await t.createAuthUser("bob@example.com");
  // Seeding through withUser proves the RLS insert paths work for a signed-in user.
  await withUser(t.db, alice.id, (tx) => seedTestUserData(tx, alice));
});

afterAll(async () => {
  await t.close();
});

async function gymIdBySlug(userId: string, slug: string): Promise<string> {
  return withUser(t.db, userId, async (tx) => {
    const [row] = await tx.select({ id: gyms.id }).from(gyms).where(eq(gyms.slug, slug));
    if (!row) throw new Error(`gym ${slug} not found`);
    return row.id;
  });
}

async function exerciseIdBySlug(slug: string): Promise<string> {
  const [row] = await t.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, slug));
  if (!row) throw new Error(`exercise ${slug} not found`);
  return row.id;
}

describe("migrations and seeds", () => {
  it("creates a profile automatically for every auth user", async () => {
    const [row] = await t.db
      .select({ email: profiles.email, timeZone: profiles.timeZone })
      .from(profiles)
      .where(eq(profiles.id, bob.id));
    // UTC until onboarding asks; the browser proposes the real zone on the welcome screen.
    expect(row).toEqual({ email: "bob@example.com", timeZone: "UTC" });
  });

  it("materialises the complete 8-week template for the user", async () => {
    await withUser(t.db, alice.id, async (tx) => {
      const days = await tx
        .select({
          name: programDays.name,
          sets: sql<number>`coalesce(sum(${programExercises.sets}), 0)::int`,
        })
        .from(programDays)
        .leftJoin(programExercises, eq(programExercises.programDayId, programDays.id))
        .groupBy(programDays.id, programDays.name, programDays.dayIndex)
        .orderBy(asc(programDays.dayIndex));
      expect(days.map((d) => d.name)).toEqual([
        "Lower A",
        "Upper A",
        "Easy Run + Arms",
        "Lower B",
        "Upper B",
        "Easy Run + Light Upper",
        "Rest + Mobility",
      ]);
      expect(days.map((d) => d.sets)).toEqual([16, 19, 14, 13, 18, 10, 0]);
      expect(await tx.select({ id: programExercises.id }).from(programExercises)).toHaveLength(37);
      expect(await tx.select({ id: programRuns.id }).from(programRuns)).toHaveLength(16);
      expect(await tx.select({ id: gyms.id }).from(gyms)).toHaveLength(5);
      expect(await tx.select({ id: equipmentInstances.id }).from(equipmentInstances)).toHaveLength(
        7,
      );
    });
  });

  it("adds nothing on a second run", async () => {
    const again = await withUser(t.db, alice.id, (tx) => seedTestUserData(tx, alice));
    expect(again.created).toBe(false);
    await withUser(t.db, alice.id, async (tx) => {
      expect(await tx.select({ id: gyms.id }).from(gyms)).toHaveLength(5);
      expect(await tx.select({ id: equipmentInstances.id }).from(equipmentInstances)).toHaveLength(
        7,
      );
      expect(await tx.select({ id: programRuns.id }).from(programRuns)).toHaveLength(16);
    });
  });

  it("re-seeding shared reference data changes nothing", async () => {
    const before = await t.db.select({ id: exercises.id }).from(exercises);
    await seedReferenceData(t.db);
    const after = await t.db.select({ id: exercises.id }).from(exercises);
    expect(after).toHaveLength(before.length);
  });
});

describe("row level security", () => {
  it("sets the role and claims together and restores the connection after a transaction", async () => {
    await withUser(
      t.db,
      alice.id,
      async (tx) => {
        const result = await tx
          .select({
            role: sql<string>`current_user`,
            subject: sql<string>`nullif(current_setting('request.jwt.claim.sub', true), '')`,
          })
          .from(sql`(select 1) as probe`);
        expect(result[0]).toEqual({ role: "authenticated", subject: alice.id });
      },
      { readOnly: true },
    );
    const result = await t.db
      .select({
        role: sql<string>`current_user`,
        subject: sql<string | null>`nullif(current_setting('request.jwt.claim.sub', true), '')`,
      })
      .from(sql`(select 1) as probe`);
    expect(result[0]?.role).not.toBe("authenticated");
    expect(result[0]?.subject).toBeNull();
  });

  it("hides one user's rows from another", async () => {
    const bobSees = await withUser(t.db, bob.id, (tx) => tx.select({ id: gyms.id }).from(gyms));
    expect(bobSees).toHaveLength(0);
    const aliceSees = await withUser(t.db, alice.id, (tx) => tx.select({ id: gyms.id }).from(gyms));
    expect(aliceSees).toHaveLength(5);
  });

  it("rejects rows written into someone else's account", async () => {
    await expectDbFailure(
      withUser(t.db, bob.id, (tx) =>
        tx.insert(gyms).values({ userId: alice.id, name: "Intruder", slug: "intruder" }),
      ),
      /row-level security/i,
    );
  });
});

describe("history integrity", () => {
  it("keeps the gym used at the time and refuses to delete a gym with history", async () => {
    const gymId = await gymIdBySlug(alice.id, "society-gym");
    const sessionId = await withUser(t.db, alice.id, async (tx) => {
      const [row] = await tx
        .insert(workoutSessions)
        .values({ userId: alice.id, gymId, startedAt: new Date("2026-09-09T06:00:00Z") })
        .returning({ id: workoutSessions.id });
      return row?.id;
    });
    expect(sessionId).toBeDefined();

    await expectDbFailure(
      withUser(t.db, alice.id, (tx) => tx.delete(gyms).where(eq(gyms.id, gymId))),
      /foreign key/i,
    );

    await withUser(t.db, alice.id, (tx) =>
      tx
        .update(gyms)
        .set({ name: "Society Gym (renamed)", isActive: false })
        .where(eq(gyms.id, gymId)),
    );
    const [session] = await withUser(t.db, alice.id, (tx) =>
      tx
        .select({ gymId: workoutSessions.gymId, gymName: gyms.name })
        .from(workoutSessions)
        .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
        .where(eq(workoutSessions.id, sessionId as string)),
    );
    expect(session).toEqual({ gymId, gymName: "Society Gym (renamed)" });
  });

  it("computes average pace in the database", async () => {
    const outdoorId = await gymIdBySlug(alice.id, "outdoor");
    const [run] = await withUser(t.db, alice.id, (tx) =>
      tx
        .insert(runs)
        .values({
          userId: alice.id,
          gymId: outdoorId,
          mode: "outdoor",
          startedAt: new Date("2026-09-09T01:00:00Z"),
          durationSeconds: 1985,
          distanceMeters: 5000,
          rpe: 3.5,
        })
        .returning({ pace: runs.averagePaceSecondsPerKm }),
    );
    expect(run?.pace).toBe(397);
  });
});

describe("previous comparable performance", () => {
  let latPulldownId: string;
  let benchId: string;
  let machineA: string;
  let machineB: string;
  let anytimeId: string;
  let samsungId: string;

  beforeAll(async () => {
    latPulldownId = await exerciseIdBySlug("lat-pulldown");
    benchId = await exerciseIdBySlug("barbell-bench-press");
    anytimeId = await gymIdBySlug(alice.id, "anytime-fitness");
    samsungId = await gymIdBySlug(alice.id, "samsung-gym");
    const [latType] = await t.db
      .select({ id: equipmentTypes.id })
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "lat_pulldown"));
    if (!latType) throw new Error("lat_pulldown type missing");

    await withUser(t.db, alice.id, async (tx) => {
      const inserted = await tx
        .insert(equipmentInstances)
        .values([
          {
            userId: alice.id,
            gymId: anytimeId,
            equipmentTypeId: latType.id,
            name: "Precor lat pulldown",
            resistanceMode: "selectorized",
          },
          {
            userId: alice.id,
            gymId: samsungId,
            equipmentTypeId: latType.id,
            name: "Matrix lat pulldown",
            resistanceMode: "selectorized",
          },
        ])
        .returning({ id: equipmentInstances.id, name: equipmentInstances.name });
      machineA = inserted.find((i) => i.name === "Precor lat pulldown")?.id ?? "";
      machineB = inserted.find((i) => i.name === "Matrix lat pulldown")?.id ?? "";

      const logSession = async (
        gymId: string,
        startedAt: string,
        entries: {
          exerciseId: string;
          equipmentInstanceId: string | null;
          weight: number;
          reps: number;
        }[],
      ) => {
        const [session] = await tx
          .insert(workoutSessions)
          .values({
            userId: alice.id,
            gymId,
            startedAt: new Date(startedAt),
            completedAt: new Date(new Date(startedAt).getTime() + 60 * 60_000),
          })
          .returning({ id: workoutSessions.id });
        if (!session) throw new Error("no session");
        for (const [i, entry] of entries.entries()) {
          const [we] = await tx
            .insert(workoutExercises)
            .values({
              userId: alice.id,
              workoutSessionId: session.id,
              exerciseId: entry.exerciseId,
              equipmentInstanceId: entry.equipmentInstanceId,
              orderIndex: i + 1,
            })
            .returning({ id: workoutExercises.id });
          if (!we) throw new Error("no workout exercise");
          await tx.insert(setLogs).values({
            userId: alice.id,
            workoutExerciseId: we.id,
            setIndex: 1,
            weight: entry.weight,
            reps: entry.reps,
            rir: 2,
          });
        }
      };

      await logSession(anytimeId, "2026-09-01T06:00:00Z", [
        { exerciseId: latPulldownId, equipmentInstanceId: machineA, weight: 80, reps: 10 },
        { exerciseId: benchId, equipmentInstanceId: null, weight: 60, reps: 5 },
      ]);
      await logSession(samsungId, "2026-09-03T06:00:00Z", [
        { exerciseId: latPulldownId, equipmentInstanceId: machineB, weight: 65, reps: 10 },
        { exerciseId: benchId, equipmentInstanceId: null, weight: 62.5, reps: 5 },
      ]);
    });
  });

  it("never uses 80 kg on machine A as the prior load for machine B", async () => {
    const forB = await withUser(t.db, alice.id, (tx) =>
      previousComparablePerformance(tx, {
        userId: alice.id,
        exerciseId: latPulldownId,
        loadPortability: "equipment_specific",
        equipmentInstanceId: machineB,
      }),
    );
    expect(forB?.equipmentInstanceId).toBe(machineB);
    expect(forB?.sets[0]?.weight).toBe(65);

    const forA = await withUser(t.db, alice.id, (tx) =>
      previousComparablePerformance(tx, {
        userId: alice.id,
        exerciseId: latPulldownId,
        loadPortability: "equipment_specific",
        equipmentInstanceId: machineA,
      }),
    );
    expect(forA?.equipmentInstanceId).toBe(machineA);
    expect(forA?.sets[0]?.weight).toBe(80);

    const unknownMachine = await withUser(t.db, alice.id, (tx) =>
      previousComparablePerformance(tx, {
        userId: alice.id,
        exerciseId: latPulldownId,
        loadPortability: "equipment_specific",
        equipmentInstanceId: null,
      }),
    );
    expect(unknownMachine).toBeNull();
  });

  it("keeps barbell bench press comparable across gyms", async () => {
    const latest = await withUser(t.db, alice.id, (tx) =>
      previousComparablePerformance(tx, {
        userId: alice.id,
        exerciseId: benchId,
        loadPortability: "global",
        equipmentInstanceId: null,
      }),
    );
    expect(latest?.gymName).toBe("Samsung Gym");
    expect(latest?.sets[0]?.weight).toBe(62.5);

    const beforeSecond = await withUser(t.db, alice.id, (tx) =>
      previousComparablePerformance(tx, {
        userId: alice.id,
        exerciseId: benchId,
        loadPortability: "global",
        equipmentInstanceId: null,
        before: new Date("2026-09-02T00:00:00Z"),
      }),
    );
    expect(beforeSecond?.gymName).toBe("Anytime Fitness");
    expect(beforeSecond?.sets[0]?.weight).toBe(60);
  });

  it("does not leak another user's history", async () => {
    const bobView = await withUser(t.db, bob.id, (tx) =>
      previousComparablePerformance(tx, {
        userId: alice.id,
        exerciseId: benchId,
        loadPortability: "global",
        equipmentInstanceId: null,
      }),
    );
    expect(bobView).toBeNull();
  });
});
