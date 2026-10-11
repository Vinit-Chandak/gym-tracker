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

it("steps down past a half that was rounded up, as far as half a portion", () => {
  // 0.375 is kept as 0.38, 1.125 as 1.13 and 1.875 as 1.88: each is a little over its half.
  expect(steppedAmount(1.13, 0.75, -1)).toBe(0.75);
  expect(steppedAmount(1.88, 0.75, -1)).toBe(1.5);
  expect(steppedAmount(0.38, 0.75, -1)).toBeNull();
  expect(steppedAmount(0.63, 0.25, -1)).toBe(0.5);
  expect(steppedAmount(0.13, 0.25, -1)).toBeNull();
  expect(steppedAmount(3.13, 1.25, -1)).toBe(2.5);
  expect(steppedAmount(1.88, 1.25, -1)).toBe(1.25);
  expect(steppedAmount(4.38, 1.75, -1)).toBe(3.5);
  expect(steppedAmount(0.5, 0.33, -1)).toBe(0.33);
  expect(steppedAmount(0.83, 0.33, -1)).toBe(0.66);
});

it("steps up past a half that was rounded down", () => {
  // 0.225 is kept as 0.22, 0.525 as 0.52 and 83.325 as 83.32: each is a little under its half.
  expect(steppedAmount(0.22, 0.15, 1)).toBe(0.3);
  expect(steppedAmount(0.52, 0.35, 1)).toBe(0.7);
  expect(steppedAmount(83.32, 33.33, 1)).toBe(99.99);
});

it("walks a portion's halves up and back down again, one tap a half", () => {
  for (const portion of [0.25, 0.33, 0.75, 1.25, 1.75, 0.15, 0.35, 33.33]) {
    const up = [steppedAmount(0, portion, 1)!];
    for (let tap = 0; tap < 6; tap++) up.push(steppedAmount(up.at(-1)!, portion, 1)!);
    const down = [up.at(-1)!];
    for (let tap = 0; tap < 6; tap++) down.push(steppedAmount(down.at(-1)!, portion, -1)!);
    expect(down.toReversed()).toEqual(up);
    expect(steppedAmount(up[0]!, portion, -1)).toBeNull();
  }
});
