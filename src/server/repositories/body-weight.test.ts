import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";

import { listBodyWeights, recordBodyWeight } from "./body-weight";

let t: TestDatabase;
let user: { id: string; email: string };
let other: { id: string; email: string };

const RANGE = { from: "2026-01-01", to: "2026-12-31" };

async function currentWeight(userId: string): Promise<number | null> {
  const [row] = await t.db
    .select({ bodyWeightKg: profiles.bodyWeightKg })
    .from(profiles)
    .where(eq(profiles.id, userId));
  return row?.bodyWeightKg ?? null;
}

beforeAll(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("weight@example.com");
  other = await t.createAuthUser("other-weight@example.com");
  for (const account of [user, other]) {
    await withUser(t.db, account.id, (tx) => ensureProfile(tx, account));
  }
});

afterAll(async () => {
  await t.close();
});

describe("body weight", () => {
  it("records a reading and puts it on the profile", async () => {
    await withUser(t.db, user.id, (tx) =>
      recordBodyWeight(tx, user.id, { measuredOn: "2026-03-01", weightKg: 74.5 }),
    );
    expect(await currentWeight(user.id)).toBe(74.5);
  });

  it("keeps one reading per day, with the last word winning", async () => {
    await withUser(t.db, user.id, async (tx) => {
      await recordBodyWeight(tx, user.id, { measuredOn: "2026-03-02", weightKg: 75 });
      await recordBodyWeight(tx, user.id, { measuredOn: "2026-03-02", weightKg: 74.9 });
    });
    const readings = await withUser(t.db, user.id, (tx) => listBodyWeights(tx, user.id, RANGE));
    expect(readings).toEqual([
      { measuredOn: "2026-03-01", weightKg: 74.5 },
      { measuredOn: "2026-03-02", weightKg: 74.9 },
    ]);
    expect(await currentWeight(user.id)).toBe(74.9);
  });

  it("leaves the profile on the newest reading when an older day is filled in", async () => {
    await withUser(t.db, user.id, (tx) =>
      recordBodyWeight(tx, user.id, { measuredOn: "2026-02-01", weightKg: 70 }),
    );
    // Correcting January must not rewrite what the person weighs now.
    expect(await currentWeight(user.id)).toBe(74.9);
  });

  it("follows a correction to the newest day itself", async () => {
    await withUser(t.db, user.id, (tx) =>
      recordBodyWeight(tx, user.id, { measuredOn: "2026-03-02", weightKg: 76.25 }),
    );
    expect(await currentWeight(user.id)).toBe(76.25);
  });

  it("reads only the days inside the range asked for", async () => {
    const readings = await withUser(t.db, user.id, (tx) =>
      listBodyWeights(tx, user.id, { from: "2026-03-01", to: "2026-03-01" }),
    );
    expect(readings).toEqual([{ measuredOn: "2026-03-01", weightKg: 74.5 }]);
  });

  it("never shows one account another account's readings", async () => {
    await withUser(t.db, other.id, (tx) =>
      recordBodyWeight(tx, other.id, { measuredOn: "2026-03-01", weightKg: 61 }),
    );
    const mine = await withUser(t.db, user.id, (tx) => listBodyWeights(tx, user.id, RANGE));
    expect(mine.map((r) => r.weightKg)).not.toContain(61);
    // Row Level Security, not the `user_id` filter, is what stops it: ask for theirs directly.
    const stolen = await withUser(t.db, user.id, (tx) => listBodyWeights(tx, other.id, RANGE));
    expect(stolen).toEqual([]);
    expect(await currentWeight(other.id)).toBe(61);
  });
});
