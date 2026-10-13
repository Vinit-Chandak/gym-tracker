import { expect, it } from "vitest";

import { boldEmWidth, textEmWidth, titleSize } from "./fit";

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

it("measures a list's words in the body's weight, its figures in Jost, as Chromium sets them", () => {
  // As set in Chromium on a leaderboard, in em: within a hundredth either way, so a list that
  // adds a hundredth never takes a line for less than it needs.
  for (const [line, figures, set] of [
    ["Kenji Watanabe", false, 7.006],
    ["@jordan", false, 3.607],
    ["211\u00a0h 50\u00a0min", true, 6.129],
    ["3,113,528\u00a0lb", true, 5.979],
    ["Wed\u00a010\u00a0Dec\u00a02025", true, 8.169],
    ["Fri\u00a017\u00a0Oct\u00a02025", true, 7.285],
    ["4\u00a0sets ·\u00a0best\u00a05\u00a0reps", true, 8.7],
  ] as const) {
    expect(textEmWidth(line, figures) * 1.01).toBeGreaterThanOrEqual(set);
    expect(textEmWidth(line, figures)).toBeLessThanOrEqual(set * 1.011);
  }
  // Jost's tabular digits are one width; Atkinson's, outside a run of figures, are not.
  expect(textEmWidth("2025", true)).toBeCloseTo(2.4);
  expect(textEmWidth("1111")).toBeLessThan(textEmWidth("0000"));
  expect(textEmWidth("Ω")).toBe(0.9);
});
