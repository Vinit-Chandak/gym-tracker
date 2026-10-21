import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  coachJobs,
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

import { enqueueCoachJob } from "./coaching-jobs";
import { activateProgramDraft, refreshProgramDraft, saveManualDraft } from "./program-drafts";
import { newProgrammeDrafts, newProgrammeRequests } from "./sport-programmes";

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
 * ADR 0059: a first programme asked of the coach waits on Plan from the moment it is asked, with
 * where it stands, until a draft answers it; the card is then the draft's. A request for a sport
 * that already has a programme, or for a single session, is not a first programme.
 */
it("lists a first programme's request from the moment it is asked until a draft answers it", async () => {
  const user = await t.createAuthUser("first-request@example.test");
  await ensureProfile(t.db, user);
  const ask = (dedupeKey: string, target: Parameters<typeof enqueueCoachJob>[2]["target"]) =>
    withUser(t.db, user.id, async (tx) => {
      const { job } = await enqueueCoachJob(tx, user.id, {
        kind: "create_program",
        trigger: "onboarding",
        dedupeKey,
        target,
      });
      return job;
    });
  const job = await ask("create:running", { sport: "running", scope: "programme" });
  await ask("create:cycling-replacement", {
    sport: "cycling",
    scope: "programme",
    programId: crypto.randomUUID(),
  });
  await ask("create:swim-session", { sport: "swimming", scope: "session" });
  // Asked a minute ago: whatever answers it is written after it, as the coach's draft always is.
  await t.db
    .update(coachJobs)
    .set({ createdAt: new Date(Date.now() - 60_000) })
    .where(eq(coachJobs.id, job.id));
  const requests = () =>
    withUser(t.db, user.id, (tx) => newProgrammeRequests(tx, user.id), { readOnly: true });
  const standing = async (status: (typeof coachJobs.$inferSelect)["status"]) => {
    await t.db.update(coachJobs).set({ status }).where(eq(coachJobs.id, job.id));
    return requests();
  };

  expect(await requests()).toEqual([{ id: job.id, sport: "running", status: "writing" }]);
  expect(await standing("claimed")).toEqual([{ id: job.id, sport: "running", status: "writing" }]);
  expect(await standing("needs_input")).toEqual([
    { id: job.id, sport: "running", status: "needs_answer" },
  ]);
  expect(await standing("failed")).toEqual([{ id: job.id, sport: "running", status: "failed" }]);
  // Set aside by changed answers, it is finished with.
  expect(await standing("superseded")).toEqual([]);

  // A draft written since stands for the sport's first programme, whatever the request says.
  await standing("queued");
  const draft = await withUser(t.db, user.id, (tx) =>
    saveManualDraft(tx, user.id, plan("Marathon base")),
  );
  expect(await requests()).toEqual([]);
  expect(
    await withUser(t.db, user.id, (tx) => newProgrammeDrafts(tx, user.id), { readOnly: true }),
  ).toEqual([{ id: draft.id, sport: "running", status: "editing", name: "Marathon base" }]);
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
