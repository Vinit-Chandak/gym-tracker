import type { CSSProperties } from "react";

/**
 * Supersets are told apart by a letter, as a gym writes them: A1 and A2 are done back to
 * back, then B1 and B2. Colour on screen means a sport (decision 0041), so a group is drawn
 * as a neutral bracket and named by its letter rather than given a hue of its own. A
 * workout's groups take their letters in order of first appearance: the first superset in
 * any workout is always A, so the same workout reads the same every time it is opened.
 *
 * The "hue" is the group's position, kept under that name for the theme's eight group
 * tokens, which charts that compare groups still use.
 */
export const SUPERSET_HUE_COUNT = 8;

export type SupersetHue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Group name → hue, for rows that carry a group in the order they are listed. */
export function supersetHues(
  rows: readonly { supersetGroup: string | null }[],
): Map<string, SupersetHue> {
  const hues = new Map<string, SupersetHue>();
  for (const row of rows) {
    const group = row.supersetGroup;
    if (group === null || hues.has(group)) continue;
    hues.set(group, ((hues.size % SUPERSET_HUE_COUNT) + 1) as SupersetHue);
  }
  return hues;
}

/** The CSS custom property for a hue, resolved by the theme for the current mode. */
export function supersetColor(hue: SupersetHue): string {
  return `var(--ov-group-${hue})`;
}

/** Inline style for a `superset-row`: hands the hue to the CSS rule that draws it. */
export function supersetStyle(hue: SupersetHue): CSSProperties {
  return { "--superset-color": supersetColor(hue) } as CSSProperties;
}

/** The group's letter: A for the first superset in the list, B for the second. */
export function supersetLetter(hue: SupersetHue): string {
  return String.fromCharCode(64 + hue);
}

/**
 * "A1", "A2", "B1": each grouped row's label, in list order, keyed by its index in `rows`.
 * Ungrouped rows have no label.
 */
export function supersetLabels(
  rows: readonly { supersetGroup: string | null }[],
): Map<number, string> {
  const hues = supersetHues(rows);
  const counts = new Map<string, number>();
  const labels = new Map<number, string>();
  rows.forEach((row, index) => {
    const group = row.supersetGroup;
    const hue = group === null ? undefined : hues.get(group);
    if (group === null || hue === undefined) return;
    const position = (counts.get(group) ?? 0) + 1;
    counts.set(group, position);
    labels.set(index, `${supersetLetter(hue)}${position}`);
  });
  return labels;
}
