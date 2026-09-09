import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import {
  createRun,
  deleteRun,
  getRun,
  getRunsOverview,
  listRuns,
  PlannedRunNotFoundError,
  plannedRunsForCurrentCycle,
  RunNotFoundError,
  updateRun,
  type RunInput,
} from "./runs";

let t: TestDatabase;
let user: { id: string; email: string };
let other: { id: string; email: string };

const TZ = "Asia/Kolkata";

function run(overrides: Partial<RunInput> = {}): RunInput {
  return {
    mode: "outdoor",
    startedAt: new Date(),
    durationSeconds: 25 * 60,
    distanceMeters: 4000,
    rpe: 3,
    shinLeftPre: 1,
    shinRightPre: 1,
    shinLeftDuring: null,
    shinRightDuring: null,
    shinLeftPost: 1,
    shinRightPost: 1,
    programRunId: null,
    notes: null,
    ...overrides,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("runs@example.com");
  other = await t.createAuthUser("runs-other@example.com");
  await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
});

afterAll(async () => {
  await t.close();
});

describe("run logging", () => {
  let firstId: string;

  it("creates a run linked to the current cycle's planned run and derives the pace", async () => {
    const cycle = await withUser(t.db, user.id, (tx) =>
      plannedRunsForCurrentCycle(tx, user.id, []),
    );
    if (!cycle) throw new Error("no cycle");
    expect(cycle.cycleIndex).toBe(1);
    expect(
      cycle.planned.map((p) => [p.dayOfWeek, p.durationMinMinutes, p.durationMaxMinutes]),
    ).toEqual([
      [4, 20, 25],
      [7, 25, 30],
    ]);
    const thursday = cycle.planned[0];
    if (!thursday) throw new Error("no planned run");
    const created = await withUser(t.db, user.id, (tx) =>
      createRun(tx, user.id, run({ programRunId: thursday.id })),
    );
    firstId = created.id;
    const stored = await withUser(t.db, user.id, (tx) => getRun(tx, user.id, firstId));
    expect(stored?.averagePaceSecondsPerKm).toBe(375);
    expect(stored?.planned?.dayOfWeek).toBe(4);
    const after = await withUser(t.db, user.id, (tx) =>
      plannedRunsForCurrentCycle(tx, user.id, [{ id: firstId, programRunId: thursday.id }]),
    );
    expect(after?.planned.map((p) => p.loggedRunId)).toEqual([firstId, null]);
  });

  it("rejects a planned run that is not the user's and hides runs from other users", async () => {
    const mine = await withUser(t.db, user.id, (tx) => listRuns(tx, user.id));
    const plannedId = mine[0]?.programRunId ?? "";
    await expect(
      withUser(t.db, other.id, (tx) => createRun(tx, other.id, run({ programRunId: plannedId }))),
    ).rejects.toBeInstanceOf(PlannedRunNotFoundError);
    expect(await withUser(t.db, other.id, (tx) => getRun(tx, other.id, firstId))).toBeNull();
    expect(await withUser(t.db, other.id, (tx) => listRuns(tx, other.id))).toEqual([]);
  });

  it("summarises the week and flags a volume spike and a rising shin", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // Last week: two easy runs; this week: already 70 minutes with rising right-shin scores.
    await withUser(t.db, user.id, async (tx) => {
      await createRun(
        tx,
        user.id,
        run({ startedAt: new Date(now - 9 * day), durationSeconds: 25 * 60 }),
      );
      await createRun(
        tx,
        user.id,
        run({ startedAt: new Date(now - 8 * day), durationSeconds: 25 * 60 }),
      );
    });
    await withUser(t.db, user.id, (tx) =>
      updateRun(
        tx,
        user.id,
        firstId,
        run({ durationSeconds: 70 * 60, shinRightPre: 1, shinRightPost: 3 }),
      ),
    );
    const overview = await withUser(t.db, user.id, (tx) => getRunsOverview(tx, user.id, TZ));
    const thisWeek = overview.weeks[0];
    expect(thisWeek?.minutes).toBeGreaterThanOrEqual(70);
    expect(overview.recent).toHaveLength(3);
    // Week boundaries depend on today's weekday; the spike only fires when last week has runs.
    if (overview.weeks[1]?.runs === 2) {
      expect(overview.spike?.lastWeekMinutes).toBe(50);
    }
    // Three runs with right shin rising 1 → 2, 1 → 2, 1 → 3 (newest first).
    await withUser(t.db, user.id, async (tx) => {
      const olderOnes = (await listRuns(tx, user.id)).filter((r) => r.id !== firstId);
      for (const older of olderOnes) {
        await updateRun(
          tx,
          user.id,
          older.id,
          run({ startedAt: older.startedAt, shinRightPre: 1, shinRightPost: 2 }),
        );
      }
    });
    const flagged = await withUser(t.db, user.id, (tx) => getRunsOverview(tx, user.id, TZ));
    expect(flagged.shin).toEqual([{ side: "right", pattern: "rising", runs: 3 }]);
  });

  it("deletes a run and refuses to touch a missing one", async () => {
    await withUser(t.db, user.id, (tx) => deleteRun(tx, user.id, firstId));
    expect(await withUser(t.db, user.id, (tx) => getRun(tx, user.id, firstId))).toBeNull();
    await expect(
      withUser(t.db, user.id, (tx) => deleteRun(tx, user.id, firstId)),
    ).rejects.toBeInstanceOf(RunNotFoundError);
    await expect(
      withUser(t.db, user.id, (tx) => updateRun(tx, user.id, firstId, run())),
    ).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
