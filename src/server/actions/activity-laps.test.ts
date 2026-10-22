import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { RunningActualV1 } from "@/domain/activity-metrics";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { getActivity } from "@/server/repositories/activities";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveActivityAction } from "./activities";

/**
 * An interval session entered as laps alone (owner, 21 October 2026): every part is a lap with
 * a kind, the totals are the laps added up unless the watch's are typed, and reps with
 * recoveries make the run intervals.
 */

let t: TestDatabase;
let user: { id: string; email: string };

beforeEach(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("laps@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
});

const lap = (
  phase: string,
  distanceValue: number | null,
  distanceUnit: string,
  durationMs: number | null,
) => ({
  phase,
  distanceValue,
  distanceUnit,
  durationMs,
  averageHeartRate: null,
  maxHeartRate: null,
});

/** The owner's session: three reps with standing recoveries between them. */
const LAPS = [
  lap("work", 0.47, "km", 120_000),
  lap("recovery", null, "km", 90_000),
  lap("work", 0.51, "km", 117_000),
  lap("recovery", null, "km", 90_000),
  lap("work", 0.49, "km", 119_000),
];

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    sport: "running",
    submissionKey: crypto.randomUUID(),
    startedAt: "2026-10-20T07:00",
    environment: "outdoor",
    distanceValue: "",
    distanceUnit: "km",
    hours: "",
    minutes: "",
    seconds: "",
    runType: "",
    effort: "4",
    laps: JSON.stringify(LAPS),
    ...values,
  }))
    data.set(key, value);
  return data;
}

async function saved(id: string): Promise<RunningActualV1> {
  const record = await getActivity(t.db, user.id, id);
  return record!.actual as RunningActualV1;
}

it("saves a run entered as laps alone, its totals the laps added up and its kind intervals", async () => {
  const state = await saveActivityAction(null, {}, form());
  expect(state.fieldErrors).toBeUndefined();
  expect(state.formError).toBeUndefined();
  const actual = await saved(state.savedActivityId!);
  expect(actual.distance).toEqual({ value: 1.47, unit: "km", metres: 1470 });
  expect(actual.durationMs).toBe(536_000);
  expect(actual.runType).toBe("intervals");
  expect(actual.laps.map((entry) => entry.phase)).toEqual([
    "work",
    "recovery",
    "work",
    "recovery",
    "work",
  ]);
});

it("adds laps up in the unit the athlete runs in, and keeps a kind they chose", async () => {
  const state = await saveActivityAction(
    null,
    {},
    form({
      distanceUnit: "mi",
      runType: "hills",
      laps: JSON.stringify([lap("work", 400, "m", 90_000), lap("recovery", null, "m", 60_000)]),
    }),
  );
  const actual = await saved(state.savedActivityId!);
  expect(actual.distance.unit).toBe("mi");
  expect(actual.distance.metres).toBeCloseTo(400, 2);
  expect(actual.durationMs).toBe(150_000);
  expect(actual.runType).toBe("hills");
});

it("keeps the watch's totals when they are typed, and refuses ones short of the laps at the total", async () => {
  const watch = await saveActivityAction(
    null,
    {},
    form({ distanceValue: "2.6", minutes: "11", seconds: "30" }),
  );
  const actual = await saved(watch.savedActivityId!);
  expect(actual.distance.value).toBe(2.6);
  expect(actual.durationMs).toBe(690_000);

  const short = await saveActivityAction(
    null,
    {},
    form({ distanceValue: "1", minutes: "5", seconds: "0" }),
  );
  expect(short.savedActivityId).toBeUndefined();
  // Said once, at each total, with what the laps add up to: no sentence over Save repeats it.
  expect(short.fieldErrors).toEqual({
    duration: "The laps add up to 8:56, longer than 5:00.",
    distance: "The laps add up to 1.47 km, more than 1.00 km.",
  });
  expect(short.formError).toBeUndefined();
  expect(short.values?.distanceValue).toBe("1");
});

it("says a lap's problem at that lap, and nowhere else", async () => {
  const state = await saveActivityAction(
    null,
    {},
    form({
      laps: JSON.stringify([...LAPS, lap("cooldown", null, "km", null)]),
    }),
  );
  expect(state.fieldErrors).toEqual({ "laps.5": "Give lap 6 a distance, a time or both." });
  expect(state.formError).toBeUndefined();
});

it("does not take a total the laps hold only in part, and asks for it at the field", async () => {
  // A rep timed with no distance: the run's distance is unknown, not the other rep's alone.
  const state = await saveActivityAction(
    null,
    {},
    form({
      laps: JSON.stringify([lap("work", 0.4, "km", 90_000), lap("work", null, "km", 60_000)]),
    }),
  );
  expect(state.fieldErrors).toEqual({ distance: "Enter how far you ran." });
  expect(state.formError).toBeUndefined();

  // With the watch's distance typed, the time is still the laps', which hold it whole.
  const typed = await saveActivityAction(
    null,
    {},
    form({
      distanceValue: "0.7",
      laps: JSON.stringify([lap("work", 0.4, "km", 90_000), lap("work", null, "km", 60_000)]),
    }),
  );
  const actual = await saved(typed.savedActivityId!);
  expect([actual.distance.value, actual.durationMs]).toEqual([0.7, 150_000]);
});

it("still asks for a distance and a time when there are no laps to add up", async () => {
  const state = await saveActivityAction(null, {}, form({ laps: "" }));
  expect(state.fieldErrors).toEqual({
    duration: "Enter the duration as more than zero and under seven days.",
    distance: "Enter how far you ran.",
  });
  expect(state.formError).toBeUndefined();
});
