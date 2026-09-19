import { and, eq } from "drizzle-orm";

import {
  gyms,
  profiles,
  programDays,
  programRuns,
  programs,
  programSlotEvents,
  runs,
  sharedSessionStats,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Accounts as the database held them before the multisport model: raw runs, a mixed
 * programme of strength days and planned runs, and completion events that answer for one
 * part of a day. The audit, the backfill and the constraint suites all read from here, so a
 * legacy shape only has to be described once, and the deliberately broken cases below are
 * the ones the migration policy has rules for rather than invented curiosities.
 *
 * Nothing here relaxes a live constraint to make a fixture: every anomaly is one the current
 * schema genuinely permits.
 */

export type LegacyAccount = {
  userId: string;
  timeZone: string;
  gymId: string;
  programId: string;
  /** Planned runs, in the order they were written. */
  programRunIds: string[];
  /** Raw runs, in the order they were written. */
  runIds: string[];
  workoutSessionIds: string[];
};

export type LegacySeedOptions = {
  timeZone?: string;
  /** Weeks of planned runs; each week plans a Wednesday and a Saturday run. */
  weeks?: number;
  /** Log the Wednesday run of week one and record its completion event. */
  logPlannedRun?: boolean;
  /** Log a run that answers for no plan at all. */
  logAdHocRun?: boolean;
  /** Finish one strength session and record its completion event. */
  finishSession?: boolean;
  /** Write the shared projections a follower would see for the logged work. */
  shareStats?: boolean;
};

const DAY_NAMES = ["Lower A", "Upper A", "Rest"];

/** A mixed programme, some logged work, and the events that resolved it. */
export async function seedLegacyAccount(
  db: DbOrTx,
  user: { id: string; email?: string | null },
  options: LegacySeedOptions = {},
): Promise<LegacyAccount> {
  const {
    timeZone = "Asia/Kolkata",
    weeks = 2,
    logPlannedRun = true,
    logAdHocRun = true,
    finishSession = true,
    shareStats = true,
  } = options;

  await ensureProfile(db, { id: user.id, email: user.email ?? null });
  await db.update(profiles).set({ timeZone }).where(eq(profiles.id, user.id));

  const [gym] = await db
    .insert(gyms)
    .values({ userId: user.id, name: "Anytime Fitness", slug: "anytime-fitness", kind: "gym" })
    .onConflictDoNothing({ target: [gyms.userId, gyms.slug] })
    .returning({ id: gyms.id });
  const gymId =
    gym?.id ??
    (
      await db
        .select({ id: gyms.id })
        .from(gyms)
        .where(and(eq(gyms.userId, user.id), eq(gyms.slug, "anytime-fitness")))
        .limit(1)
    )[0]!.id;

  const [program] = await db
    .insert(programs)
    .values({
      userId: user.id,
      familyId: crypto.randomUUID(),
      slug: "legacy-mixed",
      name: "Legacy mixed programme",
      status: "active",
      startDate: "2026-09-07",
      weeks,
      startDayIndex: 1,
    })
    .returning({ id: programs.id });
  const programId = program!.id;

  await db.insert(programDays).values(
    DAY_NAMES.map((name, index) => ({
      userId: user.id,
      programId,
      dayIndex: index + 1,
      name,
      dayOfWeek: index + 1,
      includesLifting: name !== "Rest",
      includesRun: index === 1,
    })),
  );

  const plannedRows = [];
  for (let week = 1; week <= weeks; week++) {
    for (const dayOfWeek of [3, 6]) {
      plannedRows.push({
        userId: user.id,
        programId,
        weekIndex: week,
        dayOfWeek,
        durationMinMinutes: 25,
        durationMaxMinutes: 35,
        distanceMinKm: 4,
        distanceMaxKm: 5,
        rpeMin: 3,
        rpeMax: 5,
        paceNote: "Conversational.",
        progressionNote: "Add five minutes next week.",
        stopRule: "Stop if the knee complains.",
        comment: "Easy week.",
      });
    }
  }
  const plannedRunIds = (
    await db.insert(programRuns).values(plannedRows).returning({ id: programRuns.id })
  ).map((row) => row.id);

  const runIds: string[] = [];
  if (logPlannedRun) {
    const [row] = await db
      .insert(runs)
      .values({
        userId: user.id,
        programRunId: plannedRunIds[0]!,
        mode: "outdoor",
        startedAt: new Date("2026-09-09T06:30:00Z"),
        durationSeconds: 1800,
        distanceMeters: 5000,
        rpe: 4,
        effortReported: true,
        notes: "Felt easy.",
      })
      .returning({ id: runs.id });
    runIds.push(row!.id);
    await db.insert(programSlotEvents).values({
      userId: user.id,
      programId,
      cycleIndex: 1,
      dayIndex: 2,
      part: "run",
      status: "completed",
      runId: row!.id,
      occurredOn: "2026-09-09",
    });
    if (shareStats) {
      await db.insert(sharedSessionStats).values({
        userId: user.id,
        sport: "run",
        sourceId: row!.id,
        title: "Run",
        occurredOn: "2026-09-09",
        startedAt: new Date("2026-09-09T06:30:00Z"),
        durationSeconds: 1800,
        distanceMeters: 5000,
        paceSecondsPerKm: 360,
      });
    }
  }
  if (logAdHocRun) {
    const [row] = await db
      .insert(runs)
      .values({
        userId: user.id,
        mode: "treadmill",
        startedAt: new Date("2026-09-11T12:00:00Z"),
        durationSeconds: 1500,
        distanceMeters: 4000,
        // A numeric effort nobody ever confirmed: the legacy_unconfirmed case.
        rpe: 5,
        effortReported: false,
        surface: "Treadmill",
      })
      .returning({ id: runs.id });
    runIds.push(row!.id);
  }

  const workoutSessionIds: string[] = [];
  if (finishSession) {
    const [row] = await db
      .insert(workoutSessions)
      .values({
        userId: user.id,
        programId,
        gymId,
        cycleIndex: 1,
        startedAt: new Date("2026-09-07T17:00:00Z"),
        completedAt: new Date("2026-09-07T18:10:00Z"),
        warmupCompleted: true,
      })
      .returning({ id: workoutSessions.id });
    workoutSessionIds.push(row!.id);
    await db.insert(programSlotEvents).values({
      userId: user.id,
      programId,
      cycleIndex: 1,
      dayIndex: 1,
      part: "session",
      status: "completed",
      workoutSessionId: row!.id,
      occurredOn: "2026-09-07",
    });
    if (shareStats) {
      await db.insert(sharedSessionStats).values({
        userId: user.id,
        sport: "workout",
        sourceId: row!.id,
        title: "Lower A",
        occurredOn: "2026-09-07",
        startedAt: new Date("2026-09-07T17:00:00Z"),
        durationSeconds: 4200,
        workingSets: 12,
      });
    }
  }

  return {
    userId: user.id,
    timeZone,
    gymId,
    programId,
    programRunIds: plannedRunIds,
    runIds,
    workoutSessionIds,
  };
}

/**
 * The completion migration 0011 wrote for a day whose run predates raw run records: an event
 * that resolves the plan with no run to point at. No activity may be fabricated for it.
 */
export async function seedLegacyCompletionWithoutRun(
  db: DbOrTx,
  account: LegacyAccount,
  slot: { cycleIndex: number; dayIndex: number; occurredOn: string },
): Promise<void> {
  await db.insert(programSlotEvents).values({
    userId: account.userId,
    programId: account.programId,
    cycleIndex: slot.cycleIndex,
    dayIndex: slot.dayIndex,
    part: "run",
    status: "completed",
    occurredOn: slot.occurredOn,
    note: "Backfilled from the programme sheet.",
  });
}

/** A second raw run claiming the same plan: ambiguous unless an event names the real one. */
export async function seedDuplicatePlannedRun(
  db: DbOrTx,
  account: LegacyAccount,
  programRunId: string,
): Promise<string> {
  const [row] = await db
    .insert(runs)
    .values({
      userId: account.userId,
      programRunId,
      mode: "outdoor",
      startedAt: new Date("2026-09-09T17:00:00Z"),
      durationSeconds: 1700,
      distanceMeters: 4800,
      rpe: 5,
      effortReported: true,
    })
    .returning({ id: runs.id });
  return row!.id;
}

/** A link into another account's programme. The raw run stays; the link is isolated. */
export async function seedCrossOwnerPlannedRun(
  db: DbOrTx,
  account: LegacyAccount,
  foreignProgramRunId: string,
): Promise<string> {
  const [row] = await db
    .insert(runs)
    .values({
      userId: account.userId,
      programRunId: foreignProgramRunId,
      mode: "outdoor",
      startedAt: new Date("2026-09-12T06:00:00Z"),
      durationSeconds: 1200,
      distanceMeters: 3000,
      rpe: 4,
      effortReported: true,
    })
    .returning({ id: runs.id });
  return row!.id;
}
