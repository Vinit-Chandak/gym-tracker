import { describe, expect, it } from "vitest";

import { EXERCISE_ALIASES } from "@/db/seed/data/exercise-aliases";
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
const library = EXERCISES.map((e) => ({
  ...e,
  secondaryMuscles: e.secondaryMuscles ?? [],
  aliases: EXERCISE_ALIASES[e.slug] ?? [],
})).sort((a, b) => a.name.localeCompare(b.name));
const names = (items: readonly { name: string }[]) => items.map((item) => item.name);

describe("exercise search", () => {
  it("finds an exercise by another name it goes by", () => {
    // Aliases answer as names do (plan: discovery and recognition), local names included.
    expect(names(searchExercises(library, "RDL")?.byName ?? [])).toContain(
      "Barbell Romanian deadlift",
    );
    expect(searchExercises(library, "press-up")?.byName[0]?.name).toBe("Push-up");
    // The library's own name still leads when it is what was typed.
    expect(searchExercises(library, "Push-up")?.byName[0]?.name).toBe("Push-up");
  });

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

  it.each([
    ["bench presses", "Barbell bench press"],
    ["leg presses", "45° leg press"],
    ["shoulder presses", "Shoulder press machine"],
    ["crunches", "Crunch"],
    ["flyes", "Dumbbell chest fly"],
    // On its way to "bench presses", the word is no longer the start of "press".
    ["bench presse", "Barbell bench press"],
  ])("reads %j as the plural it is", (query, name) => {
    expect(names(searchExercises(library, query)?.byName ?? [])).toContain(name);
  });

  it("keeps a word that only ever took an s", () => {
    expect(names(searchExercises(library, "lateral raises")?.byName ?? [])).toContain(
      "Lateral raise machine",
    );
    expect(names(searchExercises(library, "lunges")?.byName ?? []).length).toBeGreaterThan(0);
  });

  it("lists exercises for a muscle after the names that mention it, primary movers first", () => {
    const results = searchExercises(library, "biceps");
    // A name match is the name or one of the names it goes by.
    expect(results?.byName.every((e) => [e.name, ...e.aliases].some((n) => /bicep/i.test(n)))).toBe(
      true,
    );
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

  it("opens a swap on the same movement, each exercise listed once", () => {
    const squat = library.find((e) => e.slug === "low-bar-squat")!;
    expect(squat.movementPattern).toBe("squat");
    const sections = exerciseSections(library, "", squat);
    // A squat's swap began at the chest exercises; it begins at the squats and leg presses.
    expect(sections[0]).toMatchObject({ key: "like", title: "Same movement" });
    expect(names(sections[0]!.items)).toEqual(
      expect.arrayContaining(["Front squat", "Hack squat", "45° leg press"]),
    );
    expect(sections[0]!.items.every((e) => e.movementPattern === "squat")).toBe(true);
    const listed = sections.flatMap((section) => section.items);
    expect(listed).toHaveLength(library.length);
    expect(new Set(listed).size).toBe(library.length);
    // A search ranks as ever, and nothing alike leaves the library as it was.
    expect(exerciseSections(library, "curl", squat).map((s) => s.key)).not.toContain("like");
    expect(exerciseSections(library, "", { movementPattern: "none such" })).toEqual(
      exerciseSections(library, ""),
    );
  });
});
