import { afterAll, beforeAll, expect, it } from "vitest";

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

afterAll(async () => {
  await t?.close();
});
