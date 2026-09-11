import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { coachRequests, profiles, sessionPlans } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { handleCoachServiceRequest } from "@/server/coach-service";

import {
  getCoachMemo,
  markRequestFailed,
  pendingRequest,
  recentAttempts,
  reconcileExpiredCoachRequests,
  REQUEST_TIMEOUT_MESSAGE,
  REQUEST_TIMEOUT_MINUTES,
  todayCoachState,
} from "./coach-plans";

const NOW = new Date("2026-09-11T09:00:00Z");
const TOKEN = "synthetic-request-lifecycle-token";
let t: TestDatabase;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("COACH_SERVICE_TOKEN", TOKEN);
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t?.close();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.test`);
  const fixture = await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  await withUser(t.db, user.id, (tx) =>
    tx
      .update(profiles)
      .set({ aiCoachEnabled: true, timeZone: "Asia/Kolkata" })
      .where(eq(profiles.id, user.id)),
  );
  return {
    id: user.id,
    programId: fixture.programId,
    gymId: fixture.gymIdBySlug.get("anytime-fitness")!,
    otherGymId: fixture.gymIdBySlug.get("samsung-gym")!,
  };
}
type Athlete = Awaited<ReturnType<typeof athlete>>;

async function request(user: Athlete, overrides: Partial<typeof coachRequests.$inferInsert> = {}) {
  const [row] = await withUser(t.db, user.id, (tx) =>
    tx
      .insert(coachRequests)
      .values({
        userId: user.id,
        gymId: user.gymId,
        requestedAt: NOW,
        ...overrides,
      })
      .returning(),
  );
  return row!;
}

async function submit(
  user: Athlete,
  requestId: string | null,
  overrides: Record<string, unknown> = {},
) {
  const response = await handleCoachServiceRequest(
    t.db,
    new Request(`https://app.test/api/coach/service/users/${user.id}/plans`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        slot: { cycleIndex: 1, dayIndex: 1 },
        gymId: user.gymId,
        trigger: requestId ? "replan" : "nightly",
        requestId,
        summary: "Accepted plan.",
        memo: "Accepted memo.",
        exercises: [{ exerciseSlug: "high-bar-squat", sets: [{ weight: 40, reps: 5, rir: 3 }] }],
        ...overrides,
      }),
    }),
    ["users", user.id, "plans"],
  );
  return { status: response.status, body: await response.json() };
}

describe("durable request timeouts", () => {
  it("persists a timeout and shows the failure on the same Today read", async () => {
    const user = await athlete();
    const expired = await request(user, { requestedAt: new Date(NOW.getTime() - 16 * 60_000) });
    const state = await withUser(t.db, user.id, (tx) =>
      todayCoachState(tx, user.id, {
        enabled: true,
        timeZone: "Asia/Kolkata",
        programId: user.programId,
        ref: { cycleIndex: 1, dayIndex: 1 },
        gymId: user.gymId,
      }),
    );
    expect(state.pending).toBeNull();
    expect(state.failure).toMatchObject({
      id: expired.id,
      status: "failed",
      error: REQUEST_TIMEOUT_MESSAGE,
      completedAt: NOW,
    });
    const attempts = await withUser(t.db, user.id, (tx) => recentAttempts(tx, user.id));
    expect(attempts[0]).toMatchObject({ id: expired.id, status: "failed", completedAt: NOW });
    expect(await withUser(t.db, user.id, (tx) => reconcileExpiredCoachRequests(tx, user.id))).toBe(
      0,
    );
  });

  it("preserves the current timeout boundary and records expiry once it is exceeded", async () => {
    const user = await athlete();
    const waiting = await request(user, {
      requestedAt: new Date(NOW.getTime() - REQUEST_TIMEOUT_MINUTES * 60_000),
    });
    expect(
      await withUser(t.db, user.id, (tx) => reconcileExpiredCoachRequests(tx, user.id, NOW)),
    ).toBe(0);
    // Query latency can cross the cutoff. One status read must use one captured instant.
    vi.setSystemTime(new Date(NOW.getTime() + 1));
    try {
      expect((await withUser(t.db, user.id, (tx) => pendingRequest(tx, user.id, NOW)))?.id).toBe(
        waiting.id,
      );
    } finally {
      vi.setSystemTime(NOW);
    }
    expect(
      await withUser(t.db, user.id, (tx) =>
        reconcileExpiredCoachRequests(tx, user.id, new Date(NOW.getTime() + 1)),
      ),
    ).toBe(1);
  });

  it("cannot expire another athlete's request even when passed their ID", async () => {
    const owner = await athlete(),
      other = await athlete();
    const expired = await request(owner, { requestedAt: new Date(NOW.getTime() - 16 * 60_000) });
    expect(
      await withUser(t.db, other.id, (tx) => reconcileExpiredCoachRequests(tx, owner.id)),
    ).toBe(0);
    const [unchanged] = await withUser(t.db, owner.id, (tx) =>
      tx.select().from(coachRequests).where(eq(coachRequests.id, expired.id)),
    );
    expect(unchanged?.status).toBe("requested");
  });
});

describe("request-scoped result acceptance", () => {
  it("accepts the same gym UUID regardless of letter casing", async () => {
    const user = await athlete();
    const waiting = await request(user);
    const accepted = await submit(user, waiting.id, { gymId: user.gymId.toUpperCase() });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
  });

  it.each(["expired", "failed", "planned", "foreign", "gym", "trigger"])(
    "rejects a %s request association without changing the saved plan or memo",
    async (kind) => {
      const user = await athlete();
      const original = await submit(user, null);
      expect(original.status).toBe(201);
      const owner = kind === "foreign" ? await athlete() : user;
      const association = await request(owner, {
        ...(kind === "expired" ? { requestedAt: new Date(NOW.getTime() - 16 * 60_000) } : {}),
        ...(kind === "failed" || kind === "planned" ? { status: kind, completedAt: NOW } : {}),
        ...(kind === "gym" ? { gymId: user.otherGymId } : {}),
      });
      const rejected = await submit(user, association.id, {
        summary: "Late replacement.",
        memo: "This must not replace the memo.",
        ...(kind === "trigger" ? { trigger: "nightly" } : {}),
      });
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(422);
      expect(rejected.body.issues).toContainEqual({
        path: "requestId",
        message: expect.any(String),
      });
      const active = await withUser(t.db, user.id, (tx) =>
        tx
          .select()
          .from(sessionPlans)
          .where(and(eq(sessionPlans.userId, user.id), eq(sessionPlans.status, "active"))),
      );
      expect(active.map((plan) => plan.id)).toEqual([original.body.plan.id]);
      expect((await withUser(t.db, user.id, (tx) => getCoachMemo(tx, user.id))).overview).toBe(
        "Accepted memo.",
      );
    },
  );

  it("keeps a successful request terminal when duplicate results, late failures and reconciliation arrive", async () => {
    const user = await athlete();
    const waiting = await request(user);
    const first = await submit(user, waiting.id);
    expect(first.status).toBe(201);
    const duplicate = await submit(user, waiting.id, { summary: "Duplicate result." });
    expect(duplicate.status).toBe(422);
    expect(
      await withUser(t.db, user.id, (tx) =>
        markRequestFailed(tx, user.id, waiting.id, "Late failure"),
      ),
    ).toBe(false);
    expect(
      await withUser(t.db, user.id, (tx) =>
        reconcileExpiredCoachRequests(tx, user.id, new Date(NOW.getTime() + 60 * 60_000)),
      ),
    ).toBe(0);
    const [stored] = await withUser(t.db, user.id, (tx) =>
      tx.select().from(coachRequests).where(eq(coachRequests.id, waiting.id)),
    );
    expect(stored).toMatchObject({ status: "planned", error: null, completedAt: NOW });
    const plans = await withUser(t.db, user.id, (tx) => tx.select().from(sessionPlans));
    expect(plans.map((plan) => plan.id)).toEqual([first.body.plan.id]);
  });
});
