import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  coachChangeRecords,
  coachEvidenceBaselines,
  dailyRecovery,
  equipmentInstances,
  equipmentTypes,
  gyms,
  profiles,
  programDays,
  programExercises,
  programRuns,
  runs,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { DbOrTx } from "@/db/types";
import { coachJobResultSchema, jobTargetSchema } from "@/domain/coaching-workflow";
import { programBlueprintSchema } from "@/domain/program-blueprint";
import { createProgramFromBlueprint, readProgramBlueprint } from "./programs";
import { readCoachingEvidence, retainEvidenceBaselines } from "./coaching-evidence";
import {
  assessSessionEvidence,
  assessWeeklyEvidence,
  validateCitedEvidence,
} from "./coaching-guardrails";
import { existingEvidenceIds, readCoachMemory, updateCoachMemory } from "./coach-memory";
import { planningContext } from "./coach-plans";
import { sharedExercises } from "@/server/queries/reference";
import { applyRule } from "./progression-rule";
import { sessionHistories } from "@/server/queries/comparable";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});
const now = new Date();
async function fixture(values = [12, 12, 12, 12, 12, 12]) {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@evidence.test`);
  const as = <T>(fn: (db: DbOrTx) => Promise<T>) => withUser(t.db, user.id, fn);
  return as(async (db) => {
    await db.insert(profiles).values({ id: user.id }).onConflictDoNothing();
    const [home] = await db
      .insert(gyms)
      .values({ userId: user.id, slug: "home", name: "Home", kind: "home", isDefault: true })
      .returning();
    const [type] = await db
      .select()
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "dumbbells"));
    const [machine] = await db
      .insert(equipmentInstances)
      .values({
        userId: user.id,
        gymId: home!.id,
        equipmentTypeId: type!.id,
        name: "Dumbbells",
        resistanceMode: "free_weight",
        unit: "kg",
        loadConvention: "total",
        availableLoads: [40, 45, 47.5, 50, 52.5, 55, 57.5],
      })
      .returning();
    const blueprint = {
      ...STRENGTH_AESTHETICS_HYBRID_8WK,
      slug: "evidence",
      weeks: 4,
      days: [
        {
          ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
          dayIndex: 1,
          dayOfWeek: 2,
          includesRun: true,
          exercises: [
            {
              exerciseSlug: "goblet-squat",
              sets: 4,
              reps: [8, 12] as [number, number],
              rir: [2, 3] as [number, number],
              rest: [90, 120] as [number, number],
            },
            {
              exerciseSlug: "bodyweight-squat",
              sets: 6,
              reps: [8, 12] as [number, number],
              rir: [2, 3] as [number, number],
              rest: [90, 120] as [number, number],
            },
          ],
        },
      ],
      runs: [1, 2, 3, 4].map((weekIndex) => ({
        weekIndex,
        dayOfWeek: 2,
        duration: [20, 30] as [number, number],
        rpe: [3, 4] as [number, number],
      })),
    };
    const program = await createProgramFromBlueprint(
      db,
      user.id,
      programBlueprintSchema.parse(blueprint),
      { startDate: "2026-09-08" },
    );
    const [slot] = await db
      .select({ p: programExercises })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(and(eq(programDays.programId, program.id), eq(programExercises.orderIndex, 1)));
    const ids: string[] = [];
    for (const [index, reps] of values.entries()) {
      const startedAt = new Date(now.getTime() - (1 + index * 3) * 86_400_000);
      const [session] = await db
        .insert(workoutSessions)
        .values({
          userId: user.id,
          gymId: home!.id,
          programId: program.id,
          startedAt,
          completedAt: new Date(startedAt.getTime() + 3600_000),
        })
        .returning();
      const [exercise] = await db
        .insert(workoutExercises)
        .values({
          userId: user.id,
          workoutSessionId: session!.id,
          exerciseId: slot!.p.exerciseId,
          plannedProgramExerciseId: slot!.p.id,
          equipmentInstanceId: machine!.id,
          orderIndex: 1,
        })
        .returning();
      await db.insert(setLogs).values(
        [1, 2, 3, 4].map((setIndex) => ({
          userId: user.id,
          workoutExerciseId: exercise!.id,
          setIndex,
          setType: "working" as const,
          weight: 50,
          unit: "kg" as const,
          reps,
          rir: 2,
          effortReported: true,
        })),
      );
      ids.push(`workout:${session!.id}`);
    }
    const context = await planningContext(db, user.id, { gymId: home!.id });
    if (context.reason !== null) throw new Error(context.reason);
    const target = jobTargetSchema.parse({
      programId: program.id,
      gymId: home!.id,
      cycleIndex: 1,
      dayIndex: 1,
    });
    const output = (load: number, reps = 12, adjustment = "normal") => {
      const result = coachJobResultSchema.parse({
        outcome: "session",
        adjustment,
        rationale: "Compare repeated training evidence.",
        evidence: ids.slice(0, 2),
        plan: {
          summary: "Home training",
          exercises: context.exercises.map((item, index) => ({
            slotId: item.slotId,
            exerciseSlug: item.planned.slug,
            equipmentInstanceId: index === 0 ? machine!.id : null,
            sets: index === 0 ? [1, 2, 3, 4].map(() => ({ weight: load, reps, rir: 2 })) : [],
          })),
        },
      });
      if (result.outcome !== "session") throw new Error("Unexpected result");
      return result;
    };
    return {
      user,
      as,
      home: home!,
      machine: machine!,
      program,
      slot: slot!.p,
      ids,
      target,
      output,
    };
  });
}

it("permits a supported small home step and rejects an infeasible or excessive jump", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const changes = await assessSessionEvidence(
      db,
      a.user.id,
      a.target,
      a.output(52.5, 8),
      evidence,
      new Set(a.ids.slice(0, 2)),
    );
    expect(changes[0]).toMatchObject({
      kind: "progression",
      before: { load: 50 },
      after: { load: 52.5 },
    });
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, a.output(51, 8), evidence, new Set(a.ids)),
    ).rejects.toThrow(/available home load/);
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, a.output(55, 8), evidence, new Set(a.ids)),
    ).rejects.toThrow(/automatic limit/);
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, a.output(0, 8), evidence, new Set(a.ids)),
    ).rejects.toThrow();
    const warmupsOnly = a.output(50);
    warmupsOnly.plan.exercises[0]!.sets.forEach((set) => {
      set.setType = "warmup";
    });
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, warmupsOnly, evidence, new Set(a.ids)),
    ).rejects.toThrow(/lasting set-count/);
  });
});
it("retains legacy RIR values but excludes them from automatic evidence", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    await db.update(setLogs).set({ effortReported: false }).where(eq(setLogs.userId, a.user.id));
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(evidence.exerciseTrends[0]?.effortCoverage.known).toBe(0);
    expect(evidence.exerciseTrends[0]?.latestSets[0]?.rir).toBe(2);
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, a.output(52.5, 8), evidence, new Set(a.ids)),
    ).rejects.toThrow(/not supported/);
  });
});
it("does not stack nominally small weekly set increases beyond the original program", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const before = (await readProgramBlueprint(db, a.user.id, a.program.id))!.blueprint;
    const current = structuredClone(before);
    current.days[0]!.exercises[0]!.sets = 5;
    const proposed = structuredClone(current);
    proposed.days[0]!.exercises[0]!.sets = 6;
    await db.insert(coachChangeRecords).values({
      userId: a.user.id,
      changes: [],
      programBefore: before,
      createdAt: new Date(now.getTime() - 7 * 86_400_000),
    });
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const assessment = assessWeeklyEvidence(
      current,
      proposed,
      evidence,
      new Set(a.ids),
      await sharedExercises(db),
      now,
    );
    expect(assessment.automatic).toBe(false);
    expect(assessment.reasons.some((reason) => reason.startsWith("Cumulative:"))).toBe(true);
  });
});
it("shares evidence consumption between daily decisions and weekly review", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const current = (await readProgramBlueprint(db, a.user.id, a.program.id))!.blueprint;
    const next = structuredClone(current);
    next.days[0]!.exercises[0]!.sets = 5;
    const library = await sharedExercises(db);
    expect(
      assessWeeklyEvidence(current, next, evidence, new Set(a.ids), library, now).automatic,
    ).toBe(true);
    const changes = await assessSessionEvidence(
      db,
      a.user.id,
      a.target,
      a.output(52.5, 8),
      evidence,
      new Set(a.ids),
    );
    await db.insert(coachChangeRecords).values({ userId: a.user.id, changes, createdAt: now });
    const refreshed = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(
      assessWeeklyEvidence(current, next, refreshed, new Set(a.ids), library, now).automatic,
    ).toBe(false);
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, a.output(55, 8), refreshed, new Set(a.ids)),
    ).rejects.toThrow(/two new comparable/);
  });
});
it("retains a temporary session's baseline and exposes it to the fallback rule", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const [recovery] = await db
      .insert(dailyRecovery)
      .values({ userId: a.user.id, date: now.toISOString().slice(0, 10), fatigue: 4 })
      .returning();
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const cited = new Set([`recovery:${recovery!.id}`]);
    const changes = await assessSessionEvidence(
      db,
      a.user.id,
      a.target,
      a.output(45, 10, "temporary"),
      evidence,
      cited,
    );
    expect(changes[0]).toMatchObject({
      kind: "temporary",
      before: { load: 50 },
      after: { load: 45 },
    });
    const [receipt] = await db
      .insert(coachChangeRecords)
      .values({ userId: a.user.id, changes, createdAt: now })
      .returning();
    const [histories] = await sessionHistories(db, [
      {
        userId: a.user.id,
        exerciseId: a.slot.exerciseId,
        loadPortability: "global",
        equipmentInstanceId: a.machine.id,
      },
    ]);
    const history = histories!.history.map((item) => ({
      ...item,
      sets: item.sets.map((set) => ({ ...set, weight: 45 })),
    }));
    const rule = applyRule({
      planned: a.slot,
      exerciseSlug: "goblet-squat",
      locationKind: "home",
      equipment: a.machine,
      changes: [receipt!],
      exercise: {
        loadPortability: "global",
        defaultLoadIncrement: 2.5,
        defaultPrescriptionType: "reps",
        defaultRepMin: 8,
        defaultRepMax: 12,
        defaultDurationMinSeconds: null,
        defaultDurationMaxSeconds: null,
        defaultDistanceMinMeters: null,
        defaultDistanceMaxMeters: null,
        defaultRir: 2,
      },
      slotLineageId: a.slot.lineageId,
      history,
      elsewhere: null,
    });
    expect(rule.suggestion?.sets[0]?.weight).toBe(50);
    expect(rule.suggestion?.kind).toBe("hold");
    await expect(
      assessSessionEvidence(
        db,
        a.user.id,
        a.target,
        a.output(45, 10, "temporary"),
        evidence,
        new Set(),
      ),
    ).rejects.toThrow(/current recovery/);
  });
});
it("invalidates retained numeric references when supporting logs are edited or deleted", async () => {
  const a = await fixture([5, 6, 6, 10, 10, 10]);
  await a.as(async (db) => {
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(evidence.exerciseTrends[0]?.declineCandidate).toBe(true);
    await retainEvidenceBaselines(db, a.user.id, evidence);
    expect(await db.select().from(coachEvidenceBaselines)).toHaveLength(1);
    const referenceSource = evidence.exerciseTrends[0]!.reference!.sourceIds[0]!.split(":")[1]!;
    const [exercise] = await db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutSessionId, referenceSource));
    await db.update(setLogs).set({ reps: 11 }).where(eq(setLogs.workoutExerciseId, exercise!.id));
    const edited = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(edited.exerciseTrends[0]?.reference?.values).toContain(11);
    await db.delete(workoutSessions).where(eq(workoutSessions.id, referenceSource));
    const deleted = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(deleted.exerciseTrends[0]?.reference).toBeNull();
  });
});
it("checks run distance separately when duration is unchanged and preserves sparse evidence", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const [planned] = await db
      .select()
      .from(programRuns)
      .where(eq(programRuns.programId, a.program.id));
    const runIds: string[] = [];
    for (const days of [4, 1]) {
      const [run] = await db
        .insert(runs)
        .values({
          userId: a.user.id,
          programRunId: planned!.id,
          mode: "outdoor",
          startedAt: new Date(now.getTime() - days * 86_400_000),
          distanceMeters: 5000,
          durationSeconds: 1800,
          rpe: 4,
          effortReported: true,
        })
        .returning();
      runIds.push(`run:${run!.id}`);
    }
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const output = a.output(50);
    output.plan.run = {
      mode: "outdoor",
      durationMinutes: 30,
      distanceKm: 5.5,
      rpe: 4,
      programRunId: planned!.id,
      paceNote: "Easy effort",
      stopRule: "Stop if symptoms worsen",
      note: "",
    };
    expect(
      (await assessSessionEvidence(db, a.user.id, a.target, output, evidence, new Set(runIds)))[0]
        ?.after.distance,
    ).toBe(5500);
    output.plan.run.distanceKm = 6;
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, output, evidence, new Set(runIds)),
    ).rejects.toThrow(/automatic limit/);
    await db
      .update(programRuns)
      .set({ distanceMinKm: 5, distanceMaxKm: 5 })
      .where(eq(programRuns.programId, a.program.id));
    output.plan.run.distanceKm = 5.5;
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, output, evidence, new Set(runIds)),
    ).rejects.toThrow(/distance is outside the program range/);
    const current = (await readProgramBlueprint(db, a.user.id, a.program.id))!.blueprint;
    const next = structuredClone(current);
    next.runs[0]!.distanceKm = [5.5, 5.5];
    const library = await sharedExercises(db);
    expect(assessWeeklyEvidence(current, next, evidence, new Set(), library, now).automatic).toBe(
      false,
    );
    const supported = assessWeeklyEvidence(current, next, evidence, new Set(runIds), library, now);
    expect(supported.automatic).toBe(true);
    expect(supported.changes[0]?.after.distance).toBe(5500);
    next.runs[0]!.distanceKm = [6, 6];
    expect(
      assessWeeklyEvidence(current, next, evidence, new Set(runIds), library, now).automatic,
    ).toBe(false);
  });
});
it("keeps memo provenance private, invalidates removed sources and detects competing corrections", async () => {
  const a = await fixture();
  const other = await fixture([]);
  const id = crypto.randomUUID();
  await a.as(async (db) => {
    await updateCoachMemory(
      db,
      a.user.id,
      {
        expectedRevision: 0,
        upsert: [
          {
            id,
            category: "trend",
            status: "observation",
            text: "Squat performance is consistent.",
            sourceIds: [a.ids[0]],
            reviewAfter: new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10),
          },
        ],
      },
      "coach",
      now,
    );
    expect((await readCoachMemory(db, a.user.id, now)).items).toHaveLength(1);
    await expect(
      updateCoachMemory(db, a.user.id, { expectedRevision: 0, removeIds: [id] }, "athlete", now),
    ).rejects.toThrow(/memo changed/);
    await db.delete(workoutSessions).where(eq(workoutSessions.id, a.ids[0]!.split(":")[1]!));
    expect((await readCoachMemory(db, a.user.id, now)).reviewDueItems).toHaveLength(1);
    expect(
      await existingEvidenceIds(db, a.user.id, ["workout:------------------------------------"]),
    ).toEqual(new Set());
  });
  await other.as(async (db) => {
    expect((await readCoachMemory(db, a.user.id, now)).items).toEqual([]);
    expect(await db.select().from(coachEvidenceBaselines)).toEqual([]);
    expect(await db.select().from(coachChangeRecords)).toEqual([]);
    const output = other.output(50);
    output.evidence = [a.ids[1]!];
    await expect(validateCitedEvidence(db, other.user.id, output)).rejects.toThrow(
      /other athletes/,
    );
  });
});
