import { expect, it } from "vitest";

import { boldEmWidth, textEmWidth, titleSize } from "./fit";

it("steps a one-word title down rather than break inside the word at large text", () => {
  // A 320-pt phone at 200% text: a title's line holds about 170 pt at 100%.
  expect(titleSize("Leaderboard", 170, 30)).toBe(26);
  // At 100% the same word keeps the screen's size.
  expect(titleSize("Leaderboard", 350, 30)).toBe(30);
});

it("still steps down for a long name and then wraps it between its words", () => {
  expect(titleSize("Barbell bench press", 350, 30)).toBe(30);
  expect(titleSize("Single-arm dumbbell Romanian deadlift", 350, 30)).toBe(22);
});

it("measures a label in Host Grotesk a little over what Chromium sets", () => {
  // As set in Chromium, in em: kerning only ever takes a little off the glyphs' sum, up to about
  // 3.5% in Host Grotesk ("30 days"), so the sum errs wide and a label never gets too little room.
  for (const [label, set] of [
    ["Swimming", 4.776],
    ["30 days", 3.736],
    ["Plate-loaded", 5.81],
    ["Prefer not to say", 7.606],
  ] as const) {
    expect(boldEmWidth(label)).toBeGreaterThanOrEqual(set);
    expect(boldEmWidth(label)).toBeLessThanOrEqual(set * 1.04);
  }
  // A glyph the table does not know is counted wide rather than missed.
  expect(boldEmWidth("Ω")).toBe(0.9);
});

it("measures a list's words and figures as Chromium sets them, at any weight", () => {
  // As set in Chromium on a leaderboard, in em: never under what it sets, and within the face's
  // kerning (about 3.5%) over it, so a list that adds a hundredth never takes a line for less
  // than it needs.
  for (const [line, set] of [
    ["Kenji Watanabe", 7.083],
    ["@jordan", 3.724],
    ["211\u00a0h 50\u00a0min", 6.42],
    ["3,113,528\u00a0lb", 6.115],
    ["Wed\u00a010\u00a0Dec\u00a02025", 8.691],
    ["Fri\u00a017\u00a0Oct\u00a02025", 7.544],
    ["4\u00a0sets ·\u00a0best\u00a05\u00a0reps", 8.871],
  ] as const) {
    expect(textEmWidth(line) * 1.01).toBeGreaterThanOrEqual(set);
    expect(textEmWidth(line)).toBeLessThanOrEqual(set * 1.04);
  }
  // Host Grotesk's digits are one width, and so is every weight of it.
  expect(textEmWidth("2025")).toBeCloseTo(2.6);
  expect(textEmWidth("1111")).toBe(textEmWidth("0000"));
  expect(boldEmWidth("Swimming")).toBe(textEmWidth("Swimming"));
  expect(textEmWidth("Ω")).toBe(0.9);
});
