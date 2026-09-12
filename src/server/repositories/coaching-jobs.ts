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
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  coachGymIntents,
  coachIntakes,
  coachJobs,
  coachPreferences,
  coachWeeklyReviews,
  gyms,
  profiles,
  programDrafts,
  programDays,
  sessionPlans,
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
import { assessProgramChange } from "@/domain/program-change";
import { firstWeeklyReviewPeriod, nextWeeklyReviewPeriod } from "@/domain/coach-cadence";
import { todayInTimeZone } from "@/domain/program-calendar";
import { sharedExercises } from "@/server/queries/reference";
import { nextTrainingSlot, planningGym, storePlan } from "./coach-plans";
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
import { lastCoachBoundary } from "@/domain/coach-cadence";
import { fromDateTimeLocal } from "@/lib/time";
import { coachRollout } from "@/lib/coach-rollout";

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
  await assertCoachEnabled(db, userId);
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
    return { accepted: true, deferred: true };
  }
  if (job.kind === "create_program" && !["program", "needs_input"].includes(result.outcome))
    throw new CoachingError("Programme creation needs a draft or clarification questions.", 422);
  if (job.kind === "prepare_session" && result.outcome === "program")
    throw new CoachingError("Session preparation cannot replace a programme.", 422);
  if (job.kind === "review_program" && result.outcome === "session")
    throw new CoachingError("Submit the weekly review before session preparation.", 422);
  let draftId: string | null = null;
  let reviewOutcome: "no_change" | "automatic" | "proposal" = "no_change";
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
      const trainingDays = blueprint.days.filter((day) => day.includesLifting || day.includesRun);
      if (
        trainingDays.length !== intake.answers.sessionsPerWeek ||
        (intake.answers.preferredDays.length &&
          trainingDays.some((day) => !intake.answers.preferredDays.includes(day.dayOfWeek)))
      )
        throw new CoachingError(
          "The programme must match your confirmed training frequency and preferred days. Ask for clarification if those constraints cannot be met.",
          422,
        );
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
        rationale: result.rationale,
        uncertainties: result.uncertainties,
      })
      .returning();
    draftId = draft!.id;
    if (job.kind === "review_program" && job.target.programId) {
      const current = await readProgramBlueprint(db, userId, job.target.programId);
      if (!current) throw new CoachingError("The reviewed programme is no longer available.");
      const assessment = assessProgramChange(
        current.blueprint,
        blueprint,
        await sharedExercises(db),
      );
      if (assessment.authority === "unchanged") {
        await db
          .update(programDrafts)
          .set({ status: "superseded" })
          .where(eq(programDrafts.id, draftId));
      } else if (assessment.authority === "automatic" && coachRollout().automaticReviews) {
        await activateProgramDraft(db, userId, draftId, {
          expectedRevision: draft!.revision,
          startDate: todayInTimeZone("Asia/Kolkata", now),
          transition: "continue",
        });
        reviewOutcome = "automatic";
      } else reviewOutcome = "proposal";
    }
  }
  if (result.outcome === "session") {
    if (!job.target.cycleIndex || !job.target.dayIndex || !job.target.gymId)
      throw new CoachingError("The session target is incomplete.", 422);
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
    const [existing] = await db
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
  if (job.kind === "review_program" && result.outcome !== "needs_input") {
    if (!job.target.reviewStart || !job.target.reviewEnd)
      throw new CoachingError("The review period is missing.", 422);
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
      .set({ reviewAnchorAt: new Date(job.target.reviewEnd) })
      .where(eq(coachPreferences.userId, userId));
    await enqueueDailySession(db, userId, job.target.batchDate ?? lastCoachBoundary(now).date);
  }
  if (job.kind === "review_program" && result.outcome === "needs_input")
    await enqueueDailySession(db, userId, job.target.batchDate ?? lastCoachBoundary(now).date);
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
  return { accepted: true, draftId, contractVersion: COACH_CONTRACT_VERSION };
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

export async function enqueueDailySession(db: DbOrTx, userId: string, batchDate: string) {
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

/** Stable keyset paging: the caller drains pages; there is no silent 500-athlete ceiling. */
export async function dispatchCoachPage(db: Db, after: string | null = null, now = new Date()) {
  const rows = await db
    .select({ id: profiles.id })
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
        if (preference?.reviewWeekday && preference.consentedAt) {
          let period = preference.reviewAnchorAt
            ? nextWeeklyReviewPeriod({
                previousScheduledBoundary: preference.reviewAnchorAt,
                reviewWeekday: preference.reviewWeekday,
              })
            : firstWeeklyReviewPeriod(preference.consentedAt, preference.reviewWeekday);
          // Catch up only the latest due review, never rewrite every missed historical week.
          while (true) {
            const following = nextWeeklyReviewPeriod({
              previousScheduledBoundary: new Date(period.end),
              reviewWeekday: preference.reviewWeekday,
            });
            if (new Date(following.end) > boundary.at) break;
            period = following;
          }
          if (new Date(period.end) <= boundary.at)
            result = await enqueueCoachJob(tx, athlete.id, {
              kind: "review_program",
              trigger: "weekly",
              dedupeKey: `review:${period.end}`,
              intakeId: preference.intakeId,
              target: {
                programId: active.id,
                batchDate: boundary.date,
                reviewStart: period.start,
                reviewEnd: period.end,
              },
            });
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
