import { config as loadEnv } from "dotenv";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { effortOnCurrentScale } from "../domain/activity";
import {
  cycleSlotLineage,
  legacyProgramRunToPrescription,
  legacyPlannedDate,
  unattachedEnduranceLineage,
} from "../domain/legacy-multisport";
import { cycleDayForRunWeekday } from "../domain/program-blueprint-v2";
import { getMigrationDatabaseUrl } from "../lib/env";
import { auditMultisport } from "./multisport-audit";
import { createMigrationClient, describeTarget } from "./migrate";
import * as schema from "./schema";
import {
  activities,
  multisportMigrationIssues,
  multisportMigrationLinks,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  programFamilies,
  programRuns,
  programs,
  programSlotEvents,
  runningActivityDetails,
  runs,
  userSportPreferences,
  workoutSessions,
} from "./schema";
import type { Db, DbOrTx } from "./types";

/**
 * Building the canonical projection from what the old model wrote (plan §§10.2–10.5).
 *
 * The rule the whole thing obeys: legacy rows are the source of truth until cutover, and this
 * only ever reads them. It writes canonical rows beside them and records every mapping in the
 * ledger, so running it twice adds nothing, an interrupted run resumes where it stopped, and
 * anything ambiguous is recorded as an issue rather than decided by a coin toss.
 *
 * The one write into an existing table is `workout_sessions.activity_id`, the additive column
 * that points a session at its canonical parent. It adds a link; it changes no history.
 *
 * Strength scheduling is deliberately not projected into occurrences. Lifting keeps its
 * flexible sequence over programme days (§2.3), so only endurance work becomes dated
 * occurrences here.
 */

export const MULTISPORT_BACKFILL = "multisport_canonical_v1";

export type BackfillOptions = {
  /** One account, for rehearsal and support. Omitted, every account is processed. */
  userId?: string;
  /** Report what would be written and write nothing. */
  dryRun?: boolean;
  /** Rows per statement batch. */
  chunkSize?: number;
  /** Process an account even though the audit found a blocking issue for it. Off by default. */
  ignoreBlocking?: boolean;
};

export type BackfillSummary = {
  accounts: number;
  /** Accounts held back by a blocking audit issue. */
  blockedAccounts: number;
  families: number;
  runActivities: number;
  strengthActivities: number;
  occurrences: number;
  revisions: number;
  resolutions: number;
  legacyResolutions: number;
  skippedEvents: number;
  preferences: number;
  dryRun: boolean;
};

const emptySummary = (dryRun: boolean): BackfillSummary => ({
  accounts: 0,
  blockedAccounts: 0,
  families: 0,
  runActivities: 0,
  strengthActivities: 0,
  occurrences: 0,
  revisions: 0,
  resolutions: 0,
  legacyResolutions: 0,
  skippedEvents: 0,
  preferences: 0,
  dryRun,
});

type Account = { id: string; timeZone: string; shareTraining: boolean };

/** A source row already mapped is left alone: this is what makes a second run a no-op. */
async function mappedSourceIds(
  db: DbOrTx,
  userId: string,
  sourceKind: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ sourceId: multisportMigrationLinks.sourceId })
    .from(multisportMigrationLinks)
    .where(
      and(
        eq(multisportMigrationLinks.userId, userId),
        eq(multisportMigrationLinks.sourceKind, sourceKind),
      ),
    );
  return new Set(rows.map((row) => row.sourceId));
}

async function recordLink(
  db: DbOrTx,
  userId: string,
  link: {
    sourceKind: string;
    sourceId: string;
    targetKind: string;
    targetId: string;
    reason: string;
    checksum?: string;
  },
): Promise<void> {
  await db
    .insert(multisportMigrationLinks)
    .values({ userId, ...link })
    .onConflictDoNothing();
}

async function recordIssue(
  db: DbOrTx,
  userId: string,
  issue: { category: string; sourceKind: string; sourceId?: string; relatedId?: string },
): Promise<void> {
  await db
    .insert(multisportMigrationIssues)
    .values({ userId, status: "open", ...issue })
    .onConflictDoNothing();
}

export async function backfillMultisport(
  db: Db,
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const { userId, dryRun = false, chunkSize = 500, ignoreBlocking = false } = options;
  const summary = emptySummary(dryRun);

  const accounts: Account[] = await db
    .select({
      id: profiles.id,
      timeZone: profiles.timeZone,
      shareTraining: profiles.shareTraining,
    })
    .from(profiles)
    .where(userId ? eq(profiles.id, userId) : sql`true`)
    .orderBy(asc(profiles.createdAt));

  for (const account of accounts) {
    const audit = await auditMultisport(db, { userId: account.id, detail: true });
    for (const issue of audit.issues) {
      if (!issue.blocking) continue;
      for (const reference of issue.references ?? []) {
        if (!dryRun)
          await recordIssue(db, account.id, {
            category: issue.category,
            sourceKind: reference.source,
            sourceId: reference.id,
            relatedId: reference.relatedId,
          });
      }
    }
    if (audit.blocked && !ignoreBlocking) {
      summary.blockedAccounts++;
      continue;
    }
    summary.accounts++;
    if (dryRun) {
      summary.runActivities += audit.counts.runs;
      summary.strengthActivities += audit.counts.workoutSessions;
      summary.occurrences += audit.counts.programRuns;
      summary.revisions += audit.counts.programRuns;
      summary.resolutions += audit.projection.loggedResolutions;
      summary.legacyResolutions += audit.projection.legacyCompletedResolutions;
      continue;
    }
    summary.families += await backfillFamilies(db, account);
    summary.runActivities += await backfillRuns(db, account, chunkSize);
    summary.strengthActivities += await backfillStrengthParents(db, account, chunkSize);
    const occurrences = await backfillOccurrences(db, account);
    summary.occurrences += occurrences.occurrences;
    summary.revisions += occurrences.revisions;
    const resolutions = await backfillResolutions(db, account);
    summary.resolutions += resolutions.logged;
    summary.legacyResolutions += resolutions.legacy;
    summary.skippedEvents += resolutions.skipped;
    summary.preferences += await backfillSportPreferences(db, account);
  }

  // Recorded only for a complete pass: every account, nothing held back, nothing rehearsed.
  // A deploy reads this to decide whether to run at all, so a partial pass must not claim to
  // be the whole one — an account skipped over a blocking issue has to be tried again once
  // the issue is resolved, and a marker written now is how it would never be.
  if (!dryRun && !userId && summary.blockedAccounts === 0)
    await db.execute(
      sql`insert into public.data_backfills (name) values (${MULTISPORT_BACKFILL})
          on conflict (name) do update set completed_at = now()`,
    );

  return summary;
}

/** The lineage registry, so an owner key can include the family (§6.3). */
async function backfillFamilies(db: DbOrTx, account: Account): Promise<number> {
  const rows = await db
    .selectDistinct({ familyId: programs.familyId })
    .from(programs)
    .where(eq(programs.userId, account.id));
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(programFamilies)
    .values(rows.map((row) => ({ id: row.familyId, userId: account.id })))
    .onConflictDoNothing()
    .returning({ id: programFamilies.id });
  return inserted.length;
}

async function backfillRuns(db: Db, account: Account, chunkSize: number): Promise<number> {
  const mapped = await mappedSourceIds(db, account.id, "runs");
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.userId, account.id))
    .orderBy(asc(runs.startedAt));
  let written = 0;
  for (const chunk of batches(
    rows.filter((row) => !mapped.has(row.id)),
    chunkSize,
  )) {
    // A parent and its typed detail are one write. The chunk is the unit of retry: an
    // interrupted one rolls back whole, and the ledger tells the next run where to resume.
    await db.transaction(async (tx) => {
      for (const row of chunk) {
        const outOfBounds = row.distanceMeters > 1_000_000 || row.durationSeconds > 604_800;
        const [activity] = await tx
          .insert(activities)
          .values({
            id: row.id,
            userId: account.id,
            sport: "running",
            status: "completed",
            outcome: "logged",
            startedAt: row.startedAt,
            recordedTimeZone: account.timeZone,
            timeZoneSource: "legacy_profile_snapshot",
            occurredOn: localDate(row.startedAt, account.timeZone),
            durationMs: row.durationSeconds * 1000,
            // `runs.rpe` is still written out of ten; the canonical column is out of five.
            effortValue: row.rpe === null ? null : effortOnCurrentScale(row.rpe),
            effortStatus:
              row.rpe === null ? "unknown" : row.effortReported ? "reported" : "legacy_unconfirmed",
            notes: row.notes,
            sourceKind: "legacy_manual",
            sourceReference: `runs:${row.id}`,
          })
          .onConflictDoNothing()
          .returning({ id: activities.id });
        if (!activity) continue;
        await tx.insert(runningActivityDetails).values({
          activityId: activity.id,
          userId: account.id,
          sport: "running",
          environment: row.mode,
          // Metres as stored. The unit the athlete typed was never recorded (§10.2).
          distanceMetres: row.distanceMeters,
          distanceNativeValue: row.distanceMeters,
          distanceNativeUnit: "m",
          surface: row.surface,
          legacyGymId: row.gymId,
          legacyWorkoutSessionId: row.workoutSessionId,
          legacyProgramRunId: row.programRunId,
          legacyOutOfBounds: outOfBounds,
        });
        await recordLink(tx, account.id, {
          sourceKind: "runs",
          sourceId: row.id,
          targetKind: "activities",
          targetId: activity.id,
          reason: "identity",
          checksum: `${row.distanceMeters}:${row.durationSeconds}:${row.rpe ?? "null"}`,
        });
        written++;
      }
    });
  }
  return written;
}

async function backfillStrengthParents(
  db: Db,
  account: Account,
  chunkSize: number,
): Promise<number> {
  const mapped = await mappedSourceIds(db, account.id, "workout_sessions");
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, account.id), isNull(workoutSessions.activityId)))
    .orderBy(asc(workoutSessions.startedAt));
  let written = 0;
  for (const chunk of batches(
    rows.filter((row) => !mapped.has(row.id)),
    chunkSize,
  )) {
    await db.transaction(async (tx) => {
      for (const row of chunk) {
        // A session id that is already an activity id belongs to a run: mint, and say so.
        const [clash] = await tx
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.id, row.id))
          .limit(1);
        const activityId = clash ? crypto.randomUUID() : row.id;
        const durationMs =
          row.completedAt === null
            ? null
            : Math.max(1, row.completedAt.getTime() - row.startedAt.getTime());
        const [activity] = await tx
          .insert(activities)
          .values({
            id: activityId,
            userId: account.id,
            sport: "strength",
            status: row.completedAt === null ? "in_progress" : "completed",
            outcome: "logged",
            startedAt: row.startedAt,
            recordedTimeZone: account.timeZone,
            timeZoneSource: "legacy_profile_snapshot",
            occurredOn: localDate(row.startedAt, account.timeZone),
            durationMs,
            // Strength effort lives on its sets; the parent asserts none (§4.2).
            effortStatus: "unknown",
            notes: row.notes,
            sourceKind: "legacy_manual",
            sourceReference: `workout_sessions:${row.id}`,
          })
          .onConflictDoNothing()
          .returning({ id: activities.id });
        if (!activity) continue;
        await tx
          .update(workoutSessions)
          .set({ activityId: activity.id })
          .where(eq(workoutSessions.id, row.id));
        await recordLink(tx, account.id, {
          sourceKind: "workout_sessions",
          sourceId: row.id,
          targetKind: "activities",
          targetId: activity.id,
          reason: clash ? "minted" : "identity",
        });
        written++;
      }
    });
  }
  return written;
}

/** Each planned run becomes one occurrence with one immutable revision. */
async function backfillOccurrences(
  db: DbOrTx,
  account: Account,
): Promise<{ occurrences: number; revisions: number }> {
  const mapped = await mappedSourceIds(db, account.id, "program_runs");
  const rows = await db
    .select({ planned: programRuns, program: programs })
    .from(programRuns)
    .innerJoin(programs, eq(programs.id, programRuns.programId))
    .where(eq(programRuns.userId, account.id))
    .orderBy(asc(programRuns.weekIndex), asc(programRuns.dayOfWeek));

  // Which slot of each programme's cycle a weekday's runs belong to. The old model named a
  // weekday and nothing else, so this is the only join there has ever been — but only a day
  // that actually runs can answer for one. A weekday with no running day leaves the work
  // unattached rather than handing it to whichever other day happens to share the date.
  const daysByProgram = new Map<
    string,
    { dayIndex: number; dayOfWeek: number; includesRun: boolean }[]
  >();
  for (const programId of new Set(rows.map(({ program }) => program.id))) {
    const days = await db
      .select({
        dayIndex: schema.programDays.dayIndex,
        dayOfWeek: schema.programDays.dayOfWeek,
        includesRun: schema.programDays.includesRun,
      })
      .from(schema.programDays)
      .where(eq(schema.programDays.programId, programId));
    daysByProgram.set(
      programId,
      days.flatMap((day) =>
        day.dayOfWeek === null
          ? []
          : [{ dayIndex: day.dayIndex, dayOfWeek: day.dayOfWeek, includesRun: day.includesRun }],
      ),
    );
  }

  let occurrences = 0;
  let revisions = 0;
  for (const { planned, program } of rows) {
    if (mapped.has(planned.id)) continue;
    const startDate = program.startDate;
    if (startDate === null) {
      await recordIssue(db, account.id, {
        category: "planned_run_without_start_date",
        sourceKind: "program_runs",
        sourceId: planned.id,
      });
      continue;
    }
    const scheduledOn = legacyPlannedDate(startDate, planned.weekIndex, planned.dayOfWeek);
    const prescription = legacyProgramRunToPrescription({
      id: planned.id,
      programId: planned.programId,
      weekIndex: planned.weekIndex,
      dayOfWeek: planned.dayOfWeek,
      durationMinMinutes: planned.durationMinMinutes,
      durationMaxMinutes: planned.durationMaxMinutes,
      distanceMinKm: planned.distanceMinKm,
      distanceMaxKm: planned.distanceMaxKm,
      rpeMin: planned.rpeMin,
      rpeMax: planned.rpeMax,
      paceNote: planned.paceNote,
      progressionNote: planned.progressionNote,
      stopRule: planned.stopRule,
      comment: planned.comment,
    });
    const cycleDayIndex = cycleDayForRunWeekday(
      daysByProgram.get(program.id) ?? [],
      planned.dayOfWeek,
    );
    if (cycleDayIndex === null)
      await recordIssue(db, account.id, {
        category: "planned_run_without_running_day",
        sourceKind: "program_runs",
        sourceId: planned.id,
      });
    const [occurrence] = await db
      .insert(plannedOccurrences)
      .values({
        userId: account.id,
        sport: "running",
        familyId: program.familyId,
        // The slot the old row's weekday answers to is the role it played every week; a
        // weekday no running day falls on keeps an identity of its own and no slot.
        slotLineageId:
          cycleDayIndex === null
            ? unattachedEnduranceLineage(program.familyId, planned.dayOfWeek)
            : cycleSlotLineage(program.familyId, cycleDayIndex),
        cycleDayIndex,
        cycleIndex: planned.weekIndex,
        disposition: "pending",
        originalWeekIndex: planned.weekIndex,
        originalScheduledOn: scheduledOn,
        legacySource: `program_runs:${planned.id}`,
      })
      .onConflictDoNothing()
      .returning({ id: plannedOccurrences.id });
    if (!occurrence) continue;
    occurrences++;
    const [revision] = await db
      .insert(occurrenceVersions)
      .values({
        occurrenceId: occurrence.id,
        userId: account.id,
        sport: "running",
        programVersionId: program.id,
        scheduledOn,
        schedulingZone: account.timeZone,
        orderIndex: 0,
        prescription,
      })
      .returning({ id: occurrenceVersions.id });
    revisions++;
    await db
      .update(plannedOccurrences)
      .set({ currentRevisionId: revision!.id })
      .where(eq(plannedOccurrences.id, occurrence.id));
    await db.insert(occurrenceEvents).values({
      userId: account.id,
      occurrenceId: occurrence.id,
      kind: "created",
      actor: "migration",
      source: `program_runs:${planned.id}`,
      occurredOn: scheduledOn,
    });
    await recordLink(db, account.id, {
      sourceKind: "program_runs",
      sourceId: planned.id,
      targetKind: "planned_occurrences",
      targetId: occurrence.id,
      reason: "identity",
    });
  }
  return { occurrences, revisions };
}

/**
 * What became of each planned run, from the events the old model wrote.
 *
 * A completion naming a run resolves its occurrence through that activity. A completion with
 * no run — migration 0011's rows among them — becomes an explicit legacy resolution, and no
 * activity is invented to stand behind it (MIG-02, AT-MIG-06).
 */
async function backfillResolutions(
  db: DbOrTx,
  account: Account,
): Promise<{ logged: number; legacy: number; skipped: number }> {
  const events = await db
    .select()
    .from(programSlotEvents)
    .where(and(eq(programSlotEvents.userId, account.id), eq(programSlotEvents.part, "run")));
  const mapped = await mappedSourceIds(db, account.id, "program_slot_events");

  let logged = 0;
  let legacy = 0;
  let skipped = 0;
  for (const event of events) {
    if (mapped.has(event.id)) continue;
    const occurrence = event.runId
      ? await occurrenceForRun(db, account.id, event.runId)
      : await occurrenceForSlot(db, account.id, event);
    if (!occurrence) {
      await recordIssue(db, account.id, {
        category: "unresolved_completion_event",
        sourceKind: "program_slot_events",
        sourceId: event.id,
        relatedId: event.runId ?? undefined,
      });
      continue;
    }
    if (event.status === "skipped") {
      await db
        .update(plannedOccurrences)
        .set({ disposition: "skipped" })
        .where(eq(plannedOccurrences.id, occurrence));
      await db.insert(occurrenceEvents).values({
        userId: account.id,
        occurrenceId: occurrence,
        kind: "skipped",
        actor: "migration",
        source: `program_slot_events:${event.id}`,
        occurredOn: event.occurredOn,
      });
      skipped++;
    } else if (event.runId) {
      // The run's activity keeps the same id, so the link is the run's own identity.
      const [revision] = await db
        .select({ id: occurrenceVersions.id })
        .from(occurrenceVersions)
        .where(
          and(
            eq(occurrenceVersions.userId, account.id),
            eq(occurrenceVersions.occurrenceId, occurrence),
          ),
        )
        .orderBy(asc(occurrenceVersions.createdAt))
        .limit(1);
      if (!revision) continue;
      await db
        .update(activities)
        .set({ occurrenceId: occurrence, performedRevisionId: revision.id })
        .where(and(eq(activities.userId, account.id), eq(activities.id, event.runId)));
      await db.insert(occurrenceEvents).values({
        userId: account.id,
        occurrenceId: occurrence,
        kind: "logged",
        activityId: event.runId,
        actor: "migration",
        source: `program_slot_events:${event.id}`,
        occurredOn: event.occurredOn,
      });
      logged++;
    } else {
      await db
        .update(plannedOccurrences)
        .set({ disposition: "legacy_completed" })
        .where(eq(plannedOccurrences.id, occurrence));
      await db.insert(occurrenceEvents).values({
        userId: account.id,
        occurrenceId: occurrence,
        kind: "legacy_resolved",
        actor: "migration",
        source: `program_slot_events:${event.id}`,
        occurredOn: event.occurredOn,
        detail: { note: event.note ?? null },
      });
      legacy++;
    }
    await recordLink(db, account.id, {
      sourceKind: "program_slot_events",
      sourceId: event.id,
      targetKind: "planned_occurrences",
      targetId: occurrence,
      reason: event.runId ? "event" : "legacy_resolution",
    });
  }
  return { logged, legacy, skipped };
}

/** The occurrence a raw run answered for, through the plan it named. */
async function occurrenceForRun(db: DbOrTx, userId: string, runId: string): Promise<string | null> {
  const [row] = await db
    .select({ programRunId: runs.programRunId })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .limit(1);
  if (!row?.programRunId) return null;
  return occurrenceForPlannedRun(db, userId, row.programRunId);
}

async function occurrenceForPlannedRun(
  db: DbOrTx,
  userId: string,
  programRunId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: plannedOccurrences.id })
    .from(plannedOccurrences)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(plannedOccurrences.legacySource, `program_runs:${programRunId}`),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * A completion with no run names a cycle and a day, not a plan. It can only be resolved when
 * that programme has exactly one planned run on the day in question; anything else is an
 * ambiguity to report rather than a guess to make (§10.3).
 */
async function occurrenceForSlot(
  db: DbOrTx,
  userId: string,
  event: { programId: string; cycleIndex: number; dayIndex: number },
): Promise<string | null> {
  const [day] = await db
    .select({ dayOfWeek: schema.programDays.dayOfWeek })
    .from(schema.programDays)
    .where(
      and(
        eq(schema.programDays.programId, event.programId),
        eq(schema.programDays.dayIndex, event.dayIndex),
      ),
    )
    .limit(1);
  if (!day?.dayOfWeek) return null;
  const candidates = await db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(
      and(
        eq(programRuns.userId, userId),
        eq(programRuns.programId, event.programId),
        eq(programRuns.weekIndex, event.cycleIndex),
        eq(programRuns.dayOfWeek, day.dayOfWeek),
      ),
    );
  if (candidates.length !== 1) return null;
  return occurrenceForPlannedRun(db, userId, candidates[0]!.id);
}

/**
 * Sport preferences for an existing account.
 *
 * Strength and running are what this account already does, and they keep the sharing choice
 * they already have under the global switch. Cycling and swimming arrive switched off and
 * private: a migration does not enable a sport nobody asked for, and it never opens a
 * category that was private (SOCIAL-02).
 */
async function backfillSportPreferences(db: DbOrTx, account: Account): Promise<number> {
  const inserted = await db
    .insert(userSportPreferences)
    .values([
      {
        userId: account.id,
        sport: "strength" as const,
        enabled: true,
        shareStats: account.shareTraining,
      },
      {
        userId: account.id,
        sport: "running" as const,
        enabled: true,
        shareStats: account.shareTraining,
      },
      { userId: account.id, sport: "cycling" as const, enabled: false, shareStats: false },
      { userId: account.id, sport: "swimming" as const, enabled: false, shareStats: false },
    ])
    .onConflictDoNothing()
    .returning({ sport: userSportPreferences.sport });
  return inserted.length;
}

function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function* batches<T>(rows: readonly T[], size: number): Generator<T[]> {
  for (let index = 0; index < rows.length; index += size) yield rows.slice(index, index + size);
}

export type ReconciliationCheck = {
  name: string;
  ok: boolean;
  expected: number;
  actual: number;
  detail?: string;
};

export type ReconciliationReport = {
  generatedAt: string;
  userId: string | null;
  checks: readonly ReconciliationCheck[];
  ok: boolean;
};

/**
 * Cardinality and ownership, re-derived from the legacy tables rather than from the ledger.
 * A check that reads its own bookkeeping proves nothing (§10.5).
 */
export async function reconcileMultisport(
  db: DbOrTx,
  options: { userId?: string } = {},
): Promise<ReconciliationReport> {
  const { userId } = options;
  const scope = (column: string) => (userId ? sql` and ${sql.raw(column)} = ${userId}` : sql``);
  const value = async (statement: ReturnType<typeof sql>): Promise<number> => {
    const result = await db.execute(statement);
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    return Number((rows[0] as { value: number | string })?.value ?? 0);
  };

  const runCount = await value(
    sql`select count(*)::int as value from public.runs r where true${scope("r.user_id")}`,
  );
  const runParents = await value(
    sql`select count(*)::int as value from public.runs r
        join public.activities a on a.id = r.id and a.user_id = r.user_id and a.sport = 'running'
        where true${scope("r.user_id")}`,
  );
  const sessionCount = await value(
    sql`select count(*)::int as value from public.workout_sessions s where true${scope("s.user_id")}`,
  );
  const sessionParents = await value(
    sql`select count(*)::int as value from public.workout_sessions s
        join public.activities a on a.id = s.activity_id and a.user_id = s.user_id and a.sport = 'strength'
        where true${scope("s.user_id")}`,
  );
  const plannedCount = await value(
    sql`select count(*)::int as value from public.program_runs pr where true${scope("pr.user_id")}`,
  );
  const occurrenceCount = await value(
    sql`select count(*)::int as value from public.planned_occurrences o
        where o.legacy_source like 'program_runs:%'${scope("o.user_id")}`,
  );
  const duplicateResolutions = await value(
    sql`select count(*)::int as value from (
          select a.occurrence_id from public.activities a
          where a.occurrence_id is not null${scope("a.user_id")}
          group by a.occurrence_id having count(*) > 1) d`,
  );
  const crossOwner = await value(
    sql`select count(*)::int as value from public.activities a
        join public.planned_occurrences o on o.id = a.occurrence_id
        where o.user_id <> a.user_id${scope("a.user_id")}`,
  );
  const distanceDrift = await value(
    sql`select count(*)::int as value from public.runs r
        join public.running_activity_details d on d.activity_id = r.id
        where d.distance_metres <> r.distance_meters${scope("r.user_id")}`,
  );
  const durationDrift = await value(
    sql`select count(*)::int as value from public.runs r
        join public.activities a on a.id = r.id
        where a.duration_ms <> r.duration_seconds * 1000${scope("r.user_id")}`,
  );
  // The value is compared through the same rescale 0033 applied, not raw: `runs.rpe` keeps
  // the tens it was written in, and the canonical column holds fives. Comparing them
  // directly would report drift on every correctly migrated run.
  const effortDrift = await value(
    sql`select count(*)::int as value from public.runs r
        join public.activities a on a.id = r.id
        where a.effort_status <> (case when r.rpe is null then 'unknown'
                                       when r.effort_reported then 'reported'
                                       else 'legacy_unconfirmed' end)::effort_status
           or a.effort_value is distinct from
              (case when r.rpe is null then null else greatest(1, floor(r.rpe / 2)) end)${scope("r.user_id")}`,
  );
  const invented = await value(
    sql`select count(*)::int as value from public.occurrence_events e
        where e.kind = 'legacy_resolved' and e.activity_id is not null${scope("e.user_id")}`,
  );

  const checks: ReconciliationCheck[] = [
    {
      name: "one canonical parent per run",
      ok: runParents === runCount,
      expected: runCount,
      actual: runParents,
    },
    {
      name: "one canonical parent per workout session",
      ok: sessionParents === sessionCount,
      expected: sessionCount,
      actual: sessionParents,
    },
    {
      name: "one occurrence per planned run",
      ok: occurrenceCount === plannedCount,
      expected: plannedCount,
      actual: occurrenceCount,
    },
    {
      name: "no occurrence resolved twice",
      ok: duplicateResolutions === 0,
      expected: 0,
      actual: duplicateResolutions,
    },
    { name: "no cross-owner resolution", ok: crossOwner === 0, expected: 0, actual: crossOwner },
    { name: "distances unchanged", ok: distanceDrift === 0, expected: 0, actual: distanceDrift },
    { name: "durations unchanged", ok: durationDrift === 0, expected: 0, actual: durationDrift },
    {
      name: "effort provenance unchanged",
      ok: effortDrift === 0,
      expected: 0,
      actual: effortDrift,
      detail: "a legacy unconfirmed rating is never promoted to reported",
    },
    {
      name: "no activity invented for a legacy resolution",
      ok: invented === 0,
      expected: 0,
      actual: invented,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    userId: userId ?? null,
    checks,
    ok: checks.every((check) => check.ok),
  };
}

export function formatReconciliation(report: ReconciliationReport): string {
  return [
    `Multisport reconciliation — ${report.generatedAt}`,
    `Scope: ${report.userId ? `one account (${report.userId})` : "all accounts"}`,
    "",
    ...report.checks.map(
      (check) =>
        `  [${check.ok ? "ok " : "FAIL"}] ${check.name}: expected ${check.expected}, found ${check.actual}` +
        (check.detail ? `\n         ${check.detail}` : ""),
    ),
    "",
    report.ok ? "Result: reconciled." : "Result: FAILED. Do not switch write authority.",
  ].join("\n");
}

async function main(): Promise<void> {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const url = getMigrationDatabaseUrl();
  const client = createMigrationClient(url);
  const dryRun = process.argv.includes("--dry-run");
  try {
    const db = drizzle(client, { schema });
    console.log(`Multisport backfill${dryRun ? " (dry run)" : ""} → ${describeTarget(url)}`);
    const summary = await backfillMultisport(db, { dryRun });
    console.log(JSON.stringify(summary, null, 2));
    if (!dryRun) {
      const report = await reconcileMultisport(db);
      console.log(formatReconciliation(report));
      if (!report.ok) process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

// Only when run as a script; importing the functions above must touch nothing.
if (process.argv[1]?.endsWith("backfill-multisport.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
