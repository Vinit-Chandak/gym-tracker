import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  notExists,
  notInArray,
  notLike,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  coachGymIntents,
  coachChangeRecords,
  coachIntakes,
  coachJobs,
  coachPreferences,
  coachWeeklyReviews,
  gyms,
  profiles,
  programDrafts,
  programDays,
  plannedOccurrences,
  occurrenceVersions,
  activities,
  programs,
  runs,
  sessionPlans,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import {
  COACH_CONTRACT_VERSION,
  JOB_LEASE_MS,
  MAX_JOB_ATTEMPTS,
  coachJobResultSchema,
  jobTargetSchema,
  type JobTarget,
} from "@/domain/coaching-workflow";
import {
  assessWeeklyEvidence,
  assessSessionEvidence,
  validateCitedEvidence,
} from "./coaching-guardrails";
import { readCoachingEvidence, retainEvidenceBaselines } from "./coaching-evidence";
import { updateCoachMemory } from "./coach-memory";
import { applyRequestPatch, hasActionableRequests } from "./coach-program-requests";
import { expireCoachDiagnostics, recordAttemptDiagnostics } from "./coach-diagnostics";
import type { CoachingChangeRecord } from "@/db/schema";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { lastCoachBoundary, reviewStanding, weeklyReviewPeriod } from "@/domain/coach-cadence";
import { diffOperationIds, diffPrograms } from "@/domain/program-diff";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { sharedExercises } from "@/server/queries/reference";
import { nextTrainingSlot, planningGym, storeOccurrencePlan, storePlan } from "./coach-plans";
import { openOccurrencesBetween } from "./program-occurrences";
import {
  assertCoachEnabled,
  assertNoOpenWorkout,
  CoachingError,
  getCoachingPreferences,
  sourceRevision,
} from "./coaching-state";
import { getActiveProgram, getSchedule } from "./schedule";
import { readProgramBlueprint } from "./programs";
import {
  activateProgramDraft,
  validateBlueprintForAthlete,
  validateOpeningPlan,
} from "./program-drafts";
import { fromDateTimeLocal } from "@/lib/time";
import { coachRollout } from "@/lib/coach-rollout";
import type { ActivitySport } from "@/domain/activity";
import { coverageProblems, type SportCoverage } from "@/domain/coach-sport-policy";

export type CoachJob = typeof coachJobs.$inferSelect;
const pending = ["queued", "claimed"] as const;

export async function getCoachJob(db: DbOrTx, userId: string, id: string) {
  const [job] = await db
    .select()
    .from(coachJobs)
    .where(and(eq(coachJobs.userId, userId), eq(coachJobs.id, id)));
  return job ?? null;
}
export async function listCoachJobs(db: DbOrTx, userId: string, limit = 12) {
  await reconcileCoachJobs(db, userId);
  return db
    .select()
    .from(coachJobs)
    .where(eq(coachJobs.userId, userId))
    .orderBy(desc(coachJobs.createdAt))
    .limit(limit);
}
export async function enqueueCoachJob(
  db: DbOrTx,
  userId: string,
  input: {
    kind: CoachJob["kind"];
    trigger: CoachJob["trigger"];
    dedupeKey: string;
    intakeId?: string | null;
    target: Partial<JobTarget>;
  },
) {
  const target = jobTargetSchema.parse(input.target);
  const [inserted] = await db
    .insert(coachJobs)
    .values({ userId, ...input, target })
    .onConflictDoNothing({ target: [coachJobs.userId, coachJobs.dedupeKey] })
    .returning();
  if (inserted) return { job: inserted, created: true };
  const [existing] = await db
    .select()
    .from(coachJobs)
    .where(and(eq(coachJobs.userId, userId), eq(coachJobs.dedupeKey, input.dedupeKey)));
  if (!existing) throw new CoachingError("The coach request could not be saved.", 503);
  return { job: existing, created: false };
}

export async function requestProgramCreation(
  db: DbOrTx,
  userId: string,
  intakeId: string,
  requestKey: string,
) {
  if (!coachRollout().generation)
    throw new CoachingError(
      "Programme generation is temporarily paused. Your answers and drafts are saved.",
      503,
    );
  const profile = await assertCoachEnabled(db, userId);
  await assertNoOpenWorkout(db, userId);
  const preference = await getCoachingPreferences(db, userId);
  const [intake] = await db
    .select()
    .from(coachIntakes)
    .where(and(eq(coachIntakes.id, intakeId), eq(coachIntakes.userId, userId)));
  if (!intake?.confirmedAt || preference?.intakeId !== intake.id)
    throw new CoachingError("Confirm your latest coaching answers first.");
  const [current] = await db
    .select()
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "create_program"),
        eq(coachJobs.intakeId, intakeId),
        inArray(coachJobs.status, [...pending]),
      ),
    )
    .limit(1);
  if (current) return { job: current, created: false };
  const duplicate = await db
    .select()
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.dedupeKey, `create:${intake.id}:${requestKey}`),
      ),
    )
    .limit(1);
  if (duplicate[0]) return { job: duplicate[0], created: false };
  await assertCoachRequestAllowance(db, userId, profile.timeZone);
  const active = await getActiveProgram(db, userId);
  return enqueueCoachJob(db, userId, {
    kind: "create_program",
    trigger: active ? "replacement" : "onboarding",
    dedupeKey: `create:${intake.id}:${requestKey}`,
    intakeId,
    target: { programId: active?.id ?? null, gymId: intake.answers.gymId },
  });
}

export async function reconcileCoachJobs(db: DbOrTx, userId: string, now = new Date()) {
  const expired = await db
    .select()
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.status, "claimed"),
        lte(coachJobs.leaseUntil, now),
      ),
    );
  for (const job of expired)
    await db
      .update(coachJobs)
      .set({
        status: job.attempts < MAX_JOB_ATTEMPTS ? "queued" : "failed",
        leaseUntil: null,
        nextAttemptAt: new Date(now.getTime() + 60_000),
        error:
          job.attempts < MAX_JOB_ATTEMPTS
            ? "The coach timed out. This request is saved for another attempt."
            : "The coach could not finish after three attempts. Your answers are saved; you can retry.",
        completedAt: job.attempts < MAX_JOB_ATTEMPTS ? null : now,
      })
      .where(
        and(
          eq(coachJobs.id, job.id),
          eq(coachJobs.status, "claimed"),
          eq(coachJobs.attemptId, job.attemptId!),
        ),
      );
}

export async function claimCoachJob(db: DbOrTx, userId: string, id: string, now = new Date()) {
  await assertCoachEnabled(db, userId);
  await reconcileCoachJobs(db, userId, now);
  const job = await getCoachJob(db, userId, id);
  if (!job || job.status !== "queued" || job.nextAttemptAt > now) return null;
  if (job.attempts >= MAX_JOB_ATTEMPTS) return null;
  const [otherClaim] = await db
    .select({ id: coachJobs.id })
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.status, "claimed"),
        gt(coachJobs.leaseUntil, now),
      ),
    )
    .limit(1);
  if (otherClaim) return null;
  if (job.kind === "prepare_session") {
    const [review] = await db
      .select({ id: coachJobs.id })
      .from(coachJobs)
      .where(
        and(
          eq(coachJobs.userId, userId),
          eq(coachJobs.kind, "review_program"),
          inArray(coachJobs.status, ["queued", "claimed"]),
        ),
      )
      .limit(1);
    if (review) return null;
  }
  const [open] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt)))
    .limit(1);
  if (open) {
    await db
      .update(coachJobs)
      .set({
        nextAttemptAt: new Date(now.getTime() + 60 * 60_000),
        error: "Waiting for the open workout to finish.",
      })
      .where(eq(coachJobs.id, id));
    return null;
  }
  const mismatch = await targetMismatch(db, userId, job);
  if (mismatch) {
    await supersedeJob(db, job, mismatch, now);
    return null;
  }
  const [claimed] = await db
    .update(coachJobs)
    .set({
      status: "claimed",
      attemptId: crypto.randomUUID(),
      attempts: job.attempts + 1,
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
      sourceRevision: await sourceRevision(db, userId),
      error: null,
    })
    .where(and(eq(coachJobs.id, id), eq(coachJobs.userId, userId), eq(coachJobs.status, "queued")))
    .returning();
  return claimed ?? null;
}

export async function supersedeJob(db: DbOrTx, job: CoachJob, reason: string, now = new Date()) {
  await db
    .update(coachJobs)
    .set({ status: "superseded", error: reason, completedAt: now, leaseUntil: null })
    .where(
      and(
        eq(coachJobs.id, job.id),
        eq(coachJobs.userId, job.userId),
        inArray(coachJobs.status, [...pending]),
      ),
    );
}

async function targetMismatch(db: DbOrTx, userId: string, job: CoachJob): Promise<string | null> {
  const active = await getActiveProgram(db, userId);
  if ((active?.id ?? null) !== job.target.programId)
    return "Your programme changed while this request was waiting.";
  const preferences = await getCoachingPreferences(db, userId);
  if (job.intakeId && job.intakeId !== preferences?.intakeId)
    return "Your confirmed answers changed.";
  if (job.kind !== "prepare_session") return null;
  // An occurrence job answers for one identity, so what could have changed under it is that
  // identity's own state: a newer revision, a log, a skip, a cancellation (COACH-08).
  if (job.target.occurrenceId) {
    const [occurrence] = await db
      .select({
        disposition: plannedOccurrences.disposition,
        currentRevisionId: plannedOccurrences.currentRevisionId,
        activityId: activities.id,
      })
      .from(plannedOccurrences)
      .leftJoin(
        activities,
        and(
          eq(activities.occurrenceId, plannedOccurrences.id),
          eq(activities.userId, plannedOccurrences.userId),
        ),
      )
      .where(
        and(
          eq(plannedOccurrences.userId, userId),
          eq(plannedOccurrences.id, job.target.occurrenceId),
        ),
      )
      .limit(1);
    if (!occurrence) return "That scheduled session no longer exists.";
    if (occurrence.activityId) return "That session has already been logged.";
    if (occurrence.disposition !== "pending") return "That session is no longer outstanding.";
    if (occurrence.currentRevisionId !== job.target.occurrenceRevisionId)
      return "That session changed while this request was waiting.";
    return null;
  }
  const schedule = await getSchedule(db, userId);
  const slot = schedule ? nextTrainingSlot(schedule) : null;
  if (!slot || slot.cycleIndex !== job.target.cycleIndex || slot.dayIndex !== job.target.dayIndex)
    return "This training day is no longer next in your programme.";
  const target = await sessionTarget(db, userId, job.target.batchDate);
  if (!target || target.gymId !== job.target.gymId || target.intentId !== job.target.intentId)
    return "Your selected gym changed. The newer request takes priority.";
  return null;
}

export async function acceptCoachJobResult(
  db: DbOrTx,
  userId: string,
  id: string,
  attemptId: string,
  raw: unknown,
  now = new Date(),
) {
  const result = coachJobResultSchema.parse(raw);
  const digest = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  const job = await getCoachJob(db, userId, id);
  if (!job) throw new CoachingError("Coach request not found.", 404);
  if (job.attemptId !== attemptId) throw new CoachingError("This is not the current attempt.");
  if (["succeeded", "needs_input"].includes(job.status) && job.resultDigest === digest)
    return { accepted: true, duplicate: true };
  if (job.status !== "claimed" || !job.leaseUntil || job.leaseUntil <= now) {
    await reconcileCoachJobs(db, userId, now);
    return { accepted: false, reason: "The request is no longer claimed by this attempt." };
  }
  const athlete = await assertCoachEnabled(db, userId);
  const athleteToday = todayInTimeZone(athlete.timeZone ?? "UTC", now);
  const stale =
    job.sourceRevision !== (await sourceRevision(db, userId))
      ? "Your training inputs changed while the coach was working."
      : await targetMismatch(db, userId, job);
  if (stale) {
    await supersedeJob(db, job, stale, now);
    return { accepted: false, reason: stale };
  }
  await assertNoOpenWorkout(db, userId);
  if (result.outcome === "deferred") {
    await db
      .update(coachJobs)
      .set({
        status: job.attempts < MAX_JOB_ATTEMPTS ? "queued" : "failed",
        completedAt: job.attempts < MAX_JOB_ATTEMPTS ? null : now,
        leaseUntil: null,
        error: result.reason,
        nextAttemptAt: new Date(now.getTime() + 60 * 60_000),
      })
      .where(eq(coachJobs.id, id));
    await recordAttemptDiagnostics(
      db,
      userId,
      {
        jobId: job.id,
        attemptId,
        kind: job.kind,
        outcome: "deferred",
        diagnostics: { attempt: job.attempts },
        error: result.reason,
      },
      now,
    );
    return { accepted: true, deferred: true };
  }
  if (job.kind === "create_program" && !["program", "needs_input"].includes(result.outcome))
    throw new CoachingError("Programme creation needs a draft or clarification questions.", 422);
  if (job.kind === "prepare_session" && result.outcome === "program")
    throw new CoachingError("Session preparation cannot replace a programme.", 422);
  if (job.kind === "review_program" && result.outcome === "session")
    throw new CoachingError("Submit the weekly review before session preparation.", 422);
  let draftId: string | null = null;
  const evidenceEnd = job.target.reviewEnd
    ? new Date(Math.min(now.getTime(), new Date(job.target.reviewEnd).getTime()))
    : now;
  const trainingEvidence = await readCoachingEvidence(
    db,
    userId,
    job.target.programId,
    evidenceEnd,
  );
  const cited = await validateCitedEvidence(db, userId, result);
  let acceptedChanges: CoachingChangeRecord[] = [];
  let programBefore: ProgramBlueprint | null = null;
  let reviewOutcome: "no_change" | "automatic" | "proposal" = "no_change";
  // A deferral returned above without reaching here, so every remaining outcome carries one.
  const requestPatch = result.requests;
  /**
   * A change the athlete asked for is theirs to approve, whatever the numeric limits allow.
   * Assessment timing does not authorise application: the confirmed decision is that an
   * explicit request produces a proposal, and only approval activates it.
   */
  const proposesRequest = (requestPatch?.decisions ?? []).some(
    (decision) => decision.state === "proposed",
  );
  /** Operation IDs of the actual blueprint difference, so a claimed change can be checked. */
  let changeOperationIds: Set<string> | null = null;
  if (result.outcome === "program") {
    const blueprint = await validateBlueprintForAthlete(
      db,
      userId,
      result.blueprint,
      job.kind === "create_program" ? job.target.gymId : null,
    );
    if (job.kind === "create_program" && !result.openingPlan)
      throw new CoachingError(
        "A new programme needs its opening session, including calibration guidance for unknown loads.",
        422,
      );
    if (job.kind === "create_program")
      await validateOpeningPlan(db, userId, blueprint, result.openingPlan, job.target.gymId);
    if (job.kind === "create_program" && job.intakeId) {
      const [intake] = await db
        .select()
        .from(coachIntakes)
        .where(and(eq(coachIntakes.id, job.intakeId), eq(coachIntakes.userId, userId)));
      if (!intake) throw new CoachingError("Your confirmed answers are unavailable.", 422);
      // Sessions and runs are counted separately, against the answers the athlete gave for
      // each. Counting a run as a session made an athlete who lifts four days and runs on two
      // rest days impossible to program for: the runs had to be folded into the lifting days
      // to pass, which lengthened exactly the days whose time the athlete had agreed.
      const { sessionsPerWeek, preferredDays, runsPerWeek, preferredRunDays } = intake.answers;
      const liftingDays = blueprint.days.filter((day) => day.includesLifting);
      const runDays = blueprint.days.filter((day) => day.includesRun);
      if (
        liftingDays.length !== sessionsPerWeek ||
        (preferredDays.length && liftingDays.some((day) => !preferredDays.includes(day.dayOfWeek)))
      )
        throw new CoachingError(
          "The programme must match your confirmed training frequency and preferred days. Ask for clarification if those constraints cannot be met.",
          422,
        );
      if (
        (runsPerWeek !== null && runDays.length !== runsPerWeek) ||
        (preferredRunDays.length &&
          runDays.some((day) => !preferredRunDays.includes(day.dayOfWeek)))
      )
        throw new CoachingError(
          "The running must match the runs a week and run days you confirmed. Ask for clarification if those cannot be met.",
          422,
        );
      const trainingDays = blueprint.days.filter((day) => day.includesLifting || day.includesRun);
      if (new Set(trainingDays.map((day) => day.dayOfWeek)).size !== trainingDays.length)
        throw new CoachingError("Use a distinct weekday for each confirmed training day.", 422);
    }
    const [draft] = await db
      .insert(programDrafts)
      .values({
        userId,
        source: job.kind === "review_program" ? "weekly" : "ai",
        status: "ready",
        blueprint,
        openingPlan: job.kind === "create_program" ? result.openingPlan : null,
        jobId: job.id,
        intakeId: job.intakeId,
        baseProgramId: job.target.programId,
        sourceRevision: job.sourceRevision!,
        headline: result.headline,
        rationale: result.rationale,
        uncertainties: result.uncertainties,
      })
      .returning();
    draftId = draft!.id;
    if (job.kind === "review_program" && job.target.programId) {
      const current = await readProgramBlueprint(db, userId, job.target.programId);
      if (!current) throw new CoachingError("The reviewed programme is no longer available.");
      const assessment = assessWeeklyEvidence(
        current.blueprint,
        blueprint,
        trainingEvidence,
        cited,
        await sharedExercises(db),
        now,
      );
      changeOperationIds = diffOperationIds(diffPrograms(current.blueprint, blueprint));
      if (assessment.authority === "unchanged") {
        await db
          .update(programDrafts)
          .set({ status: "superseded" })
          .where(eq(programDrafts.id, draftId));
      } else if (
        assessment.automatic &&
        coachRollout().automaticReviews &&
        !proposesRequest &&
        job.target.purpose !== "requests"
      ) {
        // The athlete's own today, not the owner's: a review activated for someone in Los
        // Angeles was being started on India's date, which is most of a day ahead of theirs.
        const [athlete] = await db
          .select({ timeZone: profiles.timeZone })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1);
        await activateProgramDraft(db, userId, draftId, {
          expectedRevision: draft!.revision,
          startDate: todayInTimeZone(athlete?.timeZone ?? "UTC", now),
          transition: "continue",
          automatic: true,
        });
        reviewOutcome = "automatic";
        acceptedChanges = assessment.changes;
        programBefore = current.blueprint;
      } else {
        reviewOutcome = "proposal";
        // The coach's caveats and the server's gate are two different statements, and they
        // are kept in two different columns. Merged, "a new slot needs review" — emitted once
        // per added slot — read to the athlete as the coach doubting its own proposal.
        await db
          .update(programDrafts)
          .set({
            gateReasons: [...new Set(assessment.reasons)]
              .slice(0, 20)
              .map((text) => text.slice(0, 500)),
          })
          .where(eq(programDrafts.id, draftId));
      }
    }
  }
  if (result.outcome === "session" && job.target.occurrenceId) {
    // An occurrence preparation answers for exactly one target, and may not reach past it:
    // no other occurrence, no strength slot, no weekly structure (§8.2).
    if (!job.target.occurrenceRevisionId)
      throw new CoachingError("The occurrence target is missing its revision.", 422);
    if (result.plan.exercises.length > 0 || result.plan.run !== null)
      throw new CoachingError(
        "An endurance preparation carries its own session and nothing else.",
        422,
      );
    if (result.plan.endurance.length !== 1)
      throw new CoachingError("Prepare exactly the occurrence this job was claimed for.", 422);
    await storeOccurrencePlan(
      db,
      userId,
      {
        occurrenceId: job.target.occurrenceId,
        occurrenceRevisionId: job.target.occurrenceRevisionId,
        trigger: job.trigger === "gym" ? "replan" : "nightly",
        routineSessionUrl: job.routineSessionUrl,
        entry: result.plan.endurance[0],
        memo: result.plan.memo,
      },
      now,
    );
  } else if (result.outcome === "session") {
    if (!job.target.cycleIndex || !job.target.dayIndex || !job.target.gymId)
      throw new CoachingError("The session target is incomplete.", 422);
    if (result.plan.endurance.length > 0)
      throw new CoachingError(
        "A strength preparation cannot prepare an endurance occurrence; those are their own jobs.",
        422,
      );
    acceptedChanges = await assessSessionEvidence(
      db,
      userId,
      job.target,
      result,
      trainingEvidence,
      cited,
    );
    await storePlan(db, userId, {
      slot: { cycleIndex: job.target.cycleIndex, dayIndex: job.target.dayIndex },
      gymId: job.target.gymId,
      trigger: job.trigger === "gym" ? "replan" : "nightly",
      plan: result.plan,
      routineSessionUrl: job.routineSessionUrl,
      strict: true,
    });
  }
  if (result.outcome === "no_change" && job.kind === "prepare_session") {
    const [existing] = job.target.occurrenceId
      ? await db
          .select({ id: sessionPlans.id })
          .from(sessionPlans)
          .where(
            and(
              eq(sessionPlans.userId, userId),
              eq(sessionPlans.occurrenceId, job.target.occurrenceId),
              eq(sessionPlans.occurrenceRevisionId, job.target.occurrenceRevisionId!),
              eq(sessionPlans.status, "active"),
            ),
          )
          .limit(1)
      : await db
          .select({ id: sessionPlans.id })
          .from(sessionPlans)
          .where(
            and(
              eq(sessionPlans.userId, userId),
              eq(sessionPlans.programId, job.target.programId!),
              eq(sessionPlans.cycleIndex, job.target.cycleIndex!),
              eq(sessionPlans.dayIndex, job.target.dayIndex!),
              eq(sessionPlans.gymId, job.target.gymId!),
              eq(sessionPlans.status, "active"),
            ),
          )
          .limit(1);
    if (!existing)
      throw new CoachingError("There is no prepared session to keep. Submit a session plan.", 422);
  }
  // Before the review below closes out any outstanding request: a review that reads a note and
  // still cannot grant it must not queue itself again, or it would run every night from then on.
  if (result.memory) await updateCoachMemory(db, userId, result.memory, "coach", now);
  /**
   * Every ask this attempt was handed gets an outcome, or the result is refused.
   *
   * This is the step that makes the difference between a note being read and a request being
   * answered. A decision that claims to have proposed a change has to name operations the
   * revised blueprint actually contains, so "I added the curls" cannot stand in for adding
   * them, and a session plan cannot close a programme request at all.
   */
  const requests = await applyRequestPatch(db, userId, {
    jobId: job.id,
    attemptId,
    kind: job.kind,
    patch: requestPatch ?? {},
    changeOperationIds,
    draftId: reviewOutcome === "proposal" ? draftId : null,
    now,
    today: athleteToday,
  });
  if (job.kind === "review_program" && result.outcome !== "needs_input") {
    if (!job.target.reviewStart || !job.target.reviewEnd)
      throw new CoachingError("The review period is missing.", 422);
    await assertSportCoverage(db, userId, job, result.coverage ?? []);
    await db.insert(coachWeeklyReviews).values({
      userId,
      jobId: job.id,
      periodStart: new Date(job.target.reviewStart),
      periodEnd: new Date(job.target.reviewEnd),
      outcome: reviewOutcome,
      rationale: result.rationale,
      draftId,
    });
    await db
      .update(coachPreferences)
      .set({
        // A run that only answered the athlete's requests has not read the training week the
        // scheduled review owes them, so it does not consume it: the anchor stays where it
        // was and the ordinary review still reads every day since the last one.
        ...(job.target.purpose === "requests"
          ? {}
          : { reviewAnchorAt: new Date(job.target.reviewEnd) }),
        // Cleared only when nothing is still waiting. An ask saved after this attempt's
        // snapshot keeps the flag up, so it is heard at the next daily run instead of being
        // closed by a review that never saw it.
        ...(requests.remaining === 0 ? { reviewRequestedAt: null } : {}),
      })
      .where(eq(coachPreferences.userId, userId));
    await enqueueDailySession(db, userId, job.target.batchDate ?? lastCoachBoundary(now).date);
  }
  if (job.kind === "review_program" && result.outcome === "needs_input")
    await enqueueDailySession(db, userId, job.target.batchDate ?? lastCoachBoundary(now).date);
  // A session job can find an ask but cannot decide it. The review that can is enqueued for
  // this same batch, so the run draining the queue handles both rather than the athlete
  // waiting a second night for a handover between two of the coach's own jobs. Only the
  // scheduled daily job does this: an on-demand gym change is not a request for a hearing.
  if (job.kind === "prepare_session" && job.trigger === "daily" && requests.remaining > 0)
    await enqueueRequestReview(db, userId, now);
  await retainEvidenceBaselines(db, userId, trainingEvidence);
  if (acceptedChanges.length)
    await db
      .insert(coachChangeRecords)
      .values({ userId, jobId: job.id, changes: acceptedChanges, programBefore, createdAt: now });
  if (draftId && (job.kind === "create_program" || reviewOutcome === "proposal"))
    await db
      .update(programDrafts)
      .set({ sourceRevision: await sourceRevision(db, userId) })
      .where(eq(programDrafts.id, draftId));
  await db
    .update(coachJobs)
    .set({
      status: result.outcome === "needs_input" ? "needs_input" : "succeeded",
      result,
      resultDigest: digest,
      completedAt: now,
      leaseUntil: null,
    })
    .where(eq(coachJobs.id, id));
  await recordAttemptDiagnostics(
    db,
    userId,
    {
      jobId: job.id,
      attemptId,
      kind: job.kind,
      outcome: result.outcome,
      diagnostics: {
        attempt: job.attempts,
        reviewOutcome,
        requestsOpened: requests.opened,
        requestsDecided: requests.decided,
        requestsRemaining: requests.remaining,
        changeOperations: changeOperationIds?.size ?? 0,
        acceptedChanges: acceptedChanges.length,
      },
    },
    now,
  );
  return { accepted: true, draftId, contractVersion: COACH_CONTRACT_VERSION };
}

/**
 * Which sports this programme actually includes, from the programme itself.
 *
 * Read from the programme rather than from the athlete's sport preferences, because a
 * shortcut turned off on the profile does not remove a sport from a programme they agreed to
 * — and a review that quietly stopped covering it would be the switch deciding their
 * training (SPORT-01, COACH-03).
 */
export async function programmeSports(
  db: DbOrTx,
  userId: string,
  programId: string | null,
): Promise<ActivitySport[]> {
  if (!programId) return [];
  const sports = new Set<ActivitySport>();
  const days = await db
    .select({
      includesLifting: programDays.includesLifting,
      includesRun: programDays.includesRun,
    })
    .from(programDays)
    .where(and(eq(programDays.userId, userId), eq(programDays.programId, programId)));
  for (const day of days) {
    if (day.includesLifting) sports.add("strength");
    if (day.includesRun) sports.add("running");
  }
  const occurrenceSports = await db
    .selectDistinct({ sport: plannedOccurrences.sport })
    .from(plannedOccurrences)
    .innerJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        eq(occurrenceVersions.userId, plannedOccurrences.userId),
      ),
    )
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(occurrenceVersions.programVersionId, programId),
        ne(plannedOccurrences.disposition, "cancelled"),
      ),
    );
  for (const row of occurrenceSports) sports.add(row.sport);
  return [...sports];
}

/**
 * Refuses a review that left a sport out, or covered one the programme does not include.
 *
 * Coverage is checked against the programme, not taken on the result's word. Missing coverage
 * is invalid (§8.2 item 7): a swim that got no mention is not a swim the coach decided to
 * leave alone, it is a swim nobody looked at.
 */
async function assertSportCoverage(
  db: DbOrTx,
  userId: string,
  job: CoachJob,
  coverage: readonly SportCoverage[],
): Promise<void> {
  const included = await programmeSports(db, userId, job.target.programId);
  if (included.length === 0) return;
  const problems = coverageProblems(included, coverage);
  if (problems.length > 0)
    throw new CoachingError(
      `Every sport in the programme needs a coverage entry. ${problems
        .map((problem) => problem.message)
        .join(" ")}`,
      422,
    );
}

export async function sessionTarget(
  db: DbOrTx,
  userId: string,
  batchDate: string | null = null,
): Promise<JobTarget | null> {
  const schedule = await getSchedule(db, userId);
  const slot = schedule ? nextTrainingSlot(schedule) : null;
  if (!schedule || !slot) return null;
  const [intent] = await db
    .select()
    .from(coachGymIntents)
    .where(
      and(
        eq(coachGymIntents.userId, userId),
        eq(coachGymIntents.programId, schedule.program.id),
        eq(coachGymIntents.cycleIndex, slot.cycleIndex),
        eq(coachGymIntents.dayIndex, slot.dayIndex),
      ),
    );
  const [day] = await db
    .select({ gymId: programDays.recommendedGymId })
    .from(programDays)
    .where(eq(programDays.id, slot.day.id));
  const gymId = intent?.gymId ?? day?.gymId ?? (await planningGym(db, userId))?.id;
  if (!gymId) return null;
  return jobTargetSchema.parse({
    programId: schedule.program.id,
    cycleIndex: slot.cycleIndex,
    dayIndex: slot.dayIndex,
    gymId,
    batchDate,
    intentId: intent?.id ?? null,
  });
}

/**
 * When this athlete's review interval starts, deriving and recording one if nothing has.
 *
 * Three call sites read this, and every one of them treated "no anchor" as "no review, ever":
 * the dispatcher skipped the athlete, the request review returned null, and asking for one
 * said the coach was off. An account that enabled the coach before the workflow existed has
 * `ai_coach_enabled` true and no `consented_at` — the old switch wrote only the profile flag —
 * so its programme was never reviewed and its requests waited on a run that was never queued.
 *
 * The coach being on is the fact; the missing timestamp is a gap in the record, not a reason
 * to do nothing. Where one is missing it is reconstructed from the training the review would
 * read — when the active programme started — and written down, so the cadence starts and this
 * is computed once rather than on every pass.
 */
export async function reviewAnchor(
  db: DbOrTx,
  userId: string,
  now = new Date(),
): Promise<Date | null> {
  const preference = await getCoachingPreferences(db, userId);
  const recorded = preference?.reviewAnchorAt ?? preference?.consentedAt ?? null;
  if (recorded) return recorded;
  const active = await getActiveProgram(db, userId);
  if (!active) return null;
  const [program] = await db
    .select({ createdAt: programs.createdAt })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.id, active.id)))
    .limit(1);
  const started = active.startDate ? new Date(`${active.startDate}T00:00:00Z`) : null;
  const derived =
    started && Number.isFinite(started.getTime()) ? started : (program?.createdAt ?? now);
  // Never in the future: an interval has to start before the boundary that ends it.
  const consentedAt = derived < now ? derived : now;
  await db
    .insert(coachPreferences)
    .values({ userId, mode: "coach", consentedAt })
    .onConflictDoUpdate({
      target: coachPreferences.userId,
      set: { consentedAt, updatedAt: now },
    });
  return consentedAt;
}

/**
 * A programme review whose purpose is what the athlete asked for.
 *
 * The ordinary review runs on its cadence and reads the training week it owes them. This one
 * runs because somebody asked for something, on the next scheduled daily run rather than the
 * moment they pressed send. It reads the same evidence — a request is still judged against
 * training — but it does not consume the scheduled review's interval, and anything it
 * proposes waits for approval. One review per boundary either way, so the two never race.
 */
export async function enqueueRequestReview(db: DbOrTx, userId: string, now = new Date()) {
  const active = await getActiveProgram(db, userId);
  if (!active) return null;
  const preference = await getCoachingPreferences(db, userId);
  const anchor = await reviewAnchor(db, userId, now);
  const boundary = lastCoachBoundary(now);
  // An interval has to have somewhere to start; a request made since the last boundary is
  // heard at the next one.
  if (!anchor || boundary.at <= anchor) return null;
  const period = weeklyReviewPeriod(anchor, boundary.at);
  return enqueueCoachJob(db, userId, {
    kind: "review_program",
    trigger: "weekly",
    dedupeKey: `review:${period.end}`,
    intakeId: preference?.intakeId,
    target: {
      programId: active.id,
      batchDate: boundary.date,
      reviewStart: period.start,
      reviewEnd: period.end,
      purpose: "requests",
    },
  });
}

/**
 * How far ahead a daily run prepares. Today and the next two days, which is the 48 hours
 * §8.2 item 4 asks for expressed in the athlete's own dates: a Friday night run prepares
 * Saturday and Sunday, and no further.
 */
export const PREPARATION_LOOKAHEAD_DAYS = 2;

/**
 * The endurance preparations one batch owes, one job per occurrence and revision.
 *
 * Today's identity was one job per athlete per date, which cannot describe two rides on one
 * Tuesday and cannot say which of them a result is for. So each occurrence gets its own job,
 * keyed by the exact revision it was queued against: a revision arriving afterwards leaves
 * the old job superseded rather than quietly re-aimed, and a repeated dispatch finds the same
 * key rather than enqueuing a second (SCHED-02, AT-COACH-06).
 *
 * Overdue work is deliberately not here. Nothing rolls forward: an unfinished Wednesday swim
 * is still Wednesday's, and preparing it again on Friday would be the coach deciding to move
 * it (TODAY-01).
 */
export async function enqueueOccurrencePreparations(
  db: DbOrTx,
  userId: string,
  batchDate: string,
): Promise<number> {
  const preferences = await getCoachingPreferences(db, userId);
  const active = await getActiveProgram(db, userId);
  const occurrences = await openOccurrencesBetween(
    db,
    userId,
    batchDate,
    addDays(batchDate, PREPARATION_LOOKAHEAD_DAYS),
  );
  let queued = 0;
  for (const occurrence of occurrences) {
    // Only the active programme's work is coached. Standalone scheduled activities are the
    // athlete's own, and adding one to the programme is an explicit act (SCHED-08).
    if (!occurrence.programVersionId || occurrence.programVersionId !== active?.id) continue;
    const { created } = await enqueueCoachJob(db, userId, {
      kind: "prepare_session",
      trigger: "daily",
      dedupeKey: `occurrence:${occurrence.id}:${occurrence.revisionId}`,
      intakeId: preferences?.intakeId,
      target: {
        programId: active.id,
        occurrenceId: occurrence.id,
        occurrenceRevisionId: occurrence.revisionId,
        sport: occurrence.sport as ActivitySport,
        batchDate,
      },
    });
    if (created) queued++;
  }
  // A preparation written against a revision that has since moved on is not a plan for
  // anything; it is superseded rather than answered (COACH-08).
  await db
    .update(coachJobs)
    .set({
      status: "superseded",
      error: "That session changed after this preparation was queued.",
      completedAt: new Date(),
      leaseUntil: null,
    })
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "prepare_session"),
        inArray(coachJobs.status, ["queued", "claimed"]),
        like(coachJobs.dedupeKey, "occurrence:%"),
        notInArray(
          coachJobs.dedupeKey,
          occurrences.length > 0
            ? occurrences.map(
                (occurrence) => `occurrence:${occurrence.id}:${occurrence.revisionId}`,
              )
            : [""],
        ),
      ),
    );
  return queued;
}

export async function enqueueDailySession(db: DbOrTx, userId: string, batchDate: string) {
  await enqueueOccurrencePreparations(db, userId, batchDate);
  const target = await sessionTarget(db, userId, batchDate);
  if (!target) return null;
  const preferences = await getCoachingPreferences(db, userId);
  await db
    .update(coachJobs)
    .set({
      status: "superseded",
      error: "A newer daily preparation replaced this attempt.",
      completedAt: new Date(),
      leaseUntil: null,
    })
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.trigger, "daily"),
        inArray(coachJobs.status, ["queued", "claimed"]),
        ne(coachJobs.dedupeKey, `daily:${batchDate}`),
        // An occurrence's job is keyed by its own identity, not by the batch, so the strength
        // preparation replacing itself must not sweep the day's swims away with it.
        notLike(coachJobs.dedupeKey, "occurrence:%"),
      ),
    );
  return enqueueCoachJob(db, userId, {
    kind: "prepare_session",
    trigger: "daily",
    dedupeKey: `daily:${batchDate}`,
    intakeId: preferences?.intakeId,
    target,
  });
}

/**
 * Whether anything was trained on one of the athlete's own calendar days.
 *
 * A rest day is a day with no training work logged on it — no working set, no run — measured
 * in the athlete's zone, because it is their day that was quiet. A programme that merely calls
 * the day a rest day does not count: the sequence slides, and what the plan expected and what
 * happened stop agreeing after the first missed session.
 *
 * What is counted is working sets rather than sessions. A rest-and-mobility day is a real slot
 * with a real card, and opening it writes a session row; asking only whether a session exists
 * made those days look like training and pushed the review out to its ceiling, week after
 * week, for anyone whose programme carries one. A session holding nothing but warm-up or
 * mobility work is a day the athlete rested, and a review belongs on it.
 */
async function trainedOn(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  date: string,
): Promise<boolean> {
  const from = fromDateTimeLocal(`${date}T00:00`, timeZone);
  const to = fromDateTimeLocal(`${addDays(date, 1)}T00:00`, timeZone);
  // An unreadable zone is not evidence of rest; the ceiling still brings the review round.
  if (!from || !to) return true;
  const [set] = await db
    .select({ id: setLogs.id })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .where(
      and(
        eq(setLogs.userId, userId),
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.startedAt, from),
        lt(workoutSessions.startedAt, to),
        ne(setLogs.setType, "warmup"),
      ),
    )
    .limit(1);
  if (set) return true;
  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.userId, userId), gte(runs.startedAt, from), lt(runs.startedAt, to)))
    .limit(1);
  return Boolean(run);
}

/** Stable keyset paging: the caller drains pages; there is no silent 500-athlete ceiling. */
export async function dispatchCoachPage(db: Db, after: string | null = null, now = new Date()) {
  // Debugging receipts expire on the batch's own schedule, not on any athlete's coach
  // succeeding. Once per batch, before the first page of athletes.
  const expiredDiagnostics = after === null ? await expireCoachDiagnostics(db, now) : 0;
  const rows = await db
    .select({ id: profiles.id, timeZone: profiles.timeZone })
    .from(profiles)
    .where(and(eq(profiles.aiCoachEnabled, true), after ? gt(profiles.id, after) : undefined))
    .orderBy(asc(profiles.id))
    .limit(51);
  const page = rows.slice(0, 50);
  const boundary = lastCoachBoundary(now);
  const jobs: { userId: string; jobId: string; kind: CoachJob["kind"] }[] = [];
  const errors: { userId: string; error: string }[] = [];
  for (const athlete of page) {
    try {
      await withUser(db, athlete.id, async (tx) => {
        await reconcileCoachJobs(tx, athlete.id, now);
        const preference = await getCoachingPreferences(tx, athlete.id);
        const active = await getActiveProgram(tx, athlete.id);
        if (!active) return;
        let result: Awaited<ReturnType<typeof enqueueCoachJob>> | null = null;
        // The last review's own end, or the moment coaching was switched on; there is no
        // missed-week backlog to replay, because one review reads everything since the last.
        const anchor = await reviewAnchor(tx, athlete.id, now);
        if (anchor) {
          const standing = reviewStanding(anchor, boundary.at);
          // An interval has to have somewhere to start; a request made since the last
          // boundary is heard at the next one.
          const heard = boundary.at > anchor;
          const scheduled =
            standing === "due" ||
            (standing === "needs_a_quiet_day" &&
              !(await trainedOn(
                tx,
                athlete.id,
                athlete.timeZone,
                addDays(todayInTimeZone(athlete.timeZone, boundary.at), -1),
              )));
          // An athlete who has asked for something only a review can grant does not wait out
          // the cadence for it. The confirmed rule is that this happens at the next scheduled
          // daily run and nowhere else: saving the request starts nothing, and what the run
          // buys them is a hearing rather than an outcome — anything structural, and anything
          // they asked for, still arrives as a proposal they approve.
          const asked =
            heard &&
            (!!(preference?.reviewRequestedAt && preference.reviewRequestedAt > anchor) ||
              (await hasActionableRequests(
                tx,
                athlete.id,
                todayInTimeZone(athlete.timeZone, boundary.at),
              )));
          if (scheduled || asked) {
            const period = weeklyReviewPeriod(anchor, boundary.at);
            result = await enqueueCoachJob(tx, athlete.id, {
              kind: "review_program",
              trigger: "weekly",
              dedupeKey: `review:${period.end}`,
              intakeId: preference?.intakeId,
              target: {
                programId: active.id,
                batchDate: boundary.date,
                reviewStart: period.start,
                reviewEnd: period.end,
                // A run that only answers requests must not count as the scheduled training
                // review, or the week it did not read would never be read by anything.
                purpose: scheduled ? "scheduled" : "requests",
              },
            });
          }
        }
        if (result && !pending.includes(result.job.status as "queued" | "claimed")) result = null;
        result ??= await enqueueDailySession(tx, athlete.id, boundary.date);
        if (result && pending.includes(result.job.status as "queued" | "claimed"))
          jobs.push({ userId: athlete.id, jobId: result.job.id, kind: result.job.kind });
      });
    } catch {
      errors.push({
        userId: athlete.id,
        error: "Could not dispatch this athlete. Continue the batch and retry this page.",
      });
    }
  }
  return {
    batchDate: boundary.date,
    scheduledAt: boundary.at.toISOString(),
    evaluated: page.length,
    expiredDiagnostics,
    jobs,
    errors,
    nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
  };
}

export async function queuedCoachJobs(db: Db, now = new Date()) {
  const other = alias(coachJobs, "other_coach_job");
  return db
    .select({ id: coachJobs.id, userId: coachJobs.userId, kind: coachJobs.kind })
    .from(coachJobs)
    .innerJoin(profiles, eq(profiles.id, coachJobs.userId))
    .where(
      and(
        eq(profiles.aiCoachEnabled, true),
        eq(coachJobs.status, "queued"),
        lt(coachJobs.attempts, MAX_JOB_ATTEMPTS),
        lte(coachJobs.nextAttemptAt, now),
        notExists(
          db
            .select({ id: workoutSessions.id })
            .from(workoutSessions)
            .where(
              and(
                eq(workoutSessions.userId, coachJobs.userId),
                isNull(workoutSessions.completedAt),
              ),
            ),
        ),
        notExists(
          db
            .select({ id: other.id })
            .from(other)
            .where(
              and(
                eq(other.userId, coachJobs.userId),
                eq(other.status, "claimed"),
                gt(other.leaseUntil, now),
              ),
            ),
        ),
        or(
          ne(coachJobs.kind, "prepare_session"),
          notExists(
            db
              .select({ id: other.id })
              .from(other)
              .where(
                and(
                  eq(other.userId, coachJobs.userId),
                  eq(other.kind, "review_program"),
                  inArray(other.status, ["queued", "claimed"]),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(
      sql`case when ${coachJobs.kind} = 'create_program' then 0 when ${coachJobs.kind} = 'review_program' then 1 when ${coachJobs.trigger} = 'gym' then 2 else 3 end`,
      asc(coachJobs.createdAt),
      asc(coachJobs.id),
    )
    .limit(50);
}

/** How often an athlete may ask for a review of their own, on top of the cadence. */
export const ATHLETE_REVIEW_INTERVAL_DAYS = 7;

/** The `coach_jobs.dedupe_key` prefix that marks a review the athlete asked for. */
const ASKED_REVIEW_PREFIX = "review:asked:";

/**
 * Whether the athlete may ask for a review now, and when they may next.
 *
 * The cadence decides when a review is owed; this decides when one may be asked for, which
 * is a different question and needs its own answer on screen. Somebody who has just changed
 * gym, or come back from a week away, should not have to guess whether tapping does anything.
 */
export async function athleteReviewStatus(db: DbOrTx, userId: string, now = new Date()) {
  const [last] = await db
    .select({ createdAt: coachJobs.createdAt })
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "review_program"),
        like(coachJobs.dedupeKey, `${ASKED_REVIEW_PREFIX}%`),
      ),
    )
    .orderBy(desc(coachJobs.createdAt))
    .limit(1);
  const [running] = await db
    .select({ id: coachJobs.id })
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "review_program"),
        inArray(coachJobs.status, ["queued", "claimed"]),
      ),
    )
    .limit(1);
  const nextAt = last
    ? new Date(last.createdAt.getTime() + ATHLETE_REVIEW_INTERVAL_DAYS * 86_400_000)
    : null;
  return {
    /** A review is already queued or running; asking again would only duplicate it. */
    running: Boolean(running),
    canAsk: !running && (!nextAt || nextAt <= now),
    nextAt: nextAt && nextAt > now ? nextAt : null,
  };
}

/**
 * The athlete asks for their programme to be reviewed now.
 *
 * The cadence reviews about once a week on a day they rested, which is right for the ordinary
 * case and useless when something has just changed. This runs the same review against the
 * same evidence, and answers the asks they are waiting on, but it is not the scheduled one:
 * `purpose: "requests"` leaves the anchor where it was, so the training week the cadence owes
 * them is still read by the review that owes it, and nothing this produces is applied without
 * their approval.
 *
 * One a week each. A review already queued is returned as it is rather than duplicated — the
 * athlete gets the review they asked for either way.
 */
export async function requestProgramReview(db: DbOrTx, userId: string, now = new Date()) {
  const profile = await assertCoachEnabled(db, userId);
  // The coach will not claim anything while a workout is open, so a review asked for now
  // would sit in the queue rather than run. Say so, in the terms of what was asked.
  const [open] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt)))
    .limit(1);
  if (open)
    throw new CoachingError("Finish or discard your open workout, then ask for the review.");
  const active = await getActiveProgram(db, userId);
  if (!active) throw new CoachingError("There is no programme to review yet.");
  const status = await athleteReviewStatus(db, userId, now);
  if (status.running) {
    const [existing] = await db
      .select()
      .from(coachJobs)
      .where(
        and(
          eq(coachJobs.userId, userId),
          eq(coachJobs.kind, "review_program"),
          inArray(coachJobs.status, ["queued", "claimed"]),
        ),
      )
      .limit(1);
    return { job: existing!, created: false };
  }
  if (!status.canAsk)
    throw new CoachingError(
      "You have already asked for a review this week. The coach reviews your programme on its own schedule too.",
      429,
    );
  const preference = await getCoachingPreferences(db, userId);
  const anchor = await reviewAnchor(db, userId, now);
  if (!anchor || anchor >= now)
    throw new CoachingError("There is nothing to review yet. Train a session first.");
  return enqueueCoachJob(db, userId, {
    kind: "review_program",
    // Scheduled work, so the review is handed the asks it is meant to answer; the purpose
    // below is what keeps it from consuming the cadence's own review.
    trigger: "weekly",
    dedupeKey: `${ASKED_REVIEW_PREFIX}${todayInTimeZone(profile.timeZone, now)}`,
    intakeId: preference?.intakeId,
    target: {
      programId: active.id,
      batchDate: lastCoachBoundary(now).date,
      reviewStart: anchor.toISOString(),
      reviewEnd: now.toISOString(),
      purpose: "requests",
    },
  });
}

/** A durable last choice wins for the exact upcoming occurrence. Same gym is a no-op. */
export async function requestGymChange(
  db: DbOrTx,
  userId: string,
  gymId: string,
  reason: string | null = null,
) {
  const profile = await assertCoachEnabled(db, userId);
  await assertNoOpenWorkout(db, userId);
  const target = await sessionTarget(db, userId);
  if (!target) throw new CoachingError("There is no upcoming programme session to prepare.");
  const [gym] = await db
    .select()
    .from(gyms)
    .where(and(eq(gyms.userId, userId), eq(gyms.id, gymId), eq(gyms.isActive, true)));
  if (!gym) throw new CoachingError("Choose one of your active training locations.", 422);
  if (target.gymId === gymId) return { job: null, created: false };
  const boundary = lastCoachBoundary();
  const today = todayInTimeZone(profile.timeZone);
  await assertCoachRequestAllowance(db, userId, profile.timeZone);
  const intentId = crypto.randomUUID();
  await db
    .insert(coachGymIntents)
    .values({
      id: intentId,
      userId,
      programId: target.programId!,
      cycleIndex: target.cycleIndex!,
      dayIndex: target.dayIndex!,
      gymId,
      requestedOn: today,
    })
    .onConflictDoUpdate({
      target: [
        coachGymIntents.userId,
        coachGymIntents.programId,
        coachGymIntents.cycleIndex,
        coachGymIntents.dayIndex,
      ],
      set: { id: intentId, gymId, requestedOn: today },
    });
  await db
    .update(coachJobs)
    .set({
      status: "superseded",
      error: "A newer gym choice replaced this request.",
      completedAt: new Date(),
      leaseUntil: null,
    })
    .where(
      and(
        eq(coachJobs.userId, userId),
        eq(coachJobs.kind, "prepare_session"),
        inArray(coachJobs.status, ["queued", "claimed"]),
      ),
    );
  const preference = await getCoachingPreferences(db, userId);
  return enqueueCoachJob(db, userId, {
    kind: "prepare_session",
    trigger: "gym",
    dedupeKey: `gym:${intentId}`,
    intakeId: preference?.intakeId,
    target: { ...target, gymId, intentId, reason, batchDate: boundary.date },
  });
}

async function assertCoachRequestAllowance(db: DbOrTx, userId: string, timeZone: string) {
  const since = fromDateTimeLocal(`${todayInTimeZone(timeZone)}T00:00`, timeZone)!;
  const requests = await db
    .select({ id: coachJobs.id })
    .from(coachJobs)
    .where(
      and(
        eq(coachJobs.userId, userId),
        gte(coachJobs.createdAt, since),
        or(eq(coachJobs.kind, "create_program"), eq(coachJobs.trigger, "gym")),
      ),
    );
  if (requests.length >= 3)
    throw new CoachingError(
      "Programme creation and gym changes share three requests per day. Your work is saved; you can edit it or train now, and request the coach again tomorrow.",
      429,
    );
}
