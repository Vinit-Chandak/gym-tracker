import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  coachJobs,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  programDrafts,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { nextPendingSlot, type SlotRef } from "@/domain/schedule";
import { ensureProfile } from "@/server/queries/profile";

import { enqueueCoachJob } from "./coaching-jobs";
import { sourceRevision } from "./coaching-state";
import { occurrencesForSlot, rescheduleOccurrence, skipOccurrence } from "./occurrences";
import {
  activateProgramDraft,
  adoptProgramme,
  archiveActiveProgram,
  copyProgramToDraft,
  refreshProgramDraft,
  saveManualDraft,
} from "./program-drafts";
import { materialiseMissingOccurrences, materialiseProgramme } from "./program-occurrences";
import { applyProposal, createProposal } from "./program-revisions";
import { createProgramFromBlueprint, readProgramBlueprint } from "./programs";
import { getSchedule, recordSlotEvent } from "./schedule";

/**
 * A programme's runs as occurrences, through the paths that start and change a programme.
 *
 * The run half of a day that lifts and runs is answered by its occurrence and nothing else, so
 * every path that writes a programme owes it occurrences, and every change to one has to reach
 * the occurrence Today is about to offer. These drive the repository functions the actions
 * call, against a template's real cycle, dated from the real today.
 */

const ZONE = "UTC";
const HYBRID = STRENGTH_AESTHETICS_HYBRID_8WK;
const MINUTE = 60_000;
/** The hybrid's running days: Easy Run + Arms and Easy Run + Light Upper. */
const RUN_DAYS = HYBRID.days.filter((day) => day.includesRun).map((day) => day.dayIndex);
const EASY_RUN_AND_ARMS = HYBRID.days.find((day) => day.dayIndex === 3)!;

let t: TestDatabase;
const today = todayInTimeZone(ZONE);

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  await withUser(t.db, user.id, async (tx) => {
    await ensureProfile(tx, user);
    await tx.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
  });
  return user;
}
type Athlete = Awaited<ReturnType<typeof athlete>>;
const as = <T>(a: Athlete, work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, a.id, work);

const adopt = (a: Athlete, startDate: string) =>
  as(a, (tx) => adoptProgramme(tx, a.id, HYBRID, { startDate }));

/** Every occurrence of one family, with the revision in force. */
async function familyOccurrences(a: Athlete, familyId: string) {
  return as(a, (tx) =>
    tx
      .select({
        id: plannedOccurrences.id,
        cycleIndex: plannedOccurrences.cycleIndex,
        cycleDayIndex: plannedOccurrences.cycleDayIndex,
        disposition: plannedOccurrences.disposition,
        scheduledOn: occurrenceVersions.scheduledOn,
        prescription: occurrenceVersions.prescription,
      })
      .from(plannedOccurrences)
      .innerJoin(
        occurrenceVersions,
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
      )
      .where(and(eq(plannedOccurrences.userId, a.id), eq(plannedOccurrences.familyId, familyId)))
      .orderBy(asc(occurrenceVersions.scheduledOn)),
  );
}

const runFor = async (a: Athlete, familyId: string, slot: SlotRef) => {
  const found = await as(a, (tx) =>
    occurrencesForSlot(tx, a.id, {
      familyId,
      cycleDayIndex: slot.dayIndex,
      cycleIndex: slot.cycleIndex,
    }),
  );
  expect(found).toHaveLength(1);
  return found[0]!;
};

const position = async (a: Athlete) => {
  const schedule = await as(a, (tx) => getSchedule(tx, a.id));
  return schedule ? nextPendingSlot(schedule.state) : null;
};

const minutes = (prescription: { sessionTargets: { durationMs: unknown } } | null) =>
  (prescription?.sessionTargets.durationMs as [number, number] | null)?.map((ms) => ms / MINUTE);

/**
 * Answers the sequence up to and including one slot: every workout done, every run skipped
 * on its own occurrence, as the athlete would from Today.
 */
async function answerThrough(a: Athlete, programId: string, familyId: string, through: SlotRef) {
  for (let cycleIndex = 1; cycleIndex <= through.cycleIndex; cycleIndex++)
    for (const day of HYBRID.days) {
      if (cycleIndex === through.cycleIndex && day.dayIndex > through.dayIndex) break;
      const slot = { cycleIndex, dayIndex: day.dayIndex };
      if (day.includesLifting || !day.includesRun)
        await as(a, (tx) =>
          recordSlotEvent(tx, a.id, programId, slot, "session", "completed", {
            occurredOn: today,
          }),
        );
      if (day.includesRun) {
        const run = await runFor(a, familyId, slot);
        await as(a, (tx) => skipOccurrence(tx, a.id, run.id));
      }
    }
}

describe("starting a template", () => {
  /**
   * Production: Profile › Programme › Start this programme wrote the programme and stopped.
   * No run had an occurrence, so the third day's run could never be answered, and the athlete
   * was offered "Easy Run + Arms" every day from then on.
   */
  it("gives its runs occurrences, so the sequence passes the first running day", async () => {
    const a = await athlete();
    const created = await adopt(a, today);

    const rows = await familyOccurrences(a, created.familyId);
    expect(rows).toHaveLength(HYBRID.runs.length);
    expect(new Set(rows.map((row) => row.cycleDayIndex))).toEqual(new Set(RUN_DAYS));

    // Lower A, Upper A and the workout of Easy Run + Arms: what is left of day 3 is its run.
    for (const dayIndex of [1, 2, 3])
      await as(a, (tx) =>
        recordSlotEvent(tx, a.id, created.id, { cycleIndex: 1, dayIndex }, "session", "completed", {
          occurredOn: today,
        }),
      );
    expect(await position(a)).toEqual({ cycleIndex: 1, dayIndex: 3 });

    const run = await runFor(a, created.familyId, { cycleIndex: 1, dayIndex: 3 });
    expect(run.sport).toBe("running");
    await as(a, (tx) => skipOccurrence(tx, a.id, run.id));
    expect(await position(a)).toEqual({ cycleIndex: 1, dayIndex: 4 });
  });

  it("retires the programme it replaces: its waiting change, its jobs and its runs ahead", async () => {
    const a = await athlete();
    const first = await adopt(a, addDays(today, -10));
    const [draft] = await as(a, async (tx) =>
      tx
        .insert(programDrafts)
        .values({
          userId: a.id,
          source: "weekly",
          status: "ready",
          blueprint: HYBRID,
          sourceRevision: await sourceRevision(tx, a.id),
          baseProgramId: first.id,
        })
        .returning(),
    );
    const { job } = await as(a, (tx) =>
      enqueueCoachJob(tx, a.id, {
        kind: "review_program",
        trigger: "weekly",
        dedupeKey: "review:replaced",
        target: { programId: first.id, batchDate: today },
      }),
    );

    const second = await adopt(a, today);
    expect(second.familyId).not.toBe(first.familyId);

    const [closed] = await as(a, (tx) =>
      tx.select().from(programDrafts).where(eq(programDrafts.id, draft!.id)),
    );
    expect(closed?.status).toBe("superseded");
    const [superseded] = await as(a, (tx) =>
      tx.select().from(coachJobs).where(eq(coachJobs.id, job.id)),
    );
    expect(superseded?.status).toBe("superseded");

    const old = await familyOccurrences(a, first.familyId);
    const missed = old.filter((row) => row.scheduledOn < today);
    const ahead = old.filter((row) => row.scheduledOn >= today);
    expect(missed.length).toBeGreaterThan(0);
    expect(ahead.length).toBeGreaterThan(0);
    // What was due while it ran and never done was missed then; nothing after it is owed.
    expect(missed.every((row) => row.disposition === "pending")).toBe(true);
    expect(ahead.every((row) => row.disposition === "cancelled")).toBe(true);
    const withdrawn = await as(a, (tx) =>
      tx
        .select()
        .from(occurrenceEvents)
        .where(and(eq(occurrenceEvents.userId, a.id), eq(occurrenceEvents.kind, "cancelled"))),
    );
    expect(withdrawn).toHaveLength(ahead.length);

    const fresh = await familyOccurrences(a, second.familyId);
    expect(fresh).toHaveLength(HYBRID.runs.length);
    expect(fresh.every((row) => row.disposition === "pending")).toBe(true);
  });
});

describe("leaving a programme", () => {
  const settled = async (a: Athlete, familyId: string) => {
    const rows = await familyOccurrences(a, familyId);
    return {
      missed: rows.filter((row) => row.scheduledOn < today).map((row) => row.disposition),
      ahead: rows.filter((row) => row.scheduledOn >= today).map((row) => row.disposition),
    };
  };

  it("withdraws the runs it had ahead, by a new block or by archiving", async () => {
    const a = await athlete();
    const first = await adopt(a, addDays(today, -10));

    // A new block, approved from a draft of a programme of its own.
    const copy = await as(a, (tx) => copyProgramToDraft(tx, a.id, first.id, true));
    const ready = await as(a, (tx) => refreshProgramDraft(tx, a.id, copy.id, copy.revision));
    const { programId } = await as(a, (tx) =>
      activateProgramDraft(tx, a.id, ready.id, {
        expectedRevision: ready.revision,
        startDate: today,
        transition: "new_block",
      }),
    );
    // What fell due while the old block ran was missed then; nothing after it is owed.
    const old = await settled(a, first.familyId);
    expect(new Set(old.missed)).toEqual(new Set(["pending"]));
    expect(new Set(old.ahead)).toEqual(new Set(["cancelled"]));

    // The new block starts today, so archiving it leaves nothing of it owed.
    const [started] = await as(a, (tx) =>
      tx.select({ familyId: programs.familyId }).from(programs).where(eq(programs.id, programId)),
    );
    expect((await settled(a, started!.familyId)).ahead).toContain("pending");
    await as(a, (tx) => archiveActiveProgram(tx, a.id, programId));
    const archived = await settled(a, started!.familyId);
    expect(archived.missed).toEqual([]);
    expect(new Set(archived.ahead)).toEqual(new Set(["cancelled"]));
  });
});

describe("changing a programme an athlete is behind on", () => {
  /**
   * Seventeen days behind, at cycle 2's Easy Run + Arms. Its run was dated in week 2, so a
   * revision froze it by its date — and Today, which offers it by slot, kept the old target
   * while the programme's day showed the new one.
   */
  it("revises the run Today is about to offer, whatever its date", async () => {
    const a = await athlete();
    const created = await adopt(a, addDays(today, -26));
    await answerThrough(a, created.id, created.familyId, { cycleIndex: 2, dayIndex: 2 });
    const due = { cycleIndex: 2, dayIndex: 3 };
    expect(await position(a)).toEqual(due);
    const before = await runFor(a, created.familyId, due);
    expect(before.scheduledOn < today).toBe(true);
    expect(minutes(before.prescription)).toEqual([25, 25]);
    const answered = await runFor(a, created.familyId, { cycleIndex: 1, dayIndex: 3 });

    const proposal = await as(a, (tx) =>
      createProposal(tx, a.id, {
        source: "ai",
        summary: "A longer Thursday run.",
        rationale: null,
        patch: {
          operations: [
            {
              op: "run",
              weekIndex: 2,
              dayOfWeek: EASY_RUN_AND_ARMS.dayOfWeek,
              duration: [45, 45],
              reason: "The easy runs are settled.",
            },
          ],
        },
      }),
    );
    await as(a, (tx) => applyProposal(tx, a.id, proposal.id));

    const after = await runFor(a, created.familyId, due);
    expect(after.id).toBe(before.id);
    expect(minutes(after.prescription)).toEqual([45, 45]);
    // The run the athlete has already answered keeps what it asked for on the day.
    const kept = await runFor(a, created.familyId, { cycleIndex: 1, dayIndex: 3 });
    expect(kept.revisionId).toBe(answered.revisionId);
  });

  it("does the same through an approved draft", async () => {
    const a = await athlete();
    const created = await adopt(a, addDays(today, -26));
    await answerThrough(a, created.id, created.familyId, { cycleIndex: 2, dayIndex: 2 });
    expect(await position(a)).toEqual({ cycleIndex: 2, dayIndex: 3 });

    // An edit to every week's runs, the ones already behind the athlete included.
    const copy = await as(a, (tx) => copyProgramToDraft(tx, a.id, created.id, false));
    const longer = {
      ...copy.blueprint,
      runs: copy.blueprint.runs.map((run) => ({ ...run, duration: [45, 45] as [number, number] })),
    };
    const saved = await as(a, (tx) =>
      saveManualDraft(tx, a.id, longer, { id: copy.id, expectedRevision: copy.revision }),
    );
    const ready = await as(a, (tx) => refreshProgramDraft(tx, a.id, saved.id, saved.revision));
    await as(a, (tx) =>
      activateProgramDraft(tx, a.id, ready.id, {
        expectedRevision: ready.revision,
        startDate: today,
        transition: "continue",
      }),
    );

    const run = async (cycleIndex: number, dayIndex: number) =>
      minutes((await runFor(a, created.familyId, { cycleIndex, dayIndex })).prescription);
    // From the slot Today offers on, the change; before it, what was asked on the day.
    expect(await run(2, 3)).toEqual([45, 45]);
    expect(await run(2, 6)).toEqual([45, 45]);
    expect(await run(1, 3)).toEqual([20, 25]);
    expect(await run(1, 6)).toEqual([25, 30]);
  });

  it("keeps the date the athlete moved a run to", async () => {
    const a = await athlete();
    const created = await adopt(a, today);
    const slot = { cycleIndex: 2, dayIndex: 3 };
    const run = await runFor(a, created.familyId, slot);
    const moved = addDays(run.scheduledOn, 1);
    await as(a, (tx) => rescheduleOccurrence(tx, a.id, run.id, moved));

    // A revision that leaves this run as it is leaves it where the athlete put it.
    const unchanged = await as(a, async (tx) =>
      materialiseProgramme(tx, a.id, {
        programId: created.id,
        familyId: created.familyId,
        blueprint: (await readProgramBlueprint(tx, a.id, created.id))!.blueprint,
        startDate: today,
        transition: "continue",
      }),
    );
    expect(unchanged.revised).toBe(0);
    expect((await runFor(a, created.familyId, slot)).scheduledOn).toBe(moved);

    // One that changes it changes what it asks for, not when.
    const proposal = await as(a, (tx) =>
      createProposal(tx, a.id, {
        source: "ai",
        summary: "A longer Thursday run.",
        rationale: null,
        patch: {
          operations: [
            {
              op: "run",
              weekIndex: 2,
              dayOfWeek: EASY_RUN_AND_ARMS.dayOfWeek,
              duration: [40, 40],
              reason: "Ready for more.",
            },
          ],
        },
      }),
    );
    await as(a, (tx) => applyProposal(tx, a.id, proposal.id));
    const revised = await runFor(a, created.familyId, slot);
    expect(minutes(revised.prescription)).toEqual([40, 40]);
    expect(revised.scheduledOn).toBe(moved);
  });
});

describe("repairing a programme started without occurrences", () => {
  it("writes them once, as the programme would have had them", async () => {
    const a = await athlete();
    // The old template path: the programme's rows and nothing else.
    const created = await as(a, (tx) =>
      createProgramFromBlueprint(tx, a.id, HYBRID, { startDate: today }),
    );
    expect(await familyOccurrences(a, created.familyId)).toEqual([]);

    const repaired = await materialiseMissingOccurrences(t.db);
    expect(repaired.failed).toEqual([]);
    expect(repaired.programmes).toBe(1);
    expect(repaired.occurrences).toBe(HYBRID.runs.length);
    const rows = await familyOccurrences(a, created.familyId);
    expect(rows).toHaveLength(HYBRID.runs.length);
    expect(new Set(rows.map((row) => row.cycleDayIndex))).toEqual(new Set(RUN_DAYS));

    // Nothing is left to repair, so a second deploy writes nothing.
    expect(await materialiseMissingOccurrences(t.db)).toEqual({
      programmes: 0,
      occurrences: 0,
      failed: [],
    });
  });
});
