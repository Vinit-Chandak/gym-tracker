import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { SUPABASE_AUTH_STUB_SQL } from "@/db/test/pglite";

/**
 * Migration 0045 on a database that already has machines: every machine keeps its type, now
 * also in `equipment_instance_types`, and its history is untouched. The database is built to
 * 0044 from a copy of the migrations, filled the way the old code filled it, then upgraded with
 * the real migrator, as a deploy would.
 */

let client: PGlite;
let folder: string;

beforeEach(async () => {
  client = new PGlite();
  await client.exec(SUPABASE_AUTH_STUB_SQL);
  folder = await mkdtemp(join(tmpdir(), "overload-migrations-"));
  await cp("src/db/migrations", folder, { recursive: true });
  const journal = JSON.parse(await readFile(join(folder, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 44);
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(journal));
  await migrate(drizzle(client, { schema }), { migrationsFolder: folder });
});

afterEach(async () => {
  await client.close();
  await rm(folder, { recursive: true, force: true });
});

it("gives every existing machine one row for its own type, and touches nothing else", async () => {
  const user = crypto.randomUUID();
  await client.query("insert into auth.users (id, email) values ($1, $2)", [user, "a@example.com"]);
  await client.query("insert into equipment_types (slug, name, category, default_resistance_mode) values ('pec_deck', 'Pec deck', 'machine', 'selectorized'), ('cable_station', 'Cable station', 'cable', 'selectorized')");
  const gym = crypto.randomUUID();
  await client.query(
    "insert into gyms (id, user_id, name, slug) values ($1, $2, 'Gym', 'gym')",
    [gym, user],
  );
  await client.query(
    `insert into equipment_instances (user_id, gym_id, equipment_type_id, name, resistance_mode, is_active)
     select $1, $2, id, name, 'selectorized', slug = 'pec_deck' from equipment_types`,
    [user, gym],
  );
  const before = await client.query<{ id: string; equipment_type_id: string; is_active: boolean }>(
    "select id, equipment_type_id, is_active from equipment_instances order by id",
  );

  await migrate(drizzle(client, { schema }), { migrationsFolder: "src/db/migrations" });

  const after = await client.query("select id, equipment_type_id, is_active from equipment_instances order by id");
  expect(after.rows).toEqual(before.rows);
  const types = await client.query<{ equipment_instance_id: string; equipment_type_id: string; user_id: string }>(
    "select equipment_instance_id, equipment_type_id, user_id from equipment_instance_types order by equipment_instance_id",
  );
  // Archived machines keep their type as well: archiving keeps history, and a restore needs it.
  expect(types.rows).toEqual(
    before.rows.map((row) => ({
      equipment_instance_id: row.id,
      equipment_type_id: row.equipment_type_id,
      user_id: user,
    })),
  );
});

it("keeps a machine's display type in its types from then on", async () => {
  await migrate(drizzle(client, { schema }), { migrationsFolder: "src/db/migrations" });
  const user = crypto.randomUUID();
  await client.query("insert into auth.users (id, email) values ($1, $2)", [user, "b@example.com"]);
  await client.query("insert into equipment_types (slug, name, category, default_resistance_mode) values ('lat_pulldown', 'Lat pulldown', 'machine', 'selectorized'), ('seated_row_cable', 'Seated cable row station', 'cable', 'selectorized'), ('cable_station', 'Cable station', 'cable', 'selectorized')");
  const gym = crypto.randomUUID();
  await client.query("insert into gyms (id, user_id, name, slug) values ($1, $2, 'Gym', 'gym')", [gym, user]);
  const types = Object.fromEntries(
    (await client.query<{ id: string; slug: string }>("select id, slug from equipment_types")).rows.map((r) => [r.slug, r.id]),
  );
  const machine = crypto.randomUUID();
  await client.query(
    "insert into equipment_instances (id, user_id, gym_id, equipment_type_id, name, resistance_mode) values ($1, $2, $3, $4, 'Lat machine', 'selectorized')",
    [machine, user, gym, types.lat_pulldown],
  );
  // "Also used for": the same machine is a low row too.
  await client.query(
    "insert into equipment_instance_types (equipment_instance_id, equipment_type_id, user_id) values ($1, $2, $3)",
    [machine, types.seated_row_cable, user],
  );
  const typesOf = async () =>
    (
      await client.query<{ equipment_type_id: string }>(
        "select equipment_type_id from equipment_instance_types where equipment_instance_id = $1 order by equipment_type_id",
        [machine],
      )
    ).rows.map((r) => r.equipment_type_id);
  expect(await typesOf()).toEqual([types.lat_pulldown, types.seated_row_cable].sort());
  // Changing the display type replaces that one row and keeps the other.
  await client.query("update equipment_instances set equipment_type_id = $1 where id = $2", [
    types.cable_station,
    machine,
  ]);
  expect(await typesOf()).toEqual([types.cable_station, types.seated_row_cable].sort());
});
