import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  programDays,
  programExerciseFallbacks,
  programExercises,
  programRuns,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { parseProgramBlueprint, type ProgramBlueprint } from "@/domain/program-blueprint";

import {
  createProgramFromBlueprint,
  MissingReferenceDataError,
  readProgramBlueprint,
} from "./programs";

let t: TestDatabase;
let user: { id: string; email: string };

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  // The auth bridge trigger creates the profile when the auth user appears.
  user = await t.createAuthUser("blueprint@example.com");
});
afterAll(async () => {
  await t.close();
});

const adopt = (blueprint: ProgramBlueprint, startDate: string, familyId?: string) =>
  withUser(t.db, user.id, (tx) =>
    createProgramFromBlueprint(tx, user.id, blueprint, { startDate, familyId }),
  );

describe("materialising a blueprint", () => {
  it("writes the whole plan as the user's own rows, dated from their start date", async () => {
    const created = await adopt(STRENGTH_AESTHETICS_HYBRID_8WK, "2027-01-04");

    const [program] = await t.db.select().from(programs).where(eq(programs.id, created.id));
    expect(program?.userId).toBe(user.id);
    expect(program?.status).toBe("active");
    expect(program?.startDate).toBe("2027-01-04");
    // Eight weeks inclusive of the first day.
    expect(program?.endDate).toBe("2027-02-28");
    expect(program?.version).toBe(1);
    expect(program?.familyId).toBe(created.familyId);

    const days = await t.db.select().from(programDays).where(eq(programDays.programId, created.id));
    expect(days).toHaveLength(STRENGTH_AESTHETICS_HYBRID_8WK.days.length);
    const exercises = await t.db
      .select()
      .from(programExercises)
      .where(eq(programExercises.userId, user.id));
    expect(exercises).toHaveLength(37);
    const runs = await t.db.select().from(programRuns).where(eq(programRuns.programId, created.id));
    expect(runs).toHaveLength(16);
    const fallbacks = await t.db
      .select()
      .from(programExerciseFallbacks)
      .where(eq(programExerciseFallbacks.userId, user.id));
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it("keeps prescriptions, cues and progression rules intact", async () => {
    const [day] = await t.db
      .select()
      .from(programDays)
      .where(and(eq(programDays.userId, user.id), eq(programDays.dayIndex, 1)))
      .limit(1);
    const [first] = await t.db
      .select()
      .from(programExercises)
      .where(and(eq(programExercises.programDayId, day!.id), eq(programExercises.orderIndex, 1)));
    const planned = STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!.exercises[0]!;
    expect(first?.sets).toBe(planned.sets);
    expect([first?.repMin, first?.repMax]).toEqual(planned.reps);
    expect([first?.rirMin, first?.rirMax]).toEqual(planned.rir);
    expect(first?.keyCue).toBe(planned.keyCue);
    expect(first?.progressionRule).toEqual(planned.progressionRule);
    expect(first?.prescriptionType).toBe("reps");
  });

  it("adopting a second programme archives the first, so Today has one answer", async () => {
    const second = await adopt(STRENGTH_AESTHETICS_HYBRID_8WK, "2027-03-01");
    const rows = await t.db
      .select({ id: programs.id, status: programs.status, version: programs.version })
      .from(programs)
      .where(eq(programs.userId, user.id))
      .orderBy(desc(programs.version));
    expect(rows.filter((r) => r.status === "active")).toHaveLength(1);
    expect(rows.find((r) => r.status === "active")?.id).toBe(second.id);
    expect(second.version).toBe(2);
  });

  it("continues a lineage when given its family id, which is how a revision lands", async () => {
    const first = await adopt(STRENGTH_AESTHETICS_HYBRID_8WK, "2027-05-03");
    const revised = await adopt(STRENGTH_AESTHETICS_HYBRID_8WK, "2027-05-03", first.familyId);
    expect(revised.familyId).toBe(first.familyId);
    expect(revised.version).toBe(first.version + 1);
  });

  it("says which shared row is missing rather than writing half a programme", async () => {
    const unknownExercise = parseProgramBlueprint({
      ...STRENGTH_AESTHETICS_HYBRID_8WK,
      slug: "unknown-exercise-plan",
      days: [
        {
          ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
          exercises: [
            {
              exerciseSlug: "not-a-real-exercise",
              sets: 3,
              reps: [5, 8],
              rir: [2, 3],
              rest: [120, 180],
            },
          ],
        },
      ],
      runs: [],
    });
    await expect(adopt(unknownExercise, "2027-06-07")).rejects.toThrow(MissingReferenceDataError);
  });
});

/**
 * A run written as a distance.
 *
 * A block built around "an easy 5k twice a week" is built around the distance, and the run
 * carried only minutes: the number the block is about survived as prose in a pace note, where
 * a later review reading structured fields could not see that it had been held flat on
 * purpose. It goes with the run now, and comes back with it.
 */
describe("a run's distance", () => {
  const withRuns = (distanceKm?: [number, number]): ProgramBlueprint =>
    parseProgramBlueprint({
      ...STRENGTH_AESTHETICS_HYBRID_8WK,
      slug: `distance-${distanceKm?.join("-") ?? "none"}`,
      runs: [
        {
          weekIndex: 1,
          dayOfWeek: 3,
          duration: [25, 40],
          ...(distanceKm ? { distanceKm } : {}),
          rpe: [3, 5],
          paceNote: "Easy, conversational.",
          progressionNote: "Hold the distance while the shin settles.",
          shinRule: "Stop if it worsens as the run goes on.",
        },
      ],
    });

  it("is written with the run and read back with it", async () => {
    const created = await adopt(withRuns([5, 5]), "2027-02-01");
    const [row] = await withUser(t.db, user.id, (tx) =>
      tx.select().from(programRuns).where(eq(programRuns.programId, created.id)),
    );
    expect(row?.distanceMinKm).toBe(5);
    expect(row?.distanceMaxKm).toBe(5);
    const read = await withUser(t.db, user.id, (tx) =>
      readProgramBlueprint(tx, user.id, created.id),
    );
    expect(read!.blueprint.runs[0]!.distanceKm).toEqual([5, 5]);
  });

  it("keeps a range where the programme gives one", async () => {
    const created = await adopt(withRuns([5, 8]), "2027-03-01");
    const read = await withUser(t.db, user.id, (tx) =>
      readProgramBlueprint(tx, user.id, created.id),
    );
    expect(read!.blueprint.runs[0]!.distanceKm).toEqual([5, 8]);
  });

  it("leaves a run prescribed by time alone without one", async () => {
    const created = await adopt(withRuns(), "2027-04-01");
    const read = await withUser(t.db, user.id, (tx) =>
      readProgramBlueprint(tx, user.id, created.id),
    );
    expect(read!.blueprint.runs[0]!.distanceKm).toBeUndefined();
    expect(read!.blueprint.runs[0]!.duration).toEqual([25, 40]);
  });
});
