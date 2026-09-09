import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { withUser } from "../src/db/with-user";
import { getDatabaseUrl } from "../src/lib/env";
import { listGyms } from "../src/server/repositories/gyms";
import { getTodayPlan } from "../src/server/repositories/schedule";
import { getInProgressSession, getSessionDetail } from "../src/server/repositories/sessions";
import { exerciseAvailability, gymAvailability } from "../src/server/repositories/availability";
import { readMuscleVolume } from "../src/server/repositories/muscle-volume";
import { readWorkouts } from "../src/server/repositories/training-data";
import { parseDateRange } from "../src/server/validation/date-range";
import { addDays, todayInTimeZone } from "../src/domain/program-calendar";
import { weekStart } from "../src/domain/running";

async function main() {
  config({ path: ".env.local", quiet: true });
  if (!process.env.SEED_USER_EMAIL)
    throw new Error("Set SEED_USER_EMAIL locally to select the account to measure.");
  let queries = 0;
  const client = postgres(getDatabaseUrl(), {
    prepare: false,
    max: 1,
    ssl: "require",
    connect_timeout: 10,
    debug: () => {
      queries += 1;
    },
  });
  const db = drizzle(client, { schema });
  try {
    const [user] = await db
      .select({ id: schema.profiles.id, timeZone: schema.profiles.timeZone })
      .from(schema.profiles)
      .where(eq(schema.profiles.email, process.env.SEED_USER_EMAIL))
      .limit(1);
    if (!user) throw new Error("Account not found.");
    const from = weekStart(todayInTimeZone(user.timeZone));
    const week = parseDateRange({ from, to: addDays(from, 6) }, user.timeZone);
    const gyms = await withUser(db, user.id, (tx) => listGyms(tx, user.id));
    const open = await withUser(db, user.id, (tx) => getInProgressSession(tx, user.id));
    const [exercise] = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(eq(schema.exercises.slug, "barbell-bench-press"));
    const measurements: [string, () => Promise<unknown>][] = [
      ["Today plan", () => withUser(db, user.id, (tx) => getTodayPlan(tx, user.id, user.timeZone))],
      ["Gym list", () => withUser(db, user.id, (tx) => listGyms(tx, user.id))],
      [
        "Body map: previous full-record read",
        () => withUser(db, user.id, (tx) => readWorkouts(tx, user.id, week), { readOnly: true }),
      ],
      [
        "Body map: aggregate",
        () =>
          withUser(db, user.id, (tx) => readMuscleVolume(tx, user.id, week), { readOnly: true }),
      ],
    ];
    const gym = gyms.find((g) => g.isDefault) ?? gyms[0];
    if (gym)
      measurements.push([
        "Gym availability",
        () => withUser(db, user.id, (tx) => gymAvailability(tx, user.id, gym.id)),
      ]);
    if (exercise)
      measurements.push([
        "Exercise availability",
        () => withUser(db, user.id, (tx) => exerciseAvailability(tx, user.id, exercise.id)),
      ]);
    if (open)
      measurements.push([
        "Open workout",
        () => withUser(db, user.id, (tx) => getSessionDetail(tx, user.id, open.id)),
      ]);
    for (const [name, run] of measurements) {
      const samples: number[] = [];
      const queryCounts: number[] = [];
      for (let sample = 0; sample < 3; sample++) {
        queries = 0;
        const start = performance.now();
        await run();
        samples.push(Math.round(performance.now() - start));
        queryCounts.push(queries);
      }
      samples.sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          name,
          medianMs: samples[1],
          minMs: samples[0],
          maxMs: samples[2],
          queries: queryCounts,
        }),
      );
    }
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("Measurement failed. Check the local database connection and selected account.");
  process.exitCode = 1;
});
