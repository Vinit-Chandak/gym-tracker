import { eq } from "drizzle-orm";
import { beforeAll, afterAll, expect, it } from "vitest";
import { profiles, gyms } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "./profile";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});
it("restores a missing profile from the verified signup name, and keeps later name edits", async () => {
  const user = { ...(await t.createAuthUser("restored@example.test")), displayName: "Signup name" };
  await withUser(t.db, user.id, async (tx) => {
    await tx.delete(profiles).where(eq(profiles.id, user.id));
    expect((await ensureProfile(tx, user)).displayName).toBe("Signup name");
    await tx.update(profiles).set({ displayName: "Chosen name" }).where(eq(profiles.id, user.id));
    expect((await ensureProfile(tx, user)).displayName).toBe("Chosen name");
    await tx.update(profiles).set({ displayName: "" }).where(eq(profiles.id, user.id));
    expect((await ensureProfile(tx, user)).displayName).toBe("Signup name");
  });
});
it("deleting the Auth record cascades app data and lets the email start with a new identity", async () => {
  const user = await t.createAuthUser("deleted@example.test");
  await withUser(t.db, user.id, (tx) =>
    tx.insert(gyms).values({ userId: user.id, name: "My gym", slug: "my-gym" }),
  );
  await t.client.query("delete from auth.users where id = $1", [user.id]);
  expect(await t.db.select().from(profiles).where(eq(profiles.id, user.id))).toHaveLength(0);
  expect(await t.db.select().from(gyms).where(eq(gyms.userId, user.id))).toHaveLength(0);
  const fresh = await t.createAuthUser(user.email);
  expect(fresh.id).not.toBe(user.id);
  expect((await ensureProfile(t.db, fresh)).onboardedAt).toBeNull();
});
