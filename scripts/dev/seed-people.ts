/**
 * Three accounts for the local stack (docs/local-dev.md), with enough history that every
 * Friends screen has something to show: overlapping lifts for Compare and the exercise
 * leaderboard, runs for the running boards, body weight for the "÷ body weight" rankings,
 * and follows in every state — mutual, one-way, and a request waiting to be accepted.
 *
 *   vinit    @vinit     lifts and runs; shares body weight; follows shreyash and priya
 *   shreyash @shreyash  lifts; shares body weight; follows vinit back; approves follows
 *   priya    @priya     runs most days, lifts a little; keeps body weight private;
 *                       has asked to follow vinit (pending)
 *
 * Every password is "password123". Training is written through the same repositories the
 * app uses, then back-dated and re-derived with the shared-stats backfill, so the shared rows
 * are exactly what finishing those sessions on those days would have produced. Safe to run
 * again: accounts that already exist are left alone.
 *
 *   npm run dev:seed
 */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { backfillSharedStats } from "@/db/backfill-shared-stats";
import * as schema from "@/db/schema";
import { exercises, profiles, workoutSessions } from "@/db/schema";
import { seedTestUserData } from "@/db/test/fixtures";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { acceptFollow, requestFollow } from "@/server/repositories/follows";
import { listGyms } from "@/server/repositories/gyms";
import { createRun } from "@/server/repositories/runs";
import {
  addExerciseToSession,
  finishSession,
  logSet,
  startAdHocSession,
} from "@/server/repositories/sessions";

const DATABASE_URL =
  process.env.SEED_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/overload_dev";
const TZ = "Asia/Kolkata";
const PASSWORD = "password123";

type Person = { email: string; username: string; displayName: string; shareBodyWeight: boolean };
const PEOPLE: Record<"vinit" | "shreyash" | "priya", Person> = {
  vinit: {
    email: "vinit@local.test",
    username: "vinit",
    displayName: "Vinit Chandak",
    shareBodyWeight: true,
  },
  shreyash: {
    email: "shreyash@local.test",
    username: "shreyash",
    displayName: "Shreyash Laddha",
    shareBodyWeight: true,
  },
  priya: {
    email: "priya@local.test",
    username: "priya",
    displayName: "Priya Menon",
    shareBodyWeight: false,
  },
};

type SetSpec = {
  w: number | null;
  r: number | null;
  warmup?: boolean;
  seconds?: number;
  metres?: number;
};
type Slot = { slug: string; sets: SetSpec[] };
/** A workout: how many days ago it was, its length in minutes, and what was done. */
type Workout = { daysAgo: number; minutes: number; slots: Slot[] };
type Run = { daysAgo: number; km: number; minutes: number };

const set = (w: number | null, r: number | null, warmup = false): SetSpec => ({ w, r, warmup });
const sets = (n: number, w: number | null, r: number): SetSpec[] =>
  Array.from({ length: n }, () => set(w, r));

// --- What each person did ---------------------------------------------------------------------

const VINIT_WORKOUTS: Workout[] = [
  // Push / pull / legs, twice through, getting a little heavier each time.
  ...[38, 31, 24, 17, 10, 3].flatMap((daysAgo, i): Workout[] => {
    const bench = 60 + i * 2.5;
    const raise = 7.5 + (i >= 4 ? 2.5 : 0);
    return [
      {
        daysAgo,
        minutes: 62,
        slots: [
          {
            slug: "barbell-bench-press",
            sets: [set(40, 10, true), ...sets(3, bench, 6), set(bench - 5, 8)],
          },
          { slug: "overhead-press", sets: sets(3, 35 + i * 1.25, 8) },
          { slug: "db-lateral-raise", sets: sets(4, raise, 12) },
          { slug: "incline-db-press", sets: sets(3, 22.5, 10) },
        ],
      },
      {
        daysAgo: daysAgo - 1,
        minutes: 55,
        slots: [
          { slug: "pull-up", sets: sets(4, 0, 8 + Math.floor(i / 2)) },
          { slug: "barbell-row", sets: sets(4, 55 + i * 2.5, 8) },
          { slug: "lat-pulldown", sets: sets(3, 50, 10) },
          { slug: "hammer-curl", sets: sets(3, 14, 10) },
        ],
      },
      {
        daysAgo: daysAgo - 2,
        minutes: 70,
        slots: [
          { slug: "high-bar-squat", sets: [set(50, 8, true), ...sets(4, 80 + i * 5, 5)] },
          { slug: "leg-press-45", sets: sets(3, 140, 10) },
          { slug: "goblet-squat", sets: sets(3, 24, 12) },
          { slug: "plank", sets: [{ w: null, r: null, seconds: 60 + i * 10 }] },
          { slug: "farmers-carry", sets: [{ w: 24, r: null, metres: 40 }] },
        ],
      },
    ];
  }),
];

const SHREYASH_WORKOUTS: Workout[] = [
  ...[27, 20, 13, 6].flatMap((daysAgo, i): Workout[] => [
    {
      daysAgo,
      minutes: 58,
      slots: [
        { slug: "barbell-bench-press", sets: [set(40, 10, true), ...sets(4, 70 + i * 2.5, 5)] },
        { slug: "db-lateral-raise", sets: [...sets(2, 10, 12), ...sets(2, 10, 10)] },
        { slug: "flat-db-press", sets: sets(3, 26, 10) },
        { slug: "hammer-curl", sets: sets(3, 16, 10) },
      ],
    },
    {
      daysAgo: daysAgo - 2,
      minutes: 65,
      slots: [
        { slug: "conventional-deadlift", sets: [set(60, 5, true), ...sets(3, 120 + i * 5, 5)] },
        { slug: "pull-up", sets: sets(4, 5, 6) },
        { slug: "seated-cable-row", sets: sets(3, 60, 10) },
        { slug: "plank", sets: [{ w: null, r: null, seconds: 90 }] },
      ],
    },
  ]),
];

const PRIYA_WORKOUTS: Workout[] = [
  {
    daysAgo: 12,
    minutes: 40,
    slots: [
      { slug: "goblet-squat", sets: sets(3, 16, 15) },
      { slug: "db-lateral-raise", sets: sets(3, 5, 15) },
      { slug: "plank", sets: [{ w: null, r: null, seconds: 120 }] },
    ],
  },
  {
    daysAgo: 5,
    minutes: 42,
    slots: [
      { slug: "goblet-squat", sets: sets(3, 18, 12) },
      { slug: "db-lateral-raise", sets: [...sets(2, 6, 12), set(7.5, 8)] },
      { slug: "pull-up", sets: sets(3, 0, 3) },
    ],
  },
];

const VINIT_RUNS: Run[] = [
  { daysAgo: 25, km: 3.1, minutes: 21 },
  { daysAgo: 18, km: 4.0, minutes: 26.5 },
  { daysAgo: 11, km: 2.7, minutes: 18.2 },
  { daysAgo: 4, km: 5.0, minutes: 33 },
];
const PRIYA_RUNS: Run[] = [
  { daysAgo: 27, km: 5.0, minutes: 30 },
  { daysAgo: 23, km: 6.2, minutes: 36.5 },
  { daysAgo: 19, km: 5.0, minutes: 29 },
  { daysAgo: 15, km: 8.0, minutes: 48 },
  { daysAgo: 9, km: 5.0, minutes: 28.5 },
  { daysAgo: 6, km: 10.0, minutes: 61 },
  { daysAgo: 2, km: 5.0, minutes: 27.8 },
];

const BODY_WEIGHT: Record<keyof typeof PEOPLE, { daysAgo: number; kg: number }[]> = {
  vinit: [
    { daysAgo: 30, kg: 76.4 },
    { daysAgo: 14, kg: 75.8 },
    { daysAgo: 1, kg: 75.2 },
  ],
  shreyash: [
    { daysAgo: 20, kg: 82.0 },
    { daysAgo: 3, kg: 81.4 },
  ],
  priya: [{ daysAgo: 7, kg: 58.5 }],
};

// --- Helpers ----------------------------------------------------------------------------------

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
};

/** `daysAgo` days before now, at 7 pm in the account's zone (a plausible gym hour). */
function at(daysAgo: number, hour = 19): Date {
  const date = new Date();
  date.setUTCHours(hour - 5, 30 - 30, 0, 0); // 19:00 IST is 13:30 UTC
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

async function main(): Promise<void> {
  const client = postgres(DATABASE_URL, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const as =
    (id: string) =>
    <T>(fn: (tx: DbOrTx) => Promise<T>) =>
      withUser(db, id, fn);

  try {
    const ids: Record<keyof typeof PEOPLE, string> = { vinit: "", shreyash: "", priya: "" };
    let created = 0;
    for (const [key, person] of Object.entries(PEOPLE) as [keyof typeof PEOPLE, Person][]) {
      const [existing] = await client`select id from auth.users where email = ${person.email}`;
      if (existing) {
        ids[key] = existing.id as string;
        continue;
      }
      const id = randomUUID();
      // Drizzle rewires this client's json serializer to pass strings through, hence the cast.
      const metadata = { username: person.username, display_name: person.displayName };
      await client`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
                   values (${id}, ${person.email}, ${JSON.stringify(metadata)}::jsonb, ${hashPassword(PASSWORD)})`;
      await db
        .update(profiles)
        .set({
          timeZone: TZ,
          onboardedAt: new Date(),
          shareBodyWeight: person.shareBodyWeight,
          followApproval: key === "shreyash",
        })
        .where(eq(profiles.id, id));
      await as(id)((tx) => seedTestUserData(tx, { id, email: person.email }));
      ids[key] = id;
      created++;
    }
    if (created === 0) {
      console.log("All three accounts exist already; nothing seeded.");
      return;
    }

    const slugToId = new Map(
      (await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises)).map((e) => [
        e.slug,
        e.id,
      ]),
    );
    const exerciseId = (slug: string) => {
      const id = slugToId.get(slug);
      if (!id) throw new Error(`No exercise with slug "${slug}"`);
      return id;
    };

    async function train(who: string, workouts: Workout[]): Promise<void> {
      const gyms = await as(who)((tx) => listGyms(tx, who));
      const gymId = gyms.find((g) => g.slug === "anytime-fitness")!.id;
      for (const workout of workouts) {
        const sessionId = await as(who)(async (tx) => {
          const { sessionId } = await startAdHocSession(tx, who, { gymId });
          for (const slot of workout.slots) {
            const { workoutExerciseId } = await addExerciseToSession(tx, who, sessionId, {
              exerciseId: exerciseId(slot.slug),
              equipmentInstanceId: null,
            });
            for (const [i, s] of slot.sets.entries()) {
              await logSet(tx, who, {
                workoutExerciseId,
                setIndex: i + 1,
                setType: s.warmup ? "warmup" : "working",
                weight: s.w,
                unit: "kg",
                reps: s.r,
                rir: null,
                durationSeconds: s.seconds ?? null,
                ...(s.metres !== undefined ? { distanceMeters: s.metres } : {}),
              });
            }
          }
          await finishSession(tx, who, sessionId, { notes: null, bodyWeightKg: null });
          return sessionId;
        });
        // Finishing stamps "now"; the session belongs to the day it is meant for.
        const startedAt = at(workout.daysAgo);
        await db
          .update(workoutSessions)
          .set({
            startedAt,
            completedAt: new Date(startedAt.getTime() + workout.minutes * 60_000),
          })
          .where(eq(workoutSessions.id, sessionId));
        await db.execute(
          sql`update set_logs set completed_at = ${startedAt.toISOString()}::timestamptz, created_at = ${startedAt.toISOString()}::timestamptz
              where workout_exercise_id in
                (select id from workout_exercises where workout_session_id = ${sessionId})`,
        );
      }
    }

    async function jog(who: string, runs: Run[]): Promise<void> {
      for (const run of runs) {
        await as(who)((tx) =>
          createRun(tx, who, {
            mode: "outdoor",
            startedAt: at(run.daysAgo, 6),
            durationSeconds: Math.round(run.minutes * 60),
            distanceMeters: Math.round(run.km * 1000),
            rpe: null,
            shinLeftPre: null,
            shinRightPre: null,
            shinLeftDuring: null,
            shinRightDuring: null,
            shinLeftPost: null,
            shinRightPost: null,
            programRunId: null,
            notes: null,
          }),
        );
      }
    }

    async function weigh(who: string, readings: { daysAgo: number; kg: number }[]) {
      for (const reading of readings) {
        const day = at(reading.daysAgo, 7).toISOString().slice(0, 10);
        await as(who)((tx) => recordBodyWeight(tx, who, { measuredOn: day, weightKg: reading.kg }));
      }
    }

    await train(ids.vinit, VINIT_WORKOUTS);
    await train(ids.shreyash, SHREYASH_WORKOUTS);
    await train(ids.priya, PRIYA_WORKOUTS);
    await jog(ids.vinit, VINIT_RUNS);
    await jog(ids.priya, PRIYA_RUNS);
    await weigh(ids.vinit, BODY_WEIGHT.vinit);
    await weigh(ids.shreyash, BODY_WEIGHT.shreyash);
    await weigh(ids.priya, BODY_WEIGHT.priya);

    // Follows: vinit ⇄ shreyash, vinit → priya, and priya's request to vinit left waiting.
    await as(ids.vinit)((tx) => requestFollow(tx, ids.vinit, ids.shreyash));
    await as(ids.shreyash)((tx) => acceptFollow(tx, ids.shreyash, ids.vinit));
    await as(ids.shreyash)((tx) => requestFollow(tx, ids.shreyash, ids.vinit));
    await as(ids.vinit)((tx) => requestFollow(tx, ids.vinit, ids.priya));
    await client`update profiles set follow_approval = true where id = ${ids.vinit}`;
    await as(ids.priya)((tx) => requestFollow(tx, ids.priya, ids.vinit));

    // The shared rows were written at finish time with today's date; derive them again from
    // the back-dated sessions, exactly as the production backfill does.
    await db.delete(schema.sharedSessionStats);
    await db.delete(schema.sharedExerciseStats);
    const summary = await backfillSharedStats(db);
    console.log(
      `Seeded ${created} accounts (password "${PASSWORD}"): ${summary.workouts} workouts, ${summary.runs} runs, ${summary.readings} body-weight readings.`,
    );
    for (const [key, person] of Object.entries(PEOPLE)) {
      console.log(
        `  ${person.email.padEnd(24)} @${person.username.padEnd(10)} ${ids[key as keyof typeof PEOPLE]}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  const failed = error as { query?: string; parameters?: unknown };
  if (failed?.query) console.error("Query:", failed.query, "\nParameters:", failed.parameters);
  process.exit(1);
});
