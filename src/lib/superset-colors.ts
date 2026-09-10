import type { CSSProperties } from "react";

/**
 * Supersets are told apart by colour, not by a label. The theme carries eight group hues,
 * each validated on both canvases and kept clear of the copper accent, and a workout's
 * groups take them in order of first appearance: the first superset in any workout is
 * always hue 1, so the same workout looks the same every time it is opened.
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
