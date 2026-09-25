import { describe, expect, it } from "vitest";

import { EXERCISES } from "@/db/seed/data/exercises";

import { exerciseSections, matchesExerciseQuery, searchExercises } from "./exercise-search";

const latPulldown = {
  name: "Lat pulldown",
  slug: "lat-pulldown",
  category: "hypertrophy",
  modality: "machine",
  movementPattern: "vertical_pull",
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps", "upper_back"],
} as const;

/** The library as it is seeded, alphabetical as the picker receives it. */
const library = EXERCISES.map((e) => ({ ...e, secondaryMuscles: e.secondaryMuscles ?? [] })).sort(
  (a, b) => a.name.localeCompare(b.name),
);
const names = (items: readonly { name: string }[]) => items.map((item) => item.name);

describe("exercise search", () => {
  it("matches on name, muscles, modality and movement pattern", () => {
    expect(matchesExerciseQuery(latPulldown, "pull")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "biceps")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "machine lats")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "vertical pull")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "chest")).toBe(false);
  });

  it("treats an empty query as match-all", () => {
    expect(matchesExerciseQuery(latPulldown, "   ")).toBe(true);
    expect(searchExercises([latPulldown], "  ")).toBeNull();
  });

  it.each(["pullup", "pull up", "pull-up", "Pull-ups", "pullups"])(
    "puts the Pull-up first for %j, however it is spelled",
    (query) => {
      const results = searchExercises(library, query);
      expect(results?.byName[0]?.name).toBe("Pull-up");
      expect(names(results?.byName ?? [])).toContain("Assisted pull-up (machine)");
    },
  );

  it("does not read a two-letter word as a muscle", () => {
    // "up" is not the upper back: a search for pull-ups is not a search for every row.
    const results = searchExercises(library, "pull up");
    expect(names([...(results?.byName ?? []), ...(results?.byOther ?? [])])).not.toContain(
      "Barbell bent-over row",
    );
  });

  it("matches a name while its last word is still being typed", () => {
    expect(searchExercises(library, "pull u")?.byName[0]?.name).toBe("Pull-up");
  });

  it("reads a plural as a finished word", () => {
    // "lats" is the muscle; "lat" might yet become "lateral".
    expect(names(searchExercises(library, "machine lats")?.byName ?? [])).not.toContain(
      "Iso-lateral machine row",
    );
    expect(names(searchExercises(library, "lat")?.byName ?? [])).toContain("Lateral raise machine");
  });

  it("lists exercises for a muscle after the names that mention it, primary movers first", () => {
    const results = searchExercises(library, "biceps");
    expect(results?.byName.every((e) => /bicep/i.test(e.name))).toBe(true);
    const other = results?.byOther ?? [];
    const firstSecondary = other.findIndex((e) => !e.primaryMuscles.includes("biceps"));
    expect(firstSecondary).toBeGreaterThan(0);
    expect(other.slice(firstSecondary).every((e) => !e.primaryMuscles.includes("biceps"))).toBe(
      true,
    );
  });

  it("groups by body region without a query and by match quality with one", () => {
    expect(exerciseSections(library, "")[0]?.key).not.toBe("name");
    expect(exerciseSections(library, "pullup").map((s) => s.title)).toEqual(["Best matches"]);
    expect(exerciseSections([latPulldown], "biceps").map((s) => s.key)).toEqual(["other"]);
  });
});
