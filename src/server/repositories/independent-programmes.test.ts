import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { seedLegacyAccount } from "@/db/test/multisport-fixtures";
import { backfillMultisport } from "@/db/backfill-multisport";
import { coachJobs, coachProgramRequests, profiles, programs } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";
import { AD_HOC_ORIGIN, UNKNOWN_EFFORT, plannedOrigin } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { programBlueprintSchema } from "@/domain/program-blueprint";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { moveEnduranceSession, repeatEnduranceSession } from "@/domain/endurance-series";
import { createActivity, type SaveActivityInput } from "./activities";
import { getOccurrence, occurrencesOnDate, programmeOccurrences } from "./occurrences";
import {
  adoptProgramme,
  saveManualDraft,
  refreshProgramDraft,
  activateProgramDraft,
} from "./program-drafts";
import { activeSportProgrammes } from "./sport-programmes";
import { getSchedule } from "./schedule";
import { readProgramBlueprint } from "./programs";
import { saveCoachNotes } from "./coach-plans";
import { readCoachNotes } from "./coach-memory";
import { claimRequestsForAttempt, hasActionableRequests } from "./coach-program-requests";
import { jobTargetSchema } from "@/domain/coaching-workflow";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
}, 90_000);

it("roundtrips repeated series and applies time-only edits without rewriting their history", async () => {
  const user = await t.createAuthUser("repeated-series@example.test");
  await ensureProfile(t.db, user);
  const startDate = addDays(todayInTimeZone("UTC"), 2);
  const sessions = repeatEnduranceSession(
    {
      lineageId: crypto.randomUUID(),
      name: "Easy run",
      weekIndex: 1,
      dayOffset: 0,
      scheduledLocalTime: "06:00",
      prescription: endurancePrescriptionSchema.parse({
        prescriptionVersion: 1,
        sport: "running",
        sessionTargets: { durationMs: [1_800_000, 1_800_000] },
      }),
    },
    { everyDays: 4, throughDayOffset: 13 },
  );
  const blueprint = programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: "repeated-series",
    name: "Repeating run",
    weeks: 2,
    days: [],
    enduranceSessions: sessions,
  });
  const active = await withUser(t.db, user.id, (tx) =>
    adoptProgramme(tx, user.id, blueprint, { startDate }),
  );
  const before = await programmeOccurrences(t.db, user.id, active.familyId);
  const read = (await readProgramBlueprint(t.db, user.id, active.id))!.blueprint;
  expect(read.enduranceSessions).toEqual(sessions);
  const draft = await withUser(t.db, user.id, (tx) =>
    saveManualDraft(tx, user.id, {
      ...read,
      enduranceSessions: read.enduranceSessions!.map((entry, index) => ({
        ...entry,
        scheduledLocalTime: index === 1 ? "07:30" : entry.scheduledLocalTime,
      })),
    }),
  );
  const ready = await withUser(t.db, user.id, (tx) =>
    refreshProgramDraft(tx, user.id, draft.id, draft.revision),
  );
  await withUser(t.db, user.id, (tx) =>
    activateProgramDraft(tx, user.id, ready.id, {
      expectedRevision: ready.revision,
      startDate,
      transition: "continue",
    }),
  );
  const after = await programmeOccurrences(t.db, user.id, active.familyId);
  expect(after.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
  expect(after[1]!.scheduledLocalTime?.slice(0, 5)).toBe("07:30");
  expect(after[1]!.revisionId).not.toBe(before[1]!.revisionId);
  expect(after.filter((_, index) => index !== 1).map((entry) => entry.revisionId)).toEqual(
    before.filter((_, index) => index !== 1).map((entry) => entry.revisionId),
  );
});

it("refuses to continue a manual replacement and gives it its own block and start date", async () => {
  const user = await t.createAuthUser("replace-endurance@example.test");
  await ensureProfile(t.db, user);
  const startDate = addDays(todayInTimeZone("UTC"), 2);
  const blueprint = programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "cycling",
    slug: "old-ride",
    name: "Old ride",
    weeks: 2,
    days: [],
    enduranceSessions: [
      {
        lineageId: crypto.randomUUID(),
        name: "Easy ride",
        weekIndex: 1,
        dayOffset: 0,
        prescription: {
          prescriptionVersion: 1,
          sport: "cycling",
          sessionTargets: { durationMs: [1_800_000, 1_800_000] },
        },
      },
    ],
  });
  const original = await withUser(t.db, user.id, (tx) =>
    adoptProgramme(tx, user.id, blueprint, { startDate }),
  );
  const draft = await withUser(t.db, user.id, (tx) =>
    saveManualDraft(tx, user.id, {
      ...blueprint,
      slug: "new-ride",
      name: "New ride",
    }),
  );
  const ready = await withUser(t.db, user.id, (tx) =>
    refreshProgramDraft(tx, user.id, draft.id, draft.revision),
  );
  await expect(
    withUser(t.db, user.id, (tx) =>
      activateProgramDraft(tx, user.id, ready.id, {
        expectedRevision: ready.revision,
        startDate,
        transition: "continue",
      }),
    ),
  ).rejects.toThrow(/replacement programme/);
  expect((await activeSportProgrammes(t.db, user.id))[0]!.id).toBe(original.id);
  const replacementDate = addDays(startDate, 7);
  const replacement = await withUser(t.db, user.id, (tx) =>
    activateProgramDraft(tx, user.id, ready.id, {
      expectedRevision: ready.revision,
      startDate: replacementDate,
      transition: "new_block",
    }),
  );
  const active = (await activeSportProgrammes(t.db, user.id))[0]!;
  expect(active.id).toBe(replacement.programId);
  expect(active.familyId).not.toBe(original.familyId);
  expect(active.startDate).toBe(replacementDate);
  expect((await programmeOccurrences(t.db, user.id, active.familyId))[0]!.scheduledOn).toBe(
    replacementDate,
  );
  expect((await programmeOccurrences(t.db, user.id, original.familyId))[0]!.resolution.kind).toBe(
    "cancelled",
  );
});

it("moves a legacy weekly repeat across weeks without replacing either occurrence", async () => {
  const user = await t.createAuthUser("move-repeat-across-week@example.test");
  await ensureProfile(t.db, user);
  const startDate = addDays(todayInTimeZone("UTC"), 2);
  const lineageId = crypto.randomUUID();
  const blueprint = programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: "movable-repeat",
    name: "Weekly repeats",
    weeks: 3,
    days: [],
    enduranceSessions: [0, 7].map((dayOffset) => ({
      lineageId,
      name: "Easy run",
      dayOffset,
      weekIndex: Math.floor(dayOffset / 7) + 1,
      prescription: {
        prescriptionVersion: 1,
        sport: "running",
        sessionTargets: { durationMs: [1_800_000, 1_800_000] },
      },
    })),
  });
  const active = await withUser(t.db, user.id, (tx) =>
    adoptProgramme(tx, user.id, blueprint, { startDate }),
  );
  const before = await programmeOccurrences(t.db, user.id, active.familyId);
  const first = before.find((entry) => entry.originalWeekIndex === 1)!;
  const second = before.find((entry) => entry.originalWeekIndex === 2)!;
  const moved = {
    ...blueprint,
    enduranceSessions: [
      moveEnduranceSession(blueprint.enduranceSessions![0]!, 8),
      blueprint.enduranceSessions![1]!,
    ].sort((a, b) => a.dayOffset - b.dayOffset),
  };
  const draft = await withUser(t.db, user.id, (tx) => saveManualDraft(tx, user.id, moved));
  const ready = await withUser(t.db, user.id, (tx) =>
    refreshProgramDraft(tx, user.id, draft.id, draft.revision),
  );
  const revision = await withUser(t.db, user.id, (tx) =>
    activateProgramDraft(tx, user.id, ready.id, {
      expectedRevision: ready.revision,
      startDate,
      transition: "continue",
    }),
  );
  const after = await programmeOccurrences(t.db, user.id, active.familyId);
  expect(after).toHaveLength(2);
  expect(new Set(after.map((entry) => entry.id))).toEqual(new Set(before.map((entry) => entry.id)));
  expect(after.find((entry) => entry.id === first.id)!.scheduledOn).toBe(addDays(startDate, 8));
  expect(after.find((entry) => entry.id === second.id)!.scheduledOn).toBe(addDays(startDate, 7));
  expect(after.every((entry) => entry.resolution.kind === "incomplete")).toBe(true);
  const read = (await readProgramBlueprint(t.db, user.id, revision.programId))!.blueprint;
  expect(read.enduranceSessions!.find((entry) => entry.dayOffset === 8)).toMatchObject({
    weekIndex: 2,
    originalWeekIndex: 1,
  });
});

it("does not duplicate a session logged today when an edit tries to move it into another week", async () => {
  const user = await t.createAuthUser("move-logged-today@example.test");
  await ensureProfile(t.db, user);
  await t.db.update(profiles).set({ timeZone: "UTC" }).where(eq(profiles.id, user.id));
  const today = todayInTimeZone("UTC");
  const blueprint = programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: "logged-repeat",
    name: "Preserve the run",
    weeks: 2,
    days: [],
    enduranceSessions: [0, 7].map((dayOffset) => ({
      lineageId: crypto.randomUUID(),
      name: "Easy run",
      dayOffset,
      weekIndex: Math.floor(dayOffset / 7) + 1,
      prescription: {
        prescriptionVersion: 1,
        sport: "running",
        sessionTargets: { durationMs: [1_800_000, 1_800_000] },
      },
    })),
  });
  const active = await withUser(t.db, user.id, (tx) =>
    adoptProgramme(tx, user.id, blueprint, { startDate: today }),
  );
  const before = await programmeOccurrences(t.db, user.id, active.familyId);
  const logged = before.find((entry) => entry.scheduledOn === today)!;
  await withUser(t.db, user.id, (tx) =>
    createActivity(tx, user.id, {
      submissionKey: crypto.randomUUID(),
      origin: plannedOrigin(logged.id, logged.revisionId),
      actual: {
        sport: "running",
        environment: "outdoor",
        distance: nativeDistance(5, "km"),
        durationMs: 1_800_000,
        surface: null,
        elevationGainMetres: null,
        treadmillInclinePercent: null,
        averageHeartRate: null,
        maxHeartRate: null,
        cadenceStepsPerMinute: null,
        runType: null,
        laps: [],
      },
      startedAt: new Date(`${today}T00:00:00Z`),
      recordedTimeZone: "UTC",
      timeZoneSource: "profile_at_entry",
      occurredOn: today,
      effort: UNKNOWN_EFFORT,
      outcome: "logged",
      title: null,
      notes: null,
    }),
  );
  const draft = await withUser(t.db, user.id, (tx) =>
    saveManualDraft(tx, user.id, {
      ...blueprint,
      enduranceSessions: blueprint.enduranceSessions!.map((entry, index) =>
        index === 0 ? moveEnduranceSession(entry, 8) : entry,
      ),
    }),
  );
  const ready = await withUser(t.db, user.id, (tx) =>
    refreshProgramDraft(tx, user.id, draft.id, draft.revision),
  );
  const revision = await withUser(t.db, user.id, (tx) =>
    activateProgramDraft(tx, user.id, ready.id, {
      expectedRevision: ready.revision,
      startDate: today,
      transition: "continue",
    }),
  );
  const after = await programmeOccurrences(t.db, user.id, active.familyId);
  expect(after).toHaveLength(2);
  expect(after.find((entry) => entry.id === logged.id)).toMatchObject({
    scheduledOn: today,
    revisionId: logged.revisionId,
    resolution: { kind: "logged" },
  });
  expect(after.some((entry) => entry.scheduledOn === addDays(today, 8))).toBe(false);
  const read = (await readProgramBlueprint(t.db, user.id, revision.programId))!.blueprint;
  expect(read.enduranceSessions).toHaveLength(2);
  expect(
    read.enduranceSessions!.find(
      (entry) => entry.lineageId === blueprint.enduranceSessions![0]!.lineageId,
    )!.dayOffset,
  ).toBe(0);
});

it("claims coach requests and reads targeted notes only for their own sport", async () => {
  const user = await t.createAuthUser("scoped-coach@example.test");
  await ensureProfile(t.db, user);
  await saveCoachNotes(t.db, user.id, "General availability", crypto.randomUUID());
  await saveCoachNotes(
    t.db,
    user.id,
    "Keep the long run on Sunday",
    crypto.randomUUID(),
    "running",
  );
  await saveCoachNotes(t.db, user.id, "Keep squats", crypto.randomUUID(), "strength");
  expect(
    (await readCoachNotes(t.db, user.id, new Date(), "running")).pending.map((note) => note.text),
  ).toEqual(["General availability", "Keep the long run on Sunday"]);
  expect(
    (await readCoachNotes(t.db, user.id, new Date(), "strength")).pending.map((note) => note.text),
  ).toEqual(["General availability", "Keep squats"]);
  for (const sport of ["strength", "running", "cycling", "swimming"] as const)
    await t.db.insert(coachProgramRequests).values({
      id: crypto.randomUUID(),
      userId: user.id,
      sport,
      sourceId: `note:${crypto.randomUUID()}`,
      quote: "An exact request",
      summary: `${sport} request`,
    });
  const [job] = await t.db
    .insert(coachJobs)
    .values({
      userId: user.id,
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: "scoped-claim",
      target: jobTargetSchema.parse({ sport: "running" }),
    })
    .returning();
  const claimed = await claimRequestsForAttempt(
    t.db,
    user.id,
    job!.id,
    crypto.randomUUID(),
    "2026-10-16",
    "running",
  );
  expect(claimed.items.map((item) => item.summary)).toEqual(["running request"]);
  const others = await t.db
    .select()
    .from(coachProgramRequests)
    .where(eq(coachProgramRequests.userId, user.id));
  expect(
    others.filter((item) => item.sport !== "running").every((item) => item.claimedJobId === null),
  ).toBe(true);
  for (const sport of ["strength", "running", "cycling", "swimming"] as const)
    expect(await hasActionableRequests(t.db, user.id, "2026-10-16", sport)).toBe(true);
});

afterAll(async () => {
  await t?.close();
});

it("splits a mixed programme without changing lifting events, workouts, activities or prescription versions", async () => {
  const user = await t.createAuthUser("independent@example.test");
  const seeded = await seedLegacyAccount(t.db, user);
  await backfillMultisport(t.db);
  const snapshot = async () => {
    const tables = [
      "workout_sessions",
      "set_logs",
      "activities",
      "occurrence_versions",
      "program_slot_events",
    ];
    return Promise.all(
      tables.map(async (name) => (await t.client.query(`select * from ${name} order by id`)).rows),
    );
  };
  const before = await snapshot();
  const schedule = await getSchedule(t.db, user.id);
  const sql = readFileSync("src/db/migrations/0057_independent_sport_programmes.sql", "utf8").match(
    /DO \$\$[\s\S]*?END \$\$;/,
  )![0];
  await t.client.exec(sql);
  const active = await activeSportProgrammes(t.db, user.id);
  expect(active.map((p) => p.sport)).toEqual(["strength", "running"]);
  expect(active[0]!.id).toBe(seeded.programId);
  expect(await snapshot()).toEqual(before);
  expect((await getSchedule(t.db, user.id))?.state).toEqual(schedule?.state);
  const running = await readProgramBlueprint(t.db, user.id, active[1]!.id);
  expect(running?.blueprint.enduranceSessions).toHaveLength(4);
  expect(running?.blueprint.days).toEqual([]);
  await t.client.exec(sql);
  expect(await activeSportProgrammes(t.db, user.id)).toHaveLength(2);
  expect(await snapshot()).toEqual(before);
  await t.db.update(programs).set({ status: "archived" }).where(eq(programs.id, active[1]!.id));
  expect((await getSchedule(t.db, user.id))?.state).toEqual(schedule?.state);
}, 90_000);

it("keeps four active sports, backdates only the selected scheduled session, and preserves past sessions through future edits", async () => {
  const user = await t.createAuthUser("four-sports@example.test");
  await ensureProfile(t.db, user);
  const startDate = "2026-09-01";
  const lifting = await withUser(t.db, user.id, (tx) =>
    adoptProgramme(
      tx,
      user.id,
      {
        ...STRENGTH_AESTHETICS_HYBRID_8WK,
        sport: "strength",
        days: STRENGTH_AESTHETICS_HYBRID_8WK.days.map((day) => ({ ...day, includesRun: false })),
        runs: [],
      },
      { startDate },
    ),
  );
  const plans = new Map<string, Awaited<ReturnType<typeof adoptProgramme>>>();
  for (const sport of ["running", "cycling", "swimming"] as const) {
    const blueprint = programBlueprintSchema.parse({
      blueprintVersion: 1,
      sport,
      slug: `test-${sport}`,
      name: `${sport} plan`,
      weeks: 52,
      repeats: "weekly",
      days: [],
      runs: [],
      enduranceSessions: [0, 350].map((dayOffset) => ({
        lineageId: crypto.randomUUID(),
        name: "Easy",
        weekIndex: Math.floor(dayOffset / 7) + 1,
        dayOffset,
        prescription: {
          prescriptionVersion: 1,
          sport,
          sessionTargets: { durationMs: [1_800_000, 1_800_000] },
        },
      })),
    });
    plans.set(
      sport,
      await withUser(t.db, user.id, (tx) => adoptProgramme(tx, user.id, blueprint, { startDate })),
    );
  }
  expect((await activeSportProgrammes(t.db, user.id)).map((plan) => plan.sport)).toEqual([
    "strength",
    "running",
    "cycling",
    "swimming",
  ]);
  const strengthBefore = (await getSchedule(t.db, user.id))!.state;
  const candidates = await occurrencesOnDate(t.db, user.id, startDate);
  expect(candidates).toHaveLength(3);
  expect(candidates.every((session) => session.prescription?.title === "Easy")).toBe(true);
  expect(candidates.every((session) => session.loggable && !session.closed)).toBe(true);
  expect(await occurrencesOnDate(t.db, user.id, "2026-09-02")).toHaveLength(0);
  const run = candidates.find((session) => session.sport === "running")!;
  const input: SaveActivityInput = {
    submissionKey: crypto.randomUUID(),
    origin: AD_HOC_ORIGIN,
    actual: {
      sport: "running",
      environment: "outdoor",
      distance: nativeDistance(5, "km"),
      durationMs: 1_800_000,
      surface: null,
      elevationGainMetres: null,
      treadmillInclinePercent: null,
      averageHeartRate: null,
      maxHeartRate: null,
      cadenceStepsPerMinute: null,
      runType: null,
      laps: [],
    },
    startedAt: new Date(`${startDate}T06:00:00Z`),
    recordedTimeZone: "UTC",
    timeZoneSource: "profile_at_entry",
    occurredOn: startDate,
    effort: UNKNOWN_EFFORT,
    outcome: "logged",
    title: null,
    notes: null,
  };
  await withUser(t.db, user.id, (tx) => createActivity(tx, user.id, input));
  expect((await getOccurrence(t.db, user.id, run.id))!.resolution.kind).toBe("incomplete");
  await withUser(t.db, user.id, (tx) =>
    createActivity(tx, user.id, {
      ...input,
      submissionKey: crypto.randomUUID(),
      origin: plannedOrigin(run.id, run.revisionId),
    }),
  );
  expect((await getOccurrence(t.db, user.id, run.id))!.resolution.kind).toBe("logged");
  expect((await getSchedule(t.db, user.id))!.state).toEqual(strengthBefore);
  const ride = plans.get("cycling")!;
  const old = (await programmeOccurrences(t.db, user.id, ride.familyId)).find(
    (session) => session.scheduledOn === startDate,
  )!;
  const current = (await readProgramBlueprint(t.db, user.id, ride.id))!;
  const draft = await withUser(t.db, user.id, (tx) =>
    saveManualDraft(tx, user.id, {
      ...current.blueprint,
      enduranceSessions: current.blueprint.enduranceSessions!.filter(
        (session) => session.dayOffset !== 0,
      ),
    }),
  );
  const ready = await withUser(t.db, user.id, (tx) =>
    refreshProgramDraft(tx, user.id, draft.id, draft.revision),
  );
  await withUser(t.db, user.id, (tx) =>
    activateProgramDraft(tx, user.id, ready.id, {
      expectedRevision: ready.revision,
      startDate,
      transition: "continue",
    }),
  );
  expect((await getOccurrence(t.db, user.id, old.id))!.loggable).toBe(true);
  expect(
    (await activeSportProgrammes(t.db, user.id)).find((plan) => plan.sport === "strength")!.id,
  ).toBe(lifting.id);
  expect(
    (await activeSportProgrammes(t.db, user.id)).find((plan) => plan.sport === "running")!.id,
  ).toBe(plans.get("running")!.id);
}, 90_000);
