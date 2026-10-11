import { expect, it } from "vitest";

import { foldStyles, rowLengths } from "./fold";

it("folds to even rows, never one alone under the rest", () => {
  expect(rowLengths(4)).toEqual([4, 2, 1]);
  expect(rowLengths(5)).toEqual([5, 3, 2, 1]);
  expect(rowLengths(6)).toEqual([6, 3, 2, 1]);
  expect(rowLengths(7)).toEqual([7, 4, 3, 2, 1]);
  expect(rowLengths(2)).toEqual([2, 1]);
});

/**
 * The rows a tray of items of these widths (px) is laid out in at `tray` px wide: the styles'
 * lengths worked out as a stylesheet would, each break that is the full width starting a row.
 */
function rows(widths: number[], tray: number): number[] {
  const { tray: style, breaks } = foldStyles(widths.map((width) => `${width}px`));
  const vars = style as Record<string, string>;
  const evaluate = (css: string): number => {
    let expression = css;
    // Custom properties first (they nest), then units and functions as JavaScript.
    while (/var\(--fold-[a-z0-9]+\)/.test(expression))
      expression = expression.replace(/var\((--fold-[a-z0-9]+)\)/g, (_, name) => vars[name]!);
    expression = expression
      .replace(/100%/g, String(tray))
      .replace(/(\d+(?:\.\d+)?)px/g, "$1")
      .replace(/calc\(/g, "(")
      .replace(/\bmax\(/g, "Math.max(")
      .replace(/\bmin\(/g, "Math.min(");
    return Function(`return ${expression}`)() as number;
  };
  const lengths: number[] = [];
  let length = 1;
  breaks.forEach((style) => {
    if (evaluate(String(style.flexBasis)) >= tray) {
      lengths.push(length);
      length = 1;
    } else length++;
  });
  return [...lengths, length];
}

it("keeps a tray on one row while every item fits, then folds it evenly", () => {
  // Lifting, Running, Cycling, Swimming at 15 px, with their padding.
  const sports = [59, 69, 64, 86];
  expect(rows(sports, 320)).toEqual([4]);
  expect(rows(sports, 284)).toEqual([4]);
  // Too narrow for all four: two and two, not three and Swimming alone.
  expect(rows(sports, 280)).toEqual([2, 2]);
  expect(rows(sports, 160)).toEqual([2, 2]);
  // Too narrow for Cycling beside Swimming: one a row.
  expect(rows(sports, 150)).toEqual([1, 1, 1, 1]);
});

it("folds five as three and two, then two a row with the last alone", () => {
  const spans = [60, 60, 60, 60, 60];
  expect(rows(spans, 320)).toEqual([5]);
  expect(rows(spans, 200)).toEqual([3, 2]);
  expect(rows(spans, 130)).toEqual([2, 2, 1]);
  expect(rows(spans, 100)).toEqual([1, 1, 1, 1, 1]);
});

it("decides by the widest row, so a wide item never runs a row over", () => {
  // Free weight, Plate-loaded, Weight stack, Bodyweight, Cardio on a 360-dp phone.
  const loads = [94, 102, 103, 94, 57];
  expect(rows(loads, 286)).toEqual([2, 2, 1]);
  expect(rows(loads, 320)).toEqual([3, 2]);
});
