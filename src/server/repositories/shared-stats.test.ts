import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  backfillSharedStats,
  hasBackfillRun,
  SHARED_STATS_BACKFILL,
} from "@/db/backfill-shared-stats";
import * as schema from "@/db/schema";
import {
  exercises,
  profileDirectory,
  sharedBodyWeight,
  sharedExerciseStats,
  sharedSessionStats,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { logTestRun, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN } from "@/domain/activity";
import { deleteActivity, getActivity, updateActivity } from "./activities";
import { nativeDistance } from "@/domain/activity-metrics";
import { performanceSeries } from "@/domain/analytics";
import { LIFTING_METRICS, RUNNING_METRICS, type ActivityMetric } from "@/domain/leaderboard";
import { convertLoad } from "@/lib/units";
import { loadCircle, rankCircle, rankExercise } from "@/server/queries/leaderboard";
import { loadHeadToHead } from "@/server/queries/head-to-head";

import { recordBodyWeight } from "./body-weight";
import { acceptFollow, requestFollow } from "./follows";
import { listGyms } from "./gyms";
import { createCustomExercise } from "./manual-training";
import { addExerciseToSession, finishSession, logSet, startAdHocSession } from "./sessions";
import {
  canViewTraining,
  getComparableExercise,
  readActivity,
  readBodyWeights,
  readCircleExercises,
  readExerciseBests,
  readExercisesInCommon,
  readExerciseTrends,
  readLeaderboard,
  readGroupSets,
  readPeriodTotals,
  readRecords,
  readSessionRecords,
  readSharedSessionExercises,
  readSharedSports,
} from "./shared-stats";
import { readWorkouts } from "./training-data";

/**
 * The shared tables (migration 0021) on the real migrations: what finishing a workout writes,
 * that it agrees with Progress, records on a heavier session, the run paths, the backfill, and
 * the policies — alice trains, bob follows her, carol does not.
 */
let t: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let gymId: string;
let bench: string;
let pullUp: string;
let legPress: string;

const TZ = "Asia/Kolkata";
const as =
  (id: string) =>
  <T>(fn: (tx: DbOrTx) => Promise<T>) =>
    withUser(t.db, id, fn);

async function account(email: string, username: string): Promise<string> {
  const id = crypto.randomUUID();
  await t.client.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, JSON.stringify({ username })],
  );
  await t.client.query("update profiles set time_zone = $2 where id = $1", [id, TZ]);
  return id;
}

async function exerciseId(slug: string): Promise<string> {
  const [row] = await t.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, slug));
  if (!row) throw new Error(`no exercise ${slug}`);
  return row.id;
}

type Set = { weight: number | null; reps: number | null; unit?: "kg" | "lb"; warmup?: boolean };

/** A finished ad hoc workout for alice: each entry is one exercise with its sets. */
async function train(
  plan: { exercise: string; sets: Set[] }[],
  who = alice,
  at = gymId,
): Promise<string> {
  return as(who)(async (tx) => {
    const { sessionId } = await startAdHocSession(tx, who, { gymId: at });
    for (const slot of plan) {
      const { workoutExerciseId } = await addExerciseToSession(tx, who, sessionId, {
        exerciseId: slot.exercise,
        equipmentInstanceId: null,
      });
      for (const [i, set] of slot.sets.entries()) {
        await logSet(tx, who, {
          workoutExerciseId,
          setIndex: i + 1,
          setType: set.warmup ? "warmup" : "working",
          weight: set.weight,
          unit: set.unit ?? "kg",
          reps: set.reps,
          rir: null,
          durationSeconds: null,
        });
      }
    }
    await finishSession(tx, who, sessionId, { notes: "private", bodyWeightKg: null });
    return sessionId;
  });
}

type SeededRun = Parameters<typeof logTestRun>[2];
const run = (over: Partial<SeededRun> = {}): SeededRun => ({
  startedAt: new Date("2026-09-10T01:00:00Z"),
  durationSeconds: 1690,
  distanceMeters: 5200,
  notes: "sore",
  ...over,
});

const ALL = {
  from: "2020-01-01",
  to: "2030-12-31",
  start: new Date("2020-01-01T00:00:00Z"),
  end: new Date("2031-01-01T00:00:00Z"),
};

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  alice = await account("alice@example.com", "alice");
  bob = await account("bob@example.com", "bob");
  carol = await account("carol@example.com", "carol");
  await as(alice)((tx) => seedTestUserData(tx, { id: alice, email: "alice@example.com" }));
  const gyms = await as(alice)((tx) => listGyms(tx, alice));
  gymId = gyms.find((g) => g.slug === "anytime-fitness")!.id;
  [bench, pullUp, legPress] = await Promise.all([
    exerciseId("barbell-bench-press"),
    exerciseId("pull-up"),
    exerciseId("leg-press-45"),
  ]);
  await t.client.query("update profiles set follow_approval = false where id = $1", [alice]);
  await as(bob)((tx) => requestFollow(tx, bob, alice));
  await as(alice)((tx) => acceptFollow(tx, alice, bob));
});

afterAll(async () => {
  await t.close();
});

describe("finishing a workout", () => {
  let first: string;

  it("writes one session row and one row per library exercise, agreeing with Progress", async () => {
    first = await train([
      {
        exercise: bench,
        sets: [
          { weight: 40, reps: 10, warmup: true },
          { weight: 60, reps: 5 },
          { weight: 62.5, reps: 4 },
        ],
      },
      { exercise: pullUp, sets: [{ weight: 0, reps: 8 }] },
      { exercise: legPress, sets: [{ weight: 120, reps: 10 }] },
    ]);
    const [session] = await as(alice)((tx) =>
      tx.select().from(sharedSessionStats).where(eq(sharedSessionStats.sourceId, first)),
    );
    expect(session).toMatchObject({
      userId: alice,
      sport: "workout",
      title: "Workout",
      workingSets: 4,
      volumeKg: 1750,
      records: [],
    });
    expect(session!.muscleSets).toMatchObject({ chest: 2, lats: 1, biceps: 1, quads: 1 });
    // The same finished session, read as Progress reads it.
    const { workouts } = await as(alice)((tx) =>
      readWorkouts(tx, alice, null, 0, 10, { sessionId: first }),
    );
    const series = performanceSeries(workouts, TZ, bench)[0]!;
    const rows = await as(alice)((tx) =>
      tx.select().from(sharedExerciseStats).where(eq(sharedExerciseStats.workoutSessionId, first)),
    );
    expect(rows).toHaveLength(3);
    const benchRow = rows.find((r) => r.exerciseId === bench)!;
    expect(benchRow.topWeightKg).toBe(series.load.at(-1)!.value);
    // Progress reads the estimate to the tenth; the shared row keeps it to the hundredth, so a
    // pound lift converts back to itself.
    expect(benchRow.bestE1rmKg).toBeCloseTo(series.estimated1RM.at(-1)!.value!, 1);
    expect(benchRow.mostReps).toBe(series.reps.at(-1)!.value);
    expect(benchRow).toMatchObject({ comparable: true, workingSets: 2, totalReps: 9 });
    expect(rows.find((r) => r.exerciseId === legPress)).toMatchObject({
      comparable: false,
      topWeightKg: 120,
      bestE1rmKg: null,
    });
    // The session's volume is every exercise's Progress volume, in kilograms.
    const total = performanceSeries(workouts, TZ).reduce(
      (n, s) => n + convertLoad(s.volume.at(-1)!.value ?? 0, s.unit, "kg"),
      0,
    );
    expect(session!.volumeKg).toBe(total);
  });

  it("reports records on a heavier session, never on the first", async () => {
    const second = await train([
      { exercise: bench, sets: [{ weight: 65, reps: 5 }] },
      { exercise: pullUp, sets: [{ weight: 0, reps: 7 }] },
      { exercise: legPress, sets: [{ weight: 140, reps: 10 }] },
    ]);
    const records = await as(alice)((tx) => readSessionRecords(tx, alice, second));
    expect(records.map((r) => [r.exercise.name, r.metric, r.value, r.previous])).toEqual([
      ["Barbell bench press", "e1rm", 75.83, 70.83],
      ["Barbell bench press", "top_weight", 65, 62.5],
      ["Barbell bench press", "best_set_volume", 325, 300],
    ]);
    const finished = await as(alice)((tx) => readSessionRecords(tx, alice, first));
    expect(finished).toEqual([]);
  });

  it("reads bests, period totals, the split and the records list for the owner", async () => {
    const bests = (await as(alice)((tx) => readExerciseBests(tx, [alice], bench))).get(alice)!;
    expect(bests.map((b) => [b.metric, b.value, b.work])).toEqual([
      ["e1rm", 75.83, null],
      // The second session's one set at 65, for 5.
      ["top_weight", 65, { sets: 1, reps: 5 }],
      ["best_set_volume", 325, null],
      ["most_reps", 5, null],
    ]);
    const totals = await as(alice)((tx) => readPeriodTotals(tx, [alice, bob], "workout", ALL));
    expect(totals.get(alice)).toEqual({
      sessions: 2,
      workingSets: 7,
      volumeKg: 3475,
      durationSeconds: expect.any(Number),
      activeDays: 1,
      records: 3,
      distanceMeters: 0,
      bestPaceSecondsPerKm: null,
      longestRunMeters: 0,
    });
    expect(totals.has(bob)).toBe(false);
    // Each working set once, under its exercise's axis: the bench press's sets are chest's
    // alone, not chest's and the triceps' and the shoulders' too.
    const groups = await as(alice)((tx) => readGroupSets(tx, alice, ALL));
    expect(groups.Chest).toBe(3);
    expect(groups.Arms ?? 0).toBe(0);
    const records = await as(alice)((tx) => readRecords(tx, alice, ALL));
    expect(records.map((r) => [r.exercise.name, r.metric, r.value])).toEqual([
      ["Barbell bench press", "e1rm", 75.83],
      ["Pull-up", "most_reps", 8],
    ]);
  });
});

describe("runs and body weight", () => {
  it("writes a run's row, rewrites it on edit and removes it on delete", async () => {
    const { id } = await as(alice)((tx) => logTestRun(tx, alice, run()));
    const row = () =>
      as(alice)((tx) =>
        tx.select().from(sharedSessionStats).where(eq(sharedSessionStats.sourceId, id)),
      );
    expect((await row())[0]).toMatchObject({
      sport: "run",
      title: "Run",
      occurredOn: "2026-09-10",
      durationSeconds: 1690,
      distanceMeters: 5200,
      paceSecondsPerKm: 325,
    });
    // A correction rewrites the shared row rather than leaving the old numbers standing.
    const current = await as(alice)((tx) => getActivity(tx, alice, id));
    if (!current || current.actual?.sport !== "running")
      throw new Error("Seeded a run, got something else");
    const actual = current.actual;
    await as(alice)((tx) =>
      updateActivity(
        tx,
        alice,
        id,
        {
          submissionKey: crypto.randomUUID(),
          origin: AD_HOC_ORIGIN,
          actual: { ...actual, distance: nativeDistance(6000, "m") },
          startedAt: current.startedAt,
          recordedTimeZone: current.recordedTimeZone,
          timeZoneSource: "profile_at_entry",
          occurredOn: current.occurredOn,
          effort: current.effort,
          outcome: "logged",
          title: null,
          notes: "sore",
        },
        current.revision,
      ),
    );
    expect((await row())[0]).toMatchObject({ distanceMeters: 6000, paceSecondsPerKm: 281.7 });
    await as(alice)((tx) => deleteActivity(tx, alice, id));
    expect(await row()).toEqual([]);
  });

  it("keeps the shared body weight at the newest reading", async () => {
    await as(alice)((tx) =>
      recordBodyWeight(tx, alice, { measuredOn: "2026-09-10", weightKg: 60 }),
    );
    await as(alice)((tx) =>
      recordBodyWeight(tx, alice, { measuredOn: "2026-09-01", weightKg: 58 }),
    );
    const [row] = await as(alice)((tx) =>
      tx.select().from(sharedBodyWeight).where(eq(sharedBodyWeight.userId, alice)),
    );
    expect(row).toMatchObject({ weightKg: 60, measuredOn: "2026-09-10" });
  });
});

describe("who may read", () => {
  it("shows alice's rows to an accepted follower and to nobody else", async () => {
    const count = (viewer: string) =>
      as(viewer)((tx) =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(sharedSessionStats)
          .where(eq(sharedSessionStats.userId, alice)),
      ).then((rows) => rows[0]!.n);
    expect(await count(alice)).toBe(2);
    expect(await count(bob)).toBe(2);
    expect(await count(carol)).toBe(0);
    expect(await as(bob)((tx) => canViewTraining(tx, alice))).toBe(true);
    expect(await as(carol)((tx) => canViewTraining(tx, alice))).toBe(false);
    const exerciseRows = await as(carol)((tx) => tx.select().from(sharedExerciseStats));
    expect(exerciseRows).toEqual([]);
  });

  it("hides everything once alice stops sharing, and only ever lets the owner write", async () => {
    await t.client.query("update profiles set share_training = false where id = $1", [alice]);
    const bobSees = await as(bob)((tx) => tx.select().from(sharedSessionStats));
    expect(bobSees).toEqual([]);
    expect(await as(bob)((tx) => readActivity(tx, [alice]))).toEqual([]);
    await t.client.query("update profiles set share_training = true where id = $1", [alice]);
    await expect(
      as(bob)((tx) =>
        tx.insert(sharedSessionStats).values({
          userId: alice,
          sport: "workout",
          sourceId: crypto.randomUUID(),
          title: "Forged",
          occurredOn: "2026-09-10",
          startedAt: new Date(),
          durationSeconds: 1,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      as(bob)((tx) =>
        tx.delete(sharedSessionStats).where(eq(sharedSessionStats.userId, alice)).returning(),
      ),
    ).resolves.toEqual([]);
  });

  it("refuses even the owner's write without the server-write marker", async () => {
    // A browser holding alice's own token and the public key: authenticated as her, but not a
    // server write. It could otherwise top every board with a lift no set limit allowed.
    const changed = await t.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('request.jwt.claim.sub', ${alice}, true),
                 set_config('role', 'authenticated', true)`,
      );
      return tx
        .update(sharedExerciseStats)
        .set({ bestE1rmKg: 400 })
        .where(eq(sharedExerciseStats.userId, alice))
        .returning();
    });
    expect(changed).toEqual([]);
    await expect(
      t.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claim.sub', ${alice}, true),
                   set_config('role', 'authenticated', true)`,
        );
        await tx.insert(sharedSessionStats).values({
          userId: alice,
          sport: "workout",
          sourceId: crypto.randomUUID(),
          title: "Forged",
          occurredOn: "2026-09-10",
          startedAt: new Date(),
          durationSeconds: 1,
        });
      }),
    ).rejects.toThrow();
    // Past the policies too, the records have to be a list: every follower's feed counts them.
    await expect(
      t.db
        .update(sharedSessionStats)
        .set({ records: sql`'{}'::jsonb` })
        .where(eq(sharedSessionStats.userId, alice)),
    ).rejects.toThrow();
    const bests = await as(alice)((tx) => readExerciseBests(tx, [alice], bench));
    expect(bests.get(alice)!.find((b) => b.metric === "e1rm")!.value).toBe(75.83);
  });

  it("lists a follower's activity with the records count, newest first", async () => {
    const rows = await as(bob)((tx) => readActivity(tx, [alice]));
    expect(rows.map((r) => [r.person.username, r.title, r.workingSets, r.records])).toEqual([
      ["alice", "Workout", 3, 3],
      ["alice", "Workout", 4, 0],
    ]);
  });

  it("shares body weight only when both people opt in", async () => {
    const canSee = (viewer: string) =>
      as(viewer)((tx) =>
        tx
          .select({ ok: sql<boolean>`public.can_view_body_weight(${alice})` })
          .from(profileDirectory)
          .limit(1),
      ).then((rows) => rows[0]!.ok);
    const opt = (id: string, on: boolean) =>
      t.client.query("update profiles set share_body_weight = $2 where id = $1", [id, on]);
    expect(await canSee(alice)).toBe(true);
    expect(await canSee(bob)).toBe(false);
    await opt(alice, true);
    expect(await canSee(bob)).toBe(false);
    await opt(bob, true);
    expect(await canSee(bob)).toBe(true);
    expect(await canSee(carol)).toBe(false);
    const rows = await as(bob)((tx) => tx.select().from(sharedBodyWeight));
    expect(rows.map((r) => r.weightKg)).toEqual([60]);
    await opt(alice, false);
    expect(await as(bob)((tx) => tx.select().from(sharedBodyWeight))).toEqual([]);
  });
});

describe("head to head", () => {
  let bobGym: string;

  it("reads both people's bests, trend and exercises in common, but only what bob may see", async () => {
    // Bob follows alice; alice does not follow bob. Bob benches in pounds and pulls up too.
    await as(bob)((tx) => seedTestUserData(tx, { id: bob, email: "bob@example.com" }));
    bobGym = (await as(bob)((tx) => listGyms(tx, bob))).find((g) => g.slug === "home")!.id;
    await train(
      [
        { exercise: bench, sets: [{ weight: 135, reps: 5, unit: "lb" }] },
        { exercise: pullUp, sets: [{ weight: 0, reps: 12 }] },
        { exercise: legPress, sets: [{ weight: 100, reps: 10 }] },
      ],
      bob,
      bobGym,
    );
    const bests = await as(bob)((tx) => readExerciseBests(tx, [bob, alice], bench));
    expect(bests.get(bob)!.find((b) => b.metric === "top_weight")!.value).toBe(61.23);
    expect(bests.get(alice)!.find((b) => b.metric === "top_weight")!.value).toBe(65);
    // Alice does not follow bob, so his rows are not hers to read: the map has only her.
    const aliceSees = await as(alice)((tx) => readExerciseBests(tx, [alice, bob], bench));
    expect([...aliceSees.keys()]).toEqual([alice]);

    const trends = await as(bob)((tx) =>
      readExerciseTrends(tx, [bob, alice], bench, ["e1rm", "top_weight"], ALL),
    );
    const trend = trends.get("e1rm")!;
    // Alice's two sessions fell on one day, so the better one stands for the day.
    expect(trend.get(alice)!.map((p) => p.value)).toEqual([75.83]);
    // Every metric asked for is read at once, each its own line.
    expect(
      trends
        .get("top_weight")!
        .get(alice)!
        .map((p) => p.value),
    ).toEqual([65]);
    expect(trend.get(bob)!).toHaveLength(1);
    // Each point names its workout, and the shared session a follower opens it by.
    const [day] = trend.get(alice)!;
    const [shared] = await as(bob)((tx) =>
      tx
        .select({ id: sharedSessionStats.id })
        .from(sharedSessionStats)
        .where(eq(sharedSessionStats.sourceId, day!.workoutSessionId)),
    );
    expect(day!.sharedId).toBe(shared!.id);

    const common = await as(bob)((tx) => readExercisesInCommon(tx, bob, alice, ALL));
    expect(common.comparable.map((e) => [e.name, e.region])).toEqual([
      ["Barbell bench press", "chest"],
      ["Pull-up", "back"],
    ]);
    expect(common.notComparable).toBe(1);
  });

  it("names a comparable movement and refuses a machine", async () => {
    expect(await as(bob)((tx) => getComparableExercise(tx, bench))).toMatchObject({
      name: "Barbell bench press",
      modality: "barbell",
      defaultPrescriptionType: "reps",
      region: "chest",
    });
    expect(await as(bob)((tx) => getComparableExercise(tx, legPress))).toBeNull();
  });

  it("hands over body weights only where both people share", async () => {
    const opt = (id: string, on: boolean) =>
      t.client.query("update profiles set share_body_weight = $2 where id = $1", [id, on]);
    await as(bob)((tx) => recordBodyWeight(tx, bob, { measuredOn: "2026-09-12", weightKg: 80 }));
    await opt(alice, true);
    await opt(bob, true);
    const both = await as(bob)((tx) => readBodyWeights(tx, [bob, alice]));
    expect([...both.keys()].sort()).toEqual([alice, bob].sort());
    expect(both.get(alice)).toEqual({ weightKg: 60, measuredOn: "2026-09-10" });
    await opt(alice, false);
    expect([...(await as(bob)((tx) => readBodyWeights(tx, [bob, alice]))).keys()]).toEqual([bob]);
    await opt(bob, false);
  });
});

describe("backfill", () => {
  it("rewrites the same rows from history and changes nothing the second time", async () => {
    const snapshot = async () => ({
      sessions: await t.db
        .select()
        .from(sharedSessionStats)
        .orderBy(sharedSessionStats.startedAt, sharedSessionStats.sport),
      exercises: await t.db
        .select()
        .from(sharedExerciseStats)
        .orderBy(sharedExerciseStats.startedAt, sharedExerciseStats.exerciseId),
      weights: await t.db.select().from(sharedBodyWeight),
    });
    const before = await snapshot();
    // Nothing has run it yet, which is what the deploy script checks before running it once.
    expect(await hasBackfillRun(t.db, SHARED_STATS_BACKFILL)).toBe(false);
    // Wipe what the app wrote; the backfill must produce it again from the sessions alone.
    await t.db.delete(sharedExerciseStats);
    await t.db.delete(sharedSessionStats);
    await t.db.delete(sharedBodyWeight);
    const first = await backfillSharedStats(t.db);
    expect(first).toEqual({ accounts: 3, workouts: 3, runs: 0, readings: 2 });
    expect(await hasBackfillRun(t.db, SHARED_STATS_BACKFILL)).toBe(true);
    // The ledger is the migration role's alone: an account cannot read it.
    expect(
      await as(alice)((tx) => tx.execute(sql`select * from public.data_backfills`)),
    ).toMatchObject({
      rows: [],
    });
    const strip = <T extends { id?: string; createdAt?: Date; updatedAt?: Date }>(rows: T[]) =>
      rows.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest);
    const after = await snapshot();
    expect(strip(after.sessions)).toEqual(strip(before.sessions));
    expect(strip(after.exercises)).toEqual(strip(before.exercises));
    expect(strip(after.weights)).toEqual(strip(before.weights));
    await backfillSharedStats(t.db);
    const again = await snapshot();
    expect(again.sessions.map((s) => s.id)).toEqual(after.sessions.map((s) => s.id));
    expect(again.exercises.map((e) => e.id)).toEqual(after.exercises.map((e) => e.id));
    expect(again.sessions.map((s) => s.records)).toEqual(after.sessions.map((s) => s.records));
  });
});

describe("leaderboard", () => {
  const opt = (id: string, column: string, on: boolean) =>
    t.client.query(`update profiles set ${column} = $2 where id = $1`, [id, on]);
  let circle: string[];

  beforeAll(async () => {
    // Bob's circle: alice (already), and now carol, who accepts anyone and benches heavier.
    await opt(carol, "follow_approval", false);
    await as(bob)((tx) => requestFollow(tx, bob, carol));
    await as(carol)((tx) => seedTestUserData(tx, { id: carol, email: "carol@example.com" }));
    const carolGym = (await as(carol)((tx) => listGyms(tx, carol))).find(
      (g) => g.slug === "home",
    )!.id;
    await train([{ exercise: bench, sets: [{ weight: 80, reps: 3 }] }], carol, carolGym);
    circle = (await as(bob)((tx) => loadCircle(tx, bob))).map((p) => p.id);
  });

  it("is the viewer and the people they follow, by name", () => {
    expect(circle).toEqual([alice, bob, carol]);
  });

  it("reuses the comparison's viewer directory row while reading current follows and privacy", async () => {
    const queries: string[] = [];
    const traced = drizzle(t.client, {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    });
    await opt(carol, "share_training", false);
    try {
      await withUser(
        traced,
        bob,
        async (tx) => {
          const head = await loadHeadToHead(tx, bob, "alice");
          if (head === null || head === "self") throw new Error("Expected a comparison");
          const existing = await loadCircle(tx, bob);
          queries.length = 0;
          const reused = await loadCircle(tx, bob, head.me);
          expect(reused).toEqual(existing);
          expect(queries).toHaveLength(1);
          expect(queries[0]).toContain('from "follows"');
          // Carol stopped sharing: she is not on the board, not even as "—".
          expect(reused.map((person) => person.id)).toEqual([alice, bob]);
          // Reusing a public directory row does not bypass the policies on training reads.
          const bests = await readExerciseBests(
            tx,
            reused.map((person) => person.id),
            bench,
          );
          expect(bests.has(alice)).toBe(true);
          expect(bests.has(carol)).toBe(false);
        },
        { readOnly: true },
      );
    } finally {
      await opt(carol, "share_training", true);
    }
  });

  it("reads one number per person for each activity metric, absent without a session", async () => {
    const boards = new Map<ActivityMetric, Map<string, number>>(
      await Promise.all(
        LIFTING_METRICS.map(
          async (metric) =>
            [
              metric,
              await as(bob)((tx) => readLeaderboard(tx, circle, "workout", metric, ALL)),
            ] as const,
        ),
      ),
    );
    const of = (metric: ActivityMetric) =>
      [alice, bob, carol].map((id) => boards.get(metric)!.get(id));
    expect(of("workouts")).toEqual([2, 1, 1]);
    expect(of("working_sets")).toEqual([7, 3, 1]);
    expect(of("volume")).toEqual([3475, 1306.15, 240]);
    expect(of("active_days")).toEqual([1, 1, 1]);
    // Bob and carol trained but set no records: 0, not absent.
    expect(of("records")).toEqual([3, 0, 0]);
    expect(of("workout_time").every((n) => typeof n === "number")).toBe(true);
    const outside = await as(bob)((tx) =>
      readLeaderboard(tx, circle, "workout", "workouts", {
        ...ALL,
        from: "2019-01-01",
        to: "2019-12-31",
      }),
    );
    expect(outside.size).toBe(0);
  });

  it("lists the comparable movements the circle has logged, most shared first", async () => {
    const exercises = await as(bob)((tx) => readCircleExercises(tx, circle));
    expect(exercises.map((e) => [e.name, e.people])).toEqual([
      ["Barbell bench press", 3],
      ["Pull-up", 2],
    ]);
  });

  it("ranks a movement's bests over all time, and per kg only among those sharing", async () => {
    const people = await as(bob)((tx) => loadCircle(tx, bob));
    const bests = await as(bob)((tx) => readExerciseBests(tx, circle, bench));
    const board = rankExercise(people, bests, new Map(), "e1rm");
    expect(board.map((r) => [r.username, r.rank, r.value])).toEqual([
      ["carol", 1, 88],
      ["alice", 2, 75.83],
      ["bob", 3, 71.44],
    ]);
    // Only alice and bob share body weight; carol has no reading and is left off, not "—".
    await opt(alice, "share_body_weight", true);
    await opt(bob, "share_body_weight", true);
    const readings = await as(bob)((tx) => readBodyWeights(tx, circle));
    const perKg = rankExercise(people, bests, readings, "e1rm_per_kg");
    expect(perKg.map((r) => [r.username, r.rank, r.value])).toEqual([
      ["alice", 1, 1.26],
      ["bob", 2, 0.89],
    ]);
    await opt(alice, "share_body_weight", false);
    await opt(bob, "share_body_weight", false);
  });

  it("drops a friend who stopped sharing from every board", async () => {
    await opt(carol, "share_training", false);
    const workouts = await as(bob)((tx) => readLeaderboard(tx, circle, "workout", "workouts", ALL));
    expect([...workouts.keys()].sort()).toEqual([alice, bob].sort());
    const exercises = await as(bob)((tx) => readCircleExercises(tx, circle));
    expect(exercises.map((e) => [e.name, e.people])).toEqual([
      ["Barbell bench press", 2],
      ["Pull-up", 2],
    ]);
    const bests = await as(bob)((tx) => readExerciseBests(tx, circle, bench));
    expect(bests.has(carol)).toBe(false);
    // Not listed at all: a "—" would tell bob she had not trained.
    const people = await as(bob)((tx) => loadCircle(tx, bob));
    const board = rankCircle(people, new Map([...workouts].map(([id, value]) => [id, { value }])));
    expect(board.map((r) => r.username)).toEqual(["alice", "bob"]);
    expect(rankExercise(people, bests, new Map(), "e1rm").map((r) => r.username)).toEqual([
      "alice",
      "bob",
    ]);
    await opt(carol, "share_training", true);
    expect((await as(bob)((tx) => loadCircle(tx, bob))).map((p) => p.id)).toEqual(circle);
  });

  it("finds the viewer by id, whatever username a cached profile still holds", async () => {
    await t.client.query("update profiles set username = 'bobby' where id = $1", [bob]);
    try {
      const people = await as(bob)((tx) => loadCircle(tx, bob));
      expect(people.map((p) => [p.id, p.username])).toContainEqual([bob, "bobby"]);
      const head = await as(bob)((tx) => loadHeadToHead(tx, bob, "alice"));
      expect(head).toMatchObject({ me: { id: bob, username: "bobby" } });
    } finally {
      await t.client.query("update profiles set username = 'bob' where id = $1", [bob]);
    }
  });
});

describe("running", () => {
  let circle: string[];

  beforeAll(async () => {
    circle = (await as(bob)((tx) => loadCircle(tx, bob))).map((p) => p.id);
  });

  it("sums a period's runs, takes the best pace only from runs of a kilometre or more", async () => {
    // Alice: a 5.2 km run and a faster 800 m one, which is not a pace. Bob: one 3 km run.
    // Carol: a 500 m jog, so she has a run but no best pace.
    await as(alice)((tx) => logTestRun(tx, alice, run()));
    await as(alice)((tx) =>
      logTestRun(
        tx,
        alice,
        run({
          startedAt: new Date("2026-09-11T01:00:00Z"),
          distanceMeters: 800,
          durationSeconds: 180,
        }),
      ),
    );
    await as(bob)((tx) =>
      logTestRun(
        tx,
        bob,
        run({
          startedAt: new Date("2026-09-12T01:00:00Z"),
          distanceMeters: 3000,
          durationSeconds: 1080,
        }),
      ),
    );
    await as(carol)((tx) =>
      logTestRun(
        tx,
        carol,
        run({
          startedAt: new Date("2026-09-12T02:00:00Z"),
          distanceMeters: 500,
          durationSeconds: 150,
        }),
      ),
    );
    const totals = await as(bob)((tx) => readPeriodTotals(tx, circle, "run", ALL));
    expect(totals.get(alice)).toMatchObject({
      sessions: 2,
      durationSeconds: 1870,
      distanceMeters: 6000,
      bestPaceSecondsPerKm: 325,
      longestRunMeters: 5200,
      workingSets: 0,
      volumeKg: 0,
    });
    expect(totals.get(bob)).toMatchObject({ sessions: 1, bestPaceSecondsPerKm: 360 });
    expect(totals.get(carol)).toMatchObject({ sessions: 1, bestPaceSecondsPerKm: null });
    // Lifting totals are untouched by runs.
    const lifting = await as(bob)((tx) => readPeriodTotals(tx, circle, "workout", ALL));
    expect(lifting.get(alice)!.sessions).toBe(2);
  });

  it("ranks each running metric, leaving out whoever cannot be ranked on it", async () => {
    const boards = new Map<ActivityMetric, Map<string, number>>(
      await Promise.all(
        RUNNING_METRICS.map(
          async (metric) =>
            [
              metric,
              await as(bob)((tx) => readLeaderboard(tx, circle, "run", metric, ALL)),
            ] as const,
        ),
      ),
    );
    const of = (metric: ActivityMetric) =>
      [alice, bob, carol].map((id) => boards.get(metric)!.get(id));
    expect(of("runs")).toEqual([2, 1, 1]);
    expect(of("distance")).toEqual([6000, 3000, 500]);
    expect(of("time")).toEqual([1870, 1080, 150]);
    expect(of("longest_run")).toEqual([5200, 3000, 500]);
    // Carol ran, but never a kilometre: no pace to rank, so "—" rather than a fast sprint.
    expect(of("best_pace")).toEqual([325, 360, undefined]);
    const people = await as(bob)((tx) => loadCircle(tx, bob));
    const ranked = rankCircle(
      people,
      new Map([...boards.get("best_pace")!].map(([id, value]) => [id, { value }])),
      true,
    );
    expect(ranked.map((r) => [r.username, r.rank])).toEqual([
      ["alice", 1],
      ["bob", 2],
      ["carol", null],
    ]);
    // Nobody ran in 2019.
    const none = await as(bob)((tx) =>
      readLeaderboard(tx, circle, "run", "runs", { ...ALL, from: "2019-01-01", to: "2019-12-31" }),
    );
    expect(none.size).toBe(0);
  });
});

describe("top weight, worked", () => {
  it("credits a repeated top weight to the session that worked it hardest", async () => {
    // Alice's bench is at 65 from before; three sets and one of them for 6: no record, yet the best
    // now reads that day's work, and the board says so under the load.
    const third = await train([
      {
        exercise: bench,
        sets: [
          { weight: 65, reps: 6 },
          { weight: 65, reps: 5 },
          { weight: 65, reps: 4 },
        ],
      },
    ]);
    const records = await as(alice)((tx) => readSessionRecords(tx, alice, third));
    // 65 × 6 is a better Epley estimate than 65 × 5 and a heavier single set; 65 itself is not new.
    expect(records.map((r) => [r.metric, r.value, r.previous])).toEqual([
      ["e1rm", 78, 75.83],
      ["best_set_volume", 390, 325],
      ["most_reps", 6, 5],
    ]);
    const bests = (await as(alice)((tx) => readExerciseBests(tx, [alice], bench))).get(alice)!;
    expect(bests.find((b) => b.metric === "top_weight")).toMatchObject({
      value: 65,
      work: { sets: 3, reps: 6 },
    });
    const circle = await as(alice)((tx) => loadCircle(tx, alice));
    const board = rankExercise(circle, new Map([[alice, bests]]), new Map(), "top_weight");
    expect(board[0]).toMatchObject({
      key: alice,
      rank: 1,
      value: 65,
      detail: "6\u00a0reps ·\u00a03\u00a0sets",
    });
    expect(rankExercise(circle, new Map([[alice, bests]]), new Map(), "e1rm")[0]).toMatchObject({
      value: 78,
      detail: null,
    });
  });
});

describe("what is shared of a session, and a rebuild of it", () => {
  it("leaves out a movement without a working set, live and when rebuilt", async () => {
    const row = await exerciseId("barbell-row");
    await train([{ exercise: row, sets: [{ weight: 50, reps: 8 }] }]);
    const bobGym = (await as(bob)((tx) => listGyms(tx, bob))).find((g) => g.slug === "home")!.id;
    // Bob's programme day had the row too; he skipped it, and only warmed up for pull-ups.
    const skipped = await train(
      [
        { exercise: bench, sets: [{ weight: 60, reps: 5 }] },
        { exercise: row, sets: [] },
        { exercise: pullUp, sets: [{ weight: 0, reps: 10, warmup: true }] },
      ],
      bob,
      bobGym,
    );
    const rowsOf = async (session: string) =>
      (
        await t.db
          .select({ exerciseId: sharedExerciseStats.exerciseId })
          .from(sharedExerciseStats)
          .where(eq(sharedExerciseStats.workoutSessionId, session))
      ).map((r) => r.exerciseId);
    expect(await rowsOf(skipped)).toEqual([bench]);
    const inCommon = async () =>
      (await as(bob)((tx) => readExercisesInCommon(tx, bob, alice, ALL))).comparable.map(
        (e) => e.name,
      );
    expect(await inCommon()).not.toContain("Barbell bent-over row");

    // A row an earlier version wrote for the skipped movement counts for nothing either...
    const [session] = await t.db
      .select()
      .from(sharedSessionStats)
      .where(eq(sharedSessionStats.sourceId, skipped));
    await t.db.insert(sharedExerciseStats).values({
      userId: bob,
      workoutSessionId: skipped,
      exerciseId: row,
      occurredOn: session!.occurredOn,
      startedAt: session!.startedAt,
      comparable: true,
      workingSets: 0,
    });
    expect(await inCommon()).not.toContain("Barbell bent-over row");
    const picker = await as(bob)((tx) => readCircleExercises(tx, [alice, bob, carol]));
    expect(picker.find((e) => e.id === row)?.people).toBe(1);
    // ...and rebuilding the shared rows from history removes it.
    await backfillSharedStats(t.db);
    expect(await rowsOf(skipped)).toEqual([bench]);
  });

  it("keeps a run on the day it was saved when rebuilt, wherever the profile is now", async () => {
    // 21:00 in London, where alice was; in Kolkata, her profile's zone, it was already the 14th.
    const { id } = await as(alice)((tx) =>
      logTestRun(
        tx,
        alice,
        run({ startedAt: new Date("2026-09-13T20:00:00Z"), timeZone: "Europe/London" }),
      ),
    );
    const day = async () =>
      (
        await t.db
          .select({ occurredOn: sharedSessionStats.occurredOn })
          .from(sharedSessionStats)
          .where(eq(sharedSessionStats.sourceId, id))
      )[0]?.occurredOn;
    expect(await day()).toBe("2026-09-13");
    await backfillSharedStats(t.db);
    expect(await day()).toBe("2026-09-13");
  });
});

describe("a shared workout's movements", () => {
  it("lists the library movements a follower may see, by the shared row's id alone", async () => {
    const own = await as(alice)((tx) =>
      createCustomExercise(tx, alice, {
        name: "Alice's landmine twist",
        category: "strength",
        modality: "dumbbell",
        measurement: "reps",
        primaryMuscles: ["obliques"],
        equipmentInstanceId: null,
      }),
    );
    const session = await train([
      {
        exercise: bench,
        sets: [
          { weight: 40, reps: 10, warmup: true },
          { weight: 70, reps: 3 },
          { weight: 70, reps: 2 },
          { weight: 60, reps: 6 },
        ],
      },
      { exercise: legPress, sets: [{ weight: 150, reps: 10 }] },
      {
        exercise: own.id,
        sets: [
          { weight: 10, reps: 12 },
          { weight: 10, reps: 12 },
        ],
      },
    ]);
    const [row] = await t.db
      .select({ id: sharedSessionStats.id, workingSets: sharedSessionStats.workingSets })
      .from(sharedSessionStats)
      .where(eq(sharedSessionStats.sourceId, session));
    const read = (viewer: string, owner = alice, id = row!.id) =>
      as(viewer)((tx) => readSharedSessionExercises(tx, owner, id));

    const seen = await read(bob);
    expect(
      seen.map((e) => [e.name, e.comparable, e.workingSets, e.topWeightKg, e.topWeightReps]),
    ).toEqual([
      ["45° leg press", false, 1, 150, 10],
      ["Barbell bench press", true, 3, 70, 3],
    ]);
    // The movement alice created has no shared row: the session's sets say there were more.
    expect(row!.workingSets).toBe(6);
    expect(await read(alice)).toEqual(seen);
    // Not a follower, the id read as someone else's, or no such row: nothing at all.
    expect(await read(carol)).toEqual([]);
    expect(await read(bob, bob)).toEqual([]);
    expect(await read(bob, alice, crypto.randomUUID())).toEqual([]);
  });
});

describe("recent activity", () => {
  it("lists by the day each row says, then by time, a day ahead of the reader as today", async () => {
    // Two friends half a world apart, as the reader (Kolkata) follows them: a New Yorker's late
    // Thursday starts after a Kolkata friend's early Friday, and by start time alone came between
    // the two Fridays.
    const ny = await account("ny@example.com", "ny");
    const ist = await account("ist@example.com", "ist");
    const reader = await account("reader@example.com", "reader");
    for (const friend of [ny, ist]) {
      await t.client.query("update profiles set follow_approval = false where id = $1", [friend]);
      await as(reader)((tx) => requestFollow(tx, reader, friend));
    }
    const shared = (userId: string, title: string, occurredOn: string, startedAt: string) =>
      t.db.insert(sharedSessionStats).values({
        userId,
        sport: "workout",
        sourceId: crypto.randomUUID(),
        title,
        occurredOn,
        startedAt: new Date(startedAt),
        durationSeconds: 3600,
      });
    await shared(ny, "NY Thursday, late", "2026-09-24", "2026-09-25T03:35:00Z");
    await shared(ny, "NY Friday", "2026-09-25", "2026-09-25T22:40:00Z");
    await shared(ist, "IST Friday, early", "2026-09-25", "2026-09-25T00:57:00Z");
    // Already the 12th where it was trained, the reader's 11th: it reads, and sorts, as today.
    await shared(ist, "Ahead of the reader", "2026-10-12", "2026-10-11T19:00:00Z");
    await shared(ny, "Today", "2026-10-11", "2026-10-11T21:00:00Z");

    const titles = async (today?: string) =>
      (await as(reader)((tx) => readActivity(tx, [ny, ist], { today }))).map((row) => row.title);
    expect(await titles("2026-10-11")).toEqual([
      "Today",
      "Ahead of the reader",
      "NY Friday",
      "IST Friday, early",
      "NY Thursday, late",
    ]);
    // Without a reader's today, by the owner's day as it stands.
    expect(await titles()).toEqual([
      "Ahead of the reader",
      "Today",
      "NY Friday",
      "IST Friday, early",
      "NY Thursday, late",
    ]);
    expect(
      await as(reader)((tx) => readActivity(tx, [ny, ist], { today: "2026-10-11", limit: 2 })),
    ).toHaveLength(2);
  });
});

describe("the sports someone has shared", () => {
  it("names each sport with a shared row once, and only as the policies let the reader see", async () => {
    const rider = await account("rider@example.com", "rider");
    const follower = await account("follower@example.com", "follower");
    const stranger = await account("stranger@example.com", "stranger");
    await t.client.query("update profiles set follow_approval = false where id = $1", [rider]);
    await as(follower)((tx) => requestFollow(tx, follower, rider));
    for (const sport of ["workout", "workout", "cycle"] as const)
      await t.db.insert(sharedSessionStats).values({
        userId: rider,
        sport,
        sourceId: crypto.randomUUID(),
        title: sport,
        occurredOn: "2026-10-01",
        startedAt: new Date("2026-10-01T07:00:00Z"),
        durationSeconds: 3600,
      });
    const sports = (viewer: string, ids: string[]) =>
      as(viewer)((tx) => readSharedSports(tx, ids)).then((found) => [...found].sort());
    expect(await sports(follower, [rider])).toEqual(["cycle", "workout"]);
    expect(await sports(rider, [rider])).toEqual(["cycle", "workout"]);
    // Somebody who does not follow the rider sees no sport of theirs, so no tab for one.
    expect(await sports(stranger, [rider])).toEqual([]);
    expect(await sports(follower, [])).toEqual([]);
  });
});

describe("a span's best lifts", () => {
  it("lists a lift done only for more than ten reps by its top weight, not leaving it out", async () => {
    const lifter = await account("lifter@example.com", "lifter");
    await as(lifter)((tx) => seedTestUserData(tx, { id: lifter, email: "lifter@example.com" }));
    const home = (await as(lifter)((tx) => listGyms(tx, lifter))).find(
      (g) => g.slug === "home",
    )!.id;
    // 35 × 12 and 30 × 15: no set an estimated 1RM is made from, and still the span's best.
    await train(
      [
        {
          exercise: bench,
          sets: [
            { weight: 35, reps: 12 },
            { weight: 30, reps: 15 },
          ],
        },
      ],
      lifter,
      home,
    );
    const best = () => as(lifter)((tx) => readRecords(tx, lifter, ALL));
    expect((await best()).map((r) => [r.exercise.name, r.metric, r.value])).toEqual([
      ["Barbell bench press", "top_weight", 35],
    ]);
    // Once the span holds a set of ten or fewer, the estimate is the lift's best again.
    await train([{ exercise: bench, sets: [{ weight: 30, reps: 10 }] }], lifter, home);
    expect((await best()).map((r) => [r.metric, r.value])).toEqual([["e1rm", 40]]);
  });
});
