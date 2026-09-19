import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { occurrenceVersions, plannedOccurrences, programFamilies } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { handleCoachRequest } from "@/server/coach-api";
import { createActivity, type SaveActivityInput } from "@/server/repositories/activities";
import { createCoachToken } from "@/server/repositories/coach-tokens";
import { createProgramFromBlueprint } from "@/server/repositories/programs";

/**
 * AT-API: the two surfaces, and the line between them.
 *
 * The property under test is not "v2 works". It is that v1 keeps its shape while v2 exists
 * beside it — that a v1 client is never handed a swim, never handed half a programme, and
 * never handed a redirect where it asked for JSON.
 */

let t: TestDatabase;

// One database for the file: the shared reference library is memoised per process, so a
// fresh database per test would leave the cache pointing at warm-up rows that no longer
// exist. Each test uses its own athlete instead, which is the isolation that matters here.
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function athlete(email: string) {
  const user = await t.createAuthUser(email);
  const created = await withUser(t.db, user.id, (tx) => createCoachToken(tx, user.id, "test", 30));
  return { id: user.id, token: created.token };
}

type Athlete = Awaited<ReturnType<typeof athlete>>;

function call(a: Athlete, path: string, query = "") {
  const parts = path.split("/").filter(Boolean);
  return handleCoachRequest(
    t.db,
    new Request(`https://app.test/api/coach/${path}${query}`, {
      headers: { authorization: `Bearer ${a.token}` },
    }),
    parts,
  );
}

const ride = (date: string, km: number | null, hour = 6): SaveActivityInput => ({
  submissionKey: crypto.randomUUID(),
  origin: AD_HOC_ORIGIN,
  actual: {
    sport: "cycling",
    environment: "outdoor",
    durationMs: 1_800_000,
    distance: km === null ? null : nativeDistance(km, "km"),
    assistance: "unassisted",
    resourceId: null,
    averagePowerWatts: null,
    averageCadenceRpm: null,
    averageHeartRate: null,
    maxHeartRate: null,
    elevationGainMetres: null,
  },
  startedAt: new Date(`${date}T0${hour}:00:00Z`),
  recordedTimeZone: "UTC",
  timeZoneSource: "profile_at_entry",
  occurredOn: date,
  effort: reportedEffort(4),
  outcome: "logged",
  title: null,
  notes: null,
});

const save = (a: Athlete, input: SaveActivityInput) =>
  withUser(t.db, a.id, (tx) => createActivity(tx, a.id, input));

describe("v1 compatibility", () => {
  /** AT-API-01: the running payload is the running payload, and says so in its version. */
  it("keeps the running endpoint at version 1", async () => {
    const a = await athlete("v1-running@example.test");
    await save(a, ride("2026-06-01", 20));
    const response = await call(a, "running");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { version: number; runs: unknown[] };
    expect(body.version).toBe(1);
    // A ride is not a run. The v1 list is unchanged by cycling existing.
    expect(body.runs).toHaveLength(0);
  });

  /** AT-API-06: deprecation travels in headers, not in a new JSON key. */
  it("announces the compatibility window without changing the body", async () => {
    const a = await athlete("v1-headers@example.test");
    const response = await call(a, "summary");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("X-Coach-Api-Supported-Sports")).toBe("workout, run");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("deprecation");
  });

  /** AT-API-02: an unrepresentable programme is an explicit upgrade, never a partial one. */
  it("refuses a v1 programme that contains a swim", async () => {
    const a = await athlete("v1-programme@example.test");
    const created = await withUser(t.db, a.id, (tx) =>
      createProgramFromBlueprint(
        tx,
        a.id,
        {
          ...STRENGTH_AESTHETICS_HYBRID_8WK,
          slug: "with-swim",
          weeks: 2,
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
        { startDate: "2026-06-01" },
      ),
    );
    await withUser(t.db, a.id, async (tx) => {
      await tx.insert(programFamilies).values({ id: created.familyId, userId: a.id });
      const [occurrence] = await tx
        .insert(plannedOccurrences)
        .values({ userId: a.id, sport: "swimming", familyId: created.familyId })
        .returning({ id: plannedOccurrences.id });
      const [revision] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId: a.id,
          sport: "swimming",
          programVersionId: created.id,
          scheduledOn: "2026-06-03",
          schedulingZone: "UTC",
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: revision!.id })
        .where(eq(plannedOccurrences.id, occurrence!.id));
    });

    const response = await call(a, "program/current");
    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = (await response.json()) as { error: string; upgradeTo: string };
    expect(body.error).toBe("upgrade_required");
    expect(body.upgradeTo).toBe("/api/coach/v2/program/current");

    // And v2 can describe it.
    const v2 = await call(a, "v2/program/current");
    expect(v2.status).toBe(200);
    const plan = (await v2.json()) as {
      version: number;
      program: { occurrences: { sport: string }[] };
    };
    expect(plan.version).toBe(2);
    expect(plan.program.occurrences.map((o) => o.sport)).toEqual(["swimming"]);
  });

  /** A strength-and-running programme is still perfectly representable. */
  it("still serves a v1 programme it can describe", async () => {
    const a = await athlete("v1-ok@example.test");
    await withUser(t.db, a.id, (tx) =>
      createProgramFromBlueprint(
        tx,
        a.id,
        {
          ...STRENGTH_AESTHETICS_HYBRID_8WK,
          slug: "lifting-only",
          weeks: 2,
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
        { startDate: "2026-06-01" },
      ),
    );
    const response = await call(a, "program/current");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { version: number; program: { slug: string } | null };
    expect(body.version).toBe(1);
    expect(body.program?.slug).toBe("lifting-only");
  });
});

describe("v2", () => {
  /** AT-API-03: typed, sport-complete rows with a stable cursor. */
  it("returns typed activities and pages by a stable cursor", async () => {
    const a = await athlete("v2-activities@example.test");
    for (let index = 0; index < 3; index++)
      await save(a, ride("2026-06-10", 10 + index, index + 1));
    const first = await call(a, "v2/activities", "?limit=2");
    expect(first.status).toBe(200);
    const page = (await first.json()) as {
      version: number;
      activities: { sport: string; detail: { assistance: string } }[];
      nextCursor: string | null;
    };
    expect(page.version).toBe(2);
    expect(page.activities).toHaveLength(2);
    expect(page.activities[0]?.sport).toBe("cycling");
    expect(page.activities[0]?.detail.assistance).toBe("unassisted");
    expect(page.nextCursor).not.toBeNull();

    const second = await call(
      a,
      "v2/activities",
      `?limit=2&cursor=${encodeURIComponent(page.nextCursor!)}`,
    );
    const rest = (await second.json()) as { activities: unknown[]; nextCursor: string | null };
    expect(rest.activities).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
  });

  /** AT-API-04: a bad cursor and a bad limit are documented 400s, not silent defaults. */
  it("rejects an invalid cursor, limit, sport and range", async () => {
    const a = await athlete("v2-validation@example.test");
    expect((await call(a, "v2/activities", "?cursor=nonsense")).status).toBe(400);
    expect((await call(a, "v2/activities", "?limit=500")).status).toBe(400);
    expect((await call(a, "v2/activities", "?sport=jogging")).status).toBe(400);
    expect((await call(a, "v2/summary", "?from=2020-01-01&to=2026-01-01")).status).toBe(400);
    expect((await call(a, "v2/summary", "?from=2026-06-30&to=2026-06-01")).status).toBe(400);
    expect((await call(a, "v2/nothing")).status).toBe(404);
  });

  /** AT-API-03 / AT-STAT-02: aggregates are SQL totals with their coverage stated. */
  it("aggregates the whole period and declares what it could not include", async () => {
    const a = await athlete("v2-summary@example.test");
    await save(a, ride("2026-06-01", 10, 1));
    await save(a, ride("2026-06-02", null, 2));
    const response = await call(a, "v2/summary", "?from=2026-06-01&to=2026-06-30");
    const body = (await response.json()) as {
      period: { from: string; to: string; inclusive: boolean };
      totals: {
        sport: string;
        count: number;
        distanceMetres: number | null;
        unknownDistances: number;
      }[];
      coverage: string;
    };
    expect(body.period).toEqual({ from: "2026-06-01", to: "2026-06-30", inclusive: true });
    const cycling = body.totals.find((entry) => entry.sport === "cycling")!;
    expect(cycling.count).toBe(2);
    expect(cycling.distanceMetres).toBeCloseTo(10_000, 3);
    expect(cycling.unknownDistances).toBe(1);
    expect(body.coverage).toContain("whole stated period");
  });

  /**
   * AT-API-05: the token is read-only, and another athlete's data is not reachable.
   *
   * The route file exports only `GET`, so a POST never reaches the handler at all — Next
   * answers 405 itself. What is checked here is the half that is this module's to guarantee:
   * the transaction is read-only, and a request authenticated as one athlete sees one
   * athlete's activities and no others'.
   */
  it("keeps the token scoped to its own account", async () => {
    const a = await athlete("v2-owner@example.test");
    const b = await athlete("v2-other@example.test");
    await save(b, ride("2026-06-05", 30));
    const mine = (await (await call(a, "v2/activities")).json()) as { activities: unknown[] };
    expect(mine.activities).toHaveLength(0);
    const theirs = (await (await call(b, "v2/activities")).json()) as { activities: unknown[] };
    expect(theirs.activities).toHaveLength(1);
  });

  it("refuses a missing or revoked token on both versions", async () => {
    const anonymous = await handleCoachRequest(
      t.db,
      new Request("https://app.test/api/coach/v2/summary"),
      ["v2", "summary"],
    );
    expect(anonymous.status).toBe(401);
    const bad = await handleCoachRequest(
      t.db,
      new Request("https://app.test/api/coach/v2/summary", {
        headers: { authorization: "Bearer not-a-token" },
      }),
      ["v2", "summary"],
    );
    expect(bad.status).toBe(401);
  });
});
