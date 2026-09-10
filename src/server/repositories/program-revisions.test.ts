import { and, asc, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  profiles,
  programChangeProposals,
  programDays,
  programExercises,
  programs,
  programSlotEvents,
  sessionPlans,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { ProgramPatch } from "@/domain/program-patch";
import { comparableHistory } from "@/server/queries/comparable";

import { planningContext, storePlan } from "./coach-plans";
import { listGyms } from "./gyms";
import {
  applyProposal,
  createProposal,
  listOpenProposals,
  listProposals,
  ProposalError,
  rejectProposal,
} from "./program-revisions";
import { readProgramBlueprint } from "./programs";
import { getSchedule, recordSlotEvent } from "./schedule";
import {
  discardSession,
  finishSession,
  getSessionDetail,
  logSet,
  startPlannedSession,
} from "./sessions";

const TZ = "Asia/Kolkata";

let t: TestDatabase;
let user: { id: string; email: string };
let gymId: string;

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

async function activeProgram() {
  const [program] = await t.db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, user.id), eq(programs.status, "active")))
    .limit(1);
  if (!program) throw new Error("no active programme");
  return program;
}

/** Every slot of the active programme, in order, with the lineage it carries. */
async function slots() {
  return t.db
    .select({
      id: programExercises.id,
      lineageId: programExercises.lineageId,
      exerciseId: programExercises.exerciseId,
      orderIndex: programExercises.orderIndex,
      dayIndex: programDays.dayIndex,
      sets: programExercises.sets,
      notes: programExercises.notes,
    })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .where(eq(programDays.programId, (await activeProgram()).id))
    .orderBy(asc(programDays.dayIndex), asc(programExercises.orderIndex));
}

async function lineageOf(dayIndex: number, index: number) {
  const day = (await slots()).filter((slot) => slot.dayIndex === dayIndex);
  const found = day[index];
  if (!found) throw new Error(`no slot ${index} on day ${dayIndex}`);
  return found.lineageId;
}

const propose = (patch: ProgramPatch["operations"], summary = "A change.") =>
  as((tx) =>
    createProposal(tx, user.id, {
      source: "ai",
      summary,
      rationale: "Because the last three sessions said so.",
      patch: { operations: patch },
    }),
  );

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("revisions@example.com");
  await as((tx) => seedTestUserData(tx, user));
  await t.db.update(profiles).set({ timeZone: TZ }).where(eq(profiles.id, user.id));
  const gyms = await as((tx) => listGyms(tx, user.id));
  gymId = gyms.find((g) => g.slug === "anytime-fitness")!.id;
});

afterAll(async () => {
  await t.close();
});

describe("proposing a change", () => {
  it("refuses one that does not fit the programme it is for", async () => {
    await expect(
      propose([
        {
          op: "substitute",
          lineageId: "00000000-0000-4000-8000-000000000000",
          exerciseSlug: "front-squat",
          reason: "The knee.",
        },
      ]),
    ).rejects.toThrow(ProposalError);
    await expect(
      as((tx) =>
        createProposal(tx, user.id, { source: "ai", summary: "x", rationale: null, patch: {} }),
      ),
    ).rejects.toThrow(/not valid/);
    expect(await as((tx) => listProposals(tx, user.id))).toEqual([]);
  });

  it("records one that does, with a line per operation", async () => {
    const lineageId = await lineageOf(1, 0);
    const proposal = await propose(
      [{ op: "adjust", lineageId, sets: 4, reason: "Squats are moving well." }],
      "Fourth squat set.",
    );
    expect(proposal.status).toBe("proposed");
    const open = await as((tx) => listOpenProposals(tx, user.id));
    expect(open).toHaveLength(1);
    expect(open[0]?.lines).toEqual(["Change to 4 sets. Squats are moving well."]);
    expect(await as((tx) => rejectProposal(tx, user.id, proposal.id))).toBe(true);
    // Answering it twice does nothing the second time.
    expect(await as((tx) => rejectProposal(tx, user.id, proposal.id))).toBe(false);
    expect(await as((tx) => listOpenProposals(tx, user.id))).toEqual([]);
    expect((await as((tx) => listProposals(tx, user.id)))[0]?.status).toBe("rejected");
  });

  it("is invisible to other accounts", async () => {
    const other = await t.createAuthUser("not-mine@example.com");
    const rows = await withUser(t.db, other.id, (tx) => tx.select().from(programChangeProposals));
    expect(rows).toEqual([]);
  });
});

describe("approving a change", () => {
  it("refuses while a session is open", async () => {
    const schedule = await as((tx) => getSchedule(tx, user.id));
    const lowerA = schedule!.days.find((d) => d.name === "Lower A")!;
    const { sessionId } = await as((tx) =>
      startPlannedSession(tx, user.id, { gymId, programDayId: lowerA.id, cycleIndex: 1 }),
    );
    const proposal = await propose([
      { op: "remove", lineageId: await lineageOf(1, 5), reason: "The abs are covered." },
    ]);
    await expect(as((tx) => applyProposal(tx, user.id, proposal.id))).rejects.toThrow(
      /Finish or discard/,
    );
    await as((tx) => discardSession(tx, user.id, sessionId));
    await as((tx) => rejectProposal(tx, user.id, proposal.id));
  });

  it("writes the next version, keeping lineage, position and everything logged", async () => {
    const before = await activeProgram();
    const beforeSlots = await slots();
    const squatLineage = await lineageOf(1, 0);
    const crunchLineage = await lineageOf(1, 5);

    // The athlete is two slots in: one done, one skipped on purpose.
    await as(async (tx) => {
      await recordSlotEvent(
        tx,
        user.id,
        before.id,
        { cycleIndex: 1, dayIndex: 1 },
        "session",
        "completed",
        {
          occurredOn: "2026-09-08",
        },
      );
      await recordSlotEvent(
        tx,
        user.id,
        before.id,
        { cycleIndex: 1, dayIndex: 2 },
        "session",
        "skipped",
        {
          occurredOn: "2026-09-09",
          note: "Travelling.",
        },
      );
    });
    const context = await as((tx) => planningContext(tx, user.id, { gymId }));
    if (context.reason) throw new Error(context.reason);
    const plan = await as((tx) =>
      storePlan(tx, user.id, {
        slot: { cycleIndex: context.slot.cycleIndex, dayIndex: context.slot.dayIndex },
        gymId,
        trigger: "nightly",
        plan: {
          summary: "Arms and an easy run.",
          exercises: [{ exerciseSlug: context.exercises[0]!.planned.slug, sets: [] }],
        },
      }),
    );

    const proposal = await propose([
      { op: "substitute", lineageId: squatLineage, exerciseSlug: "front-squat", reason: "Knee." },
      { op: "remove", lineageId: crunchLineage, reason: "Covered elsewhere." },
      {
        op: "add",
        dayIndex: 1,
        afterLineageId: squatLineage,
        exercise: {
          exerciseSlug: "hanging-leg-raise",
          sets: 3,
          reps: [8, 12],
          rir: [1, 2],
          rest: [60, 90],
        },
        reason: "Better for the abs.",
      },
    ]);
    const applied = await as((tx) => applyProposal(tx, user.id, proposal.id));
    expect(applied.version).toBe(before.version + 1);

    const after = await activeProgram();
    expect(after.id).toBe(applied.programId);
    expect(after.id).not.toBe(before.id);
    expect(after.familyId).toBe(before.familyId);
    expect(after.startDate).toBe(before.startDate);
    expect(after.startDayIndex).toBe(before.startDayIndex);
    const [old] = await t.db.select().from(programs).where(eq(programs.id, before.id));
    expect(old?.status).toBe("archived");

    // The day reads as asked, and every slot the change kept carries its own lineage over.
    const afterSlots = await slots();
    const dayOne = afterSlots.filter((slot) => slot.dayIndex === 1);
    expect(dayOne).toHaveLength(beforeSlots.filter((s) => s.dayIndex === 1).length);
    expect(dayOne[1]?.lineageId).not.toBe(squatLineage);
    expect(dayOne.map((slot) => slot.lineageId)).not.toContain(crunchLineage);
    expect(dayOne[0]?.lineageId).toBe(squatLineage);
    const kept = beforeSlots.filter(
      (slot) => slot.lineageId !== crunchLineage && slot.dayIndex !== 1,
    );
    for (const slot of kept) {
      expect(afterSlots.map((s) => s.lineageId)).toContain(slot.lineageId);
    }

    // Where the athlete had got to came across, so the next slot is unchanged.
    const events = await t.db
      .select()
      .from(programSlotEvents)
      .where(eq(programSlotEvents.programId, after.id))
      .orderBy(asc(programSlotEvents.dayIndex));
    expect(events.map((event) => [event.dayIndex, event.status])).toEqual([
      [1, "completed"],
      [2, "skipped"],
    ]);
    expect(events[1]?.note).toBe("Travelling.");
    const schedule = await as((tx) => getSchedule(tx, user.id));
    expect(schedule?.program.id).toBe(after.id);

    // A plan written against the old version names slots that are gone, so it is dropped.
    const [stale] = await t.db.select().from(sessionPlans).where(eq(sessionPlans.id, plan.id));
    expect(stale?.status).toBe("void");

    const [record] = await t.db
      .select()
      .from(programChangeProposals)
      .where(eq(programChangeProposals.id, proposal.id));
    expect(record?.status).toBe("applied");
    expect(record?.appliedProgramId).toBe(after.id);
    expect(record?.appliedAt).not.toBeNull();
  });

  it("refuses a change proposed against a version that has since moved on", async () => {
    const stale = await propose([
      { op: "adjust", lineageId: await lineageOf(2, 0), sets: 4, reason: "More pressing." },
    ]);
    // A second change lands first, so the first now names a programme that is no longer active.
    const other = await propose([
      { op: "adjust", lineageId: await lineageOf(2, 0), sets: 5, reason: "Even more." },
    ]);
    await as((tx) => applyProposal(tx, user.id, other.id));
    await expect(as((tx) => applyProposal(tx, user.id, stale.id))).rejects.toThrow(
      /has changed since this was proposed/,
    );
    await expect(as((tx) => applyProposal(tx, user.id, other.id))).rejects.toThrow(
      /no longer waiting/,
    );
  });

  it("round-trips through the blueprint without losing what the programme said", async () => {
    const program = await activeProgram();
    const read = await as((tx) => readProgramBlueprint(tx, user.id, program.id));
    if (!read) throw new Error("no blueprint");
    expect(read.startDayIndex).toBe(program.startDayIndex);
    expect(read.blueprint.days).toHaveLength(7);
    expect(read.blueprint.runs.length).toBeGreaterThan(0);
    expect(read.blueprint.days.every((day) => day.exercises.every((e) => e.lineageId))).toBe(true);
    const [latest] = await t.db
      .select({ version: programs.version })
      .from(programs)
      .where(eq(programs.userId, user.id))
      .orderBy(desc(programs.version))
      .limit(1);
    expect(latest?.version).toBe(program.version);
  });
});

describe("history across a revision", () => {
  it("still counts as the same slot's after the programme is rewritten", async () => {
    const schedule = await as((tx) => getSchedule(tx, user.id));
    const lowerA = schedule!.days.find((d) => d.name === "Lower A")!;
    const { sessionId } = await as((tx) =>
      startPlannedSession(tx, user.id, { gymId, programDayId: lowerA.id, cycleIndex: 2 }),
    );
    const detail = await as((tx) => getSessionDetail(tx, user.id, sessionId));
    const press = detail!.exercises.find((e) => e.exercise.slug === "leg-press-45")!;
    const slotBefore = press.planned!.programExerciseId;
    await as(async (tx) => {
      await logSet(tx, user.id, {
        workoutExerciseId: press.id,
        setIndex: 1,
        setType: "working",
        weight: 100,
        reps: 10,
        rir: 2,
        durationSeconds: null,
      });
      await finishSession(tx, user.id, sessionId, { notes: null, bodyWeightKg: null });
    });
    const [slotLineage] = await t.db
      .select({ lineageId: programExercises.lineageId })
      .from(programExercises)
      .where(eq(programExercises.id, slotBefore));

    // A change elsewhere in the programme still rewrites every slot into new rows.
    const proposal = await propose([
      { op: "adjust", lineageId: await lineageOf(2, 0), sets: 3, reason: "Back to three." },
    ]);
    await as((tx) => applyProposal(tx, user.id, proposal.id));
    const after = (await slots()).find((slot) => slot.lineageId === slotLineage!.lineageId);
    expect(after?.dayIndex).toBe(1);
    // A new row on the new version, and the old one still stands with what it prescribed.
    expect(after?.id).not.toBe(slotBefore);

    const history = await as((tx) =>
      comparableHistory(tx, {
        userId: user.id,
        exerciseId: press.exercise.id,
        loadPortability: press.exercise.loadPortability,
        equipmentInstanceId: press.equipment?.id ?? null,
        limit: 5,
      }),
    );
    expect(history).toHaveLength(1);
    // The row it was logged against is gone; its lineage is what still names the slot.
    expect(history[0]?.plannedProgramExerciseId).toBe(slotBefore);
    expect(history[0]?.plannedSlotLineageId).toBe(slotLineage?.lineageId);
    const [archived] = await t.db
      .select({ programId: programDays.programId })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(eq(programExercises.id, slotBefore));
    expect(archived?.programId).not.toBe((await activeProgram()).id);
  });
});
