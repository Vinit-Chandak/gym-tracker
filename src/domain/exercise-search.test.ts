import { expect, it } from "vitest";

import { searchScore, searchWords } from "./exercise-search";

const exercise = (name: string, muscles: string[] = [], pattern = "elbow_flexion") => ({
  name,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  movementPattern: pattern,
  primaryMuscles: muscles,
  modality: "cable",
});

it("compares words without case, punctuation or plurals", () => {
  expect(searchWords("Bayesian Bicep-Curls!")).toEqual(["bayesian", "bicep", "curl"]);
  expect(searchWords("the calves and flies")).toEqual(["calf", "fly"]);
  expect(searchWords("press")).toEqual(["press"]);
});

it("ranks a name match above a muscle match, and a closer name first", () => {
  const words = searchWords("Bayesian bicep curls");
  const bayesian = searchScore(words, exercise("Bayesian cable curl", ["biceps"]));
  const barbell = searchScore(words, exercise("Barbell curl", ["biceps"]));
  const pushdown = searchScore(words, exercise("Triceps pushdown", ["triceps"], "elbow_extension"));
  expect(bayesian).toBeGreaterThan(barbell);
  expect(barbell).toBeGreaterThan(0);
  expect(pushdown).toBe(0);
});

it("matches the start of a longer word, not a fragment of two letters", () => {
  expect(searchScore(searchWords("lat pull"), exercise("Lat pulldown", ["lats"]))).toBe(4);
  expect(searchScore(searchWords("la"), exercise("Lat pulldown", ["lats"]))).toBe(0);
});
