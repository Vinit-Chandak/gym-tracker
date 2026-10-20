import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { NextLoad, nextLoadQuestion } from "./next-load";

const stack = { known: [47, 54, 59], stack: true, assisted: false, increment: null };

it("asks for the stop past today's heaviest, with the gap between the two heaviest as a guess", () => {
  expect(nextLoadQuestion(stack, [47, 54, 59])).toEqual({ from: 59, guess: 64 });
});

it("asks nothing when that stop is already known, on plates, or before anything is lifted", () => {
  expect(nextLoadQuestion({ ...stack, known: [47, 54, 59, 64] }, [59])).toBeNull();
  expect(nextLoadQuestion({ ...stack, stack: false }, [59])).toBeNull();
  expect(nextLoadQuestion(stack, [null])).toBeNull();
  expect(nextLoadQuestion(null, [59])).toBeNull();
});

it("leaves the box empty when only one weight has ever been lifted on the machine", () => {
  expect(nextLoadQuestion({ ...stack, known: [] }, [40, 40])).toEqual({ from: 40, guess: null });
});

it("counts today's sets as stops, and asks for less help on an assisted machine", () => {
  expect(nextLoadQuestion({ ...stack, known: [] }, [50, 55])).toEqual({ from: 55, guess: 60 });
  expect(nextLoadQuestion({ ...stack, known: [30, 25], assisted: true }, [25])).toEqual({
    from: 25,
    guess: 20,
  });
});

it("asks from the best ever lifted here, not from a lighter day's heaviest (ADR 0048)", () => {
  // A light day at 47: the stop above it is known, but the one above the best, 59, is not.
  expect(nextLoadQuestion(stack, [47, 47], 59)).toEqual({ from: 59, guess: 64 });
  // Today's heaviest past the best asks from today.
  expect(nextLoadQuestion({ ...stack, known: [47, 54, 59, 64] }, [64], 59)).toEqual({
    from: 64,
    guess: 69,
  });
  // The stop above the best already known: nothing to ask.
  expect(nextLoadQuestion({ ...stack, known: [47, 54, 59, 64] }, [47], 59)).toBeNull();
  // Less help is the best on an assisted machine.
  expect(nextLoadQuestion({ ...stack, known: [30, 25], assisted: true }, [30], 25)).toEqual({
    from: 25,
    guess: 20,
  });
});

it("asks nothing at the least help an assisted machine gives", () => {
  const assisted = { ...stack, known: [5, 10, 15, 20, 25, 30], assisted: true };
  expect(nextLoadQuestion(assisted, [5, 5, 5])).toBeNull();
  // A single stop says nothing about the step below it yet, so that one is still asked.
  expect(nextLoadQuestion({ ...assisted, known: [] }, [5])).toEqual({ from: 5, guess: null });
});

it("says beside its label that a guessed weight is from the logs, and nothing where there is none", () => {
  const ask = { equipmentInstanceId: "stack", from: 59, unitLabel: "kg", assisted: false };
  const guessed = renderToStaticMarkup(createElement(NextLoad, { ...ask, guess: 64 }));
  expect(guessed).toContain('value="64"');
  expect(guessed).toContain('<span id="next-load-stack-from"');
  expect(guessed).toContain('aria-describedby="next-load-stack-from"');
  expect(guessed).toContain("From your logs");
  const blank = renderToStaticMarkup(createElement(NextLoad, { ...ask, guess: null }));
  expect(blank).not.toContain("From your logs");
  expect(blank).not.toContain("aria-describedby");
});
