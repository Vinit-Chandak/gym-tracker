import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  coachChangeRecords,
  coachEvidenceBaselines,
  coachNotes,
  dailyRecovery,
  equipmentInstances,
  equipmentTypes,
  exercises,
  gyms,
  programDays,
  programExercises,
  occurrenceVersions,
  plannedOccurrences,
  programFamilies,
  programRuns,
  programs,
  runningActivityDetails,
  sessionPlans,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { logTestRun } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { DbOrTx } from "@/db/types";
import { plannedOrigin } from "@/domain/activity";
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
import { CoachingError } from "./coaching-state";
import { planningContext } from "./coach-plans";
import { ensureProfile } from "@/server/queries/profile";
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
    await ensureProfile(db, { id: user.id, email: user.email });
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
    ).rejects.toThrow(/known to have/);
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
it("compares a logged RIR nobody labelled, and still reports it as unconfirmed", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    await db.update(setLogs).set({ effortReported: false }).where(eq(setLogs.userId, a.user.id));
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const trend = evidence.exerciseTrends[0];
    // `effortReported` is false by default on every row written before the app recorded the
    // answer, so it says nobody wrote down where the number came from — not that it was
    // copied from the target. The number is the athlete's, and it is compared.
    expect(trend?.effortCoverage.known).toBe(6);
    // The provenance is still reported, so the coach can temper how confident it sounds.
    expect(trend?.effortCoverage.confirmed).toBe(0);
    expect(trend?.latestSets[0]?.rir).toBe(2);
    // The same progression the confirmed history earns, earned by the same numbers. Holding
    // it back taught the athlete that the effort they remember giving did not count.
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
    // Provenance was the only gate lifted. Every limit on the size of the jump still holds.
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, a.output(55, 8), evidence, new Set(a.ids)),
    ).rejects.toThrow(/automatic limit/);
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
    ).rejects.toThrow(/same evidence cannot justify another change/);
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

it("reads a low energy given before the question was retired as a recovery report, and fatigue the same way", async () => {
  // Energy is no longer asked, but check-ins from before then keep it. While one is recent it
  // supports a temporary reduction exactly as it did, and the fatigue that replaced it opens
  // the same gate from the other end of its scale.
  const a = await fixture();
  await a.as(async (db) => {
    const recent = a.ids[0]!;
    const sessionId = recent.slice("workout:".length);
    const acute = async (checkIn: { energy: number | null; fatigue: number | null }) => {
      await db.update(workoutSessions).set(checkIn).where(eq(workoutSessions.id, sessionId));
      const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
      return evidence.acuteEvidenceIds.includes(recent);
    };
    expect(await acute({ energy: 2, fatigue: null })).toBe(true);
    expect(await acute({ energy: null, fatigue: 4 })).toBe(true);
    expect(await acute({ energy: 3, fatigue: 3 })).toBe(false);
    expect(await acute({ energy: null, fatigue: null })).toBe(false);
  });
});

it("uses a recent quoted Tell the coach report for a temporary adjustment, but rejects old or invented reports", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const [note] = await db
      .insert(coachNotes)
      .values({
        userId: a.user.id,
        text: "My knee is sore today.",
        createdAt: new Date(now.getTime() - 3600_000),
      })
      .returning();
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const output = a.output(45, 10, "temporary");
    const cited = new Set([`note:${note!.id}`]);
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, output, evidence, cited),
    ).rejects.toThrow(/temporary reduction needs/);
    output.reportedConstraint = { sourceId: `note:${note!.id}`, text: "My knee is sore today." };
    expect(
      (await assessSessionEvidence(db, a.user.id, a.target, output, evidence, cited))[0],
    ).toMatchObject({ kind: "temporary", before: { load: 50 }, after: { load: 45 } });
    output.reportedConstraint.text = "My back is injured.";
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, output, evidence, cited),
    ).rejects.toThrow(/temporary reduction needs/);
    output.reportedConstraint.text = "My knee is sore today.";
    await db
      .update(coachNotes)
      .set({ createdAt: new Date(now.getTime() - 4 * 86400_000) })
      .where(eq(coachNotes.id, note!.id));
    await expect(
      assessSessionEvidence(db, a.user.id, a.target, output, evidence, cited),
    ).rejects.toThrow(/temporary reduction needs/);
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
      const { id } = await logTestRun(db, a.user.id, {
        startedAt: new Date(now.getTime() - days * 86_400_000),
        distanceMeters: 5000,
        durationSeconds: 1800,
        rpe: 4,
        effortReported: true,
      });
      // The link the backfill leaves on a run that fulfilled a planned run, which is how
      // the evidence still knows which day's prescription this one answers.
      await db
        .update(runningActivityDetails)
        .set({ legacyProgramRunId: planned!.id })
        .where(eq(runningActivityDetails.activityId, id));
      runIds.push(`run:${id}`);
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

/**
 * A worker gets two corrections inside its lease, and a refusal that names one fault at a
 * time spends them on discovery rather than on the fix. A real run lost a session this way:
 * three rejections, three different reasons, budget gone, nothing prepared.
 */
it("names every independent fault in one refusal, not the first one found", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const context = await planningContext(db, a.user.id, { gymId: a.home.id });
    if (context.reason !== null) throw new Error(context.reason);
    const result = coachJobResultSchema.parse({
      outcome: "session",
      adjustment: "normal",
      rationale: "Two exercises, three faults between them.",
      evidence: a.ids.slice(0, 2),
      plan: {
        summary: "Home training",
        exercises: [
          {
            // Two sets where the programme asks for four, at a load far above the baseline.
            slotId: context.exercises[0]!.slotId,
            exerciseSlug: context.exercises[0]!.planned.slug,
            equipmentInstanceId: a.machine.id,
            sets: [1, 2].map(() => ({ weight: 57.5, reps: 12, rir: 2 })),
          },
          {
            // And three where it asks for six.
            slotId: context.exercises[1]!.slotId,
            exerciseSlug: context.exercises[1]!.planned.slug,
            equipmentInstanceId: null,
            sets: [1, 2, 3].map(() => ({ reps: 12, rir: 2 })),
          },
        ],
      },
    });
    if (result.outcome !== "session") throw new Error("Unexpected result");

    const refusal = await assessSessionEvidence(
      db,
      a.user.id,
      a.target,
      result,
      evidence,
      new Set(a.ids.slice(0, 2)),
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(CoachingError);
    const error = refusal as CoachingError;
    expect(error.status).toBe(422);
    // Both exercises are named, and the set count and the load are named separately.
    expect(error.issues.filter((issue) => issue.startsWith("goblet-squat")).length).toBeGreaterThan(
      1,
    );
    expect(error.issues.some((issue) => issue.startsWith("bodyweight-squat"))).toBe(true);
    // `message` stays the first of them, so a reader that only reads that is unchanged.
    expect(error.message).toBe(error.issues[0]);
  });
});

/**
 * A refusal that ends the assessment still carries exactly one issue, so the response for it
 * is the same one every existing reader already handles.
 */
it("carries one issue when one refusal ends the assessment", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const output = a.output(50, 12);
    (output.plan as { memo?: string }).memo = "Not the coach's to write here.";
    const refusal = (await assessSessionEvidence(
      db,
      a.user.id,
      a.target,
      output,
      evidence,
      new Set(a.ids.slice(0, 2)),
    ).catch((error: unknown) => error)) as CoachingError;
    expect(refusal).toBeInstanceOf(CoachingError);
    expect(refusal.issues).toEqual([refusal.message]);
    expect(refusal.message).toMatch(/structured memory patch/);
  });
});

/**
 * A run logged since the cutover answers an occurrence, not a `program_runs` row, and the
 * guardrails still ask which day's prescription it speaks for. The slot of the cycle carries
 * that — never the date, which is a weekday two days of one cycle may share (#57).
 */
it("finds the planned run behind a run logged against a programme occurrence", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const [family] = await db
      .select({ familyId: programs.familyId })
      .from(programs)
      .where(eq(programs.id, a.program.id));
    const [day] = await db
      .select({ dayIndex: programDays.dayIndex, dayOfWeek: programDays.dayOfWeek })
      .from(programDays)
      .where(and(eq(programDays.programId, a.program.id), eq(programDays.dayIndex, 1)));
    const [planned] = await db
      .select()
      .from(programRuns)
      .where(and(eq(programRuns.programId, a.program.id), eq(programRuns.weekIndex, 1)));

    // The lineage registry the materialiser writes; occurrences key on it.
    await db
      .insert(programFamilies)
      .values({ id: family!.familyId, userId: a.user.id })
      .onConflictDoNothing();
    const [occurrence] = await db
      .insert(plannedOccurrences)
      .values({
        userId: a.user.id,
        sport: "running",
        familyId: family!.familyId,
        cycleIndex: 1,
        cycleDayIndex: day!.dayIndex,
        disposition: "pending",
      })
      .returning({ id: plannedOccurrences.id });
    const [version] = await db
      .insert(occurrenceVersions)
      .values({
        occurrenceId: occurrence!.id,
        userId: a.user.id,
        sport: "running",
        scheduledOn: "2026-09-08",
        schedulingZone: "UTC",
      })
      .returning({ id: occurrenceVersions.id });
    await db
      .update(plannedOccurrences)
      .set({ currentRevisionId: version!.id })
      .where(eq(plannedOccurrences.id, occurrence!.id));

    const logged = await logTestRun(db, a.user.id, {
      startedAt: new Date(now.getTime() - 2 * 86_400_000),
      distanceMeters: 5000,
      durationSeconds: 1800,
      rpe: 4,
      effortReported: true,
      origin: plannedOrigin(occurrence!.id, version!.id),
    });

    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    const entry = evidence.running.history.find((run) => run.sourceId === `run:${logged.id}`);
    expect(entry).toMatchObject({
      dayOfWeek: day!.dayOfWeek,
      programRunId: planned!.id,
      effortReported: true,
      rpe: 4,
      mode: "outdoor",
    });
  });
});

/** An ad hoc run answers for no plan, and is offered to none: the old behaviour, kept. */
it("leaves a run that answered for nothing without a planned day", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    const logged = await logTestRun(db, a.user.id, {
      startedAt: new Date(now.getTime() - 2 * 86_400_000),
      distanceMeters: 4000,
      durationSeconds: 1500,
    });
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(
      evidence.running.history.find((run) => run.sourceId === `run:${logged.id}`),
    ).toMatchObject({ dayOfWeek: null, programRunId: null, effortReported: false, rpe: null });
  });
});

type Logged = {
  weight: number;
  reps: number;
  rir: number | null;
  setType?: "warmup" | "working" | "backoff";
};

/**
 * The lower-body warm-up ends in the "first compound ramp" — 40% × 8, 55–60% × 5, 70–75% × 2–3
 * — on the bar the day's first lift uses. The logger starts every row it adds as a working set
 * and asks each one for its reps in reserve, so an athlete who logs that ramp on the squat
 * without switching each row to warm-up leaves three light "working" sets, with an RIR typed
 * into each, in front of the three that are the work.
 */
const RAMP: readonly Logged[] = [
  { weight: 40, reps: 8, rir: 6 },
  { weight: 57.5, reps: 5, rir: 5 },
  { weight: 72.5, reps: 3, rir: 5 },
];
const WORK: readonly Logged[] = [1, 2, 3].map(() => ({ weight: 100, reps: 5, rir: 2 }));
const asWarmups = (sets: readonly Logged[]): Logged[] =>
  sets.map((set) => ({ ...set, rir: null, setType: "warmup" }));

/** Lower A's high-bar squat, 3 × 4–6 at 2–3 RIR, on a barbell at a commercial gym. */
/**
 * `plans[i]`, where given, is the coach's plan session `i` was trained from: its sets, stored
 * as a consumed plan linked to that workout, as starting a planned session leaves it.
 */
async function squatFixture(
  sessions: readonly (readonly Logged[])[],
  plans: readonly (readonly Logged[] | null)[] = [],
) {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@ramp.test`);
  const as = <T>(fn: (db: DbOrTx) => Promise<T>) => withUser(t.db, user.id, fn);
  return as(async (db) => {
    await ensureProfile(db, { id: user.id, email: user.email });
    const [gym] = await db
      .insert(gyms)
      .values({ userId: user.id, slug: "gym", name: "Gym", kind: "gym", isDefault: true })
      .returning();
    const [type] = await db.select().from(equipmentTypes).where(eq(equipmentTypes.slug, "barbell"));
    const [bar] = await db
      .insert(equipmentInstances)
      .values({
        userId: user.id,
        gymId: gym!.id,
        equipmentTypeId: type!.id,
        name: "Barbell",
        resistanceMode: "free_weight",
        unit: "kg",
        loadConvention: "total",
        loadIncrement: 2.5,
      })
      .returning();
    const lowerA = STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!;
    expect(lowerA.exercises[0]).toMatchObject({ exerciseSlug: "high-bar-squat", sets: 3 });
    const program = await createProgramFromBlueprint(
      db,
      user.id,
      programBlueprintSchema.parse({
        ...STRENGTH_AESTHETICS_HYBRID_8WK,
        slug: "ramp",
        weeks: 4,
        days: [{ ...lowerA, dayIndex: 1, dayOfWeek: 2, exercises: [lowerA.exercises[0]!] }],
        runs: [],
      }),
      { startDate: "2026-09-08" },
    );
    const [slot] = await db
      .select({ p: programExercises })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(eq(programDays.programId, program.id));
    const ids: string[] = [];
    for (const [index, sets] of sessions.entries()) {
      const startedAt = new Date(now.getTime() - (1 + index * 3) * 86_400_000);
      const [session] = await db
        .insert(workoutSessions)
        .values({
          userId: user.id,
          gymId: gym!.id,
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
          equipmentInstanceId: bar!.id,
          orderIndex: 1,
        })
        .returning();
      await db.insert(setLogs).values(
        sets.map((set, index) => ({
          userId: user.id,
          workoutExerciseId: exercise!.id,
          setIndex: index + 1,
          setType: set.setType ?? ("working" as const),
          weight: set.weight,
          unit: "kg" as const,
          reps: set.reps,
          rir: set.rir,
          effortReported: true,
        })),
      );
      const planned = plans[index];
      if (planned)
        await db.insert(sessionPlans).values({
          userId: user.id,
          programId: program.id,
          programDayId: slot!.p.programDayId,
          cycleIndex: 1,
          dayIndex: 1,
          gymId: gym!.id,
          status: "consumed",
          trigger: "nightly",
          summary: "Lower A",
          consumedAt: startedAt,
          workoutSessionId: session!.id,
          exercises: [
            {
              slotId: slot!.p.id,
              action: "keep",
              exerciseSlug: "high-bar-squat",
              exerciseId: slot!.p.exerciseId,
              exerciseName: "High-bar barbell squat",
              equipmentInstanceId: bar!.id,
              equipmentInstanceName: "Barbell",
              note: "",
              restSeconds: null,
              supersetGroup: null,
              perSide: null,
              unit: "kg",
              slotLineageId: slot!.p.lineageId,
              sets: planned.map((set) => ({
                setType: set.setType ?? "working",
                weight: set.weight,
                reps: set.reps,
                rir: set.rir,
                durationSeconds: null,
                distanceMeters: null,
              })),
            },
          ],
        });
      ids.push(`workout:${session!.id}`);
    }
    const context = await planningContext(db, user.id, { gymId: gym!.id });
    if (context.reason !== null) throw new Error(context.reason);
    const target = jobTargetSchema.parse({
      programId: program.id,
      gymId: gym!.id,
      cycleIndex: 1,
      dayIndex: 1,
    });
    /** A session plan that writes exactly these sets for the squat. */
    const plan = (sets: readonly Logged[]) => {
      const result = coachJobResultSchema.parse({
        outcome: "session",
        adjustment: "normal",
        rationale: "Hold the squat where the athlete has been working.",
        evidence: ids.slice(0, 2),
        plan: {
          summary: "Lower A",
          exercises: [
            {
              slotId: context.exercises[0]!.slotId,
              exerciseSlug: "high-bar-squat",
              equipmentInstanceId: bar!.id,
              sets: sets.map((set) => ({
                setType: set.setType ?? "working",
                weight: set.weight,
                reps: set.reps,
                rir: set.rir,
              })),
            },
          ],
        },
      });
      if (result.outcome !== "session") throw new Error("Unexpected result");
      return result;
    };
    const assess = async (
      db: DbOrTx,
      sets: readonly Logged[],
      cited: readonly string[] = ids.slice(0, 2),
    ) =>
      assessSessionEvidence(
        db,
        user.id,
        target,
        plan(sets),
        await readCoachingEvidence(db, user.id, program.id, now),
        new Set(cited),
      );
    const refusal = (db: DbOrTx, sets: readonly Logged[], cited?: readonly string[]) =>
      assess(db, sets, cited).then(
        () => null,
        (error: unknown) => {
          if (error instanceof CoachingError) return error;
          throw error;
        },
      );
    return { user, as, gym: gym!, bar: bar!, program, slot: slot!.p, ids, assess, refusal };
  });
}

const SQUAT = "high-bar-squat";

it("reads the warm-up ramp an athlete logged as working sets as the warm-up it was", async () => {
  const a = await squatFixture(Array.from({ length: 6 }, () => [...RAMP, ...WORK]));
  await a.as(async (db) => {
    const trend = (await readCoachingEvidence(db, a.user.id, a.program.id, now)).exerciseTrends[0]!;
    // Read by position, this trend was the 40 kg warm-up: "first working set, 8 reps at 40 kg",
    // a working profile of 40, 57.5 and 72.5 kg, and not one session that completed the range.
    expect(trend.comparison.load).toBe(100);
    expect(trend.observations[0]).toMatchObject({
      load: 100,
      value: 5,
      loadProfile: [100, 100, 100],
      completedMinimum: true,
    });
    expect(trend.repeatedCompletion).toBe(true);
    // The coach is shown what was logged and how it is read, side by side.
    expect(trend.latestSets.map((set) => [set.weight, set.setType, set.loggedAs])).toEqual([
      [40, "warmup", "working"],
      [57.5, "warmup", "working"],
      [72.5, "warmup", "working"],
      [100, "working", undefined],
      [100, "working", undefined],
      [100, "working", undefined],
    ]);

    // The app's own rule reads it the same way: the work is what it progresses, and the ramp
    // is carried into the prefill as it was, like any other warm-up.
    const context = await planningContext(db, a.user.id, { gymId: a.gym.id });
    if (context.reason !== null) throw new Error(context.reason);
    const rule = context.exercises[0]!.rule!;
    expect(rule.reason).toMatch(/add one rep/);
    expect(rule.sets.map((set) => [set.setType, set.weight, set.reps])).toEqual([
      ["warmup", 40, 8],
      ["warmup", 57.5, 5],
      ["warmup", 72.5, 3],
      ["working", 100, 6],
      ["working", 100, 6],
      ["working", 100, 6],
    ]);
    // The history itself is still exactly what was logged.
    expect(context.exercises[0]!.history[0]!.sets[0]).toBe("40×8 @6 RIR");
  });
});

it("holds the load an athlete worked at when they logged the warm-up ramp as working sets", async () => {
  const a = await squatFixture(Array.from({ length: 6 }, () => [...RAMP, ...WORK]));
  await a.as(async (db) => {
    // The three sets at 100 kg are the work, and three sets at 100 kg is what the slot says.
    expect(await a.refusal(db, WORK)).toBeNull();
    expect(await a.assess(db, WORK)).toEqual([]);
    // Written with the ramp in front of it, as warm-ups, the same session holds too.
    expect(await a.refusal(db, [...asWarmups(RAMP), ...WORK])).toBeNull();
    // And the lift can move again: three sessions of 3 × 5 at 2 RIR inside 4–6 earn a rep.
    const oneMore = WORK.map((set) => ({ ...set, reps: 6 }));
    expect(await a.assess(db, oneMore)).toMatchObject([
      { kind: "progression", before: { targets: [5, 5, 5] }, after: { targets: [6, 6, 6] } },
    ]);
  });
});

it("still measures a load change from the work, so an unsupported jump is refused as before", async () => {
  const a = await squatFixture(Array.from({ length: 6 }, () => [...RAMP, ...WORK]));
  await a.as(async (db) => {
    const jump = await a.refusal(
      db,
      WORK.map((set) => ({ ...set, weight: 110 })),
    );
    expect(jump?.issues).toEqual([
      `${SQUAT}: the load change exceeds the automatic limit and needs review.`,
      `${SQUAT}: the change is not supported by repeated comparable performance.`,
    ]);
    // 3 × 5 is inside 4–6 but short of the 6 the conservative rule waits for: no load step yet.
    const step = await a.refusal(
      db,
      WORK.map((set) => ({ ...set, weight: 102.5 })),
    );
    expect(step?.issues).toEqual([
      `${SQUAT}: the change is not supported by repeated comparable performance.`,
    ]);
  });
});

it("reads a ramp followed by fewer working sets than prescribed without being told", async () => {
  // The latest session: the ramp, then two of the three working sets. Counting sets could not
  // tell its 72.5 kg × 3 from the first step of a pyramid; its weight can.
  const a = await squatFixture([
    [...RAMP, ...WORK.slice(0, 2)],
    ...Array.from({ length: 5 }, () => [...RAMP, ...WORK]),
  ]);
  await a.as(async (db) => {
    expect(await a.refusal(db, WORK)).toBeNull();
    // Written with the ramp in front as warm-ups, it holds just the same.
    expect(await a.refusal(db, [...asWarmups(RAMP), ...WORK])).toBeNull();
    // Reading the ramp as a ramp never moves the baseline off the work: 100 kg still anchors.
    const jump = await a.refusal(
      db,
      WORK.map((set) => ({ ...set, weight: 110 })),
    );
    expect(jump?.issues).toContain(
      `${SQUAT}: the load change exceeds the automatic limit and needs review.`,
    );
  });
});

it("keeps a planned pyramid's steps as work, and reads an unplanned one as ramp and top set", async () => {
  const pyramid: Logged[] = [80, 90, 100].map((weight) => ({ weight, reps: 5, rir: 2 }));
  const planned = await squatFixture(
    Array.from({ length: 6 }, () => pyramid),
    Array.from({ length: 6 }, () => pyramid),
  );
  await planned.as(async (db) => {
    expect(await planned.refusal(db, pyramid)).toBeNull();
    const trend = (await readCoachingEvidence(db, planned.user.id, planned.program.id, now))
      .exerciseTrends[0]!;
    expect(trend.observations[0]?.loadProfile).toEqual([80, 90, 100]);
    expect(trend.latestSets.some((set) => set.loggedAs)).toBe(false);
  });

  // The athlete's own pyramid, with no plan behind it: a slot prescribes straight sets, so the
  // work is the top, and the steps below it were getting there.
  const own = await squatFixture(Array.from({ length: 6 }, () => pyramid));
  await own.as(async (db) => {
    const trend = (await readCoachingEvidence(db, own.user.id, own.program.id, now))
      .exerciseTrends[0]!;
    expect(trend.latestSets.map((set) => [set.weight, set.setType, set.loggedAs])).toEqual([
      [80, "warmup", "working"],
      [90, "warmup", "working"],
      [100, "working", undefined],
    ]);
    expect(await own.refusal(db, WORK)).toBeNull();
  });
});

it("reads a set the athlete dropped to after two of the work as a back-off", async () => {
  // Two sets at 100 kg, then a third taken down to 80: two sets of work, not three, so a plan
  // holding 3 × 100 kg is a hold rather than a 25% jump on the third set.
  const dropped = await squatFixture([
    [...WORK.slice(0, 2), { weight: 80, reps: 5, rir: 2 }],
    ...Array.from({ length: 5 }, () => [...WORK]),
  ]);
  await dropped.as(async (db) => expect(await dropped.refusal(db, WORK)).toBeNull());
});

it("reads a back-off after the work as a back-off, and an unplanned lift the same way", async () => {
  const backOff: Logged[] = [...WORK, { weight: 80, reps: 8, rir: 2 }];
  const b = await squatFixture(Array.from({ length: 6 }, () => backOff));
  await b.as(async (db) => {
    expect(await b.refusal(db, WORK)).toBeNull();
    const trend = (await readCoachingEvidence(db, b.user.id, b.program.id, now)).exerciseTrends[0]!;
    expect(trend.observations[0]?.loadProfile).toEqual([100, 100, 100]);
    expect(trend.latestSets.map((set) => [set.weight, set.setType, set.loggedAs])).toEqual([
      [100, "working", undefined],
      [100, "working", undefined],
      [100, "working", undefined],
      [80, "backoff", "working"],
    ]);

    // A lift nothing in the programme prescribes is read the same way.
    const [curl] = await db.select().from(exercises).where(eq(exercises.slug, "barbell-curl"));
    const startedAt = new Date(now.getTime() - 2 * 86_400_000);
    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId: b.user.id,
        gymId: b.gym.id,
        startedAt,
        completedAt: new Date(startedAt.getTime() + 3600_000),
      })
      .returning();
    const [extra] = await db
      .insert(workoutExercises)
      .values({
        userId: b.user.id,
        workoutSessionId: session!.id,
        exerciseId: curl!.id,
        equipmentInstanceId: b.bar.id,
        orderIndex: 1,
      })
      .returning();
    await db.insert(setLogs).values(
      [20, 30, 40, 40, 40].map((weight, index) => ({
        userId: b.user.id,
        workoutExerciseId: extra!.id,
        setIndex: index + 1,
        setType: "working" as const,
        weight,
        unit: "kg" as const,
        reps: 10,
        rir: 2,
        effortReported: true,
      })),
    );
    const unplanned = (
      await readCoachingEvidence(db, b.user.id, b.program.id, now)
    ).exerciseTrends.find((item) => item.exerciseId === curl!.id)!;
    expect(unplanned.lineageId).toBeNull();
    expect(unplanned.comparison.load).toBe(40);
    expect(unplanned.latestSets.filter((set) => set.loggedAs).map((set) => set.weight)).toEqual([
      20, 30,
    ]);
  });
});

/** Every set of one logged session, re-logged with these numbers. */
async function relog(
  db: DbOrTx,
  sourceId: string,
  values: { weight: number; reps: number; rir: number },
) {
  const logged = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutSessionId, sourceId.slice("workout:".length)));
  await db
    .update(setLogs)
    .set(values)
    .where(
      inArray(
        setLogs.workoutExerciseId,
        logged.map((row) => row.id),
      ),
    );
}
const straight = (weight: number, reps: number, rir: number): Logged[] =>
  [1, 2, 3].map(() => ({ weight, reps, rir }));

it("steps the load on one session with a rep to spare, and only on that session (ADR 0039)", async () => {
  // 3 × 6 at 3 RIR at the top of 4–6: 9 in hand against the 8 that 6 at 2 RIR needs.
  const a = await squatFixture([straight(100, 6, 3), ...Array.from({ length: 5 }, () => WORK)]);
  await a.as(async (db) => {
    const step = straight(102.5, 5, 2);
    expect(await a.assess(db, step, [a.ids[0]!])).toMatchObject([
      { kind: "progression", evidenceIds: [a.ids[0]], after: { load: 102.5 } },
    ]);
    // The session that earned it is the one that has to be cited.
    expect((await a.refusal(db, step, [a.ids[1]!, a.ids[2]!]))?.issues).toEqual([
      `${SQUAT}: this change stands on ${a.ids[0]}; cite it, and only evidence new since the last accepted change. The same evidence cannot justify another change.`,
    ]);
  });
});

it("asks a set for the reps it had in hand, on the latest session alone", async () => {
  // 3 × 5 with 3 in reserve: at 2 RIR, that is 6.
  const a = await squatFixture([straight(100, 5, 3)]);
  await a.as(async (db) => {
    expect(await a.assess(db, straight(100, 6, 2), [a.ids[0]!])).toMatchObject([
      { kind: "progression", before: { targets: [5, 5, 5] }, after: { targets: [6, 6, 6] } },
    ]);
  });
  // 5 at exactly 2 RIR had no sixth rep in hand, and one session is not two.
  const b = await squatFixture([straight(100, 5, 2)]);
  await b.as(async (db) => {
    expect((await b.refusal(db, straight(100, 6, 2), [b.ids[0]!]))?.issues).toEqual([
      `${SQUAT}: target changes need repeated comparable evidence and a small step.`,
      `${SQUAT}: cite two new comparable training dates; the same evidence cannot justify another change.`,
    ]);
  });
});

it("goes back to the load before a step that missed the range twice", async () => {
  const missed = straight(102.5, 3, 0);
  const a = await squatFixture([
    missed,
    missed,
    straight(100, 6, 3),
    ...Array.from({ length: 3 }, () => WORK),
  ]);
  await a.as(async (db) => {
    expect(await a.assess(db, straight(100, 6, 2))).toMatchObject([
      {
        kind: "reduction",
        before: { load: 102.5 },
        after: { load: 100 },
        evidenceIds: [a.ids[0], a.ids[1]],
      },
    ]);
    // Anywhere else is still a cut, and a cut needs a confirmed decline.
    expect((await a.refusal(db, straight(97.5, 6, 2)))?.issues).toContain(
      `${SQUAT}: the change is not supported by repeated comparable performance.`,
    );
  });
});

it("goes back a coarse step too, though it is more than the automatic cut", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    // 40 to 45 on these dumbbells is 12.5%, and back again is 11%.
    await relog(db, a.ids[0]!, { weight: 45, reps: 6, rir: 1 });
    await relog(db, a.ids[1]!, { weight: 45, reps: 6, rir: 1 });
    for (const id of a.ids.slice(2)) await relog(db, id, { weight: 40, reps: 12, rir: 3 });
    const evidence = await readCoachingEvidence(db, a.user.id, a.program.id, now);
    expect(evidence.exerciseTrends[0]?.revert?.load).toBe(40);
    expect(
      await assessSessionEvidence(
        db,
        a.user.id,
        a.target,
        a.output(40, 12),
        evidence,
        new Set(a.ids.slice(0, 2)),
      ),
    ).toMatchObject([{ kind: "reduction", before: { load: 45 }, after: { load: 40 } }]);
  });
});

it("compares a plan with what was trained since an accepted change, not with the change's loads", async () => {
  // The coach moved the squat to 100 kg five days ago. The athlete trained it with a rep to
  // spare, the app's rule stepped to 102.5, and they trained that.
  const a = await squatFixture([
    straight(102.5, 5, 2),
    straight(100, 6, 3),
    ...Array.from({ length: 4 }, () => straight(97.5, 6, 2)),
  ]);
  await a.as(async (db) => {
    await db.insert(coachChangeRecords).values({
      userId: a.user.id,
      createdAt: new Date(now.getTime() - 5 * 86_400_000),
      changes: [
        {
          scope: `slot:${a.slot.lineageId}`,
          kind: "progression",
          evidenceIds: [a.ids[2]!],
          unit: "kg",
          exerciseSlug: SQUAT,
          equipmentId: a.bar.id,
          before: { load: 97.5, loads: [0, 1, 2].map((index) => ({ index, load: 97.5 })) },
          after: { load: 100, loads: [0, 1, 2].map((index) => ({ index, load: 100 })) },
        },
      ],
    });
    // Holding 102.5, where they are, is a hold, not a jump from the change's 100.
    expect(await a.refusal(db, straight(102.5, 5, 2))).toBeNull();
  });
});

it("lets two earned steps through the 14-day limit where one is already past 10%", async () => {
  const a = await fixture();
  await a.as(async (db) => {
    // 40 kg for weeks; a rep to spare four days ago stepped to 45; a rep to spare at 45 since.
    for (const id of a.ids.slice(2)) await relog(db, id, { weight: 40, reps: 10, rir: 2 });
    await relog(db, a.ids[1]!, { weight: 40, reps: 12, rir: 4 });
    await relog(db, a.ids[0]!, { weight: 45, reps: 12, rir: 3 });
    const assess = async (load: number) =>
      assessSessionEvidence(
        db,
        a.user.id,
        a.target,
        a.output(load, 10),
        await readCoachingEvidence(db, a.user.id, a.program.id, now),
        new Set(a.ids.slice(0, 1)),
      );
    // 47.5 is one real step from 45, and 40 to 47.5 is two.
    expect(await assess(47.5)).toMatchObject([{ kind: "progression", after: { load: 47.5 } }]);
    // A third inside the fortnight is for review.
    await relog(db, a.ids[0]!, { weight: 47.5, reps: 12, rir: 3 });
    await expect(assess(50)).rejects.toThrow(/over 14 days need review/);
  });
});
