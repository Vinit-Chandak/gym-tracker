import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  coachChangeRecords,
  coachPreferences,
  coachProgramRequests,
  coachRequestDecisions,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  programDrafts,
  sessionPlans,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import type { ProgramBlueprint } from "@/domain/program-blueprint";

/**
 * Migration 0037, against rows written before it.
 *
 * Every test database migrates a fresh schema, where the data half of 0037 matches nothing.
 * So the legacy rows are written afterwards, back-dated to before 0034 shipped, and the file
 * is run again the way the migrator runs it: one transaction. The column additions are
 * idempotent for exactly this reason.
 */

let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0037_coaching_flow_review.sql", "utf8");
  await t.client.exec("BEGIN");
  try {
    for (const statement of file.split("--> statement-breakpoint")) {
      await t.client.exec(statement.trim());
    }
    await t.client.exec("COMMIT");
  } catch (error) {
    await t.client.exec("ROLLBACK");
    throw error;
  }
}

const BEFORE = new Date("2026-09-21T04:19:00Z");
const AFTER = new Date("2026-09-23T04:19:00Z");

/** The template with its runs written the way a pre-0034 coach wrote them: out of ten. */
function outOfTen(): ProgramBlueprint {
  const plan = structuredClone(STRENGTH_AESTHETICS_HYBRID_8WK) as ProgramBlueprint;
  plan.runs = plan.runs.map((run, index) => ({
    ...run,
    rpe: index === 0 ? [0, 0] : run.rpe[1] === 1 ? [3, 3] : [3, 4],
  }));
  return plan;
}

async function athlete(email: string) {
  const user = await t.createAuthUser(email);
  await t.db.insert(coachPreferences).values({ userId: user.id, mode: "coach" });
  return user.id;
}

async function draft(
  userId: string,
  input: Partial<typeof programDrafts.$inferInsert> & { createdAt: Date },
) {
  const [row] = await t.db
    .insert(programDrafts)
    .values({
      userId,
      source: "weekly",
      status: "activated",
      blueprint: outOfTen(),
      sourceRevision: 1,
      ...input,
    })
    .returning();
  return row!;
}

const efforts = (plan: ProgramBlueprint) => plan.runs.map((run) => run.rpe);

it("puts drafts written before 0034 on the five-step scale, and nothing written after", async () => {
  const userId = await athlete("scale@example.test");
  const old = await draft(userId, { createdAt: BEFORE });
  const fresh = await draft(userId, { createdAt: AFTER });

  await runMigration();

  const [rescaled] = await t.db.select().from(programDrafts).where(eq(programDrafts.id, old.id));
  // The same map 0034 used: 3–4 → 1–2, 3 → 1, and zero stays "nothing asked".
  expect(efforts(rescaled!.blueprint)[0]).toEqual([0, 0]);
  expect(new Set(efforts(rescaled!.blueprint).slice(1).map(String))).toEqual(
    new Set(["1,2", "1,1"]),
  );
  const [untouched] = await t.db.select().from(programDrafts).where(eq(programDrafts.id, fresh.id));
  expect(untouched!.blueprint).toEqual(fresh.blueprint);
});

it("rescales the programme a change record kept, which later checks compare against", async () => {
  const userId = await athlete("record@example.test");
  const [record] = await t.db
    .insert(coachChangeRecords)
    .values({ userId, changes: [], programBefore: outOfTen(), createdAt: BEFORE })
    .returning();

  await runMigration();

  const [after] = await t.db
    .select()
    .from(coachChangeRecords)
    .where(eq(coachChangeRecords.id, record!.id));
  expect(efforts(after!.programBefore!).slice(1).every(([, max]) => max! <= 2)).toBe(true);
});

it("closes an old proposal unanswered and gives its asks back to the coach", async () => {
  const userId = await athlete("pending@example.test");
  const waiting = await draft(userId, { status: "ready", createdAt: BEFORE });
  const manual = await draft(userId, { source: "manual", status: "editing", createdAt: BEFORE });
  const recent = await draft(userId, { status: "ready", createdAt: AFTER });
  const requestId = crypto.randomUUID();
  await t.db.insert(coachProgramRequests).values({
    id: requestId,
    userId,
    sourceId: `note:${crypto.randomUUID()}`,
    quote: "anytime does not have horizontal leg press",
    summary: "Leg press at Anytime",
    state: "proposed",
    detail: "Falls back to the 45° press.",
    draftId: waiting.id,
    changeRefs: ["slot:x"],
  });

  await runMigration();

  const rows = await t.db.select().from(programDrafts).where(eq(programDrafts.userId, userId));
  const byId = new Map(rows.map((row) => [row.id, row]));
  expect(byId.get(waiting.id)).toMatchObject({ status: "superseded", closedAs: "outdated" });
  expect(byId.get(waiting.id)!.closedAt).not.toBeNull();
  // The athlete's own draft and anything written on the new scale are left alone.
  expect(byId.get(manual.id)!.status).toBe("editing");
  expect(byId.get(recent.id)!.status).toBe("ready");

  const [request] = await t.db
    .select()
    .from(coachProgramRequests)
    .where(eq(coachProgramRequests.id, requestId));
  expect(request).toMatchObject({ state: "waiting", draftId: null, changeRefs: [], detail: "" });
  const history = await t.db
    .select()
    .from(coachRequestDecisions)
    .where(eq(coachRequestDecisions.requestId, requestId));
  expect(history.map((entry) => entry.state)).toEqual(["waiting"]);
  // A proposal nobody asked for has no ask to bring the review forward, so this does.
  const [preference] = await t.db
    .select()
    .from(coachPreferences)
    .where(eq(coachPreferences.userId, userId));
  expect(preference!.reviewRequestedAt).not.toBeNull();
});

/** A run prescription the way sessions were written before 0034: every effort out of ten. */
function sessionOutOfTen(targetEffort: [number, number] | null) {
  return {
    prescriptionVersion: 1,
    sport: "running",
    structureSource: "authored",
    title: null,
    sessionTargets: { durationMs: [1_800_000, 2_100_000], distanceMetres: null, effort: targetEffort },
    nodes: [
      {
        kind: "step",
        id: "warm",
        phase: "warmup",
        action: "run",
        target: { kind: "duration", ms: [300_000, 300_000] },
        effort: null,
        stroke: null,
        notes: null,
      },
      {
        kind: "repeat",
        id: "strides",
        repetitions: 4,
        steps: [
          {
            kind: "step",
            id: "stride",
            phase: "main",
            action: "run",
            target: { kind: "duration", ms: [20_000, 20_000] },
            effort: [6, 7],
            stroke: null,
            notes: null,
          },
        ],
        restBetweenMs: 60_000,
      },
    ],
    running: { paceNote: "Conversational", progressionNote: null, symptomStopRule: null, note: null },
    instructions: null,
    notes: null,
    legacy: null,
  } as unknown as typeof occurrenceVersions.$inferInsert.prescription;
}

const dayFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** A scheduled run with its versions in the order they were written; the last is current. */
async function session(
  userId: string,
  versions: { createdAt: Date; scheduledOn: string; prescription: unknown }[],
  disposition: "pending" | "cancelled" = "pending",
) {
  const [occurrence] = await t.db
    .insert(plannedOccurrences)
    .values({ userId, sport: "running", disposition })
    .returning();
  let current: { id: string } | undefined;
  for (const version of versions)
    [current] = await t.db
      .insert(occurrenceVersions)
      .values({
        occurrenceId: occurrence!.id,
        userId,
        sport: "running",
        scheduledOn: version.scheduledOn,
        schedulingZone: "UTC",
        prescription: version.prescription as typeof occurrenceVersions.$inferInsert.prescription,
        createdAt: version.createdAt,
      })
      .returning({ id: occurrenceVersions.id });
  await t.db
    .update(plannedOccurrences)
    .set({ currentRevisionId: current!.id })
    .where(eq(plannedOccurrences.id, occurrence!.id));
  return { id: occurrence!.id, revisionId: current!.id };
}

async function current(occurrenceId: string) {
  const [row] = await t.db
    .select({ revisionId: plannedOccurrences.currentRevisionId, prescription: occurrenceVersions.prescription })
    .from(plannedOccurrences)
    .innerJoin(occurrenceVersions, eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId))
    .where(eq(plannedOccurrences.id, occurrenceId));
  return row!;
}

it("writes upcoming sessions still on the old scale again on five steps, and leaves history alone", async () => {
  const userId = await athlete("sessions@example.test");
  const upcoming = await session(userId, [
    { createdAt: BEFORE, scheduledOn: dayFromNow(3), prescription: sessionOutOfTen([3, 4]) },
  ]);
  // Moved after 0034: the new version copies the old prescription word for word.
  const moved = await session(userId, [
    { createdAt: BEFORE, scheduledOn: dayFromNow(4), prescription: sessionOutOfTen([3, 4]) },
    { createdAt: AFTER, scheduledOn: dayFromNow(5), prescription: sessionOutOfTen([3, 4]) },
  ]);
  const past = await session(userId, [
    { createdAt: BEFORE, scheduledOn: dayFromNow(-3), prescription: sessionOutOfTen([3, 4]) },
  ]);
  const cancelled = await session(
    userId,
    [{ createdAt: BEFORE, scheduledOn: dayFromNow(6), prescription: sessionOutOfTen([3, 4]) }],
    "cancelled",
  );
  // Written after 0034, so already out of five, even though its numbers look the same.
  const fresh = await session(userId, [
    { createdAt: AFTER, scheduledOn: dayFromNow(7), prescription: sessionOutOfTen([1, 2]) },
  ]);
  const [plan] = await t.db
    .insert(sessionPlans)
    .values({
      userId,
      sport: "running",
      planVersion: 2,
      occurrenceId: upcoming.id,
      occurrenceRevisionId: upcoming.revisionId,
      trigger: "nightly",
      summary: "Run it as approved.",
      exercises: [],
    })
    .returning();

  await runMigration();

  const revised = await current(upcoming.id);
  expect(revised.revisionId).not.toBe(upcoming.revisionId);
  const prescription = revised.prescription as unknown as ReturnType<typeof sessionOutOfTen> & {
    sessionTargets: { effort: number[] };
    nodes: { effort?: number[] | null; steps?: { effort: number[] }[] }[];
  };
  // 0034's map: 3–4 → 1–2, 6–7 → 3; an effort nobody set stays unset.
  expect(prescription.sessionTargets.effort).toEqual([1, 2]);
  expect(prescription.nodes[0]!.effort).toBeNull();
  expect(prescription.nodes[1]!.steps![0]!.effort).toEqual([3, 3]);
  // The version it replaced is history and says what it always said.
  const [old] = await t.db
    .select()
    .from(occurrenceVersions)
    .where(eq(occurrenceVersions.id, upcoming.revisionId));
  expect((old!.prescription as unknown as { sessionTargets: { effort: number[] } }).sessionTargets.effort).toEqual([3, 4]);
  // A preparation written against the old version no longer stands for the session.
  const [withdrawn] = await t.db.select().from(sessionPlans).where(eq(sessionPlans.id, plan!.id));
  expect(withdrawn!.status).toBe("superseded");
  const events = await t.db
    .select()
    .from(occurrenceEvents)
    .where(eq(occurrenceEvents.occurrenceId, upcoming.id));
  expect(events.map((event) => [event.kind, event.actor])).toEqual([["revised", "migration"]]);

  expect((await current(moved.id)).revisionId).not.toBe(moved.revisionId);
  for (const untouched of [past, cancelled, fresh])
    expect((await current(untouched.id)).revisionId).toBe(untouched.revisionId);

  // Run again, it finds nothing left on the old scale.
  await runMigration();
  expect((await current(upcoming.id)).revisionId).toBe(revised.revisionId);
});

