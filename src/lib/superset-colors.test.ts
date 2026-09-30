import { expect, it } from "vitest";
import {
  SUPERSET_HUE_COUNT,
  supersetColor,
  supersetHues,
  supersetLabels,
  supersetLetter,
} from "./superset-colors";

it("gives each group one hue in order of first appearance, ignoring ungrouped rows", () => {
  const hues = supersetHues([
    { supersetGroup: null },
    { supersetGroup: "B" },
    { supersetGroup: "B" },
    { supersetGroup: null },
    { supersetGroup: "A" },
    { supersetGroup: "B" },
  ]);
  expect([...hues.entries()]).toEqual([
    ["B", 1],
    ["A", 2],
  ]);
});

it("wraps around once the palette is used up", () => {
  const rows = Array.from({ length: SUPERSET_HUE_COUNT + 2 }, (_, i) => ({
    supersetGroup: `g${i}`,
  }));
  const hues = supersetHues(rows);
  expect(hues.get(`g${SUPERSET_HUE_COUNT}`)).toBe(1);
  expect(hues.get(`g${SUPERSET_HUE_COUNT + 1}`)).toBe(2);
});

it("resolves a hue through the theme rather than a fixed colour", () => {
  expect(supersetColor(3)).toBe("var(--ov-group-3)");
});

it("names groups by letter in order of first appearance, and members by position", () => {
  expect(supersetLetter(1)).toBe("A");
  expect(supersetLetter(3)).toBe("C");
  const labels = supersetLabels([
    { supersetGroup: null },
    { supersetGroup: "arms" },
    { supersetGroup: "arms" },
    { supersetGroup: "core" },
    { supersetGroup: null },
    { supersetGroup: "core" },
  ]);
  expect([...labels.entries()]).toEqual([
    [1, "A1"],
    [2, "A2"],
    [3, "B1"],
    [5, "B2"],
  ]);
});
