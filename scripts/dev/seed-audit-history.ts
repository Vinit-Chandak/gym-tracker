/** Repeatable, local-only long history for pagination, calendars, trends and mobile audits. */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance, type EnduranceActual } from "@/domain/activity-metrics";
import type { Food } from "@/domain/nutrition";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  closeStrengthParent,
  createActivity,
  openStrengthParent,
} from "@/server/repositories/activities";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { createFood, saveLibraryMeal, saveNutritionTargets } from "@/server/repositories/nutrition";
import { writeSessionStats } from "@/server/repositories/shared-stats";
import { readWorkouts } from "@/server/repositories/training-data";

const VERSION = "history-56-months-v1";
const MONTHS = 56;
const USERNAMES = ["vinit", "shreyash", "priya", "alex"];
type Person = typeof s.profiles.$inferSelect;
type Window = { version: string; months: number; from: string; through: string };

/** Stable UUIDs also make an interrupted run safe to resume before its month receipt was saved. */
function idFor(key: string): string {
  const hex = createHash("sha256").update(`${VERSION}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function rows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

const date = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

const FOODS: Food[] = [
  {
    name: "Rolled oats",
    portionAmount: 100,
    unit: "g",
    kcal: 389,
    carbsG: 66.3,
    fatG: 6.9,
    proteinG: 16.9,
  },
  {
    name: "Greek yoghurt",
    portionAmount: 100,
    unit: "g",
    kcal: 97,
    carbsG: 3.9,
    fatG: 5,
    proteinG: 9,
  },
  {
    name: "Rice, lentils and roasted vegetables",
    portionAmount: 1,
    unit: "serving",
    kcal: 620,
    carbsG: 95,
    fatG: 14,
    proteinG: 25,
  },
  {
    name: "Tofu and vegetable stir-fry with brown rice",
    portionAmount: 1,
    unit: "serving",
    kcal: 710,
    carbsG: 89,
    fatG: 24,
    proteinG: 35,
  },
  {
    name: "Banana",
    portionAmount: 1,
    unit: "piece",
    kcal: 105,
    carbsG: 27,
    fatG: 0.4,
    proteinG: 1.3,
  },
  {
    name: "Restaurant meal — nutrition partly unknown",
    portionAmount: 1,
    unit: "serving",
    kcal: 840,
    carbsG: null,
    fatG: null,
    proteinG: null,
  },
];

async function prepareFoodLibrary(tx: DbOrTx, person: Person) {
  const existing = await tx.select().from(s.foods).where(eq(s.foods.userId, person.id));
  const ids: string[] = [];
  for (const food of FOODS) {
    ids.push(
      existing.find((row) => row.name === food.name)?.id ?? (await createFood(tx, person.id, food)),
    );
  }
  const [targets] = await tx
    .select()
    .from(s.nutritionTargets)
    .where(eq(s.nutritionTargets.userId, person.id));
  if (!targets)
    await saveNutritionTargets(tx, person.id, {
      dailyKcal: person.username === "priya" ? 2200 : 2600,
      proteinPerKg: 1.8,
      fatPercent: 25,
    });
  const meals = await tx.select().from(s.savedMeals).where(eq(s.savedMeals.userId, person.id));
  if (!meals.some((meal) => meal.name === "Oats, yoghurt and banana")) {
    await saveLibraryMeal(tx, person.id, {
      name: "Oats, yoghurt and banana",
      items: [
        { foodId: ids[0]!, amount: 70 },
        { foodId: ids[1]!, amount: 150 },
        { foodId: ids[4]!, amount: 1 },
      ],
    });
  }
  return ids;
}

async function strength(
  tx: DbOrTx,
  person: Person,
  gymId: string,
  exercises: Map<string, string>,
  day: string,
  index: number,
  month: number,
) {
  const sessionId = idFor(`${person.id}:strength:${day}`);
  const [existing] = await tx
    .select({ id: s.workoutSessions.id })
    .from(s.workoutSessions)
    .where(eq(s.workoutSessions.id, sessionId));
  if (existing) return;
  // 13:30 UTC is evening in Kolkata and morning in New York, including both DST offsets.
  const startedAt = new Date(`${day}T13:30:00Z`);
  const completedAt = new Date(startedAt.getTime() + (42 + (index % 4) * 6) * 60_000);
  const partial = index % 4 === 1;
  const missing = index % 4 === 3;
  await tx.insert(s.workoutSessions).values({
    id: sessionId,
    userId: person.id,
    gymId,
    startedAt,
    sleepHours: missing || partial ? null : 6.5 + (index % 3) * 0.5,
    sleepQuality: missing || partial ? null : 3 + (index % 3),
    fatigue: missing ? null : 1 + (index % 4),
    soreness: missing || partial ? null : 1 + (index % 3),
    warmupCompleted: index % 3 !== 0,
    notes:
      index % 5 === 0 ? "Reduced load after travel; resumed the normal plan next session." : null,
    createdAt: startedAt,
    updatedAt: completedAt,
  });
  await openStrengthParent(tx, person.id, { id: sessionId, startedAt }, person.timeZone);
  const slugs =
    index % 2 === 0
      ? ["barbell-bench-press", "goblet-squat", "plank"]
      : ["barbell-bench-press", "farmers-carry", "plank"];
  for (const [slot, slug] of slugs.entries()) {
    const exerciseId = exercises.get(slug);
    if (!exerciseId) throw new Error(`Missing history exercise: ${slug}`);
    const workoutExerciseId = idFor(`${sessionId}:${slug}`);
    await tx.insert(s.workoutExercises).values({
      id: workoutExerciseId,
      userId: person.id,
      workoutSessionId: sessionId,
      exerciseId,
      orderIndex: slot,
      completedAt,
      createdAt: startedAt,
      supersetGroup: index % 3 === 0 && slot > 0 ? "Core and assistance" : null,
    });
    const kg = Math.round((person.username === "priya" ? 20 : 30) + month * 0.6 + slot * 2.5);
    const isTimed = slug === "plank";
    const isCarry = slug === "farmers-carry";
    await tx.insert(s.setLogs).values(
      Array.from({ length: 3 }, (_, set) => ({
        id: idFor(`${workoutExerciseId}:${set}`),
        userId: person.id,
        workoutExerciseId,
        setIndex: set + 1,
        setType: set === 0 && !isTimed && !isCarry ? ("warmup" as const) : ("working" as const),
        weight: isTimed
          ? 0
          : (person.preferredUnit === "lb" ? Math.round((kg * 2.20462) / 5) * 5 : kg) *
            (set === 0 ? 0.6 : 1),
        unit: person.preferredUnit,
        reps: isTimed || isCarry ? null : 8 + (index % 3),
        rir: isTimed || isCarry || partial ? null : 2,
        rpe: isTimed || isCarry ? (partial ? null : 3) : null,
        effortReported: !partial,
        durationSeconds: isTimed ? 30 + (month % 7) * 5 : isCarry ? 40 : null,
        distanceMeters: isCarry ? 20 + (index % 3) * 10 : null,
        completedAt: new Date(startedAt.getTime() + (slot * 12 + set * 3 + 4) * 60_000),
        createdAt: startedAt,
      })),
    );
  }
  await tx
    .update(s.workoutSessions)
    .set({ completedAt })
    .where(eq(s.workoutSessions.id, sessionId));
  await closeStrengthParent(tx, person.id, sessionId, completedAt);
  await tx
    .update(s.activities)
    .set({ createdAt: startedAt, updatedAt: completedAt, sourceReference: VERSION })
    .where(eq(s.activities.id, sessionId));
  const { workouts } = await readWorkouts(tx, person.id, null, 0, 1, { sessionId });
  await writeSessionStats(tx, person.id, workouts[0]!, person.timeZone);
}

function actualFor(person: Person, index: number, month: number): EnduranceActual {
  const imperial = person.preferredUnit === "lb";
  if (index % 5 === 3)
    return {
      sport: "cycling",
      environment: index % 2 ? "indoor" : "outdoor",
      durationMs: (30 + (month % 4) * 10) * 60_000,
      distance: index % 2 ? null : nativeDistance(15 + (month % 4) * 5, imperial ? "mi" : "km"),
      assistance: "unassisted",
      resourceId: null,
      averagePowerWatts: index % 2 ? 140 : null,
      averageCadenceRpm: index % 2 ? 85 : null,
      averageHeartRate: 125,
      maxHeartRate: 155,
      elevationGainMetres: index % 2 ? null : 160,
    };
  if (index % 5 === 4)
    return {
      sport: "swimming",
      environment: "pool",
      elapsedMs: 30 * 60_000,
      activeMs: month % 3 === 0 ? null : 24 * 60_000,
      distanceMethod: "lengths",
      distance: null,
      poolLength: nativeDistance(25, imperial ? "yd" : "m"),
      lengths: 32 + (month % 5) * 4,
      stroke: month % 4 === 0 ? "mixed" : "freestyle",
      strokeCount: null,
      resourceId: null,
      averageHeartRate: null,
      maxHeartRate: null,
    };
  const distance = nativeDistance(3 + (index % 4), imperial ? "mi" : "km");
  return {
    sport: "running",
    environment: month % 5 === 0 ? "treadmill" : "outdoor",
    distance,
    durationMs:
      Math.round((distance.metres / 1000) * (390 - month * 0.8 + (index % 3) * 10)) * 1000,
    surface: month % 5 === 0 ? null : "road",
    elevationGainMetres: month % 5 === 0 ? null : 30,
    treadmillInclinePercent: month % 5 === 0 ? 1 : null,
    averageHeartRate: 138 + (index % 4),
    maxHeartRate: 169,
    cadenceStepsPerMinute: month % 3 === 0 ? null : 165,
  };
}

export async function seedAuditHistory(
  db: Db,
): Promise<Window & { to: string; insertedMonths: number }> {
  // This module is also importable: retain the same safety gate as the command-line runner.
  const target = new URL(process.env.SEED_DATABASE_URL ?? "invalid:");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.search !== "" ||
    target.hash !== "" ||
    !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
  ) {
    throw new Error("History fixtures require an isolated loopback overload_audit database.");
  }
  await db.execute(
    sql`create table if not exists auth.local_audit_seed_state (name text primary key, details jsonb not null)`,
  );
  const saved = rows<{ details: Window }>(
    await db.execute(sql`select details from auth.local_audit_seed_state where name = ${VERSION}`),
  )[0];
  const through = process.env.AUDIT_SEED_THROUGH ?? todayInTimeZone("Asia/Kolkata");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(through) ||
    !Number.isFinite(Date.parse(through)) ||
    new Date(through).toISOString().slice(0, 10) !== through ||
    through > todayInTimeZone("Asia/Kolkata")
  ) {
    throw new Error("AUDIT_SEED_THROUGH must be a real date on or before today (YYYY-MM-DD).");
  }
  const anchor = new Date(through);
  const window: Window = saved?.details ?? {
    version: VERSION,
    months: MONTHS,
    from: date(anchor.getUTCFullYear(), anchor.getUTCMonth() - MONTHS + 1, 1),
    through,
  };
  if (saved && process.env.AUDIT_SEED_THROUGH && through !== window.through)
    throw new Error(
      "This database already has a different history anchor; choose a new isolated audit database.",
    );
  await db.execute(
    sql`insert into auth.local_audit_seed_state (name, details) values (${VERSION}, ${JSON.stringify(window)}::jsonb) on conflict do nothing`,
  );
  const people = (await db.select().from(s.profiles)).filter((person) =>
    USERNAMES.includes(person.username),
  );
  if (people.length !== USERNAMES.length)
    throw new Error("Seed all four established audit personas before history.");
  const exercises = new Map((await db.select().from(s.exercises)).map((row) => [row.slug, row.id]));
  let insertedMonths = 0;
  for (const person of people) {
    // A completed fixture stays completed even if the tester later removes a food or workout.
    // Do not rebuild libraries merely to find IDs that no unseeded month needs.
    const completed = rows<{ count: number }>(
      await db.execute(sql`
      select count(*)::int as count from auth.local_audit_seed_state
      where name like ${`${VERSION}:${person.id}:%`} and name <> ${`${VERSION}:${person.id}:profile`}
    `),
    )[0];
    if (completed?.count === MONTHS) continue;
    const profileKey = `${VERSION}:${person.id}:profile`;
    if (
      !rows(
        await db.execute(sql`select 1 from auth.local_audit_seed_state where name = ${profileKey}`),
      ).length
    ) {
      const joinedAt = new Date(`${window.from}T00:00:00Z`);
      await db.transaction(async (tx) => {
        await tx
          .update(s.profiles)
          .set({ createdAt: joinedAt, onboardedAt: joinedAt })
          .where(eq(s.profiles.id, person.id));
        await tx.execute(
          sql`update auth.users set created_at = ${joinedAt.toISOString()}::timestamptz where id = ${person.id}`,
        );
        await tx.execute(
          sql`insert into auth.local_audit_seed_state (name, details) values (${profileKey}, '{}'::jsonb)`,
        );
      });
    }
    const [gym] = await db
      .select()
      .from(s.gyms)
      .where(and(eq(s.gyms.userId, person.id), eq(s.gyms.isDefault, true)));
    if (!gym) throw new Error(`No default gym for ${person.username}`);
    const foodIds = await withUser(db, person.id, (tx) => prepareFoodLibrary(tx, person));
    const start = new Date(window.from);
    for (let month = 0; month < MONTHS; month++) {
      const first = date(start.getUTCFullYear(), start.getUTCMonth() + month, 1);
      const last = date(start.getUTCFullYear(), start.getUTCMonth() + month + 1, 0);
      const until = last < window.through ? last : window.through;
      const key = `${VERSION}:${person.id}:${first.slice(0, 7)}`;
      if (
        rows(await db.execute(sql`select 1 from auth.local_audit_seed_state where name = ${key}`))
          .length
      )
        continue;
      await withUser(db, person.id, async (tx) => {
        const strengthDays =
          person.username === "priya" ? [1, 8, 15, 22] : [1, 4, 8, 11, 15, 18, 22, 25];
        for (const [index, number] of strengthDays.entries()) {
          const day = `${first.slice(0, 7)}-${String(number).padStart(2, "0")}`;
          if (day <= until) await strength(tx, person, gym.id, exercises, day, index, month);
        }
        const enduranceDays =
          person.username === "priya"
            ? [2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28]
            : [2, 6, 10, 14, 20, 26];
        const trainedSports = new Set<string>();
        const logEndurance = async (index: number, day: string, partial = false) => {
          const actual = actualFor(person, index, month);
          const startedAt = new Date(
            `${day}T${String(partial ? 8 + index : 12).padStart(2, "0")}:00:00Z`,
          );
          const result = await createActivity(tx, person.id, {
            submissionKey: idFor(
              `${person.id}:endurance:${day}${partial ? `:partial:${actual.sport}` : ""}`,
            ),
            origin: AD_HOC_ORIGIN,
            actual,
            startedAt,
            recordedTimeZone: person.timeZone,
            timeZoneSource: "profile_at_entry",
            occurredOn: day,
            effort: month % 4 === 0 ? UNKNOWN_EFFORT : reportedEffort(2 + (index % 3)),
            outcome: "logged",
            title: index % 3 === 0 ? "Easy session before work" : null,
            notes:
              index % 4 === 0 ? "Comfortable effort; stopped with energy left for tomorrow." : null,
          });
          await tx
            .update(s.activities)
            .set({ createdAt: startedAt, sourceReference: VERSION })
            .where(eq(s.activities.id, result.id));
          trainedSports.add(actual.sport);
        };
        for (const [index, number] of enduranceDays.entries()) {
          const day = `${first.slice(0, 7)}-${String(number).padStart(2, "0")}`;
          if (day <= until) await logEndurance(index, day);
        }
        // A run started on the first of a month still needs every sport represented without
        // inserting future days. Distinct receipt keys keep these same-day activities separate.
        for (const index of [0, 3, 4]) {
          if (!trainedSports.has(actualFor(person, index, month).sport))
            await logEndurance(index, until, true);
        }
        for (const number of [1, 8, 15, 22, 28]) {
          const day = `${first.slice(0, 7)}-${String(number).padStart(2, "0")}`;
          if (day > until) continue;
          const base = person.username === "priya" ? 61 : person.username === "shreyash" ? 86 : 80;
          await recordBodyWeight(tx, person.id, {
            measuredOn: day,
            weightKg:
              Math.round((base - month * 0.06 + Math.sin(month + number) * 0.8) * 100) / 100,
          });
        }
        const entries: (typeof s.foodEntries.$inferInsert)[] = [];
        for (let number = 1; number <= Number(until.slice(-2)); number++) {
          // A few completely unlogged days and meals exercise honest missing-data states.
          if (number % 7 === 0) continue;
          const eatenOn = `${first.slice(0, 7)}-${String(number).padStart(2, "0")}`;
          for (const [position, meal] of (
            ["breakfast", "lunch", "dinner", "afternoon_snack"] as const
          ).entries()) {
            if (position === 3 && number % 2 === 0) continue;
            const foodIndex =
              position === 0
                ? month % 2
                : position === 1
                  ? 2
                  : position === 2
                    ? number % 11 === 0
                      ? 5
                      : 3
                    : 4;
            const food = FOODS[foodIndex]!;
            const createdAt = new Date(`${eatenOn}T13:00:00Z`);
            entries.push({
              id: idFor(`${person.id}:food:${eatenOn}:${meal}`),
              userId: person.id,
              eatenOn,
              meal,
              foodId: foodIds[foodIndex]!,
              ...food,
              amount:
                food.portionAmount === 100 ? (position === 0 ? 80 : 150) : 1 + (number % 3) * 0.25,
              createdAt,
              updatedAt: createdAt,
            });
          }
        }
        if (entries.length) await tx.insert(s.foodEntries).values(entries).onConflictDoNothing();
        await tx
          .update(s.foods)
          .set({ lastLoggedAt: new Date(`${until}T13:00:00Z`) })
          .where(eq(s.foods.userId, person.id));
      });
      await db.execute(
        sql`insert into auth.local_audit_seed_state (name, details) values (${key}, '{}'::jsonb) on conflict do nothing`,
      );
      insertedMonths++;
      if ((month + 1) % 14 === 0)
        console.log(`History: @${person.username}, ${month + 1}/${MONTHS} months seeded.`);
    }
  }
  console.log(
    `History window: ${window.from} through ${window.through}; ${insertedMonths} new account-months.`,
  );
  return { ...window, to: window.through, insertedMonths };
}
