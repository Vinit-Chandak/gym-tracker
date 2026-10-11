import { expect, it } from "vitest";

import { titleSize } from "./fit";

it("steps a one-word title down rather than break inside the word at large text", () => {
  // 390 pt at 200% text: a title's line holds 350 / 1.75 = 200 pt at 100%.
  expect(titleSize("Leaderboard", 200, 34)).toBe(30);
  // At 100% the same word keeps the screen's size.
  expect(titleSize("Leaderboard", 350, 34)).toBe(34);
});

it("still steps down for a long name and then wraps it between its words", () => {
  expect(titleSize("Barbell bench press", 350, 34)).toBe(34);
  expect(titleSize("Single-arm dumbbell Romanian deadlift", 350, 34)).toBe(26);
});
