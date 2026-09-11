import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { withUser } from "../src/db/with-user";
import { getDatabaseUrl } from "../src/lib/env";
import { listGyms } from "../src/server/repositories/gyms";
import { getGym } from "../src/server/repositories/gyms";
import { listAbsentEquipment } from "../src/server/repositories/absent-equipment";
import { listEquipmentForGym, listEquipmentTypes } from "../src/server/repositories/equipment";
import { getTodayPlan } from "../src/server/repositories/schedule";
import { getInProgressSession, getSessionDetail } from "../src/server/repositories/sessions";
import { exerciseAvailability, gymAvailability } from "../src/server/repositories/availability";
import { readMuscleVolume } from "../src/server/repositories/muscle-volume";
import { readTrainingData, readWorkouts } from "../src/server/repositories/training-data";
import { readHistory, readHistoryWorkouts } from "../src/server/repositories/history";
import { getRunsOverview } from "../src/server/repositories/runs";
import { getSchedule } from "../src/server/repositories/schedule";
import { listBodyWeights } from "../src/server/repositories/body-weight";
import { trainingAnalytics } from "../src/domain/analytics";
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
    const range = parseDateRange({}, user.timeZone);
    const gyms = await withUser(db, user.id, (tx) => listGyms(tx, user.id));
    const open = await withUser(db, user.id, (tx) => getInProgressSession(tx, user.id));
    const [exercise] = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(eq(schema.exercises.slug, "barbell-bench-press"));
    const measurements: [string, () => Promise<unknown>][] = [
      [
        "Database round trip",
        async () => {
          await db.execute(sql`select 1`);
        },
      ],
      [
        "Parameterised statements via Promise.all",
        async () => {
          await withUser(db, user.id, (tx) =>
            Promise.all([
              tx.execute(sql`select ${1}::int`),
              tx.execute(sql`select ${2}::int`),
              tx.execute(sql`select ${3}::int`),
            ]),
          );
        },
      ],
      ["Today plan", () => withUser(db, user.id, (tx) => getTodayPlan(tx, user.id, user.timeZone))],
      ["Gym list", () => withUser(db, user.id, (tx) => listGyms(tx, user.id))],
      [
        "Runs overview",
        () => withUser(db, user.id, (tx) => getRunsOverview(tx, user.id, user.timeZone)),
      ],
      [
        "History: full training read",
        () => withUser(db, user.id, (tx) => readTrainingData(tx, user.id, range)),
      ],
      [
        "History: list projection",
        () => withUser(db, user.id, (tx) => readHistory(tx, user.id, range)),
      ],
      [
        "Workouts: full records",
        () => withUser(db, user.id, (tx) => readWorkouts(tx, user.id, range)),
      ],
      [
        "Workouts: history projection",
        () => withUser(db, user.id, (tx) => readHistoryWorkouts(tx, user.id, range)),
      ],
      [
        "Progress data and analytics",
        () =>
          withUser(db, user.id, async (tx) => {
            const [training] = await Promise.all([
              readTrainingData(tx, user.id, range),
              getSchedule(tx, user.id),
              readMuscleVolume(tx, user.id, week),
              listBodyWeights(tx, user.id, range),
            ]);
            return trainingAnalytics(training, user.timeZone, range.from, range.to);
          }),
      ],
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
      measurements.push(
        [
          "Gym availability",
          () => withUser(db, user.id, (tx) => gymAvailability(tx, user.id, gym.id)),
        ],
        ...([false, true] as const).map((reuse): [string, () => Promise<unknown>] => [
          `Gym detail: ${reuse ? "reused rows" : "duplicate reads"}`,
          () =>
            withUser(db, user.id, async (tx) => {
              const [row, equipment, absent, types, previous] = await Promise.all([
                getGym(tx, user.id, gym.id),
                listEquipmentForGym(tx, user.id, gym.id),
                listAbsentEquipment(tx, user.id, gym.id),
                listEquipmentTypes(tx),
                reuse ? Promise.resolve(null) : gymAvailability(tx, user.id, gym.id),
              ]);
              if (!row) return null;
              const availability = reuse
                ? await gymAvailability(tx, user.id, gym.id, {
                    gym: row,
                    equipment: equipment.map((item) => ({
                      id: item.id,
                      gymId: gym.id,
                      name: item.name,
                      isActive: item.isActive,
                      equipmentTypeId: item.typeId,
                    })),
                    absentEquipmentTypeIds: new Set(absent.map((item) => item.equipmentTypeId)),
                  })
                : previous;
              return { gym: row, equipment, absent, types, availability };
            }),
        ]),
      );
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
      let resultBytes = 0;
      for (let sample = 0; sample < 3; sample++) {
        queries = 0;
        const start = performance.now();
        const result = await run();
        samples.push(Math.round(performance.now() - start));
        resultBytes = Buffer.byteLength(JSON.stringify(result) ?? "");
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
          resultBytes,
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
