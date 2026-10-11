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

/**
 * Atkinson Hyperlegible Next Bold's advance widths, in thousandths of an em as Chromium sets
 * them, glyph by glyph in the order of `BOLD_GLYPHS`: what a control's words need, known before
 * the page has measured anything.
 */
const BOLD_GLYPHS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789  -.,:#()'’×/+%–—…";
const BOLD_WIDTHS = [
  552, 596, 496, 596, 563, 376, 593, 571, 300, 292, 555, 309, 882, 571, 577, 596, 599, 385, 508,
  376, 567, 553, 763, 563, 544, 506, 700, 643, 644, 689, 597, 566, 718, 701, 425, 561, 664, 552,
  858, 717, 747, 629, 757, 650, 610, 621, 686, 662, 894, 685, 685, 618, 659, 440, 579, 600, 633,
  604, 626, 564, 624, 571, 313, 313, 373, 272, 271, 272, 765, 335, 335, 210, 269, 536, 321, 595,
  969, 501, 832, 781,
];

/** How wide `text` is in Atkinson Hyperlegible Next Bold, in em; an unlisted glyph counts 0.9. */
export function boldEmWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    const index = BOLD_GLYPHS.indexOf(ch);
    em += index < 0 ? 0.9 : BOLD_WIDTHS[index]! / 1000;
  }
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
 * smaller and two lines (Jost 700 at about 0.52 em a character). A size is kept only while the
 * longest word fits a line of its own, measured more widely (0.56 em, a word's letters having
 * no spaces to average with), so a one-word name such as "Leaderboard" steps down rather than
 * breaking inside the word at large text.
 */
export function titleSize(name: string, available: number, base: number, min = 26): number {
  const word = Math.max(0, ...name.split(/\s+/).map((part) => part.length));
  for (const size of [base, base - 4])
    if (name.length * size * 0.52 <= available && word * size * 0.56 <= available) return size;
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
