import { expect, it } from "vitest";

import { evenLayouts, foldStyles, rowLengths, scaleLayouts } from "./fold";

it("folds to even rows, never one alone under the rest", () => {
  expect(rowLengths(4)).toEqual([4, 2, 1]);
  expect(rowLengths(5)).toEqual([5, 3, 2, 1]);
  expect(rowLengths(6)).toEqual([6, 3, 2, 1]);
  expect(rowLengths(7)).toEqual([7, 4, 3, 2, 1]);
  expect(rowLengths(2)).toEqual([2, 1]);
  expect(evenLayouts(5)).toEqual([[5], [3, 2], [2, 2, 1], [1, 1, 1, 1, 1]]);
});

it("keeps a scale's figures on their row and folds only its words", () => {
  expect(scaleLayouts(5, 0)).toEqual([[5]]);
  expect(scaleLayouts(5, 1)).toEqual([[6], [5, 1]]);
  expect(scaleLayouts(5, 2)).toEqual([[7], [5, 2], [5, 1, 1]]);
});

/** A style's CSS length worked out as a stylesheet would, for a tray `tray` px wide. */
function evaluate(css: string, vars: Record<string, string>, tray: number): number {
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
}

/**
 * The rows a tray of items of these widths (px) is laid out in at `tray` px wide: the styles'
 * lengths worked out as a stylesheet would, each break that is the full width starting a row.
 */
function rows(widths: number[], tray: number, options?: Parameters<typeof foldStyles>[1]) {
  const { tray: style, breaks } = foldStyles(
    widths.map((width) => `${width}px`),
    options,
  );
  const vars = style as Record<string, string>;
  const lengths: number[] = [];
  let length = 1;
  breaks.forEach((style) => {
    if (evaluate(String(style.flexBasis), vars, tray) >= tray) {
      lengths.push(length);
      length = 1;
    } else length++;
  });
  return [...lengths, length];
}

/** Each item's width and its most, as the tray `tray` px wide gives them. */
function sizes(widths: number[], tray: number, options?: Parameters<typeof foldStyles>[1]) {
  const { tray: style, items } = foldStyles(
    widths.map((width) => `${width}px`),
    options,
  );
  const vars = style as Record<string, string>;
  return items.map((item) => ({
    basis: Math.round(evaluate(String(item.flexBasis), vars, tray) * 100) / 100,
    most: Math.round(evaluate(String(item.maxWidth), vars, tray) * 100) / 100,
  }));
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

it("puts Not sure under the five figures, never 4, 5 and Not sure under 1, 2 and 3", () => {
  // 1 to 5 at their 44-pt target, and Not sure at 15 px, with its padding.
  const effort = [44, 44, 44, 44, 44, 72];
  const layouts = scaleLayouts(5, 1);
  // A 390-pt phone: one row.
  expect(rows(effort, 344, { layouts })).toEqual([6]);
  // 320 pt: the five keep their row, and Not sure takes its own.
  expect(rows(effort, 282, { layouts })).toEqual([5, 1]);
  // As recorded as well: both words under the figures, then one a row.
  const kept = [...effort, 96];
  expect(rows(kept, 282, { layouts: scaleLayouts(5, 2) })).toEqual([5, 2]);
  // At 200% text the two words no longer fit one row together.
  expect(rows([...effort.slice(0, 5), 142, 178], 282, { layouts: scaleLayouts(5, 2) })).toEqual([
    5, 1, 1,
  ]);
});

it("folds page tabs into columns of one width, a gap as wide as a page", () => {
  // 1 2 3 4 … 27 at 200% text: 64-pt tabs and an ellipsis.
  const pages = [64, 64, 64, 64, 24, 64];
  // On one row each keeps its own width, and the tabs share what is left.
  expect(rows(pages, 400, { columns: true })).toEqual([6]);
  expect(sizes(pages, 400, { columns: true })[4]).toEqual({ basis: 24, most: 400 });
  // Folded, three columns of one width: 4, … and 27 stand under 1, 2 and 3.
  expect(rows(pages, 344, { columns: true })).toEqual([3, 3]);
  const folded = sizes(pages, 344, { columns: true });
  for (const size of folded) expect(size).toEqual({ basis: 113.28, most: 113.28 });
  // A short last row keeps to the columns above it.
  expect(rows([64, 64, 64, 64, 64], 300, { columns: true })).toEqual([3, 2]);
  expect(sizes([64, 64, 64, 64, 64], 300, { columns: true }).at(-1)!.most).toBeLessThan(100);
  // A column is as wide as the widest item, so the tray folds by it.
  expect(rows([40, 40, 40, 90], 150, { columns: true })).toEqual([1, 1, 1, 1]);
  expect(rows([40, 40, 40, 90], 150)).toEqual([2, 2]);
});
