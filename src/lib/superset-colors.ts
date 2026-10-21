import type { CSSProperties } from "react";

/**
 * A workout's superset groups, numbered in order of first appearance: the first superset in
 * any workout is always group 1, so the same workout reads the same every time it is opened.
 * Form v2 draws every group in ink (DESIGN.md: a superset is a bracket in ink, not a hue), so
 * the theme resolves all eight group colours to ink; the numbering is kept for the rows and
 * any theme that tells groups apart.
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
