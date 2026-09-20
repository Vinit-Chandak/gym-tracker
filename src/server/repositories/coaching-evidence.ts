import { createHash } from "node:crypto";
import { and, asc, eq, getTableColumns, gte, isNotNull, isNull, lt, lte } from "drizzle-orm";
import {
  coachChangeRecords,
  coachEvidenceBaselines,
  dailyRecovery,
  equipmentInstances,
  exercises,
  profiles,
  programExercises,
  programDays,
  programRuns,
  runs,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { Prescription } from "@/domain/progression";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  summarizeExerciseEvidence,
  TRAINING_POLICY,
  type EvidencePerformance,
} from "@/domain/training-evidence";
import { existingEvidenceIds } from "./coach-memory";
import { prescriptionFor } from "./progression-rule";

/** One shared, reproducible evidence packet for session preparation and weekly review. */
export async function readCoachingEvidence(
  db: DbOrTx,
  userId: string,
  programId: string | null,
  end = new Date(),
) {
  const start = new Date(end.getTime() - TRAINING_POLICY.trendDays * 86_400_000);
  const [profileRows, rows, slots, references, changes, running, recoveryRows] = await Promise.all([
    db
      .select({ timeZone: profiles.timeZone, preferredUnit: profiles.preferredUnit })
      .from(profiles)
      .where(eq(profiles.id, userId)),
    db
      .select({
        workoutExercise: workoutExercises,
        session: workoutSessions,
        exercise: exercises,
        equipment: equipmentInstances,
        set: setLogs,
        lineageId: programExercises.lineageId,
      })
      .from(workoutExercises)
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
      .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
      .innerJoin(setLogs, eq(setLogs.workoutExerciseId, workoutExercises.id))
      .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
      .leftJoin(
        programExercises,
        eq(programExercises.id, workoutExercises.plannedProgramExerciseId),
      )
      .where(
        and(
          eq(workoutExercises.userId, userId),
          eq(workoutSessions.userId, userId),
          eq(setLogs.userId, userId),
          gte(workoutSessions.startedAt, start),
          lt(workoutSessions.startedAt, end),
          isNotNull(workoutSessions.completedAt),
          lte(workoutSessions.completedAt, end),
          isNull(workoutExercises.skippedAt),
        ),
      )
      .orderBy(asc(workoutSessions.startedAt), asc(setLogs.setIndex)),
    programId
      ? db
          .select({ prescription: programExercises, exercise: exercises })
          .from(programExercises)
          .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
          .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
          .where(and(eq(programDays.userId, userId), eq(programDays.programId, programId)))
      : [],
    db.select().from(coachEvidenceBaselines).where(eq(coachEvidenceBaselines.userId, userId)),
    db
      .select()
      .from(coachChangeRecords)
      .where(and(eq(coachChangeRecords.userId, userId), gte(coachChangeRecords.createdAt, start)))
      .orderBy(asc(coachChangeRecords.createdAt)),
    db
      .select({ ...getTableColumns(runs), dayOfWeek: programRuns.dayOfWeek })
      .from(runs)
      .leftJoin(programRuns, eq(programRuns.id, runs.programRunId))
      .where(and(eq(runs.userId, userId), gte(runs.startedAt, start), lt(runs.startedAt, end)))
      .orderBy(asc(runs.startedAt)),
    db
      .select()
      .from(dailyRecovery)
      .where(
        and(
          eq(dailyRecovery.userId, userId),
          gte(
            dailyRecovery.date,
            new Date(end.getTime() - 4 * 86_400_000).toISOString().slice(0, 10),
          ),
          lte(dailyRecovery.date, new Date(end.getTime() + 86_400_000).toISOString().slice(0, 10)),
        ),
      ),
  ]);
  const timeZone = profileRows[0]?.timeZone ?? "Asia/Kolkata";
  const recovery = recoveryRows.filter(
    (row) =>
      row.date >= todayInTimeZone(timeZone, new Date(end.getTime() - 3 * 86_400_000)) &&
      row.date <= todayInTimeZone(timeZone, end),
  );
  const unit = profileRows[0]?.preferredUnit === "lb" ? ("lb" as const) : ("kg" as const);
  type Group = {
    exerciseId: string;
    slug: string;
    lineageId: string | null;
    equipmentId: string | null;
    prescription: Prescription;
    history: Map<string, EvidencePerformance>;
    convention: string;
  };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const slot = slots.find(
      (s) => s.prescription.lineageId === row.lineageId && s.exercise.id === row.exercise.id,
    );
    const prescription = prescriptionFor(
      slot?.prescription ?? null,
      row.exercise,
      null,
      row.equipment?.loadIncrement ?? row.exercise.defaultLoadIncrement ?? 2.5,
      row.equipment?.unit ?? unit,
    );
    if (!prescription) continue;
    // Keep equipment/setup identities even for portable loads; do not infer band or machine equivalence.
    const key = `${row.lineageId ?? "unplanned"}:${row.exercise.id}:${row.workoutExercise.equipmentInstanceId ?? "none"}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        exerciseId: row.exercise.id,
        slug: row.exercise.slug,
        lineageId: row.lineageId,
        equipmentId: row.workoutExercise.equipmentInstanceId,
        prescription,
        history: new Map(),
        convention: row.equipment?.loadConvention ?? "exercise_log_convention",
      };
      groups.set(key, group);
    }
    let performance = group.history.get(row.workoutExercise.id);
    if (!performance) {
      performance = {
        workoutExerciseId: row.workoutExercise.id,
        workoutSessionId: row.session.id,
        performedAt: row.session.startedAt,
        performedOn: todayInTimeZone(timeZone, row.session.startedAt),
        sets: [],
      };
      group.history.set(row.workoutExercise.id, performance);
    }
    performance.sets = [...performance.sets, row.set];
  }
  const validReferences = await existingEvidenceIds(
    db,
    userId,
    references.flatMap((r) => r.reference.sourceIds),
  );
  const exerciseTrends = [...groups.entries()].map(([identity, group]) => {
    const history = [...group.history.values()];
    const initial = summarizeExerciseEvidence(group.prescription, history);
    const scope = createHash("sha256")
      .update(
        JSON.stringify([
          identity,
          group.convention,
          group.prescription,
          initial.comparison.load === null ? null : Math.round(initial.comparison.load * 20) / 20,
          initial.observations[0]?.loadProfile.map((value) =>
            value === null ? null : Math.round(value * 20) / 20,
          ),
          Math.floor((initial.observations[0]?.effort ?? -10) / 2),
        ]),
      )
      .digest("hex");
    const saved = references.find((r) => r.scope === scope);
    // Edits, deletion and ageing invalidate a reference; never retain an obsolete numeric claim.
    const reference =
      saved &&
      saved.reference.sourceIds.every((id, index) => {
        const point = initial.observations.find((item) => item.sourceId === id);
        if (!point) return false;
        return (
          validReferences.has(id) &&
          point?.value === saved.reference.values[index] &&
          point.validUnit &&
          point.effortPresent &&
          point.load === initial.comparison.load &&
          JSON.stringify(point.loadProfile) ===
            JSON.stringify(initial.observations[0]?.loadProfile) &&
          point.effort !== null &&
          initial.observations[0]?.effort != null &&
          Math.abs(point.effort - initial.observations[0].effort) <= 1
        );
      })
        ? saved.reference
        : null;
    return {
      scope,
      exerciseId: group.exerciseId,
      slug: group.slug,
      lineageId: group.lineageId,
      equipmentId: group.equipmentId,
      convention: group.convention,
      ...summarizeExerciseEvidence(group.prescription, history, reference),
    };
  });
  const thirtyDayRuns = running.filter(
    (run) => run.startedAt.getTime() >= end.getTime() - 30 * 86_400_000,
  );
  const sevenDayRuns = running.filter(
    (run) => run.startedAt.getTime() >= end.getTime() - 7 * 86_400_000,
  );
  const hasReadinessReason = (record: {
    fatigue: number | null;
    energy: number | null;
    sleepHours: number | null;
  }) =>
    (record.fatigue ?? 0) >= 4 ||
    (record.energy !== null && record.energy <= 2) ||
    (record.sleepHours !== null && record.sleepHours < 6);
  const acuteEvidenceIds = [
    ...new Set([
      ...rows
        .filter(
          ({ session }) =>
            session.startedAt.getTime() >= end.getTime() - 3 * 86_400_000 &&
            hasReadinessReason(session),
        )
        .map(({ session }) => `workout:${session.id}`),
      ...recovery.filter(hasReadinessReason).map((record) => `recovery:${record.id}`),
    ]),
  ];
  return {
    policy: TRAINING_POLICY,
    start: start.toISOString(),
    end: end.toISOString(),
    endExclusive: true,
    exerciseTrends,
    acuteEvidenceIds,
    changes,
    running: {
      longestDistance30Days: thirtyDayRuns.length
        ? Math.max(...thirtyDayRuns.map((run) => run.distanceMeters))
        : null,
      sevenDayDistance: sevenDayRuns.reduce((sum, run) => sum + run.distanceMeters, 0),
      sevenDayDuration: sevenDayRuns.reduce((sum, run) => sum + run.durationSeconds, 0),
      history: running.map((run) => ({
        sourceId: `run:${run.id}`,
        date: todayInTimeZone(timeZone, run.startedAt),
        startedAt: run.startedAt.toISOString(),
        distance: run.distanceMeters,
        duration: run.durationSeconds,
        rpe: run.rpe,
        effortReported: run.effortReported,
        mode: run.mode,
        programRunId: run.programRunId,
        dayOfWeek: run.dayOfWeek,
        notes: run.notes,
      })),
    },
    evidenceIds: [
      ...new Set([
        ...exerciseTrends.flatMap((trend) =>
          trend.observations.flatMap((point) => [point.sourceId, point.exerciseSourceId]),
        ),
        ...running.map((run) => `run:${run.id}`),
        ...recovery.map((record) => `recovery:${record.id}`),
      ]),
    ],
  };
}

export type CoachingEvidence = Awaited<ReturnType<typeof readCoachingEvidence>>;

export async function retainEvidenceBaselines(
  db: DbOrTx,
  userId: string,
  evidence: CoachingEvidence,
) {
  for (const trend of evidence.exerciseTrends) {
    if (!trend.reference) continue;
    const [saved] = await db
      .select()
      .from(coachEvidenceBaselines)
      .where(
        and(
          eq(coachEvidenceBaselines.userId, userId),
          eq(coachEvidenceBaselines.scope, trend.scope),
        ),
      );
    if (saved && JSON.stringify(saved.reference) === JSON.stringify(trend.reference)) continue;
    await db
      .insert(coachEvidenceBaselines)
      .values({ userId, scope: trend.scope, reference: trend.reference })
      .onConflictDoUpdate({
        target: [coachEvidenceBaselines.userId, coachEvidenceBaselines.scope],
        set: { reference: trend.reference },
      });
  }
}
