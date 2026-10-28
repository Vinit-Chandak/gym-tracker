/**
 * The Figures Never Truncate Rule (DESIGN.md, Typography): a figure keeps one line and steps
 * down the type ramp until it fits, never to a size in between, so a narrow screen shows the
 * same few sizes as a wide one. Sizes here are the ramp's, at 100% text.
 */
export const RAMP = [12, 13, 14, 15, 16, 17, 20, 26, 28, 30, 32, 34, 36, 42, 56] as const;

/** The largest step of the ramp at or under `px`. */
export function onRamp(px: number): number {
  return RAMP.filter((step) => step <= px).at(-1) ?? RAMP[0];
}

/**
 * A figure's width in em: Host Grotesk's digits are 0.65 em, its point, comma and colon 0.224,
 * at every weight (the face sets each weight to one width).
 */
export function emWidth(text: string): number {
  let em = 0;
  for (const ch of text)
    em += /[0-9]/.test(ch)
      ? 0.65
      : /[.,:]/.test(ch)
        ? 0.224
        : ch === " "
          ? 0.307
          : ch === "–"
            ? 0.691
            : ch === "—"
              ? 0.855
              : ch === "-"
                ? 0.49
                : 0.6;
  return em;
}

/**
 * Host Grotesk's advance widths, in thousandths of an em as Chromium sets them, glyph by glyph
 * in the order of `GLYPHS`: what a control's words or a list's line need, known before the page
 * has measured anything. One table serves every weight, since the face gives each the same
 * width (owner, 28 October 2026: one face for every word, heading and figure).
 */
const GLYPHS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \u00a0-.,:#()'’×/+%–—…·@_";
const WIDTHS = [
  555, 602, 548, 602, 557, 334, 620, 569, 212, 207, 530, 212, 899, 569, 576, 602, 602, 381, 495,
  355, 538, 552, 806, 566, 590, 465, 674, 597, 705, 685, 539, 523, 733, 675, 234, 401, 630, 521,
  855, 691, 760, 589, 789, 640, 607, 587, 634, 710, 1012, 637, 642, 542, 650, 650, 650, 650, 650,
  650, 650, 650, 650, 650, 307, 307, 490, 224, 222, 224, 800, 385, 385, 200, 266, 590, 470, 590,
  859, 691, 855, 565, 224, 894, 671,
];

/** How wide `text` is in Host Grotesk, in em, at any weight; an unlisted glyph counts 0.9. */
export function textEmWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    const at = GLYPHS.indexOf(ch);
    em += at < 0 ? 0.9 : WIDTHS[at]! / 1000;
  }
  return em;
}

/** How wide a control's words are (a tab, a segment, a summary): the face's one width. */
export const boldEmWidth = textEmWidth;

/** A run of figures in a line of words: "3,113,528", "27.5", "4:32". */
export const FIGURE_RUN = /(\d+(?:[.,:]\d+)*)/;

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
 * smaller and two lines (Host Grotesk 700 at about 0.5 em a character). A size is kept only
 * while the longest word fits a line of its own, measured more widely (0.55 em, a word's letters
 * having no spaces to average with), so a one-word name such as "Leaderboard" steps down rather
 * than breaking inside the word at large text.
 */
export function titleSize(name: string, available: number, base: number, min = 22): number {
  const word = Math.max(0, ...name.split(/\s+/).map((part) => part.length));
  for (const size of [base, base - 4])
    if (name.length * size * 0.5 <= available && word * size * 0.55 <= available) return size;
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
