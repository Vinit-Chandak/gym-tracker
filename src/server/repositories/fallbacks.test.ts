import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  exercises,
  profiles,
  programDays,
  programDrafts,
  programExerciseFallbacks,
  programExercises,
  programs,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { gymAvailability } from "./availability";
import { sourceRevision } from "./coaching-state";
import { addGymFallback, rememberSlotFallback, removeGymFallback } from "./fallbacks";
import { listGyms } from "./gyms";
import { activateProgramDraft } from "./program-drafts";
import { applyProposal, createProposal } from "./program-revisions";
import { readProgramBlueprint } from "./programs";

/*
 * A fallback the athlete adds for one gym is theirs, not the programme's. Remembered every week,
 * it is still one fallback; removed, it is gone from every day that plans the lift; and a new
 * version of the programme keeps it, at its own gym and on its own machine, rather than turning
 * it into a programme fallback for every gym.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let samsung = "";
const ex: Record<string, string> = {};

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

async function activeProgramId() {
  const [program] = await t.db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, user.id), eq(programs.status, "active")));
  return program!.id;
}

/** The fallbacks the athlete added at a gym in the active programme, one row each. */
async function gymRows(gymId = samsung) {
  return t.db
    .select({
      slot: programExerciseFallbacks.programExerciseId,
      gymId: programExerciseFallbacks.gymId,
      fallbackExerciseId: programExerciseFallbacks.fallbackExerciseId,
      lineageId: programExercises.lineageId,
    })
    .from(programExerciseFallbacks)
    .innerJoin(
      programExercises,
      eq(programExercises.id, programExerciseFallbacks.programExerciseId),
    )
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .where(
      and(
        eq(programDays.programId, await activeProgramId()),
        eq(programExerciseFallbacks.gymId, gymId),
      ),
    );
}

/** The programme-level fallbacks of the active programme (no gym). */
async function programmeRowCount() {
  const rows = await t.db
    .select({ gymId: programExerciseFallbacks.gymId })
    .from(programExerciseFallbacks)
    .innerJoin(
      programExercises,
      eq(programExercises.id, programExerciseFallbacks.programExerciseId),
    )
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .where(eq(programDays.programId, await activeProgramId()));
  return rows.filter((row) => row.gymId === null).length;
}

async function pullUpFit(gymId = samsung) {
  const fit = await as((tx) => gymAvailability(tx, user.id, gymId));
  return fit!.rows.find((row) => row.exercise.slug === "pull-up")!;
}

const pullUpToInvertedRow = () =>
  as((tx) =>
    addGymFallback(tx, user.id, {
      gymId: samsung,
      exerciseId: ex["pull-up"]!,
      fallbackExerciseId: ex["inverted-row"]!,
      fallbackEquipmentInstanceId: null,
    }),
  );

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("gym-fallbacks@example.com");
  await as((tx) => seedTestUserData(tx, user));
  await t.db.update(profiles).set({ timeZone: "Asia/Kolkata" }).where(eq(profiles.id, user.id));
  samsung = (await as((tx) => listGyms(tx, user.id))).find((g) => g.slug === "samsung-gym")!.id;
  for (const row of await t.db.select({ id: exercises.id, slug: exercises.slug }).from(exercises))
    ex[row.slug] = row.id;
});

afterAll(async () => {
  await t.close();
});

it("keeps one fallback however often the same swap is remembered", async () => {
  // The pull-up is planned on two days, so the fallback goes on both, once each.
  for (let week = 0; week < 12; week += 1) expect(await pullUpToInvertedRow()).toBe(2);
  expect(await gymRows()).toHaveLength(2);
  expect((await pullUpFit()).gymFallbacks).toHaveLength(1);
});

it("reads the programme back without the fallbacks added for a gym", async () => {
  // A blueprint holds at most ten fallbacks a slot, and the copies a remembered swap used to add
  // each week are still in some accounts: the athlete's own never count towards the ten.
  const [slot] = await gymRows();
  await t.db.insert(programExerciseFallbacks).values(
    Array.from({ length: 11 }, (_, index) => ({
      userId: user.id,
      programExerciseId: slot!.slot,
      gymId: samsung,
      fallbackExerciseId: ex["inverted-row"]!,
      rank: 100 + index,
    })),
  );
  const programId = await activeProgramId();
  const current = await as((tx) => readProgramBlueprint(tx, user.id, programId));
  const pullUps = current!.blueprint.days
    .flatMap((day) => day.exercises)
    .filter((exercise) => exercise.exerciseSlug === "pull-up");
  expect(pullUps).toHaveLength(2);
  for (const pullUp of pullUps)
    expect((pullUp.fallbacks ?? []).map((f) => f.exerciseSlug)).not.toContain("inverted-row");
});

it("removes a fallback from every day that plans the lift, copies and all", async () => {
  expect(await gymRows()).toHaveLength(13);
  const [listed] = (await pullUpFit()).gymFallbacks;
  expect(await as((tx) => removeGymFallback(tx, user.id, listed!.id))).toBe(true);
  expect(await gymRows()).toHaveLength(0);
  expect((await pullUpFit()).gymFallbacks).toHaveLength(0);
  // Gone, it is gone: removing it again finds nothing.
  expect(await as((tx) => removeGymFallback(tx, user.id, listed!.id))).toBe(false);
});

it("keeps a gym's fallback at that gym through an approved change", async () => {
  await pullUpToInvertedRow();
  const before = await gymRows();
  const programmeBefore = await programmeRowCount();
  const programId = await activeProgramId();
  const current = await as((tx) => readProgramBlueprint(tx, user.id, programId));
  const squat = current!.blueprint.days
    .flatMap((day) => day.exercises)
    .find((exercise) => exercise.exerciseSlug !== "pull-up")!;
  const proposal = await as((tx) =>
    createProposal(tx, user.id, {
      source: "ai",
      summary: "One more set.",
      rationale: null,
      patch: {
        operations: [{ op: "adjust", lineageId: squat.lineageId, sets: 5, reason: "Moving well." }],
      },
    }),
  );
  await as((tx) => applyProposal(tx, user.id, proposal.id));

  // The new version holds the fallback on the same slots, still for Samsung Gym only.
  const after = await gymRows();
  expect(after.map((row) => row.lineageId).sort()).toEqual(
    before.map((row) => row.lineageId).sort(),
  );
  expect(new Set(after.map((row) => row.slot)).size).toBe(2);
  expect(after.every((row) => before.every((old) => old.slot !== row.slot))).toBe(true);
  // Nothing became a programme fallback for every gym.
  expect(await programmeRowCount()).toBe(programmeBefore);
  // Programme fit still lists it, and it can still be removed.
  const [listed] = (await pullUpFit()).gymFallbacks;
  expect(listed?.fallbackExerciseName).toBe("Inverted row");
  expect(await as((tx) => removeGymFallback(tx, user.id, listed!.id))).toBe(true);
  expect(await gymRows()).toHaveLength(0);
});

it("keeps a gym's fallback through a draft approved to continue the block", async () => {
  await pullUpToInvertedRow();
  const programId = await activeProgramId();
  const current = await as((tx) => readProgramBlueprint(tx, user.id, programId));
  const blueprint = structuredClone(current!.blueprint);
  // Take the pull-up out of one day: that day's slot has nothing left to fall back from.
  const day = blueprint.days.find((d) => d.exercises.some((e) => e.exerciseSlug === "pull-up"))!;
  day.exercises = day.exercises.filter((exercise) => exercise.exerciseSlug !== "pull-up");
  const [draft] = await as(async (tx) =>
    tx
      .insert(programDrafts)
      .values({
        userId: user.id,
        source: "weekly",
        status: "ready",
        blueprint,
        baseProgramId: programId,
        sourceRevision: await sourceRevision(tx, user.id),
        headline: "A change.",
      })
      .returning(),
  );
  await as((tx) =>
    activateProgramDraft(tx, user.id, draft!.id, {
      expectedRevision: draft!.revision,
      startDate: "2026-09-25",
      transition: "continue",
    }),
  );
  expect(await activeProgramId()).not.toBe(programId);
  expect(await gymRows()).toHaveLength(1);
  expect((await pullUpFit()).gymFallbacks.map((f) => f.fallbackExerciseName)).toEqual([
    "Inverted row",
  ]);
  // Nowhere did it become a programme fallback, standing in at every gym.
  const everywhere = await t.db
    .select({ id: programExerciseFallbacks.id })
    .from(programExerciseFallbacks)
    .where(
      and(
        eq(programExerciseFallbacks.userId, user.id),
        eq(programExerciseFallbacks.fallbackExerciseId, ex["inverted-row"]!),
        isNull(programExerciseFallbacks.gymId),
      ),
    );
  expect(everywhere).toHaveLength(0);
});

it("remembers a swap for the lift its slot plans, and a return to that lift as nothing", async () => {
  const programId = await activeProgramId();
  const [slot] = await t.db
    .select({ id: programExercises.id })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .where(
      and(eq(programDays.programId, programId), eq(programExercises.exerciseId, ex["pull-up"]!)),
    );
  const remember = (fallbackExerciseId: string) =>
    as((tx) =>
      rememberSlotFallback(tx, user.id, {
        gymId: samsung,
        programExerciseId: slot!.id,
        fallbackExerciseId,
        fallbackEquipmentInstanceId: null,
      }),
    );
  await t.db.delete(programExerciseFallbacks).where(eq(programExerciseFallbacks.gymId, samsung));
  // Back to the planned lift: nothing to remember.
  expect(await remember(ex["pull-up"]!)).toBe(0);
  expect(await gymRows()).toHaveLength(0);
  // Anything else is the pull-up's fallback here, on the one day that still plans it.
  expect(await remember(ex["inverted-row"]!)).toBe(1);
  expect((await pullUpFit()).gymFallbacks.map((f) => f.fallbackExerciseName)).toEqual([
    "Inverted row",
  ]);
});
