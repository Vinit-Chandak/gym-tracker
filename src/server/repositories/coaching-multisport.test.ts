import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  coachJobs,
  gyms,
  occurrenceEditClaims,
  occurrenceVersions,
  plannedOccurrences,
  programFamilies,
  sessionPlans,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { EnduranceSport } from "@/domain/activity";
import {
  endurancePrescriptionSchema,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import { activePlanForOccurrence, storeOccurrencePlan } from "./coach-plans";
import { PlanValidationError } from "./coach-plans";
import { enqueueOccurrencePreparations, programmeSports } from "./coaching-jobs";
import { materialiseOccurrences, openOccurrencesBetween } from "./program-occurrences";
import { createProgramFromBlueprint } from "./programs";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";

/**
 * Coaching across four sports, at the boundary where it is actually enforced (plan §8).
 *
 * Everything here is about identity and authority rather than about training: that a
 * preparation answers for exactly one occurrence, that a revision arriving underneath it
 * supersedes rather than re-aims it, that an envelope the athlete approved is the limit of
 * what may happen without them, and that a review which says nothing about a sport is
 * refused rather than accepted quietly.
 */

const MINUTE = 60_000;
let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});
function prescription(
  sport: EnduranceSport,
  durationMs: [number, number] = [30 * MINUTE, 40 * MINUTE],
  running: Record<string, string | null> | null = null,
): EndurancePrescription {
  return endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport,
    sessionTargets: { durationMs, distanceMetres: null, effort: null },
    running,
  });
}

/** The four pieces of running prose an approved run carries. */
const RUNNING_GUIDANCE = {
  paceNote: "Conversational",
  progressionNote: null,
  symptomStopRule: "Stop if the shin complains.",
  note: null,
};

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  return withUser(t.db, user.id, async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: user.id, name: "My gym", slug: "my-gym", kind: "gym", isDefault: true })
      .returning();
    return { id: user.id, gym: gym! };
  });
}

type Athlete = Awaited<ReturnType<typeof athlete>>;
const as = <T>(a: Athlete, work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, a.id, work);

/** One occurrence per (sport, date), written straight through the materialiser. */
async function schedule(
  a: Athlete,
  familyId: string,
  programId: string,
  entries: readonly {
    sport: EnduranceSport;
    date: string;
    week: number;
    order?: number;
    running?: Record<string, string | null>;
  }[],
) {
  const lineageBySport = new Map<EnduranceSport, string>();
  for (const entry of entries)
    if (!lineageBySport.has(entry.sport)) lineageBySport.set(entry.sport, crypto.randomUUID());
  await as(a, (tx) =>
    materialiseOccurrences(tx, a.id, {
      programId,
      familyId,
      schedulingZone: "UTC",
      today: "2026-09-19",
      transition: "continue",
      blueprint: {
        blueprintVersion: 2,
        slug: "multisport",
        name: "Multisport",
        notes: "",
        startDate: "2026-09-14",
        schedulingTimeZone: "UTC",
        weeks: 4,
        strengthCycle: null,
        legacy: null,
        enduranceSlots: [...lineageBySport.entries()].map(([sport, lineageId]) => ({
          lineageId,
          sport,
          name: sport,
          prescription: prescription(sport),
        })),
        occurrences: entries.map((entry, index) => ({
          localId: `local-${index}`,
          slotLineageId: lineageBySport.get(entry.sport)!,
          weekIndex: entry.week,
          cycleDayIndex: null,
          scheduledOn: entry.date,
          scheduledLocalTime: null,
          orderIndex: entry.order ?? index,
          prescription: prescription(entry.sport, undefined, entry.running ?? null),
        })),
      },
    }),
  );
  return as(a, (tx) =>
    tx
      .select({
        id: plannedOccurrences.id,
        sport: plannedOccurrences.sport,
        revisionId: plannedOccurrences.currentRevisionId,
        scheduledOn: occurrenceVersions.scheduledOn,
      })
      .from(plannedOccurrences)
      .innerJoin(
        occurrenceVersions,
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
      )
      .where(eq(plannedOccurrences.userId, a.id))
      .orderBy(occurrenceVersions.scheduledOn, occurrenceVersions.orderIndex),
  );
}

async function programme(a: Athlete) {
  const created = await as(a, (tx) =>
    createProgramFromBlueprint(
      tx,
      a.id,
      {
        ...STRENGTH_AESTHETICS_HYBRID_8WK,
        slug: `plan-${crypto.randomUUID().slice(0, 8)}`,
        weeks: 4,
        runs: [],
        days: [
          {
            ...STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!,
            dayIndex: 1,
            includesRun: false,
            exercises: [STRENGTH_AESTHETICS_HYBRID_8WK.days[0]!.exercises[0]!],
          },
        ],
      },
      { startDate: "2026-09-14" },
    ),
  );
  await as(a, (tx) =>
    tx.insert(programFamilies).values({ id: created.familyId, userId: a.id }).onConflictDoNothing(),
  );
  return created;
}

const entry = (
  occurrence: { id: string; sport: string; revisionId: string | null },
  overrides: Record<string, unknown> = {},
) => ({
  occurrenceId: occurrence.id,
  occurrenceRevisionId: occurrence.revisionId!,
  sport: occurrence.sport,
  summary: "Easy, conversational.",
  prescription: null,
  note: "",
  ...overrides,
});

/** AT-SCHED-01 / AT-COACH-06: two same-day sessions are two identities, not one. */
it("gives two same-day swims separate occurrences, jobs and preparations", async () => {
  const a = await athlete();
  const created = await programme(a);
  const occurrences = await schedule(a, created.familyId, created.id, [
    { sport: "swimming", date: "2026-09-21", week: 2, order: 0 },
    { sport: "swimming", date: "2026-09-21", week: 2, order: 1 },
  ]);
  expect(occurrences).toHaveLength(2);
  expect(new Set(occurrences.map((o) => o.id)).size).toBe(2);

  const queued = await as(a, (tx) => enqueueOccurrencePreparations(tx, a.id, "2026-09-21"));
  expect(queued).toBe(2);
  const jobs = await as(a, (tx) => tx.select().from(coachJobs).where(eq(coachJobs.userId, a.id)));
  expect(jobs).toHaveLength(2);
  expect(new Set(jobs.map((job) => job.target.occurrenceId)).size).toBe(2);

  // Dedupe: asking again for the same batch enqueues nothing new.
  expect(await as(a, (tx) => enqueueOccurrencePreparations(tx, a.id, "2026-09-21"))).toBe(0);

  await as(a, (tx) =>
    storeOccurrencePlan(tx, a.id, {
      occurrenceId: occurrences[0]!.id,
      occurrenceRevisionId: occurrences[0]!.revisionId!,
      trigger: "nightly",
      entry: entry(occurrences[0]!),
    }),
  );
  expect(await as(a, (tx) => activePlanForOccurrence(tx, a.id, occurrences[0]!.id))).not.toBeNull();
  // Settling one says nothing about the other.
  expect(await as(a, (tx) => activePlanForOccurrence(tx, a.id, occurrences[1]!.id))).toBeNull();
});

/** §8.2 item 4: today and the next 48 hours, and nothing that has already gone past. */
it("prepares the next two days and never re-prepares overdue work", async () => {
  const a = await athlete();
  const created = await programme(a);
  await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-16", week: 1 },
    { sport: "running", date: "2026-09-21", week: 2 },
    { sport: "cycling", date: "2026-09-23", week: 2 },
    { sport: "cycling", date: "2026-09-25", week: 2 },
  ]);
  const window = await as(a, (tx) => openOccurrencesBetween(tx, a.id, "2026-09-21", "2026-09-23"));
  expect(window.map((row) => row.scheduledOn)).toEqual(["2026-09-21", "2026-09-23"]);
  expect(await as(a, (tx) => enqueueOccurrencePreparations(tx, a.id, "2026-09-21"))).toBe(2);
  const jobs = await as(a, (tx) => tx.select().from(coachJobs).where(eq(coachJobs.userId, a.id)));
  // The 16th is overdue and the 25th is beyond the window: neither is prepared.
  expect(jobs).toHaveLength(2);
});

/** AT-COACH-08: a revision arriving supersedes the job and the preparation written for it. */
it("supersedes a preparation and its job when the occurrence is revised", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "cycling", date: "2026-09-21", week: 2 },
  ]);
  await as(a, (tx) => enqueueOccurrencePreparations(tx, a.id, "2026-09-21"));
  await as(a, (tx) =>
    storeOccurrencePlan(tx, a.id, {
      occurrenceId: occurrence!.id,
      occurrenceRevisionId: occurrence!.revisionId!,
      trigger: "nightly",
      entry: entry(occurrence!),
    }),
  );

  // The same programme, with the ride now asking for something else.
  const lineage = await as(a, (tx) =>
    tx
      .select({ lineageId: plannedOccurrences.slotLineageId })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.id, occurrence!.id)),
  );
  await as(a, (tx) =>
    materialiseOccurrences(tx, a.id, {
      programId: created.id,
      familyId: created.familyId,
      schedulingZone: "UTC",
      today: "2026-09-19",
      transition: "continue",
      blueprint: {
        blueprintVersion: 2,
        slug: "multisport",
        name: "Multisport",
        notes: "",
        startDate: "2026-09-14",
        schedulingTimeZone: "UTC",
        weeks: 4,
        strengthCycle: null,
        legacy: null,
        enduranceSlots: [
          {
            lineageId: lineage[0]!.lineageId!,
            sport: "cycling",
            name: "Ride",
            prescription: prescription("cycling", [45 * MINUTE, 50 * MINUTE]),
          },
        ],
        occurrences: [
          {
            localId: "local-0",
            slotLineageId: lineage[0]!.lineageId!,
            weekIndex: 2,
            cycleDayIndex: null,
            scheduledOn: "2026-09-21",
            scheduledLocalTime: null,
            orderIndex: 0,
            prescription: prescription("cycling", [45 * MINUTE, 50 * MINUTE]),
          },
        ],
      },
    }),
  );

  const plans = await as(a, (tx) =>
    tx.select().from(sessionPlans).where(eq(sessionPlans.userId, a.id)),
  );
  expect(plans.map((plan) => plan.status)).toEqual(["superseded"]);
  await as(a, (tx) => enqueueOccurrencePreparations(tx, a.id, "2026-09-21"));
  const jobs = await as(a, (tx) => tx.select().from(coachJobs).where(eq(coachJobs.userId, a.id)));
  const stale = jobs.filter((job) => job.status === "superseded");
  expect(stale).toHaveLength(1);
  expect(stale[0]?.error).toMatch(/changed after this preparation was queued/);
  expect(jobs.filter((job) => job.status === "queued")).toHaveLength(1);
});

/** AT-COACH-04: inside the approved envelope is automatic; outside it is a proposal. */
it("stores a preparation inside the approved range and refuses one outside it", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "cycling", date: "2026-09-21", week: 2 },
  ]);
  const inside = prescription("cycling", [38 * MINUTE, 38 * MINUTE]);
  await as(a, (tx) =>
    storeOccurrencePlan(tx, a.id, {
      occurrenceId: occurrence!.id,
      occurrenceRevisionId: occurrence!.revisionId!,
      trigger: "nightly",
      entry: entry(occurrence!, { prescription: inside }),
    }),
  );
  const stored = await as(a, (tx) => activePlanForOccurrence(tx, a.id, occurrence!.id));
  expect(stored?.endurance[0]?.prescription?.sessionTargets.durationMs).toEqual([
    38 * MINUTE,
    38 * MINUTE,
  ]);

  const outside = prescription("cycling", [55 * MINUTE, 55 * MINUTE]);
  await expect(
    as(a, (tx) =>
      storeOccurrencePlan(tx, a.id, {
        occurrenceId: occurrence!.id,
        occurrenceRevisionId: occurrence!.revisionId!,
        trigger: "nightly",
        entry: entry(occurrence!, { prescription: outside }),
      }),
    ),
  ).rejects.toThrow(PlanValidationError);
});

/**
 * COACH-05: an approved running block read back is not an edit to it.
 *
 * The approved prescription arrives from a `jsonb` column, which sorts an object's keys, and
 * the coach's arrives from the schema, which orders them as it declares them. Compared as
 * strings the two never matched, so every preparation of a run carrying pace, progression or
 * a stop rule was refused as a proposal — including one that echoed the block back verbatim.
 * There was no payload that could pass, so the occurrence simply went unprepared.
 */
it("prepares a run inside its range without rewriting the approved running block", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-21", week: 2, running: RUNNING_GUIDANCE },
  ]);

  // What the coach reads back is the stored prescription, key order and all.
  const [stored] = await as(a, (tx) =>
    tx
      .select({ prescription: occurrenceVersions.prescription })
      .from(occurrenceVersions)
      .where(eq(occurrenceVersions.id, occurrence!.revisionId!)),
  );
  expect(stored!.prescription!.running).toEqual(RUNNING_GUIDANCE);

  const narrowed = {
    ...stored!.prescription!,
    sessionTargets: {
      ...stored!.prescription!.sessionTargets,
      durationMs: [35 * MINUTE, 35 * MINUTE] as [number, number],
    },
  };
  await as(a, (tx) =>
    storeOccurrencePlan(tx, a.id, {
      occurrenceId: occurrence!.id,
      occurrenceRevisionId: occurrence!.revisionId!,
      trigger: "nightly",
      entry: entry(occurrence!, { prescription: narrowed }),
    }),
  );
  const plan = await as(a, (tx) => activePlanForOccurrence(tx, a.id, occurrence!.id));
  expect(plan?.endurance[0]?.prescription?.sessionTargets.durationMs).toEqual([
    35 * MINUTE,
    35 * MINUTE,
  ]);
  expect(plan?.endurance[0]?.prescription?.running).toEqual(RUNNING_GUIDANCE);
});

/**
 * Production, 25 September: every run preparation was refused on `prescription.running`,
 * three times over, because the coach was never shown the approved block it was told to copy
 * — only the programme's run row, whose fields are named differently. Leaving the guidance out
 * now keeps it, which is the only thing a preparation could have meant by it.
 */
it("keeps the approved running block when a preparation leaves it out", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-21", week: 2, running: RUNNING_GUIDANCE },
  ]);
  const narrowed = prescription("running", [32 * MINUTE, 36 * MINUTE]);
  expect(narrowed.running).toBeNull();
  await as(a, (tx) =>
    storeOccurrencePlan(tx, a.id, {
      occurrenceId: occurrence!.id,
      occurrenceRevisionId: occurrence!.revisionId!,
      trigger: "nightly",
      entry: entry(occurrence!, { prescription: narrowed }),
    }),
  );
  const plan = await as(a, (tx) => activePlanForOccurrence(tx, a.id, occurrence!.id));
  expect(plan?.endurance[0]?.prescription?.running).toEqual(RUNNING_GUIDANCE);
  expect(plan?.endurance[0]?.prescription?.sessionTargets.durationMs).toEqual([
    32 * MINUTE,
    36 * MINUTE,
  ]);
});

/** The rule itself stands: the guidance is the athlete's, and rewriting it is theirs to read. */
it("refuses a preparation that rewrites the approved stop rule", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-21", week: 2, running: RUNNING_GUIDANCE },
  ]);
  const rewritten = prescription("running", [30 * MINUTE, 40 * MINUTE], {
    ...RUNNING_GUIDANCE,
    symptomStopRule: "Push through it.",
  });
  await expect(
    as(a, (tx) =>
      storeOccurrencePlan(tx, a.id, {
        occurrenceId: occurrence!.id,
        occurrenceRevisionId: occurrence!.revisionId!,
        trigger: "nightly",
        entry: entry(occurrence!, { prescription: rewritten }),
      }),
    ),
  ).rejects.toThrow(PlanValidationError);
});

/** AT-LIFE-08 / §8.4: a target the athlete is logging against is not moved underneath them. */
it("refuses to prepare an occurrence the athlete has claimed", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "swimming", date: "2026-09-21", week: 2 },
  ]);
  await as(a, (tx) =>
    tx.insert(occurrenceEditClaims).values({
      userId: a.id,
      occurrenceId: occurrence!.id,
      pinnedRevisionId: occurrence!.revisionId!,
      draftToken: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 10 * MINUTE),
    }),
  );
  await expect(
    as(a, (tx) =>
      storeOccurrencePlan(tx, a.id, {
        occurrenceId: occurrence!.id,
        occurrenceRevisionId: occurrence!.revisionId!,
        trigger: "nightly",
        entry: entry(occurrence!),
      }),
    ),
  ).rejects.toThrow(/logging this session right now/);
});

/** AT-COACH-07: a preparation may not answer for a revision that has moved on. */
it("refuses a preparation pinned to a superseded revision", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-21", week: 2 },
  ]);
  const stale = crypto.randomUUID();
  await expect(
    as(a, (tx) =>
      storeOccurrencePlan(tx, a.id, {
        occurrenceId: occurrence!.id,
        occurrenceRevisionId: stale,
        trigger: "nightly",
        entry: entry(occurrence!, { occurrenceRevisionId: stale }),
      }),
    ),
  ).rejects.toThrow(/different occurrence|changed while/);
});

/** AT-DATA-02: the plan's sport has to be the occurrence's sport. */
it("refuses a preparation whose sport is not the occurrence's", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-21", week: 2 },
  ]);
  await expect(
    as(a, (tx) =>
      storeOccurrencePlan(tx, a.id, {
        occurrenceId: occurrence!.id,
        occurrenceRevisionId: occurrence!.revisionId!,
        trigger: "nightly",
        entry: entry(occurrence!, { sport: "swimming" }),
      }),
    ),
  ).rejects.toThrow(/not the occurrence's sport/);
});

/** AT-DATA-05: another athlete's occurrence is not a target this account can prepare. */
it("will not prepare another athlete's occurrence", async () => {
  const a = await athlete();
  const b = await athlete();
  const created = await programme(b);
  const [theirs] = await schedule(b, created.familyId, created.id, [
    { sport: "running", date: "2026-09-21", week: 2 },
  ]);
  await expect(
    as(a, (tx) =>
      storeOccurrencePlan(tx, a.id, {
        occurrenceId: theirs!.id,
        occurrenceRevisionId: theirs!.revisionId!,
        trigger: "nightly",
        entry: entry(theirs!),
      }),
    ),
  ).rejects.toThrow(/not one of this athlete's/);
});

/** AT-COACH-02: the sports a review owes coverage for come from the programme itself. */
it("reads the programme's own sports, including its occurrences", async () => {
  const a = await athlete();
  const created = await programme(a);
  await schedule(a, created.familyId, created.id, [
    { sport: "swimming", date: "2026-09-21", week: 2 },
    { sport: "cycling", date: "2026-09-22", week: 2 },
  ]);
  const sports = await as(a, (tx) => programmeSports(tx, a.id, created.id));
  expect([...sports].sort()).toEqual(["cycling", "strength", "swimming"]);
});

/**
 * §8.4: re-materialising a programme that did not change is not a revision of it.
 *
 * The stored prescription and the blueprint's were compared as strings, so a run carrying any
 * running prose read as changed every single time — the keys came back from `jsonb` in a
 * different order. Each rescale therefore wrote a pointless new revision and superseded the
 * preparation waiting on it, quietly throwing away work the athlete was about to be shown.
 */
it("carries an unchanged run rather than revising it, keeping its preparation", async () => {
  const a = await athlete();
  const created = await programme(a);
  const [occurrence] = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-23", week: 2, running: RUNNING_GUIDANCE },
  ]);
  await as(a, (tx) =>
    storeOccurrencePlan(tx, a.id, {
      occurrenceId: occurrence!.id,
      occurrenceRevisionId: occurrence!.revisionId!,
      trigger: "nightly",
      entry: entry(occurrence!),
    }),
  );
  const lineage = await as(a, (tx) =>
    tx
      .select({ lineageId: plannedOccurrences.slotLineageId })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.id, occurrence!.id)),
  );
  const lineageId = lineage[0]!.lineageId!;

  const identical = prescription("running", [30 * MINUTE, 40 * MINUTE], RUNNING_GUIDANCE);
  const counts = await as(a, (tx) =>
    materialiseOccurrences(tx, a.id, {
      programId: created.id,
      familyId: created.familyId,
      schedulingZone: "UTC",
      today: "2026-09-19",
      transition: "continue",
      blueprint: {
        blueprintVersion: 2,
        slug: "multisport",
        name: "Multisport",
        notes: "",
        startDate: "2026-09-14",
        schedulingTimeZone: "UTC",
        weeks: 4,
        strengthCycle: null,
        legacy: null,
        enduranceSlots: [{ lineageId, sport: "running", name: "Run", prescription: identical }],
        occurrences: [
          {
            localId: "local-0",
            slotLineageId: lineageId,
            weekIndex: 2,
            cycleDayIndex: null,
            scheduledOn: "2026-09-23",
            scheduledLocalTime: null,
            orderIndex: 0,
            prescription: identical,
          },
        ],
      },
    }),
  );
  expect(counts.revised).toBe(0);
  expect(counts.carried).toBe(1);

  // Same revision, and the preparation written against it is still the athlete's card.
  const [row] = await as(a, (tx) =>
    tx
      .select({ revisionId: plannedOccurrences.currentRevisionId })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.id, occurrence!.id)),
  );
  expect(row!.revisionId).toBe(occurrence!.revisionId);
  const plan = await as(a, (tx) => activePlanForOccurrence(tx, a.id, occurrence!.id));
  expect(plan).not.toBeNull();
});

/** AT-SCHED-09: a revision keeps identity, freezes the past and cancels withdrawn work. */
it("carries occurrences across a revision, freezing the past and cancelling what is dropped", async () => {
  const a = await athlete();
  const created = await programme(a);
  const before = await schedule(a, created.familyId, created.id, [
    { sport: "running", date: "2026-09-16", week: 1 },
    { sport: "running", date: "2026-09-23", week: 2 },
  ]);
  const lineage = await as(a, (tx) =>
    tx
      .select({ lineageId: plannedOccurrences.slotLineageId })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.id, before[0]!.id)),
  );
  // The new version keeps only week one, which is already in the past.
  const counts = await as(a, (tx) =>
    materialiseOccurrences(tx, a.id, {
      programId: created.id,
      familyId: created.familyId,
      schedulingZone: "UTC",
      today: "2026-09-19",
      transition: "continue",
      blueprint: {
        blueprintVersion: 2,
        slug: "multisport",
        name: "Multisport",
        notes: "",
        startDate: "2026-09-14",
        schedulingTimeZone: "UTC",
        weeks: 4,
        strengthCycle: null,
        legacy: null,
        enduranceSlots: [
          {
            lineageId: lineage[0]!.lineageId!,
            sport: "running",
            name: "Run",
            prescription: prescription("running", [55 * MINUTE, 60 * MINUTE]),
          },
        ],
        occurrences: [
          {
            localId: "local-0",
            slotLineageId: lineage[0]!.lineageId!,
            weekIndex: 1,
            cycleDayIndex: null,
            scheduledOn: "2026-09-16",
            scheduledLocalTime: null,
            orderIndex: 0,
            prescription: prescription("running", [55 * MINUTE, 60 * MINUTE]),
          },
        ],
      },
    }),
  );
  expect(counts.frozen).toBe(1);
  expect(counts.revised).toBe(0);
  expect(counts.cancelled).toBe(1);
  const rows = await as(a, (tx) =>
    tx
      .select({
        id: plannedOccurrences.id,
        disposition: plannedOccurrences.disposition,
        prescription: occurrenceVersions.prescription,
      })
      .from(plannedOccurrences)
      .innerJoin(
        occurrenceVersions,
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
      )
      .where(eq(plannedOccurrences.userId, a.id)),
  );
  const past = rows.find((row) => row.id === before[0]!.id);
  // The past one keeps what was actually prescribed on the day, untouched.
  expect(past?.prescription?.sessionTargets.durationMs).toEqual([30 * MINUTE, 40 * MINUTE]);
  expect(rows.find((row) => row.id === before[1]!.id)?.disposition).toBe("cancelled");
});
