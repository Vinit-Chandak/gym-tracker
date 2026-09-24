import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

/**
 * Every screen that shows the open workout's sets takes part in set changes (ADR 0030,
 * `lib/set-changes.ts`).
 *
 * A saved set renders nothing again, so a screen the browser keeps (a tab for a minute, any
 * screen on Back) can hold sets from before it. A file under `src/app` or `src/components` that
 * calls one of the reads below either reads `seenSetChanges` and hands it on, to the workout's
 * `withSetChanges` or to `FreshAfterSets`, or is listed here with what it shows instead.
 */

/** Reads whose result holds the open workout's sets, or counts them. */
const READS = [
  "getActiveSession",
  "getInProgressSession",
  "getSessionDetail",
  "readTrainingData",
  "readWorkouts",
];

/** Files that call one of them and show none of the sets: what each shows instead. */
const SHOWS_NO_SETS: Record<string, string> = {
  "src/app/(app)/training/page.tsx": "a link to the open workout",
  "src/app/(app)/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute/page.tsx":
    "the exercise being replaced and the gym",
  "src/app/(app)/exercises/[exerciseId]/page.tsx": "finished workouts only (`completedOnly`)",
  "src/components/shell/session-status.tsx": "the open workout's name",
};

const callers = ["src/app", "src/components"]
  .flatMap((directory) =>
    readdirSync(join(process.cwd(), directory), { recursive: true, encoding: "utf8" })
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      .map((path) => join(directory, path).replaceAll("\\", "/")),
  )
  .map((path) => ({ path, source: readFileSync(join(process.cwd(), path), "utf8") }))
  .filter(({ source }) => READS.some((read) => new RegExp(`\\b${read}\\(`).test(source)));

it("finds the screens that show the open workout's sets", () => {
  expect(callers.map(({ path }) => path)).toEqual(
    expect.arrayContaining([
      "src/app/(app)/today/page.tsx",
      "src/app/(app)/progress/page.tsx",
      "src/app/(app)/workouts/[sessionId]/page.tsx",
      "src/app/(app)/workouts/[sessionId]/finish/page.tsx",
    ]),
  );
});

it.each(callers.map(({ path }) => path))("%s takes part, or shows no sets", (path) => {
  const { source } = callers.find((caller) => caller.path === path)!;
  const takesPart =
    /\bseenSetChanges\(\)/.test(source) &&
    (/<FreshAfterSets\b/.test(source) || /\bseenSetChanges=\{/.test(source));
  expect(takesPart || path in SHOWS_NO_SETS).toBe(true);
});

it("lists only files that still call one of the reads", () => {
  const stale = Object.keys(SHOWS_NO_SETS).filter(
    (path) => !callers.some((caller) => caller.path === path),
  );
  expect(stale).toEqual([]);
});
