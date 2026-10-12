import { expect, it } from "vitest";

import { figureSize, steppedValue } from "./row-stepper";

it("steps on the steps from zero, a typed figure going to the nearer one that way", () => {
  expect(steppedValue(5, 0.5, 1)).toBe(5.5);
  expect(steppedValue(5, 0.5, -1)).toBe(4.5);
  expect(steppedValue(6.3, 0.5, 1)).toBe(6.5);
  expect(steppedValue(6.3, 0.5, -1)).toBe(6);
  expect(steppedValue(12.34, 0.1, 1)).toBe(12.4);
});

it("goes no lower than the least or higher than the most, and from blank only up", () => {
  expect(steppedValue(0, 0.5, -1)).toBeNull();
  expect(steppedValue(24, 0.5, 1, { max: 24 })).toBeNull();
  expect(steppedValue(null, 0.5, -1)).toBeNull();
  expect(steppedValue(null, 0.5, 1)).toBe(0.5);
  expect(steppedValue(null, 1, 1, { min: 1 })).toBe(2);
});

it("steps the figure down the ramp to fit the room its column leaves beside the unit", () => {
  // 100% text: a 120-pt column less yd's 44-pt target and the 3-pt gap holds 1640 at 26.
  expect(figureSize("1640", 120 - 44 - 3)).toBe(26);
  // 200% text: 160 less a 64-pt target ran 1640 at 26 (39 px) into − and cut its last 0.
  expect(figureSize("1640", 160 - 64 - 3, 1.5)).toBe(20);
  // A figure with no unit beside it keeps its size: 31:22 has the whole column.
  expect(figureSize("31:22", 160, 1.5)).toBe(26);
  // 1440 at 100% text, where a 26 is drawn at 29 in a 135-pt column beside a 48-pt yd: 10000 fits
  // as a 26 would be at 26 px, but at 29 it ran into − and lost its last 0.
  expect(figureSize("10000", 135 - 48 - 3)).toBe(26);
  expect(figureSize("10000", 135 - 48 - 3, 29 / 26)).toBe(20);
  expect(figureSize("1640", 135 - 48 - 3, 29 / 26)).toBe(26);
  // Never under 20, the ramp's last figure size, and never over 26.
  expect(figureSize("123456.5", 60, 1.5)).toBe(20);
  expect(figureSize("–", 200)).toBe(26);
});
