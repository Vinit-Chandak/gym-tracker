import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  coachJobs,
  coachProgramRequests,
  coachWeeklyReviews,
  programDrafts,
  programs,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { jobTargetSchema } from "@/domain/coaching-workflow";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { ensureProfile } from "@/server/queries/profile";
import { loadCoachDashboard, type CoachDashboardOptions } from "./coach-dashboard";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
}, 90_000);
afterAll(async () => {
  await t?.close();
});

const now = new Date("2026-10-18T12:00:00Z");
const options: CoachDashboardOptions = {
  timeZone: "Asia/Kolkata",
  enabled: true,
  workflow: true,
  configured: true,
  canRequest: true,
};
const blueprint: ProgramBlueprint = {
  blueprintVersion: 1,
  slug: "training",
  name: "Training block",
  weeks: 8,
  notes: "",
  days: [],
  runs: [],
};

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  await ensureProfile(t.db, user);
  return user.id;
}

async function programme(userId: string, sport: ActivitySport) {
  const [row] = await t.db
    .insert(programs)
    .values({
      userId,
      sport,
      familyId: crypto.randomUUID(),
      slug: `${sport}-block`,
      name: `${sport} block`,
      status: "active",
    })
    .returning();
  return row!;
}

async function draft(
  userId: string,
  sport: ActivitySport,
  patch: Partial<typeof programDrafts.$inferInsert> = {},
) {
  const [row] = await t.db
    .insert(programDrafts)
    .values({
      userId,
      sport,
      source: "ai",
      status: "ready",
      blueprint: { ...blueprint, name: `${sport} plan` },
      sourceRevision: 1,
      createdAt: now,
      updatedAt: now,
      ...patch,
    })
    .returning();
  return row!;
}

async function job(
  userId: string,
  sport: ActivitySport,
  patch: Partial<typeof coachJobs.$inferInsert> = {},
) {
  const [row] = await t.db
    .insert(coachJobs)
    .values({
      userId,
      kind: "review_program",
      trigger: "weekly",
      dedupeKey: crypto.randomUUID(),
      target: jobTargetSchema.parse({ sport }),
      status: "succeeded",
      createdAt: new Date(now.getTime() - 1_000),
      nextAttemptAt: now,
      ...patch,
    })
    .returning();
  return row!;
}

it("includes every sport, creation drafts, reusable sessions and more than twenty open requests", async () => {
  const userId = await athlete();
  const active = await Promise.all(ACTIVITY_SPORTS.map((sport) => programme(userId, sport)));
  const strength = await draft(userId, "strength", {
    baseProgramId: active[0]!.id,
    headline: "Add a squat day",
  });
  const running = await draft(userId, "running");
  const cycling = await draft(userId, "cycling", { source: "manual", status: "editing" });
  const swimming = await draft(userId, "swimming", { standalone: true });
  await t.db.insert(coachProgramRequests).values(
    Array.from({ length: 24 }, (_, index) => ({
      id: crypto.randomUUID(),
      userId,
      sport: ACTIVITY_SPORTS[index % 4]!,
      sourceId: `note:${crypto.randomUUID()}`,
      quote: `Request ${index}`,
      summary: `Request ${index}`,
      state: index < 4 ? ("needs_answer" as const) : ("waiting" as const),
    })),
  );
  const other = await athlete();
  await programme(other, "running");
  const foreign = await draft(other, "running", { headline: "Private other account" });

  const dashboard = await loadCoachDashboard(t.db, userId, options, now);
  expect(dashboard.programmes.map((item) => item.sport)).toEqual(ACTIVITY_SPORTS);
  expect(dashboard.requests).toHaveLength(24);
  expect(dashboard.proposals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: strength.id, kind: "change", title: "Add a squat day" }),
      expect.objectContaining({ id: running.id, kind: "programme", sport: "running" }),
      expect.objectContaining({ id: cycling.id, status: "editing", fromCoach: false }),
      expect.objectContaining({ id: swimming.id, kind: "session", sport: "swimming" }),
    ]),
  );
  expect(dashboard.proposals.some((item) => item.id === foreign.id)).toBe(false);
  expect(dashboard.programmes.map((item) => item.pending)).toEqual([2, 2, 2, 2]);
  expect(dashboard.waiting).toBe(8);
  expect(JSON.parse(JSON.stringify(dashboard))).toEqual(dashboard);
});

it("keeps requests with closed or incorrectly scoped drafts visible with the coach", async () => {
  const userId = await athlete();
  const closed = await draft(userId, "running", { status: "superseded" });
  const strength = await draft(userId, "strength");
  const session = await draft(userId, "running", { standalone: true });
  const open = await draft(userId, "running");
  for (const linked of [closed, strength, session, open]) {
    await t.db.insert(coachProgramRequests).values({
      id: crypto.randomUUID(),
      userId,
      sport: "running",
      sourceId: `note:${crypto.randomUUID()}`,
      quote: linked.id,
      summary: "Revise the running schedule",
      state: "proposed",
      draftId: linked.id,
    });
  }
  const dashboard = await loadCoachDashboard(t.db, userId, options, now);
  expect(dashboard.requests.find((request) => request.quote === open.id)).toMatchObject({
    state: "proposed",
    draftId: open.id,
    sport: "running",
  });
  for (const stale of [closed, strength, session]) {
    expect(dashboard.requests.find((request) => request.quote === stale.id)).toMatchObject({
      state: "waiting",
      draftId: null,
    });
  }
});

it("reads review progress independently for each sport and offers it only with an enabled service", async () => {
  const userId = await athlete();
  await Promise.all([programme(userId, "strength"), programme(userId, "running")]);
  const runningJob = await job(userId, "running", {
    status: "claimed",
    leaseUntil: new Date(now.getTime() + 60_000),
  });
  await t.db.insert(coachWeeklyReviews).values({
    userId,
    sport: "running",
    jobId: runningJob.id,
    periodStart: new Date("2026-10-01T00:00:00Z"),
    periodEnd: new Date("2026-10-10T00:00:00Z"),
    outcome: "no_change",
    rationale: "The running plan remains suitable.",
    completedAt: new Date("2026-10-10T00:00:00Z"),
  });
  const dashboard = await loadCoachDashboard(t.db, userId, options, now);
  expect(dashboard.programmes.find((item) => item.sport === "strength")?.review).toMatchObject({
    offered: true,
    running: false,
    lastOn: null,
  });
  expect(dashboard.programmes.find((item) => item.sport === "running")?.review).toMatchObject({
    offered: true,
    running: true,
    canAsk: false,
    lastOn: "10\u00a0Oct",
  });
  for (const flag of ["enabled", "workflow", "configured", "canRequest"] as const) {
    const disabled = await loadCoachDashboard(t.db, userId, { ...options, [flag]: false }, now);
    expect(disabled.programmes.every((item) => !item.review.offered)).toBe(true);
  }
});

it("does not let another sport or session creation hide a failure and settles expired jobs read-only", async () => {
  const userId = await athlete();
  const failed = await job(userId, "running", { status: "failed", error: "Running review failed" });
  await job(userId, "strength", { status: "succeeded", createdAt: now });
  const session = await job(userId, "swimming", {
    kind: "create_program",
    status: "needs_input",
    target: jobTargetSchema.parse({ sport: "swimming", scope: "session" }),
  });
  const creation = await job(userId, "swimming", {
    kind: "create_program",
    status: "queued",
    createdAt: now,
  });
  const expired = await job(userId, "cycling", {
    status: "claimed",
    leaseUntil: new Date(now.getTime() - 60_000),
  });
  const dashboard = await loadCoachDashboard(t.db, userId, options, now);
  expect(dashboard.jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: failed.id, sport: "running", status: "failed" }),
      expect.objectContaining({ id: session.id, scope: "session", status: "needs_input" }),
      expect.objectContaining({ id: creation.id, scope: "programme", status: "queued" }),
      expect.objectContaining({ id: expired.id, status: "queued", progress: "waiting" }),
    ]),
  );
  expect(dashboard.expiredJobs).toBe(true);
  expect(dashboard.waiting).toBe(1);
  const [stored] = await t.db.select().from(coachJobs).where(eq(coachJobs.id, expired.id));
  expect(stored?.status).toBe("claimed");
  await job(userId, "running", { status: "succeeded", createdAt: now });
  const recovered = await loadCoachDashboard(t.db, userId, options, now);
  expect(recovered.jobs.some((item) => item.id === failed.id)).toBe(false);
});

it("keeps all-sport settled requests, new programmes, sessions and automatic changes in history", async () => {
  const userId = await athlete();
  const programmeDraft = await draft(userId, "running", {
    status: "activated",
    headline: "First running block",
  });
  const sessionDraft = await draft(userId, "swimming", { status: "activated", standalone: true });
  const revision = await draft(userId, "cycling", { status: "rejected", closedAs: "revised" });
  const reviewJob = await job(userId, "running");
  await t.db.insert(coachWeeklyReviews).values({
    userId,
    sport: "running",
    jobId: reviewJob.id,
    periodStart: new Date("2026-10-01T00:00:00Z"),
    periodEnd: now,
    outcome: "automatic",
    rationale: "Adjusted easy running targets.",
    draftId: programmeDraft.id,
    completedAt: now,
  });
  await t.db.insert(coachProgramRequests).values({
    id: crypto.randomUUID(),
    userId,
    sport: "swimming",
    sourceId: `note:${crypto.randomUUID()}`,
    quote: "Add technique work",
    summary: "Add technique work",
    state: "not_recommended",
    detail: "Recover first.",
    resolvedAt: now,
  });
  const dashboard = await loadCoachDashboard(t.db, userId, options, now);
  expect(dashboard.proposals).toEqual([]);
  expect(dashboard.history.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: programmeDraft.id, kind: "programme", status: "activated" }),
      expect.objectContaining({ id: sessionDraft.id, kind: "session", outcome: "Session saved" }),
      expect.objectContaining({
        id: revision.id,
        sport: "cycling",
        outcome: "Sent back for changes",
      }),
    ]),
  );
  expect(dashboard.history.requests).toEqual([
    expect.objectContaining({
      sport: "swimming",
      state: "not_recommended",
      detail: "Recover first.",
    }),
  ]);
  expect(dashboard.recentChanges).toEqual([
    expect.objectContaining({
      id: programmeDraft.id,
      sport: "running",
      title: "First running block",
    }),
  ]);
});
