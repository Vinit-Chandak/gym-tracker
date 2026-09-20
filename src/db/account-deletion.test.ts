import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { activities, profiles, workoutSessions } from "@/db/schema";
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
    // The deploy script's ledger of one-off backfills: names and dates, nothing anyone owns.
    "data_backfills",
    "equipment_types",
    // Owned twice over: both sides cascade from profiles, which the first test checks.
    "follows",
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

/**
 * Every trigger function that reads a table runs as its owner.
 *
 * Account deletion failed in production with "permission denied for table activities" at
 * COMMIT: Auth deletes `auth.users` as `supabase_auth_admin`, the cascade removes a workout
 * session, and the deferred trigger on it reads `public.activities` to see whether its parent
 * survived the same transaction. `assert_activity_detail` was the one function in this schema
 * reading a table without `SECURITY DEFINER` — `activity_detail_count`, which it calls two
 * lines further down, already had it.
 *
 * The privilege chain that produced it cannot be built here: the cascade hands the trigger an
 * elevated context of its own, so the delete below succeeds either way. This asserts the
 * property that makes the question moot instead, which is the thing that was actually wrong.
 */
it("runs every table-reading trigger function as its owner", async () => {
  const rows = await t.db.execute<{ name: string; secdef: boolean }>(sql`
    select p.proname as name, p.prosecdef as secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and p.prosrc ~* '(from|join)\\s+public\\.'
    order by 1
  `);
  expect(rows.rows.length).toBeGreaterThan(0);
  expect(rows.rows.filter((row) => !row.secdef).map((row) => row.name)).toEqual([]);
});

/**
 * Deletion through `auth.users`, which is the edge the app actually deletes from.
 *
 * Every other test here deletes the profile directly, so none of them fires the deferred
 * constraint triggers the cascade reaches on the way out — and it was one of those that
 * failed in production. This does not reproduce the privilege failure (see above), but it
 * does prove the cascade completes with those triggers firing and the account fully gone.
 */
it("deletes an account through auth, with the cascade triggers firing", async () => {
  await t.client.exec(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
        create role supabase_auth_admin nologin;
      end if;
    end $$;
    grant usage on schema auth to supabase_auth_admin;
    grant select, delete on auth.users to supabase_auth_admin;
  `);
  const user = await t.createAuthUser("auth-deleting@example.test");
  await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  const gyms = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
  const gymId = gyms.find((gym) => gym.slug === "anytime-fitness")?.id ?? "";
  await withUser(t.db, user.id, (tx) => startAdHocSession(tx, user.id, { gymId }));
  // The trigger only has something to say when the account owns an activity and its detail.
  const owned = await t.db.select().from(activities).where(eq(activities.userId, user.id));
  expect(owned.length).toBeGreaterThan(0);

  // No grant on public anywhere in here: that is the whole point of the reproduction.
  // The role is set for the session, not the transaction: a deferred constraint trigger
  // fires during COMMIT, and `SET LOCAL` is already undone by then — which is exactly how a
  // first attempt at this test passed against the broken function.
  await t.client.exec(`set role supabase_auth_admin;`);
  try {
    await t.client.exec(`
      begin;
      delete from auth.users where id = '${user.id}';
      commit;
    `);
  } finally {
    await t.client.exec(`reset role;`);
  }

  const profile = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  expect(profile).toEqual([]);
  const left = await t.db.select().from(activities).where(eq(activities.userId, user.id));
  expect(left).toEqual([]);
});
