import { afterAll, beforeAll, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { knownTimeZone } from "./time-zone";

let t: TestDatabase, userId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  userId = (await t.createAuthUser("zones@example.test")).id;
});
afterAll(async () => {
  await t?.close();
});

it("spells a zone as Postgres does, and knows none it cannot read", async () => {
  // Asked as an athlete is, under the row-level rules.
  const spell = (zone: string) =>
    withUser(t.db, userId, (tx) => knownTimeZone(tx, zone), { readOnly: true });
  expect(await spell("asia/kolkata")).toBe("Asia/Kolkata");
  expect(await spell("Asia/Kolkata")).toBe("Asia/Kolkata");
  expect(await spell("Asia/Calcutta")).toBe("Asia/Calcutta");
  expect(await spell("europe/kyiv")).toBe("Europe/Kyiv");
  expect(await spell("UTC")).toBe("UTC");
  expect(await spell("Mars/Olympus")).toBeNull();
  expect(await spell("+05:30")).toBeNull();
});
