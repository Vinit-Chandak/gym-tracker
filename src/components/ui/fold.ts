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

/**
 * Fold, Never Drop, evenly (DESIGN.md, Segmented): a tray of segments on one row while their
 * words fit, else on as few even rows as fit, never three on a row and one alone under it.
 *
 * `widths` are what each item needs on a row, as CSS lengths (its words and padding, at least a
 * target). The tray's own width decides, at any text size and before the page wakes, by
 * comparisons a stylesheet can make: each break between two items is a zero-height flex item
 * that is the full width (and so starts a row) only while the tray is narrower than the row
 * length before it needs and at least as wide as its own row length needs. The items keep their
 * own widths on every row.
 *
 * Returns the tray's style (the row lengths' widths, as custom properties) and, for each gap
 * between two items, the style of the break that stands in it.
 */
export function foldStyles(
  widths: readonly string[],
  gap = "2px",
): { tray: CSSProperties; breaks: CSSProperties[] } {
  const count = widths.length;
  const lengths = rowLengths(count);
  const tray: Record<string, string> = {};
  widths.forEach((width, index) => (tray[`--fold-w${index}`] = width));
  // What a row length needs: its widest row, the items and the gaps between them.
  for (const length of lengths) {
    const rows: string[] = [];
    for (let start = 0; start < count; start += length) {
      const items = widths.slice(start, start + length).map((_, i) => `var(--fold-w${start + i})`);
      rows.push(`calc(${items.join(" + ")} + ${items.length - 1} * ${gap})`);
    }
    tray[`--fold-r${length}`] = rows.length === 1 ? rows[0]! : `max(${rows.join(", ")})`;
  }
  const need = (length: number) => `var(--fold-r${length})`;
  // A break after item `after` (1-based) starts a row under every row length that divides it.
  const breaks = Array.from({ length: count - 1 }, (_, index) => {
    const after = index + 1;
    const terms: string[] = [];
    lengths.forEach((length, level) => {
      if (level === 0 || after % length !== 0) return;
      // Too narrow for every longer row; wide enough for this one (or the last, one a row).
      const longer = lengths.slice(0, level).map(need);
      const under = longer.length === 1 ? longer[0]! : `min(${longer.join(", ")})`;
      const conditions = [`max((${under} - 100%) * 9999, 0px)`];
      if (level < lengths.length - 1)
        conditions.push(`max((100% - ${need(length)} + 0.1px) * 9999, 0px)`);
      terms.push(`min(${conditions.join(", ")}, 100%)`);
    });
    return { flexBasis: terms.length === 0 ? "0px" : `max(0px, ${terms.join(", ")})` };
  });
  return { tray: tray as CSSProperties, breaks };
}
