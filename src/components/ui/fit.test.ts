import { expect, it } from "vitest";

import { boldEmWidth, titleSize } from "./fit";

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

it("measures a label in Atkinson Hyperlegible Next Bold a little over what Chromium sets", () => {
  // As set in Chromium, in em: kerning only ever takes a little off the glyphs' sum.
  for (const [label, set] of [
    ["Swimming", 4.863],
    ["30 days", 3.724],
    ["Plate-loaded", 5.978],
    ["Prefer not to say", 7.772],
  ] as const) {
    expect(boldEmWidth(label)).toBeGreaterThanOrEqual(set);
    expect(boldEmWidth(label)).toBeLessThanOrEqual(set * 1.02);
  }
  // A glyph the table does not know is counted wide rather than missed.
  expect(boldEmWidth("Ω")).toBe(0.9);
});
