import type { CSSProperties } from "react";

/**
 * How many to a row a tray of `count` folds to, widest first: all of them, then as many as
 * leave every row but the last full and the rows as even as they can be (four as two and two,
 * five as three and two, seven as four and three), down to one a row.
 */
export function rowLengths(count: number): number[] {
  const lengths: number[] = [];
  for (let rows = 1; rows <= count; rows++) {
    const length = Math.ceil(count / rows);
    if (lengths.at(-1) !== length) lengths.push(length);
  }
  return lengths;
}

/** The layouts a tray of `count` tries by default: its rows' lengths at each of `rowLengths`. */
export function evenLayouts(count: number): number[][] {
  return rowLengths(count).map((length) =>
    Array.from({ length: Math.ceil(count / length) }, (_, row) =>
      Math.min(length, count - row * length),
    ),
  );
}

/**
 * The layouts a tray of segments tries: the even ones, save any that leaves one segment alone
 * under fuller rows. Page tabs keep a short last row to their columns; a segment alone takes
 * the tray's whole width, so Cardio stood stretched under two rows of two like another kind of
 * control. Five that cannot go three and two go one a row, and three that cannot share a row
 * go one a row too.
 */
export function segmentLayouts(count: number): number[][] {
  return evenLayouts(count).filter((rows) => rows.at(-1)! > 1 || rows[0] === 1);
}

/**
 * The layouts of an ordinal scale (DESIGN.md, Segmented): its figures and then any words, such
 * as Not sure. Every one on a row while they fit; else the figures keep their row, columns of
 * one width, and the words go under them together, then one a row. The figures never fold:
 * five of them hold a row at 320 pt and 200% text (ADR 0052).
 */
export function scaleLayouts(figures: number, words: number): number[][] {
  if (words === 0) return [[figures]];
  return [
    [figures + words],
    [figures, words],
    ...(words > 1 ? [[figures, ...Array.from({ length: words }, () => 1)]] : []),
  ];
}

type FoldOptions = {
  /** Between two items, across and down. */
  gap?: string;
  /** The rows' lengths to try, widest first; even rows by default (`evenLayouts`). */
  layouts?: readonly (readonly number[])[];
  /**
   * Folded, every item takes one column's width, so the rows line up as a grid ("1 2 3 / 4 …
   * 28" with the gap as wide as a page) and a short last row keeps to the columns above it. A
   * column is the widest item's, so a tray folds a row sooner than it would unevenly.
   */
  columns?: boolean;
};

/**
 * Fold, Never Drop, evenly (DESIGN.md, Segmented): a tray of segments on one row while their
 * words fit, else on as few even rows as fit (`layouts`): segments never leave one alone under
 * the rest (`segmentLayouts`), and page tabs keep a short last row to their columns.
 *
 * `widths` are what each item needs on a row, as CSS lengths (its words and padding, at least a
 * target). The tray's own width decides, at any text size and before the page wakes, by
 * comparisons a stylesheet can make: each break between two items is a zero-height flex item
 * that is the full width (and so starts a row) only while the tray is narrower than every
 * layout before it needs and at least as wide as its own layout needs. Without `columns` the
 * items keep their own widths on every row.
 *
 * Returns the tray's style (each layout's width, as custom properties), for each gap between
 * two items the style of the break that stands in it, and with `columns` each item's own style
 * (its width on one row, a column's where the tray folds).
 */
export function foldStyles(
  widths: readonly string[],
  { gap = "2px", layouts: given, columns = false }: FoldOptions = {},
): { tray: CSSProperties; breaks: CSSProperties[]; items: CSSProperties[] } {
  const count = widths.length;
  const layouts = given ?? evenLayouts(count);
  const tray: Record<string, string> = {};
  widths.forEach((width, index) => (tray[`--fold-w${index}`] = width));
  const all = widths.map((_, index) => `var(--fold-w${index})`);
  const widest = all.length === 1 ? all[0]! : `max(${all.join(", ")})`;
  // Where each layout's rows end (after which item, 1-based), and a column's width in it.
  const ends = layouts.map((rows) => rows.map((_, row) => sum(rows.slice(0, row + 1))));
  const most = (rows: readonly number[]) => Math.max(...rows);
  const column = (rows: readonly number[]) =>
    `calc((100% - ${most(rows) - 1} * ${gap}) / ${most(rows)} - 0.05px)`;
  // What a layout needs: its widest row, the items and the gaps between them; folded into
  // columns, as many of the widest item as its longest row holds.
  layouts.forEach((rows, layout) => {
    if (columns && rows.length > 1) {
      tray[`--fold-r${layout}`] = `calc(${most(rows)} * ${widest} + ${most(rows) - 1} * ${gap})`;
      return;
    }
    const needs = rows.map((length, row) => {
      const start = (ends[layout]![row] ?? 0) - length;
      const items = all.slice(start, start + length);
      return `calc(${items.join(" + ")} + ${items.length - 1} * ${gap})`;
    });
    tray[`--fold-r${layout}`] = needs.length === 1 ? needs[0]! : `max(${needs.join(", ")})`;
  });
  const need = (layout: number) => `var(--fold-r${layout})`;
  // Whether a layout is the one laid out: a length that is huge where it is and nothing where
  // it is not. Too narrow for every layout before it; wide enough for this one (or the last).
  const when = (layout: number): string[] => {
    const conditions: string[] = [];
    if (layout > 0) {
      const before = layouts.slice(0, layout).map((_, earlier) => need(earlier));
      const under = before.length === 1 ? before[0]! : `min(${before.join(", ")})`;
      conditions.push(`max((${under} - 100%) * 9999, 0px)`);
    }
    if (layout < layouts.length - 1)
      conditions.push(`max((100% - ${need(layout)} + 0.1px) * 9999, 0px)`);
    return conditions;
  };
  // `value` in the layouts `which` picks, else nothing.
  const pick = (which: (layout: number) => string | null, otherwise: string) => {
    const terms: string[] = [];
    layouts.forEach((_, layout) => {
      const value = which(layout);
      if (value === null) return;
      const conditions = when(layout);
      terms.push(conditions.length === 0 ? value : `min(${[...conditions, value].join(", ")})`);
    });
    return terms.length === 0 ? otherwise : `max(${otherwise}, ${terms.join(", ")})`;
  };
  // A break after item `after` (1-based) starts a row in every layout with a row ending there.
  const breaks = Array.from({ length: count - 1 }, (_, index) => ({
    flexBasis: pick((layout) => (ends[layout]!.includes(index + 1) ? "100%" : null), "0px"),
  }));
  const items = widths.map((_, index) =>
    columns
      ? {
          flexBasis: pick(
            (layout) =>
              layouts[layout]!.length > 1 ? column(layouts[layout]!) : `var(--fold-w${index})`,
            "0px",
          ),
          maxWidth: pick(
            (layout) => (layouts[layout]!.length > 1 ? column(layouts[layout]!) : "100%"),
            "0px",
          ),
        }
      : {},
  );
  return { tray: tray as CSSProperties, breaks, items };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
