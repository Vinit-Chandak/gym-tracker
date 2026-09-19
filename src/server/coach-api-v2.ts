import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  activities,
  cyclingActivityDetails,
  occurrenceVersions,
  plannedOccurrences,
  programs,
  runningActivityDetails,
  swimmingActivityDetails,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { resolveOccurrence } from "@/domain/occurrences";
import {
  InvalidCursorError,
  listActivityPage,
  readActivityTotals,
  readAdherence,
  readComparableBests,
} from "@/server/repositories/activity-analytics";

/**
 * The sport-complete read API (plan §8.6).
 *
 * Version 1 is not changed, and is not quietly widened either: a v1 consumer asking for
 * running gets exactly the running payload it has always had. This is a second surface beside
 * it, with `version: 2`, its own cursors and its own aggregates — because a client that
 * parses a fixed shape is entitled to keep parsing it, and adding a swim to a run list is a
 * breaking change wearing a compatible coat (API-01).
 *
 * Two rules distinguish it from what a list endpoint would naturally do. Aggregates are
 * computed in SQL over the whole stated period, never over the page that happens to be in
 * hand. And a cursor carries a timestamp *and* an id, so two activities recorded at the same
 * instant cannot straddle a page boundary and lose one (AT-API-03/04).
 */

export const V2_VERSION = 2;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
/** Aggregates need a stated period. Without one, the default is the last four local weeks. */
export const DEFAULT_SUMMARY_DAYS = 28;
export const MAX_SUMMARY_DAYS = 366;

export class ApiRequestError extends Error {
  constructor(
    readonly detail: string,
    readonly status = 400,
  ) {
    super(detail);
    this.name = "ApiRequestError";
  }
}

const sportList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(ACTIVITY_SPORTS)).max(ACTIVITY_SPORTS.length));

/** `sport=cycling,swimming`, or nothing for every sport. An unknown name is an error. */
export function parseSports(raw: string | null): ActivitySport[] | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = sportList.safeParse(raw);
  if (!parsed.success)
    throw new ApiRequestError(
      `Unknown sport. Use a comma-separated list of ${ACTIVITY_SPORTS.join(", ")}.`,
    );
  return parsed.data;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000);
}

export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * The period an aggregate covers, stated explicitly rather than implied.
 *
 * Both ends are inclusive local dates, matching how the athlete reads their own calendar and
 * how the totals are grouped. A period longer than a year is refused rather than silently
 * truncated: a truncated total is a wrong total, and the client cannot tell.
 */
export function parsePeriod(params: URLSearchParams, today: string): { from: string; to: string } {
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const to = rawTo ?? today;
  if (!isoDate.safeParse(to).success)
    throw new ApiRequestError("Use from/to as YYYY-MM-DD dates in the account's time zone.");
  const from = rawFrom ?? addLocalDays(to, -(DEFAULT_SUMMARY_DAYS - 1));
  if (!isoDate.safeParse(from).success)
    throw new ApiRequestError("Use from/to as YYYY-MM-DD dates in the account's time zone.");
  const span = daysBetween(from, to);
  if (span < 0) throw new ApiRequestError("The period starts after it ends.");
  if (span + 1 > MAX_SUMMARY_DAYS)
    throw new ApiRequestError(
      `Ask for at most ${MAX_SUMMARY_DAYS} days at a time; page longer exports.`,
    );
  return { from, to };
}

export function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_PAGE_SIZE;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE)
    throw new ApiRequestError(`Use a limit between 1 and ${MAX_PAGE_SIZE}.`);
  return value;
}

/** One activity as v2 describes it: canonical sport, typed detail, and honest unknowns. */
async function activityDetails(
  tx: DbOrTx,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) return new Map();
  const [running, cycling, swimming] = await Promise.all([
    tx
      .select()
      .from(runningActivityDetails)
      .where(
        and(
          eq(runningActivityDetails.userId, userId),
          inArray(runningActivityDetails.activityId, [...ids]),
        ),
      ),
    tx
      .select()
      .from(cyclingActivityDetails)
      .where(
        and(
          eq(cyclingActivityDetails.userId, userId),
          inArray(cyclingActivityDetails.activityId, [...ids]),
        ),
      ),
    tx
      .select()
      .from(swimmingActivityDetails)
      .where(
        and(
          eq(swimmingActivityDetails.userId, userId),
          inArray(swimmingActivityDetails.activityId, [...ids]),
        ),
      ),
  ]);
  const out = new Map<string, Record<string, unknown>>();
  for (const row of running)
    out.set(row.activityId, {
      environment: row.environment,
      distanceMetres: row.distanceMetres,
      distanceNative: { value: row.distanceNativeValue, unit: row.distanceNativeUnit },
      surface: row.surface,
      elevationGainMetres: row.elevationGainMetres,
      treadmillInclinePercent: row.treadmillInclinePercent,
      averageHeartRate: row.averageHeartRate,
      maxHeartRate: row.maxHeartRate,
      cadenceStepsPerMinute: row.cadenceStepsPerMinute,
      legacyOutOfBounds: row.legacyOutOfBounds,
    });
  for (const row of cycling)
    out.set(row.activityId, {
      environment: row.environment,
      distanceMetres: row.distanceMetres,
      distanceNative:
        row.distanceNativeValue === null
          ? null
          : { value: row.distanceNativeValue, unit: row.distanceNativeUnit },
      assistance: row.assistance,
      resourceLabel: row.resourceLabel,
      averagePowerWatts: row.averagePowerWatts,
      averageCadenceRpm: row.averageCadenceRpm,
      averageHeartRate: row.averageHeartRate,
      maxHeartRate: row.maxHeartRate,
      elevationGainMetres: row.elevationGainMetres,
      legacyOutOfBounds: row.legacyOutOfBounds,
    });
  for (const row of swimming)
    out.set(row.activityId, {
      environment: row.environment,
      // Elapsed is the parent's duration; this is the swimming time when it is known, and
      // the gap between them is unclassified rather than measured rest (SWIM-02).
      activeMs: row.activeMs,
      distanceMethod: row.distanceMethod,
      distanceMetres:
        row.distanceMetres ??
        (row.lengths !== null && row.poolLengthMetres !== null
          ? row.lengths * row.poolLengthMetres
          : null),
      distanceNative:
        row.distanceNativeValue === null
          ? null
          : { value: row.distanceNativeValue, unit: row.distanceNativeUnit },
      pool:
        row.poolLengthNative === null
          ? null
          : {
              lengthNative: row.poolLengthNative,
              unit: row.poolLengthUnit,
              lengthMetres: row.poolLengthMetres,
            },
      lengths: row.lengths,
      stroke: row.stroke,
      strokeCount: row.strokeCount,
      resourceLabel: row.resourceLabel,
      averageHeartRate: row.averageHeartRate,
      maxHeartRate: row.maxHeartRate,
      legacyOutOfBounds: row.legacyOutOfBounds,
    });
  return out;
}

export async function v2Activities(
  tx: DbOrTx,
  userId: string,
  params: URLSearchParams,
  today: string,
) {
  const sports = parseSports(params.get("sport"));
  const limit = parseLimit(params.get("limit"));
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  for (const value of [from, to])
    if (value !== undefined && !isoDate.safeParse(value).success)
      throw new ApiRequestError("Use from/to as YYYY-MM-DD dates in the account's time zone.");
  let page;
  try {
    page = await listActivityPage(tx, userId, {
      sports,
      from,
      to,
      limit,
      cursor: params.get("cursor"),
    });
  } catch (error) {
    if (error instanceof InvalidCursorError) throw new ApiRequestError(error.message);
    throw error;
  }
  const details = await activityDetails(
    tx,
    userId,
    page.items.map((item) => item.id),
  );
  return {
    version: V2_VERSION,
    today,
    limit,
    activities: page.items.map((item) => ({
      id: item.id,
      sport: item.sport,
      startedAt: item.startedAt.toISOString(),
      occurredOn: item.occurredOn,
      durationMs: item.durationMs,
      effort: { value: item.effortValue, status: item.effortStatus },
      title: item.title,
      occurrenceId: item.occurrenceId,
      performedRevisionId: item.performedRevisionId,
      detail: details.get(item.id) ?? null,
    })),
    nextCursor: page.nextCursor,
    coverage:
      "One page, newest first. Read successive pages with nextCursor until it is null; the cursor is stable across inserts.",
  };
}

export async function v2Summary(
  tx: DbOrTx,
  userId: string,
  params: URLSearchParams,
  today: string,
) {
  const period = parsePeriod(params, today);
  const [totals, adherence, bests] = await Promise.all([
    readActivityTotals(tx, userId, period),
    readAdherence(tx, userId, period),
    readComparableBests(tx, userId, period),
  ]);
  return {
    version: V2_VERSION,
    period: { ...period, inclusive: true },
    totals: totals.bySport,
    trainingDays: totals.trainingDays,
    activities: totals.activities,
    adherence,
    comparableBests: bests,
    coverage:
      "Full SQL aggregates over the whole stated period, not a sample. unknownDistances and unknownDurations say what the totals could not include; zero and unknown are different answers.",
  };
}

export async function v2Program(tx: DbOrTx, userId: string, today: string) {
  const [program] = await tx
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  if (!program) return { version: V2_VERSION, today, program: null };
  const rows = await tx
    .select({
      id: plannedOccurrences.id,
      sport: plannedOccurrences.sport,
      disposition: plannedOccurrences.disposition,
      slotLineageId: plannedOccurrences.slotLineageId,
      cycleIndex: plannedOccurrences.cycleIndex,
      originalWeekIndex: plannedOccurrences.originalWeekIndex,
      originalScheduledOn: plannedOccurrences.originalScheduledOn,
      revisionId: occurrenceVersions.id,
      scheduledOn: occurrenceVersions.scheduledOn,
      orderIndex: occurrenceVersions.orderIndex,
      prescription: occurrenceVersions.prescription,
      activityId: activities.id,
      outcome: activities.outcome,
      occurredOn: activities.occurredOn,
    })
    .from(plannedOccurrences)
    .innerJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        eq(occurrenceVersions.userId, plannedOccurrences.userId),
      ),
    )
    .leftJoin(
      activities,
      and(
        eq(activities.occurrenceId, plannedOccurrences.id),
        eq(activities.userId, plannedOccurrences.userId),
      ),
    )
    .where(
      and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.familyId, program.familyId)),
    )
    .orderBy(asc(occurrenceVersions.scheduledOn), asc(occurrenceVersions.orderIndex));

  return {
    version: V2_VERSION,
    today,
    program: {
      id: program.id,
      familyId: program.familyId,
      slug: program.slug,
      name: program.name,
      version: program.version,
      startDate: program.startDate,
      weeks: program.weeks,
      occurrences: rows.map((row) => ({
        id: row.id,
        sport: row.sport,
        revisionId: row.revisionId,
        scheduledOn: row.scheduledOn,
        orderIndex: row.orderIndex,
        slotLineageId: row.slotLineageId,
        weekIndex: row.cycleIndex,
        originalWeekIndex: row.originalWeekIndex,
        originalScheduledOn: row.originalScheduledOn,
        prescription: row.prescription,
        resolution: resolveOccurrence(
          { disposition: row.disposition },
          row.activityId
            ? { id: row.activityId, outcome: row.outcome!, occurredOn: row.occurredOn! }
            : null,
        ),
      })),
      coverage:
        "Strength keeps its own cycle and projected sequence and has no occurrences here; read /api/coach/program/current for the strength cycle.",
    },
  };
}

/**
 * Whether the active programme is representable in v1 without loss.
 *
 * A v1 programme is days and planned runs. A programme carrying a ride or a swim has no
 * honest v1 shape, and a partial one would read as the complete programme — which is worse
 * than an error, because the client cannot tell. So it is `409 upgrade_required` with a
 * pointer to v2, never a silently truncated payload (API-01, AT-API-02).
 */
export async function programmeRepresentableInV1(
  tx: DbOrTx,
  userId: string,
): Promise<{ ok: true } | { ok: false; sports: ActivitySport[] }> {
  const [program] = await tx
    .select({ familyId: programs.familyId })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  if (!program) return { ok: true };
  const rows = await tx
    .selectDistinct({ sport: plannedOccurrences.sport })
    .from(plannedOccurrences)
    .where(
      and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.familyId, program.familyId)),
    );
  const unrepresentable = rows
    .map((row) => row.sport)
    .filter((sport) => sport === "cycling" || sport === "swimming");
  return unrepresentable.length === 0 ? { ok: true } : { ok: false, sports: unrepresentable };
}
