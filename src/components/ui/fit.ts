/**
 * The Figures Never Truncate Rule (DESIGN.md, Typography): a figure keeps one line and steps
 * down the type ramp until it fits, never to a size in between, so a narrow screen shows the
 * same few sizes as a wide one. Sizes here are the ramp's, at 100% text.
 */
export const RAMP = [12, 13, 14, 15, 16, 17, 20, 26, 28, 32, 34, 36, 42, 56] as const;

/** The largest step of the ramp at or under `px`. */
export function onRamp(px: number): number {
  return RAMP.filter((step) => step <= px).at(-1) ?? RAMP[0];
}

/** A figure's width in em: Jost 600's tabular digits are 0.614 em, its point and comma 0.32. */
export function emWidth(text: string): number {
  let em = 0;
  for (const ch of text)
    em += /[0-9]/.test(ch)
      ? 0.614
      : /[.,:]/.test(ch)
        ? 0.32
        : ch === " "
          ? 0.25
          : /[–—-]/.test(ch)
            ? 0.5
            : 0.6;
  return em;
}

/** The ramp step at which the widest of `texts` fits `available` points, between min and max. */
export function fitFigure(
  texts: readonly string[],
  available: number,
  { max, min }: { max: number; min: number },
): number {
  const widest = Math.max(1e-6, ...texts.map(emWidth));
  return onRamp(Math.max(min, Math.min(max, Math.floor(available / widest))));
}

/**
 * A title steps down for a long name before it wraps: one line at its size or 4 under, else
 * smaller and two lines (Jost 700 at about 0.52 em a character).
 */
export function titleSize(name: string, available: number, base: number, min = 26): number {
  for (const size of [base, base - 4]) if (name.length * size * 0.52 <= available) return size;
  return Math.max(min, base - 8);
}

/**
 * How much larger than at 100% text a role is drawn now: its share k of the growth of the root
 * font (DESIGN.md's ramp grows words by 1, figures by ½, the log by ¼ and titles by ¾).
 */
export function growth(k: number): number {
  if (typeof document === "undefined") return 1;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return 1 - k + (k * root) / 16;
}

/**
 * A ramp size as a CSS length that grows with the reader's text by its role's share k, so a
 * size chosen at 100% stays in proportion at 200%.
 */
export function rampSize(px: number, k: number): string {
  return `calc(${px * (1 - k)}px + ${(px * k) / 16}rem)`;
}
