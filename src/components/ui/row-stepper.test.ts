import { expect, it } from "vitest";

import { steppedValue } from "./row-stepper";

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
