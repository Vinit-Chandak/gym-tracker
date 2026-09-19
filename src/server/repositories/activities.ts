import { createHash } from "node:crypto";

import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";

import {
  activities,
  activitySubmissionReceipts,
  cyclingActivityDetails,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  runningActivityDetails,
  swimmingActivityDetails,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { DURATION_MS } from "@/domain/activity-limits";
import {
  originFromStorage,
  type ActivityOutcome,
  type ActivitySport,
  type Effort,
  type EnduranceSport,
  type LogOrigin,
  type TimeZoneSource,
} from "@/domain/activity";
import {
  actualDurationMs,
  distanceFromLengths,
  validateActual,
  type EnduranceActual,
} from "@/domain/activity-metrics";
import { canLog } from "@/domain/occurrences";

import { deleteActivityStats, writeEnduranceStats, writeRunStats } from "./shared-stats";

/**
 * The one place an activity is created, corrected or removed (plan §6.5).
 *
 * Every save runs the same sequence: validate the contract, take the owner's lock, check the
 * receipt and the revision, verify the occurrence really belongs to this athlete and this
 * sport, write the parent and its typed detail, settle the occurrence, rebuild the shared
 * projection, and record a receipt. All of it in one transaction, so a failure anywhere
 * leaves nothing behind and a response that never arrived can be resolved by asking for the
 * receipt instead of saving again.
 */

export class ActivityNotFoundError extends Error {
  constructor() {
    super("That activity no longer exists.");
    this.name = "ActivityNotFoundError";
  }
}

export class OccurrenceNotFoundError extends Error {
  constructor() {
    super("That planned session is not in your programme.");
    this.name = "OccurrenceNotFoundError";
  }
}

export class OccurrenceTakenError extends Error {
  constructor(readonly activityId: string) {
    super("That planned session has already been logged.");
    this.name = "OccurrenceTakenError";
  }
}

export class StaleActivityError extends Error {
  constructor() {
    super("This was changed somewhere else. Check the current version before saving again.");
    this.name = "StaleActivityError";
  }
}

export class SubmissionConflictError extends Error {
  constructor() {
    super("That submission was already used for a different save.");
    this.name = "SubmissionConflictError";
  }
}

export class InvalidActualError extends Error {
  constructor(readonly problems: readonly { field: string; message: string }[]) {
    super(problems[0]?.message ?? "Those measurements are not valid.");
    this.name = "InvalidActualError";
  }
}

export type SaveActivityInput = {
  /** One per local draft. The same key and payload always yield the same result. */
  submissionKey: string;
  origin: LogOrigin;
  actual: EnduranceActual;
  startedAt: Date;
  recordedTimeZone: string;
  timeZoneSource: TimeZoneSource;
  occurredOn: string;
  effort: Effort;
  outcome: ActivityOutcome;
  title: string | null;
  notes: string | null;
};

export type SaveResult = {
  id: string;
  /** `replayed` means the receipt answered; nothing was written a second time. */
  status: "created" | "updated" | "replayed";
};

export type ActivityRecord = {
  id: string;
  sport: ActivitySport;
  startedAt: Date;
  occurredOn: string;
  recordedTimeZone: string;
  durationMs: number | null;
  effort: Effort;
  outcome: ActivityOutcome;
  title: string | null;
  notes: string | null;
  origin: LogOrigin;
  revision: number;
  actual: EnduranceActual | null;
};

/** A stable digest of what was asked for, so a retry can be told from a different save. */
export function payloadDigest(input: SaveActivityInput): string {
  const canonical = {
    origin: input.origin,
    actual: input.actual,
    startedAt: input.startedAt.toISOString(),
    recordedTimeZone: input.recordedTimeZone,
    occurredOn: input.occurredOn,
    effort: input.effort,
    outcome: input.outcome,
    title: input.title,
    notes: input.notes,
  };
  return createHash("sha256").update(stableJson(canonical)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

/**
 * The receipt for a submission key, if there is one.
 *
 * Same key and same payload: hand back what happened the first time. Same key, different
 * payload: refuse, because that is a second save wearing the first one's name. A receipt left
 * behind by a deletion refuses a late retry rather than resurrecting the record.
 */
async function checkReceipt(
  tx: DbOrTx,
  userId: string,
  submissionKey: string,
  digest: string,
): Promise<SaveResult | null> {
  const [receipt] = await tx
    .select()
    .from(activitySubmissionReceipts)
    .where(
      and(
        eq(activitySubmissionReceipts.userId, userId),
        eq(activitySubmissionReceipts.submissionKey, submissionKey),
      ),
    )
    .limit(1);
  if (!receipt) return null;
  if (receipt.payloadDigest !== digest) throw new SubmissionConflictError();
  if (receipt.deleted || !receipt.activityId) throw new ActivityNotFoundError();
  return { id: receipt.activityId, status: "replayed" };
}

async function writeReceipt(
  tx: DbOrTx,
  userId: string,
  submissionKey: string,
  digest: string,
  activityId: string,
  resultStatus: "created" | "updated" | "deleted",
): Promise<void> {
  await tx
    .insert(activitySubmissionReceipts)
    .values({ userId, submissionKey, payloadDigest: digest, activityId, resultStatus })
    .onConflictDoNothing();
}

type OccurrenceTarget = { occurrenceId: string; revisionId: string; sport: ActivitySport };

/**
 * The occurrence a planned log names — checked, not assumed.
 *
 * Foreign, missing, already logged, cancelled or a different sport: each is its own refusal.
 * Nothing here falls back to another occurrence, and nothing matches by date (LINK-01).
 */
async function resolveTarget(
  tx: DbOrTx,
  userId: string,
  origin: LogOrigin,
  sport: EnduranceSport,
): Promise<OccurrenceTarget | null> {
  if (origin.kind === "ad_hoc") return null;
  const [row] = await tx
    .select({
      occurrenceId: plannedOccurrences.id,
      sport: plannedOccurrences.sport,
      disposition: plannedOccurrences.disposition,
      revisionId: occurrenceVersions.id,
    })
    .from(plannedOccurrences)
    .innerJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.occurrenceId, plannedOccurrences.id),
        eq(occurrenceVersions.id, origin.performedRevisionId),
      ),
    )
    .where(
      and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, origin.occurrenceId)),
    )
    .limit(1);
  if (!row || row.sport !== sport) throw new OccurrenceNotFoundError();
  const [taken] = await tx
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.occurrenceId, row.occurrenceId)))
    .limit(1);
  if (taken) throw new OccurrenceTakenError(taken.id);
  if (!canLog({ disposition: row.disposition }, null)) throw new OccurrenceNotFoundError();
  return { occurrenceId: row.occurrenceId, revisionId: row.revisionId, sport: row.sport };
}

async function writeDetail(
  tx: DbOrTx,
  userId: string,
  activityId: string,
  actual: EnduranceActual,
): Promise<void> {
  if (actual.sport === "running") {
    await tx
      .insert(runningActivityDetails)
      .values({
        activityId,
        userId,
        sport: "running",
        environment: actual.environment,
        distanceMetres: actual.distance.metres,
        distanceNativeValue: actual.distance.value,
        distanceNativeUnit: actual.distance.unit,
        surface: actual.surface,
        elevationGainMetres: actual.elevationGainMetres,
        treadmillInclinePercent: actual.treadmillInclinePercent,
        averageHeartRate: actual.averageHeartRate,
        maxHeartRate: actual.maxHeartRate,
        cadenceStepsPerMinute: actual.cadenceStepsPerMinute,
      })
      .onConflictDoUpdate({
        target: runningActivityDetails.activityId,
        set: {
          environment: actual.environment,
          distanceMetres: actual.distance.metres,
          distanceNativeValue: actual.distance.value,
          distanceNativeUnit: actual.distance.unit,
          surface: actual.surface,
          elevationGainMetres: actual.elevationGainMetres,
          treadmillInclinePercent: actual.treadmillInclinePercent,
          averageHeartRate: actual.averageHeartRate,
          maxHeartRate: actual.maxHeartRate,
          cadenceStepsPerMinute: actual.cadenceStepsPerMinute,
          updatedAt: new Date(),
        },
      });
    return;
  }
  if (actual.sport === "cycling") {
    const values = {
      environment: actual.environment,
      distanceMetres: actual.distance?.metres ?? null,
      distanceNativeValue: actual.distance?.value ?? null,
      distanceNativeUnit: actual.distance?.unit ?? null,
      assistance: actual.assistance,
      resourceId: actual.resourceId,
      averagePowerWatts: actual.averagePowerWatts,
      averageCadenceRpm: actual.averageCadenceRpm,
      averageHeartRate: actual.averageHeartRate,
      maxHeartRate: actual.maxHeartRate,
      elevationGainMetres: actual.elevationGainMetres,
    };
    await tx
      .insert(cyclingActivityDetails)
      .values({ activityId, userId, sport: "cycling", ...values })
      .onConflictDoUpdate({
        target: cyclingActivityDetails.activityId,
        set: { ...values, updatedAt: new Date() },
      });
    return;
  }
  const values = {
    environment: actual.environment,
    activeMs: actual.activeMs,
    distanceMethod: actual.distanceMethod,
    // With lengths, the distance is the pool's own arithmetic, not a second assertion.
    distanceMetres: actual.distanceMethod === "manual" ? (actual.distance?.metres ?? null) : null,
    distanceNativeValue:
      actual.distanceMethod === "manual" ? (actual.distance?.value ?? null) : null,
    distanceNativeUnit: actual.distanceMethod === "manual" ? (actual.distance?.unit ?? null) : null,
    poolLengthNative: actual.poolLength?.value ?? null,
    poolLengthUnit: actual.poolLength?.unit ?? null,
    poolLengthMetres: actual.poolLength?.metres ?? null,
    lengths: actual.lengths,
    stroke: actual.stroke,
    strokeCount: actual.strokeCount,
    resourceId: actual.resourceId,
  };
  await tx
    .insert(swimmingActivityDetails)
    .values({ activityId, userId, sport: "swimming", ...values })
    .onConflictDoUpdate({
      target: swimmingActivityDetails.activityId,
      set: { ...values, updatedAt: new Date() },
    });
}

/**
 * What a follower may see of this activity.
 *
 * Running keeps the projection it already had, under the same legacy discriminator, so a feed
 * and a leaderboard read exactly what they read before, and under the sharing choice the
 * account already made. Cycling and swimming project participation only — that it happened,
 * how long it took, and how far where a distance is known — and only where the athlete has
 * opted that sport in, which it is not by default (§9.2, SOCIAL-02).
 *
 * A projection is rewritten on every save, and removed on every delete, so a corrected or
 * withdrawn record cannot leave a stale row behind (AT-PRIV-05).
 */
async function projectSharedStats(
  tx: DbOrTx,
  userId: string,
  activityId: string,
  actual: EnduranceActual,
  startedAt: Date,
  timeZone: string,
): Promise<void> {
  if (actual.sport === "running") {
    await writeRunStats(
      tx,
      userId,
      {
        id: activityId,
        startedAt,
        durationSeconds: Math.round(actual.durationMs / 1000),
        distanceMeters: actual.distance.metres,
      },
      timeZone,
    );
    return;
  }
  const elapsedMs = actual.sport === "swimming" ? actual.elapsedMs : actual.durationMs;
  await writeEnduranceStats(
    tx,
    userId,
    actual.sport === "cycling" ? "cycle" : "swim",
    {
      id: activityId,
      startedAt,
      durationSeconds: Math.round(elapsedMs / 1000),
      distanceMeters: sharedDistanceMetres(actual),
    },
    timeZone,
  );
}

/**
 * The distance a shared row may carry, or null.
 *
 * A length-counted swim has no asserted distance of its own; the lengths and the pool are the
 * authority, and the same arithmetic the form does is done here rather than sharing nothing
 * (SWIM-01). An unknown distance stays null and never becomes zero.
 */
function sharedDistanceMetres(actual: EnduranceActual): number | null {
  if (actual.sport === "cycling") return actual.distance?.metres ?? null;
  if (actual.sport === "swimming") {
    if (actual.distanceMethod === "manual") return actual.distance?.metres ?? null;
    if (actual.distanceMethod === "lengths" && actual.lengths !== null && actual.poolLength)
      return distanceFromLengths(actual.lengths, actual.poolLength);
    return null;
  }
  return actual.distance.metres;
}

async function clearSharedStats(tx: DbOrTx, userId: string, activityId: string): Promise<void> {
  await deleteActivityStats(tx, userId, activityId);
}

export async function createActivity(
  tx: DbOrTx,
  userId: string,
  input: SaveActivityInput,
): Promise<SaveResult> {
  const problems = validateActual(input.actual);
  if (problems.length > 0) throw new InvalidActualError(problems);
  const digest = payloadDigest(input);
  const replay = await checkReceipt(tx, userId, input.submissionKey, digest);
  if (replay) return replay;

  const target = await resolveTarget(tx, userId, input.origin, input.actual.sport);
  const [row] = await tx
    .insert(activities)
    .values({
      userId,
      sport: input.actual.sport,
      status: "completed",
      outcome: input.outcome,
      startedAt: input.startedAt,
      recordedTimeZone: input.recordedTimeZone,
      timeZoneSource: input.timeZoneSource,
      occurredOn: input.occurredOn,
      durationMs: actualDurationMs(input.actual),
      effortValue: input.effort.value,
      effortStatus: input.effort.status,
      title: input.title,
      notes: input.notes,
      occurrenceId: target?.occurrenceId ?? null,
      performedRevisionId: target?.revisionId ?? null,
      performedPlanId: input.origin.kind === "planned" ? input.origin.performedPlanId : null,
      sourceKind: "manual",
    })
    .returning({ id: activities.id });
  if (!row) throw new Error("Activity insert returned no row");
  await writeDetail(tx, userId, row.id, input.actual);
  if (target) {
    await tx.insert(occurrenceEvents).values({
      userId,
      occurrenceId: target.occurrenceId,
      kind: "logged",
      activityId: row.id,
      occurredOn: input.occurredOn,
      actor: "athlete",
    });
    // Logging an occurrence that had been skipped reopens it as done, not as two answers.
    await tx
      .update(plannedOccurrences)
      .set({ disposition: "pending" })
      .where(
        and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, target.occurrenceId)),
      );
  }
  await projectSharedStats(
    tx,
    userId,
    row.id,
    input.actual,
    input.startedAt,
    input.recordedTimeZone,
  );
  await writeReceipt(tx, userId, input.submissionKey, digest, row.id, "created");
  return { id: row.id, status: "created" };
}

export async function updateActivity(
  tx: DbOrTx,
  userId: string,
  activityId: string,
  input: SaveActivityInput,
  expectedRevision: number,
): Promise<SaveResult> {
  const problems = validateActual(input.actual);
  if (problems.length > 0) throw new InvalidActualError(problems);
  const digest = payloadDigest(input);
  const replay = await checkReceipt(tx, userId, input.submissionKey, digest);
  if (replay) return replay;

  const [existing] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .limit(1);
  if (!existing) throw new ActivityNotFoundError();
  if (existing.revision !== expectedRevision) throw new StaleActivityError();
  // The sport and what it answers for are fixed at save: correcting either is a delete and a
  // new log, because the measurements underneath mean different things (LIFE-04).
  if (existing.sport !== input.actual.sport)
    throw new InvalidActualError([
      {
        field: "sport",
        message: "An activity's sport cannot be changed. Delete it and log it again.",
      },
    ]);
  const currentOrigin = originFromStorage(existing);
  if (
    currentOrigin.kind !== input.origin.kind ||
    currentOrigin.occurrenceId !== input.origin.occurrenceId
  )
    throw new InvalidActualError([
      {
        field: "origin",
        message: "What this answers for cannot be changed. Delete it and log it again.",
      },
    ]);

  await tx
    .update(activities)
    .set({
      startedAt: input.startedAt,
      recordedTimeZone: input.recordedTimeZone,
      timeZoneSource: input.timeZoneSource,
      occurredOn: input.occurredOn,
      durationMs: actualDurationMs(input.actual),
      effortValue: input.effort.value,
      effortStatus: input.effort.status,
      outcome: input.outcome,
      title: input.title,
      notes: input.notes,
      revision: existing.revision + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)));
  await writeDetail(tx, userId, activityId, input.actual);
  await projectSharedStats(
    tx,
    userId,
    activityId,
    input.actual,
    input.startedAt,
    input.recordedTimeZone,
  );
  await writeReceipt(tx, userId, input.submissionKey, digest, activityId, "updated");
  return { id: activityId, status: "updated" };
}

/**
 * Deletes an activity and everything derived from it, and gives its occurrence back.
 *
 * The receipt stays, marked deleted, so a retry that was still in flight cannot recreate what
 * somebody deliberately removed. No measurement is kept in it.
 */
export async function deleteActivity(
  tx: DbOrTx,
  userId: string,
  activityId: string,
): Promise<{ occurrenceId: string | null; sport: ActivitySport }> {
  const [existing] = await tx
    .select({
      id: activities.id,
      sport: activities.sport,
      occurrenceId: activities.occurrenceId,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .limit(1);
  if (!existing) throw new ActivityNotFoundError();

  if (existing.occurrenceId) {
    await tx.insert(occurrenceEvents).values({
      userId,
      occurrenceId: existing.occurrenceId,
      kind: "log_deleted",
      actor: "athlete",
      // The pointer is about to be cleared by the delete; the id stays here as provenance,
      // which is not a measurement and cannot bring the record back.
      detail: { removedActivityId: activityId },
    });
  }
  await clearSharedStats(tx, userId, activityId);
  await tx
    .delete(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)));
  await tx
    .update(activitySubmissionReceipts)
    .set({ deleted: true, resultStatus: "deleted", updatedAt: new Date() })
    .where(
      and(
        eq(activitySubmissionReceipts.userId, userId),
        eq(activitySubmissionReceipts.activityId, activityId),
      ),
    );
  return { occurrenceId: existing.occurrenceId, sport: existing.sport };
}

const detailFor = async (
  tx: DbOrTx,
  userId: string,
  activityId: string,
  sport: ActivitySport,
  durationMs: number | null,
): Promise<EnduranceActual | null> => {
  if (sport === "running") {
    const [row] = await tx
      .select()
      .from(runningActivityDetails)
      .where(eq(runningActivityDetails.activityId, activityId))
      .limit(1);
    if (!row) return null;
    return {
      sport: "running",
      environment: row.environment,
      distance: {
        value: row.distanceNativeValue,
        unit: row.distanceNativeUnit,
        metres: row.distanceMetres,
      },
      durationMs: durationMs ?? 0,
      surface: row.surface,
      elevationGainMetres: row.elevationGainMetres,
      treadmillInclinePercent: row.treadmillInclinePercent,
      averageHeartRate: row.averageHeartRate,
      maxHeartRate: row.maxHeartRate,
      cadenceStepsPerMinute: row.cadenceStepsPerMinute,
    };
  }
  if (sport === "cycling") {
    const [row] = await tx
      .select()
      .from(cyclingActivityDetails)
      .where(eq(cyclingActivityDetails.activityId, activityId))
      .limit(1);
    if (!row) return null;
    return {
      sport: "cycling",
      environment: row.environment,
      durationMs: durationMs ?? 0,
      distance:
        row.distanceMetres === null ||
        row.distanceNativeValue === null ||
        row.distanceNativeUnit === null
          ? null
          : {
              value: row.distanceNativeValue,
              unit: row.distanceNativeUnit,
              metres: row.distanceMetres,
            },
      assistance: row.assistance,
      resourceId: row.resourceId,
      averagePowerWatts: row.averagePowerWatts,
      averageCadenceRpm: row.averageCadenceRpm,
      averageHeartRate: row.averageHeartRate,
      maxHeartRate: row.maxHeartRate,
      elevationGainMetres: row.elevationGainMetres,
    };
  }
  if (sport === "swimming") {
    const [row] = await tx
      .select()
      .from(swimmingActivityDetails)
      .where(eq(swimmingActivityDetails.activityId, activityId))
      .limit(1);
    if (!row) return null;
    return {
      sport: "swimming",
      environment: row.environment,
      elapsedMs: durationMs ?? 0,
      activeMs: row.activeMs,
      distanceMethod: row.distanceMethod,
      distance:
        row.distanceMetres === null ||
        row.distanceNativeValue === null ||
        row.distanceNativeUnit === null
          ? null
          : {
              value: row.distanceNativeValue,
              unit: row.distanceNativeUnit,
              metres: row.distanceMetres,
            },
      poolLength:
        row.poolLengthNative === null ||
        row.poolLengthUnit === null ||
        row.poolLengthMetres === null
          ? null
          : {
              value: row.poolLengthNative,
              unit: row.poolLengthUnit,
              metres: row.poolLengthMetres,
            },
      lengths: row.lengths,
      stroke: row.stroke,
      strokeCount: row.strokeCount,
      resourceId: row.resourceId,
      averageHeartRate: row.averageHeartRate,
      maxHeartRate: row.maxHeartRate,
    };
  }
  return null;
};

function toRecord(
  row: typeof activities.$inferSelect,
  actual: EnduranceActual | null,
): ActivityRecord {
  return {
    id: row.id,
    sport: row.sport,
    startedAt: row.startedAt,
    occurredOn: row.occurredOn,
    recordedTimeZone: row.recordedTimeZone,
    durationMs: row.durationMs,
    effort: { status: row.effortStatus, value: row.effortValue } as Effort,
    outcome: row.outcome,
    title: row.title,
    notes: row.notes,
    origin: originFromStorage(row),
    revision: row.revision,
    actual,
  };
}

export async function getActivity(
  tx: DbOrTx,
  userId: string,
  activityId: string,
): Promise<ActivityRecord | null> {
  const [row] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, activityId)))
    .limit(1);
  if (!row) return null;
  return toRecord(row, await detailFor(tx, userId, row.id, row.sport, row.durationMs));
}

export type ActivityPage = {
  activities: ActivityRecord[];
  /** Opaque cursor for the next page; null when this is the last one. */
  cursor: { startedAt: string; id: string } | null;
};

/**
 * Owner-scoped history, paged by the instant and the id together so a tie cannot repeat or
 * skip a row. Totals are never taken from a page: they are SQL aggregates of the whole range.
 */
export async function listActivities(
  tx: DbOrTx,
  userId: string,
  options: {
    sport?: ActivitySport;
    cursor?: { startedAt: Date; id: string } | null;
    pageSize?: number;
  } = {},
): Promise<ActivityPage> {
  const pageSize = Math.min(options.pageSize ?? 50, 100);
  const where = [eq(activities.userId, userId), eq(activities.status, "completed")];
  if (options.sport) where.push(eq(activities.sport, options.sport));
  if (options.cursor) {
    where.push(
      or(
        lt(activities.startedAt, options.cursor.startedAt),
        and(
          eq(activities.startedAt, options.cursor.startedAt),
          lt(activities.id, options.cursor.id),
        ),
      )!,
    );
  }
  const rows = await tx
    .select()
    .from(activities)
    .where(and(...where))
    .orderBy(desc(activities.startedAt), desc(activities.id))
    .limit(pageSize + 1);
  const page = rows.slice(0, pageSize);
  const records = await Promise.all(
    page.map(async (row) =>
      toRecord(row, await detailFor(tx, userId, row.id, row.sport, row.durationMs)),
    ),
  );
  const last = page[page.length - 1];
  return {
    activities: records,
    cursor:
      rows.length > pageSize && last
        ? { startedAt: last.startedAt.toISOString(), id: last.id }
        : null,
  };
}

/** Counts, days and recorded time, computed over the whole range rather than a page (§9.1). */
export async function activityTotals(
  tx: DbOrTx,
  userId: string,
  options: { from?: string; to?: string } = {},
): Promise<
  {
    sport: ActivitySport;
    count: number;
    days: number;
    durationMs: number;
    unknownDurations: number;
  }[]
> {
  const where = [eq(activities.userId, userId), eq(activities.status, "completed")];
  if (options.from) where.push(sql`${activities.occurredOn} >= ${options.from}`);
  if (options.to) where.push(sql`${activities.occurredOn} <= ${options.to}`);
  const rows = await tx
    .select({
      sport: activities.sport,
      count: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct ${activities.occurredOn})::int`,
      durationMs: sql<number>`coalesce(sum(${activities.durationMs}), 0)::bigint`,
      unknownDurations: sql<number>`count(*) filter (where ${activities.durationMs} is null)::int`,
    })
    .from(activities)
    .where(and(...where))
    .groupBy(activities.sport)
    .orderBy(asc(activities.sport));
  return rows.map((row) => ({ ...row, durationMs: Number(row.durationMs) }));
}

/**
 * The canonical parent of a strength session, created and finished with the session itself.
 *
 * Only ever called where canonical writes are switched on. The legacy path continues to write
 * a session with no parent, which is what keeps the bridge release safe to deploy before the
 * cutover (§10.4).
 */
export async function openStrengthParent(
  tx: DbOrTx,
  userId: string,
  session: { id: string; startedAt: Date },
  timeZone?: string,
): Promise<void> {
  const zone = timeZone ?? (await ownerTimeZone(tx, userId));
  const [existing] = await tx
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, session.id)))
    .limit(1);
  if (existing) return;
  await tx.insert(activities).values({
    id: session.id,
    userId,
    sport: "strength",
    status: "in_progress",
    outcome: "logged",
    startedAt: session.startedAt,
    recordedTimeZone: zone,
    timeZoneSource: "profile_at_entry",
    occurredOn: localDate(session.startedAt, zone),
    // Strength effort lives on its sets. The parent adds no second question (LOG-18).
    effortStatus: "unknown",
    sourceKind: "manual",
  });
  await tx
    .update(workoutSessions)
    .set({ activityId: session.id })
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, session.id)));
}

export async function closeStrengthParent(
  tx: DbOrTx,
  userId: string,
  sessionId: string,
  completedAt: Date,
): Promise<void> {
  const [session] = await tx
    .select({ activityId: workoutSessions.activityId, startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, sessionId)))
    .limit(1);
  if (!session?.activityId) return;
  // Elapsed time, unless the session was left open longer than a duration may sanely be:
  // an unrecorded duration is honest, and finishing must not fail on an old open session.
  const elapsed = completedAt.getTime() - session.startedAt.getTime();
  await tx
    .update(activities)
    .set({
      status: "completed",
      durationMs: elapsed > 0 && elapsed <= DURATION_MS.max ? elapsed : null,
      updatedAt: new Date(),
    })
    .where(and(eq(activities.userId, userId), eq(activities.id, session.activityId)));
}

export async function discardStrengthParent(
  tx: DbOrTx,
  userId: string,
  sessionId: string,
): Promise<void> {
  const [session] = await tx
    .select({ activityId: workoutSessions.activityId })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, sessionId)))
    .limit(1);
  if (!session?.activityId) return;
  await tx
    .update(workoutSessions)
    .set({ activityId: null })
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, sessionId)));
  await tx
    .delete(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, session.activityId)));
}

async function ownerTimeZone(tx: DbOrTx, userId: string): Promise<string> {
  const [row] = await tx
    .select({ timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.timeZone ?? "UTC";
}

function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
