import { and, count, desc, eq, gte, isNotNull, lt, lte, max, ne, sql, sum } from "drizzle-orm";
import {
  coachIntakes,
  coachWeeklyReviews,
  exercises,
  programDrafts,
  activities,
  runningActivityDetails,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { EFFORT } from "@/domain/activity-limits";
import { COACH_POLICY } from "@/domain/coach-policy";
import {
  COACH_TRAINING_REFERENCE,
  COACH_TRAINING_REFERENCE_VERSION,
} from "@/domain/coach-training-reference";
import { ageOn } from "@/lib/units";
import { COACH_CONTRACT_VERSION, coachIntakeSchema } from "@/domain/coaching-workflow";
import { pendingParts } from "@/domain/schedule";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { sharedWarmupProtocols } from "@/server/queries/reference";
import { parseDateRange } from "@/server/validation/date-range";
import { getCoachJob } from "./coaching-jobs";
import { claimRequestsForAttempt, reopenOrphanedRequests } from "./coach-program-requests";
import {
  assertCoachEnabled,
  assertNoOpenWorkout,
  CoachingError,
  getCoachingPreferences,
  sourceRevision,
} from "./coaching-state";
import { getCoachMemo, planningContext } from "./coach-plans";
import { listCoachAttachments } from "./coach-attachments";
import { listGyms } from "./gyms";
import { getSchedule } from "./schedule";
import { readProgramBlueprint } from "./programs";
import {
  readRunActivitiesBetween,
  readRecovery,
  readWorkouts,
  type RunActivity,
} from "./training-data";
import { readWeeklyTrainingVolume } from "./training-volume";
import { readCoachingEvidence } from "./coaching-evidence";

/**
 * A run as the coach's narrative context has always listed one.
 *
 * The retired row's names are kept — `mode`, `rpe`, `effortReported` — because prompts and a
 * memo written against them are still in service. The effort's provenance travels beside them
 * instead of being flattened into the number, so an RPE nobody confirmed still says so and
 * cannot be read as the athlete's own report (LOG-03).
 *
 * The name outlived its scale. `rpe` is out of five since 0033, like every endurance effort
 * and unlike a strength set's, so `effortScale` is stated rather than left to a reader who
 * knows what RPE has always meant. A number half the size of the one a prompt was written
 * against is the kind of thing that reads as an easy week rather than as a changed unit.
 */
function coachRunView(run: RunActivity) {
  return {
    id: run.id,
    startedAt: run.startedAt,
    occurredOn: run.occurredOn,
    mode: run.environment,
    durationSeconds: run.durationSeconds,
    distanceMeters: run.distanceMeters,
    averagePaceSecondsPerKm: run.averagePaceSecondsPerKm,
    rpe: run.effort.value,
    effortScale: { min: EFFORT.min, max: EFFORT.max },
    effortReported: run.effort.status === "reported",
    effortStatus: run.effort.status,
    surface: run.surface,
    notes: run.notes,
    occurrenceId: run.occurrenceId,
    programRunId: run.programRunId,
  };
}

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
    // Whole seconds, as the retired table stored them, from the milliseconds the canonical
    // one does. The interval, the fields and their units are unchanged; only the source is.
    db
      .select({
        count: count(),
        seconds: sum(sql`round(${activities.durationMs} / 1000.0)`),
        meters: sum(runningActivityDetails.distanceMetres),
        longestMeters: max(runningActivityDetails.distanceMetres),
        knownDistances: sql<number>`count(${runningActivityDetails.distanceMetres})`.mapWith(
          Number,
        ),
        knownDurations: sql<number>`count(${activities.durationMs})`.mapWith(Number),
      })
      .from(activities)
      .innerJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.sport, "running"),
          eq(activities.status, "completed"),
          gte(activities.startedAt, start),
          lt(activities.startedAt, end),
        ),
      ),
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
  const evidenceEnd = job.target.reviewEnd
    ? new Date(Math.min(now.getTime(), new Date(job.target.reviewEnd).getTime()))
    : now;
  const today = todayInTimeZone(profile.timeZone, evidenceEnd);
  const range = parseDateRange({ from: addDays(today, -7), to: today }, profile.timeZone);
  range.start = new Date(evidenceEnd.getTime() - 7 * 86_400_000);
  range.end = evidenceEnd;
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
    trainingEvidence,
  ] = await Promise.all([
    listGyms(db, userId),
    listCoachAttachments(db, userId),
    sharedWarmupProtocols(db),
    getCoachMemo(db, userId),
    job.target.programId ? readProgramBlueprint(db, userId, job.target.programId) : null,
    getSchedule(db, userId),
    readWorkouts(db, userId, range, 0, 40),
    // The newest sixty, and whether there were more: what `readRuns` answered here before.
    readRunActivitiesBetween(
      db,
      userId,
      { start: range.start, end: range.end },
      { order: "desc", limit: 61 },
    ).then((rows) => ({ hasMore: rows.length > 60, runs: rows.slice(0, 60).map(coachRunView) })),
    readRecovery(db, userId, range),
    readWeeklyTrainingVolume(db, userId, profile.timeZone, evidenceEnd, 8),
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
    trainingPeriodSummary(
      db,
      userId,
      new Date(evidenceEnd.getTime() - 30 * 86_400_000),
      evidenceEnd,
    ),
    readCoachingEvidence(db, userId, job.target.programId, evidenceEnd),
  ]);
  /**
   * The location this job's lookups default to (ADR 0029).
   *
   * A session preparation names its gym, and a first programme takes the one the athlete
   * confirmed at intake. A weekly review names neither, and the athlete's default active gym
   * answers for them, which is the same gym Today trains them at. The library and the
   * machines are not sent: the coach looks up what it needs, at this location or any other
   * one in `locations`, while it works.
   */
  const targetGymId = job.target.gymId ?? intake?.answers.gymId ?? null;
  const equipmentGymId =
    targetGymId ??
    locations.find((gym) => gym.isActive && gym.isDefault)?.id ??
    locations.find((gym) => gym.isActive && gym.kind === "gym")?.id ??
    null;
  const period =
    job.target.reviewStart && job.target.reviewEnd
      ? await trainingPeriodSummary(
          db,
          userId,
          new Date(job.target.reviewStart),
          new Date(job.target.reviewEnd),
        )
      : null;
  const planning =
    job.kind === "prepare_session"
      ? await planningContext(db, userId, { gymId: targetGymId ?? undefined })
      : null;
  // Each slot already names its machine and its next loads; the library and the gym's
  // machine list are lookups (ADR 0029), not a second copy of what the context left out.
  const nextSession =
    planning && planning.reason === null
      ? (({ library: _library, gym, ...rest }) => ({
          ...rest,
          gym: (({ machines: _machines, ...place }) => place)(gym),
        }))(planning)
      : planning;
  // A proposal the athlete can no longer approve is not an answer, so those asks go back on
  // the list before this attempt is told what it owes an outcome.
  await reopenOrphanedRequests(db, userId, now);
  // Explicit requests are assessed by the scheduled daily work and by nothing else. An
  // on-demand gym change, or a fresh programme, is not the athlete asking for that hearing,
  // and handing it the list would make any tap on Today a trigger for a programme decision.
  const scheduled = job.trigger === "daily" || job.trigger === "weekly";
  const requests = scheduled
    ? await claimRequestsForAttempt(db, userId, job.id, attemptId, today)
    : { items: [], hasMore: false };
  return {
    contractVersion: COACH_CONTRACT_VERSION,
    /**
     * The shared training guidance, supplied once by the server rather than read from a
     * routine's own checkout, so every run coaches from the deployed text.
     */
    trainingReference: {
      version: COACH_TRAINING_REFERENCE_VERSION,
      text: COACH_TRAINING_REFERENCE,
      meaning:
        "General guidance. Server permissions, the policy's numeric limits and this athlete's records outrank it. A broad research range is not an exercise's default target band.",
    },
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
      bodyWeightKg: profile.bodyWeightKg,
      heightCm: profile.heightCm,
      age:
        profile.dateOfBirth === null
          ? null
          : ageOn(profile.dateOfBirth, todayInTimeZone(profile.timeZone, now)),
      sex: profile.sex,
      goal: profile.trainingGoal,
      dataMeaning:
        "Current profile readings. Confirmed intake is the saved programme brief, including its original measurements; use current non-null profile measurements for age, weight and height. Do not invent missing values or silently change the programme goal when the profile goal differs.",
    },
    confirmedIntake: intake
      ? {
          id: intake.id,
          revision: intake.revision,
          confirmedAt: intake.confirmedAt,
          // Parsed, so a question added after these answers were saved reaches the coach as
          // its own empty default rather than as a key that is simply not there.
          answers: coachIntakeSchema.parse(intake.answers),
        }
      : null,
    // A note that has been answered is already memory, or was already declined in writing.
    // Sending it again on every run afterwards is the same fact twice, for good, crowding out
    // the reading the job actually needs. What arrives here is what is still open.
    memo: {
      ...memo,
      notes: {
        pending: memo.notes.pending,
        hasMorePending: memo.notes.hasMorePending,
        training: memo.notes.training,
        meaning:
          "Athlete messages awaiting an answer: pending are from Tell the coach, training are notes written on a finished session or against one exercise. Close every one you read with a disposition; reviewed notes are not sent again.",
      },
    },
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
    /**
     * The location to look things up at: the job's own gym where it names one, the athlete's
     * default otherwise — a weekly review names none, and it still has to know what the
     * athlete can actually train on. Null only when the athlete has no active location.
     */
    equipmentGymId,
    lookups: {
      meaning:
        "The exercise library and each location's machines are not in this context. Look them up while you work, with this job's attempt: `workflow.ts exercises` searches the shared library and the athlete's own exercises by the athlete's own words (and by muscle or pattern), with availability at a location when you pass --gym; `workflow.ts machines --gym` lists a location's machines with their known loads. Search before you ask the athlete what an exercise is called, and before you say one is missing. An empty search means the library has no match, never that the athlete has no exercises.",
      defaultGymId: equipmentGymId,
    },
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
    trainingEvidence,
    recentInterval: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      endExclusive: true,
    },
    recentWorkouts: history,
    recentRuns: running,
    lastThirtyDays: thirtyDayEvidence,
    recovery,
    reviews,
    decisions,
    /**
     * What the athlete asked for and has not had an answer to. Kept apart from the memo on
     * purpose: remembering a preference is not the same as proposing, applying or declining
     * a change, and this job owes every one of these an outcome.
     */
    requestsToAddress: {
      items: requests.items,
      hasMore: requests.hasMore,
      meaning: !scheduled
        ? "This job is not the scheduled daily work, so it decides no explicit request. Anything the athlete has asked for is assessed at the next scheduled daily run."
        : job.kind === "prepare_session"
          ? "Explicit asks already open. A session cannot decide one: open any new ask you find in the athlete's notes and leave the outcome to the programme review in this same daily run."
          : "Explicit asks this attempt must decide. Give each one exactly one decision in requests.decisions, and open any further ask you find in the athlete's notes in requests.open. Anything saved after this snapshot waits for the next daily run.",
    },
    dataMeaning:
      "The intake's recentTraining is the athlete's own account of what they lift, in prose and approximate: treat it as a starting estimate to be corrected from logged sets, never as a completed workout. Reports can be removed and require the job-scoped download endpoint. Narrative history is bounded with hasMore; aggregate intervals cover all saved records. Unknown equipment load conventions and measurements must stay unknown.",
  };
}
