/** Extend audit:setup's personas to 56 local accounts, without touching existing records. */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { logTestRun, seedTestUserData } from "@/db/test/fixtures";
import { withUser } from "@/db/with-user";
import { recordBodyWeight } from "@/server/repositories/body-weight";

const database = process.env.AUDIT_DATABASE_URL ?? "";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname) ||
  target.search ||
  target.hash
)
  throw new Error("Theme fixtures require a dedicated loopback audit database.");

const client = postgres(database, { max: 1 });
const db = drizzle(client, { schema });
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/audit-theme-2026-10-22";

async function main() {
  try {
    const [total] = await client<
      { count: number }[]
    >`select count(*)::int as count from auth.users`;
    const count = total?.count ?? 0;
    if (count < 10) throw new Error("Run audit:setup with AUDIT_EXTENDED_PERSONAS=true first.");
    for (let index = 1; index <= 46; index++) {
      const username = `theme${String(index).padStart(2, "0")}`;
      const email = `${username}@local.test`;
      const [existing] = await client<
        { id: string }[]
      >`select id from auth.users where email=${email}`;
      const id = existing?.id ?? randomUUID();
      if ((await client`select id from activities where user_id=${id} limit 1`).length) continue;
      const salt = randomBytes(16).toString("hex");
      const password = `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
      if (!existing)
        await client`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
      values (${id}, ${email}, ${JSON.stringify({ username, display_name: `Theme athlete ${index}` })}::jsonb, ${password})`;
      await db
        .update(schema.profiles)
        .set({
          onboardedAt: new Date(),
          preferredUnit: index % 2 ? "kg" : "lb",
          timeZone: index % 2 ? "Asia/Kolkata" : "America/New_York",
          shareTraining: index % 3 !== 0,
          bodyWeightKg: 60 + index,
          heightCm: 170 + (index % 20),
          dateOfBirth: "1994-06-15",
          trainingGoal: "get_stronger",
        })
        .where(eq(schema.profiles.id, id));
      await withUser(db, id, async (tx) => {
        await seedTestUserData(tx, { id, email });
        await recordBodyWeight(tx, id, {
          measuredOn: new Date().toISOString().slice(0, 10),
          weightKg: 60 + index,
        });
        for (const daysAgo of [1, 7, 30]) {
          await logTestRun(tx, id, {
            startedAt: new Date(Date.now() - daysAgo * 86_400_000),
            distanceMeters: 3000 + index * 100,
            durationSeconds: 1200 + index * 40,
            timeZone: index % 2 ? "Asia/Kolkata" : "America/New_York",
            rpe: 1 + (index % 5),
            effortReported: true,
          });
        }
      });
    }
    const people = await client`
    select p.id, p.username, p.email, p.preferred_unit, p.onboarded_at,
      (select count(*)::int from activities a where a.user_id=p.id) as activities,
      (select count(*)::int from gyms g where g.user_id=p.id) as gyms
    from profiles p order by p.username`;
    await mkdir(output, { recursive: true });
    await writeFile(
      `${output}/theme-users.json`,
      JSON.stringify({ count: people.length, people }, null, 2),
    );
    console.log(`Theme audit seeded ${people.length} local accounts; password: password123.`);
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
