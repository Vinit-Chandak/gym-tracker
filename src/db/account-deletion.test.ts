import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { profiles, workoutSessions } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { listGyms } from "@/server/repositories/gyms";
import { startAdHocSession } from "@/server/repositories/sessions";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

/**
 * Auth deletion cascades through the profile. This suite checks that public-data half of the
 * cascade. That trust is only as good as the last table somebody added: a new table holding
 * training data, with a user_id that does not cascade, leaves that data behind an account
 * that no longer exists, and nothing in the app would ever say so.
 */
it("takes every table that holds a user's data with the profile", async () => {
  const rows = await t.db.execute<{ child: string; rule: string }>(sql`
    select c.conrelid::regclass::text as child, c.confdeltype as rule
    from pg_constraint c
    join unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and a.attname = 'user_id'
      and c.connamespace = 'public'::regnamespace
      and c.confrelid = 'profiles'::regclass
    order by 1
  `);
  const kept = rows.rows.filter((row) => row.rule !== "c").map((row) => row.child);
  expect(kept).toEqual([]);
  // And the sweep is worth something: it has to have found the tables.
  expect(rows.rows.length).toBeGreaterThanOrEqual(20);
});

/**
 * The other half of the same promise: a table with training data in it that is reached some
 * other way. Only the shared catalogues and the profile itself may stand outside.
 */
it("leaves nothing but the shared catalogues without an owner", async () => {
  const rows = await t.db.execute<{ table_name: string }>(sql`
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and t.table_name not like '__drizzle%'
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'user_id'
      )
    order by 1
  `);
  expect(rows.rows.map((row) => row.table_name)).toEqual([
    "equipment_types",
    "profiles",
    "warmup_protocols",
  ]);
});

/**
 * And the same thing carried out, on an account that has trained.
 *
 * A workout points at the gym it was done in with `on delete restrict`, so that a gym in use
 * cannot be deleted out from under its own history. Deleting the profile asks Postgres to
 * remove both at once, and whether that is refused comes down to when the restriction is
 * checked. It holds — the referencing rows are gone by the time it is — but the whole of
 * account deletion rests on it, so it is worth a test that would notice if it stopped.
 */
it("deletes an account that has trained, gym and workout together", async () => {
  const user = await t.createAuthUser("deleting@example.test");
  await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  const gyms = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
  const gymId = gyms.find((gym) => gym.slug === "anytime-fitness")?.id ?? "";
  expect(gymId).not.toBe("");
  await withUser(t.db, user.id, (tx) => startAdHocSession(tx, user.id, { gymId }));

  await t.db.delete(profiles).where(eq(profiles.id, user.id));

  const left = await t.db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, user.id));
  expect(left).toEqual([]);
  const profile = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  expect(profile).toEqual([]);
});
