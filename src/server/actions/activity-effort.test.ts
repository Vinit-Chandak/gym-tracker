import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { activities, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveActivityAction } from "./activities";

/**
 * LOG-03 and AT-LOG-11: an unconfirmed legacy effort stays what it was until the athlete says
 * otherwise. Correcting anything else about the record — a typo in the notes — used to post
 * Not sure, and the number was gone.
 */

let t: TestDatabase;
let user: { id: string; email: string };

beforeEach(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("legacy-effort@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
  await t.db.update(profiles).set({ timeZone: "Europe/London" }).where(eq(profiles.id, user.id));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
});

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    sport: "running",
    submissionKey: crypto.randomUUID(),
    startedAt: "2026-09-18T07:15",
    environment: "outdoor",
    distanceValue: "5",
    distanceUnit: "km",
    minutes: "30",
    effort: "3",
    ...values,
  }))
    data.set(key, value);
  return data;
}

/** A run as the migration left it: a number that may have been the coach's, not the athlete's. */
async function legacyRun(value: number | null): Promise<string> {
  const created = await saveActivityAction(null, {}, form());
  const id = created.savedActivityId!;
  await t.db
    .update(activities)
    .set({ effortStatus: "legacy_unconfirmed", effortValue: value })
    .where(eq(activities.id, id));
  return id;
}

async function effortOf(id: string) {
  const [row] = await t.db
    .select({ status: activities.effortStatus, value: activities.effortValue })
    .from(activities)
    .where(eq(activities.id, id));
  return row;
}

it("keeps an unconfirmed effort through a correction to the notes", async () => {
  const id = await legacyRun(3);
  const saved = await saveActivityAction(
    id,
    {},
    form({ expectedRevision: "1", effort: "keep", notes: "Fixed a typo." }),
  );
  expect(saved.savedActivityId).toBe(id);
  expect(await effortOf(id)).toEqual({ status: "legacy_unconfirmed", value: 3 });
});

it("keeps an unconfirmed record with no number as it was, rather than as Not sure", async () => {
  const id = await legacyRun(null);
  await saveActivityAction(id, {}, form({ expectedRevision: "1", effort: "keep" }));
  expect(await effortOf(id)).toEqual({ status: "legacy_unconfirmed", value: null });
});

it("takes the athlete's own answer in its place when one is given", async () => {
  const id = await legacyRun(3);
  await saveActivityAction(id, {}, form({ expectedRevision: "1", effort: "4" }));
  expect(await effortOf(id)).toEqual({ status: "reported", value: 4 });
});

it("refuses Keep where there is nothing unconfirmed to keep", async () => {
  const fresh = await saveActivityAction(null, {}, form({ effort: "keep" }));
  expect(fresh.fieldErrors?.effort).toMatch(/1 to 5/);
  expect(await t.db.select().from(activities)).toEqual([]);

  const reported = (await saveActivityAction(null, {}, form())).savedActivityId!;
  const state = await saveActivityAction(
    reported,
    {},
    form({ expectedRevision: "1", effort: "keep" }),
  );
  expect(state.fieldErrors?.effort).toMatch(/1 to 5/);
  expect(await effortOf(reported)).toEqual({ status: "reported", value: 3 });
});
