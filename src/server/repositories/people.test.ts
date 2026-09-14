import { afterAll, beforeAll, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { usernameAvailable } from "./people";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

it("answers the availability question with and without a user", async () => {
  const { id } = await t.createAuthUser("taken@example.com");
  expect(await usernameAvailable(t.db, "taken")).toBe(false);
  expect(await usernameAvailable(t.db, "free_name")).toBe(true);
  expect(await usernameAvailable(t.db, "coach")).toBe(false);
  // Under RLS the caller sees one profile row; the security-definer function still sees all.
  expect(await withUser(t.db, id, (tx) => usernameAvailable(tx, "taken"))).toBe(false);
});
