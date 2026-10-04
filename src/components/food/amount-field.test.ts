import { expect, it } from "vitest";

import { steppedAmount } from "./amount-field";

it("steps by half a portion, from a typed amount to the nearer half that way", () => {
  expect(steppedAmount(100, 100, 1)).toBe(150);
  expect(steppedAmount(100, 100, -1)).toBe(50);
  expect(steppedAmount(137, 100, 1)).toBe(150);
  expect(steppedAmount(137, 100, -1)).toBe(100);
  expect(steppedAmount(1, 1, 1)).toBe(1.5);
  // The halves are kept to the hundredth, as amounts are.
  expect(steppedAmount(33.33, 33.33, 1)).toBe(50);
  expect(steppedAmount(50, 33.33, 1)).toBe(66.66);
});

it("goes no lower than half a portion and no higher than an amount can be", () => {
  expect(steppedAmount(50, 100, -1)).toBeNull();
  expect(steppedAmount(0.5, 1, -1)).toBeNull();
  expect(steppedAmount(0, 100, 1)).toBe(50);
  expect(steppedAmount(9_990, 100, 1)).toBe(10_000);
  expect(steppedAmount(10_000, 100, 1)).toBeNull();
});
