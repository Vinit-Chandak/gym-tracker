import { and, count, desc, eq, gte, isNotNull, lt, lte, max, ne, sql, sum } from "drizzle-orm";
import {
  coachIntakes,
  coachWeeklyReviews,
  equipmentInstances,
  exercises,
  programDrafts,
  runs,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { COACH_POLICY } from "@/domain/coach-policy";
import { COACH_CONTRACT_VERSION } from "@/domain/coaching-workflow";
import { pendingParts } from "@/domain/schedule";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { parseDateRange } from "@/server/validation/date-range";
import { getCoachJob } from "./coaching-jobs";
import {
  assertCoachEnabled,
  assertNoOpenWorkout,
  CoachingError,
  getCoachingPreferences,
  sourceRevision,
} from "./coaching-state";
import { getCoachMemo, libraryAtGym, planningContext } from "./coach-plans";
import { listCoachAttachments } from "./coach-attachments";
import { listGyms } from "./gyms";
import { getSchedule } from "./schedule";
import { readProgramBlueprint } from "./programs";
import { readRuns, readRecovery, readWorkouts } from "./training-data";
import { readWeeklyTrainingVolume } from "./training-volume";

/** Full interval aggregates are independent of the bounded narrative evidence below. */
export async function trainingPeriodSummary(db: DbOrTx, userId: string, start: Date, end: Date) {
  const [lifting, [running], [sessions]] = await Promise.all([
    db
      .select({
        exerciseId: exercises.id,
        slug: exercises.slug,
        primaryMuscles: exercises.primaryMuscles,
        secondaryMuscles: exercises.secondaryMuscles,
        workingSets: count(),
      })
      .from(setLogs)
      .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
      .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
      .where(
        and(
          eq(setLogs.userId, userId),
          eq(workoutSessions.userId, userId),
          eq(workoutExercises.userId, userId),
          gte(workoutSessions.startedAt, start),
          lt(workoutSessions.startedAt, end),
          isNotNull(workoutSessions.completedAt),
          lte(workoutSessions.completedAt, end),
          ne(setLogs.setType, "warmup"),
        ),
      )
      .groupBy(exercises.id),
    db
      .select({
        count: count(),
        seconds: sum(runs.durationSeconds),
        meters: sum(runs.distanceMeters),
        longestMeters: max(runs.distanceMeters),
        knownDistances: sql<number>`count(${runs.distanceMeters})`.mapWith(Number),
        knownDurations: sql<number>`count(${runs.durationSeconds})`.mapWith(Number),
      })
      .from(runs)
      .where(and(eq(runs.userId, userId), gte(runs.startedAt, start), lt(runs.startedAt, end))),
    db
      .select({
        completed:
          sql<number>`count(*) filter (where ${workoutSessions.completedAt} <= ${end.toISOString()})`.mapWith(
            Number,
          ),
        incomplete:
          sql<number>`count(*) filter (where ${workoutSessions.completedAt} is null or ${workoutSessions.completedAt} > ${end.toISOString()})`.mapWith(
            Number,
          ),
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.startedAt, start),
          lt(workoutSessions.startedAt, end),
        ),
      ),
  ]);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    endExclusive: true,
    completedWorkouts: sessions?.completed ?? 0,
    incompleteWorkouts: sessions?.incomplete ?? 0,
    lifting,
    running,
    coverage:
      "All saved records in this interval; missing measurements remain unknown. Only workouts completed by the boundary count as completed work.",
  };
}

export async function coachJobContext(
  db: DbOrTx,
  userId: string,
  id: string,
  attemptId: string,
  now = new Date(),
) {
  const profile = await assertCoachEnabled(db, userId);
  const job = await getCoachJob(db, userId, id);
  if (
    !job ||
    job.status !== "claimed" ||
    job.attemptId !== attemptId ||
    !job.leaseUntil ||
    job.leaseUntil <= now
  )
    throw new CoachingError("Claim this job before reading its context.");
  if (job.sourceRevision !== (await sourceRevision(db, userId)))
    throw new CoachingError("This attempt's evidence changed. Release it and use a fresh claim.");
  await assertNoOpenWorkout(db, userId);
  const [intake] = job.intakeId
    ? await db
        .select()
        .from(coachIntakes)
        .where(and(eq(coachIntakes.id, job.intakeId), eq(coachIntakes.userId, userId)))
    : [];
  const today = todayInTimeZone(profile.timeZone, now);
  const range = parseDateRange({ from: addDays(today, -28), to: today }, profile.timeZone);
  range.end = now;
  const [
    locations,
    attachments,
    warmups,
    memo,
    program,
    schedule,
    history,
    running,
    recovery,
    weeks,
    reviews,
    decisions,
    preferences,
    thirtyDayEvidence,
  ] = await Promise.all([
    listGyms(db, userId),
    listCoachAttachments(db, userId),
    sharedWarmupProtocols(db),
    getCoachMemo(db, userId),
    job.target.programId ? readProgramBlueprint(db, userId, job.target.programId) : null,
    getSchedule(db, userId),
    readWorkouts(db, userId, range, 0, 40),
    readRuns(db, userId, range, 0, 60),
    readRecovery(db, userId, range),
    readWeeklyTrainingVolume(db, userId, profile.timeZone, now, 8),
    db
      .select()
      .from(coachWeeklyReviews)
      .where(eq(coachWeeklyReviews.userId, userId))
      .orderBy(desc(coachWeeklyReviews.periodEnd))
      .limit(8),
    db
      .select({
        id: programDrafts.id,
        status: programDrafts.status,
        name: sql<string>`${programDrafts.blueprint}->>'name'`,
        rationale: programDrafts.rationale,
        createdAt: programDrafts.createdAt,
      })
      .from(programDrafts)
      .where(eq(programDrafts.userId, userId))
      .orderBy(desc(programDrafts.createdAt))
      .limit(20),
    getCoachingPreferences(db, userId),
    trainingPeriodSummary(db, userId, new Date(now.getTime() - 30 * 86_400_000), now),
  ]);
  const gymId = job.target.gymId ?? intake?.answers.gymId ?? null;
  const [catalogue, equipment] = gymId
    ? await Promise.all([
        libraryAtGym(db, userId, gymId),
        db
          .select()
          .from(equipmentInstances)
          .where(
            and(
              eq(equipmentInstances.userId, userId),
              eq(equipmentInstances.gymId, gymId),
              eq(equipmentInstances.isActive, true),
            ),
          ),
      ])
    : [[], []];
  const period =
    job.target.reviewStart && job.target.reviewEnd
      ? await trainingPeriodSummary(
          db,
          userId,
          new Date(job.target.reviewStart),
          new Date(job.target.reviewEnd),
        )
      : null;
  const nextSession =
    job.kind === "prepare_session"
      ? await planningContext(db, userId, { gymId: gymId ?? undefined })
      : null;
  return {
    contractVersion: COACH_CONTRACT_VERSION,
    policy: {
      ...COACH_POLICY,
      rules: COACH_POLICY.rules.filter((rule) =>
        (rule.tasks as readonly string[]).includes(job.kind),
      ),
    },
    job: {
      id: job.id,
      kind: job.kind,
      attemptId,
      target: job.target,
      sourceRevision: job.sourceRevision,
      leaseUntil: job.leaseUntil,
    },
    snapshotAt: now.toISOString(),
    athlete: {
      name: profile.displayName,
      timeZone: profile.timeZone,
      preferredUnit: profile.preferredUnit,
    },
    confirmedIntake: intake
      ? {
          id: intake.id,
          revision: intake.revision,
          confirmedAt: intake.confirmedAt,
          answers: intake.answers,
        }
      : null,
    memo,
    coachingPreferences: preferences
      ? {
          reviewWeekday: preferences.reviewWeekday,
          reviewAnchorAt: preferences.reviewAnchorAt,
          enabledAt: preferences.consentedAt,
        }
      : null,
    attachments:
      job.kind === "create_program"
        ? attachments.filter((file) => intake?.answers.attachmentIds.includes(file.id))
        : attachments,
    locations: locations.filter((g) => g.isActive),
    equipment,
    catalogue,
    warmups,
    program,
    nextSession,
    pendingComponents:
      schedule && job.target.cycleIndex && job.target.dayIndex
        ? pendingParts(schedule.state, {
            cycleIndex: job.target.cycleIndex,
            dayIndex: job.target.dayIndex,
          })
        : null,
    reviewPeriod: period,
    longerTrends: weeks,
    recentWorkouts: history,
    recentRuns: running,
    lastThirtyDays: thirtyDayEvidence,
    recovery,
    reviews,
    decisions,
    dataMeaning:
      "Baselines are self-reports, never completed workouts. Reports can be removed and require the job-scoped download endpoint. Narrative history is bounded with hasMore; aggregate intervals cover all saved records. Unknown equipment load conventions and measurements must stay unknown.",
  };
}
