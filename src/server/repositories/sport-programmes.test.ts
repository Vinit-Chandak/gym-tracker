import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  programFamilies,
} from "@/db/schema";

import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { simplePrescription } from "@/domain/activity-prescription";
import { programBlueprintSchema } from "@/domain/program-blueprint";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { ensureProfile } from "@/server/queries/profile";

import { activateProgramDraft, refreshProgramDraft, saveManualDraft } from "./program-drafts";
import { newProgrammeDrafts } from "./sport-programmes";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
}, 90_000);

const plan = (name: string) =>
  programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: `running-${crypto.randomUUID()}`,
    name,
    weeks: 1,
    notes: "",
    days: [],
    runs: [],
    enduranceSessions: [
      {
        lineageId: crypto.randomUUID(),
        name: "Easy run",
        weekIndex: 1,
        dayOffset: 0,
        scheduledLocalTime: null,
        prescription: simplePrescription("running", { durationMs: [1_800_000, 1_800_000] }),
      },
    ],
  });

/**
 * ADR 0059: a first running programme waits on Plan until it is started, as no programme's card
 * can say it is waiting; once there is a running programme, its card does.
 */
it("lists a first programme's draft until the sport has a programme", async () => {
  const user = await t.createAuthUser("first-running@example.test");
  await ensureProfile(t.db, user);
  await withUser(t.db, user.id, async (tx) => {
    const draft = await saveManualDraft(tx, user.id, plan("5K block"));
    expect(await newProgrammeDrafts(tx, user.id)).toEqual([
      { id: draft.id, sport: "running", status: "editing", name: "5K block" },
    ]);
    const reviewed = await refreshProgramDraft(tx, user.id, draft.id, draft.revision);
    expect((await newProgrammeDrafts(tx, user.id))[0]).toMatchObject({ status: "ready" });

    await activateProgramDraft(tx, user.id, draft.id, {
      expectedRevision: reviewed.revision,
      startDate: addDays(todayInTimeZone("UTC"), 1),
      transition: "new_block",
    });
    expect(await newProgrammeDrafts(tx, user.id)).toEqual([]);
    // A draft against the running programme is that programme's card's to show.
    await saveManualDraft(tx, user.id, plan("Next block"));
    expect(await newProgrammeDrafts(tx, user.id)).toEqual([]);
  });
});

/**
 * ADR 0059: a running programme is the athlete's running from its start. The runs an older
 * combined programme still carries from then on are withdrawn; its runs before the start, its
 * other sports and the athlete's own unplanned runs are not touched.
 */
it("withdraws the runs another programme carries from a running programme's start", async () => {
  const user = await t.createAuthUser("legacy-runs@example.test");
  await ensureProfile(t.db, user);
  const today = todayInTimeZone("UTC");
  const start = addDays(today, 2);
  const family = crypto.randomUUID();
  await t.db.insert(programFamilies).values({ id: family, userId: user.id });
  const occurrence = async (sport: "running" | "cycling", on: string, familyId: string | null) => {
    const [row] = await t.db
      .insert(plannedOccurrences)
      .values({ userId: user.id, sport, familyId, disposition: "pending", originalScheduledOn: on })
      .returning();
    const [version] = await t.db
      .insert(occurrenceVersions)
      .values({
        occurrenceId: row!.id,
        userId: user.id,
        sport,
        scheduledOn: on,
        schedulingZone: "UTC",
        orderIndex: 0,
        prescription: simplePrescription(sport, { durationMs: [1_800_000, 1_800_000] }),
      })
      .returning();
    await t.db
      .update(plannedOccurrences)
      .set({ currentRevisionId: version!.id })
      .where(eq(plannedOccurrences.id, row!.id));
    return row!.id;
  };
  const before = await occurrence("running", addDays(today, 1), family);
  const after = await occurrence("running", addDays(today, 5), family);
  const ride = await occurrence("cycling", addDays(today, 5), family);
  const unplanned = await occurrence("running", addDays(today, 5), null);

  const programId = await withUser(t.db, user.id, async (tx) => {
    const draft = await saveManualDraft(tx, user.id, plan("10K block"));
    const reviewed = await refreshProgramDraft(tx, user.id, draft.id, draft.revision);
    return (
      await activateProgramDraft(tx, user.id, draft.id, {
        expectedRevision: reviewed.revision,
        startDate: start,
        transition: "new_block",
      })
    ).programId;
  });
  const dispositions = Object.fromEntries(
    (
      await t.db
        .select({ id: plannedOccurrences.id, disposition: plannedOccurrences.disposition })
        .from(plannedOccurrences)
        .where(inArray(plannedOccurrences.id, [before, after, ride, unplanned]))
    ).map((row) => [row.id, row.disposition]),
  );
  expect(dispositions).toEqual({
    [before]: "pending",
    [after]: "cancelled",
    [ride]: "pending",
    [unplanned]: "pending",
  });
  const [event] = await t.db
    .select()
    .from(occurrenceEvents)
    .where(eq(occurrenceEvents.occurrenceId, after));
  expect(event).toMatchObject({ kind: "cancelled", source: `programs:${programId}` });
});

afterAll(async () => {
  await t?.close();
});
