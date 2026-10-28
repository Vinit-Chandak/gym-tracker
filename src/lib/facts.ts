/**
 * Between two facts said on one line ("18:07 · PureGym Shoreditch · Sleep 7.25 h"): the dot is
 * held to the fact after it by a no-break space, so a line that wraps breaks before a dot and
 * the next line starts "· Sleep 7.25 h", rather than the first ending on a dot left alone.
 */
export const FACT_SEPARATOR = " · ";

/** The facts given, those that say something, one after another on a line. */
export function joinFacts(facts: readonly (string | null | undefined | false)[]): string {
  return facts.filter((fact): fact is string => Boolean(fact)).join(FACT_SEPARATOR);
}

/**
 * Units and nouns a figure is held to when it is written as text ("60–75 min", "2 sets", "1–2
 * RIR").
 */
const UNIT =
  /(\d) (?=(?:min|mins|minutes?|h|hrs?|hours?|s|secs?|seconds?|km|mi|m|yd|kg|lb|lbs|kcal|g|reps?|sets?|days?|weeks?|RIR)\b)/g;

/**
 * Figures written as text held whole where a line wraps: a range never breaks at its dash (a
 * word joiner either side of it, U+2060, keeps the en dash itself), and a figure keeps its unit
 * by a no-break space: "60–75 min", "2.6–3.1 km", as "@" and RPE keep the figure after them
 * ("@ 1–2 RIR", "RPE 7"). For what the coach or the athlete wrote, such as a day's time note,
 * and for ranges whose text is kept as it is where it is compared (rangeLabel, a prescription's
 * "3 × 8–12 @ 1–2 RIR"), held only where it is shown; a figure from a shared formatter already
 * keeps its unit.
 */
export function holdFigures(text: string): string {
  return text
    .replace(/(\d)–(?=\d)/g, "$1\u2060–\u2060")
    .replace(UNIT, "$1\u00a0")
    .replace(/(@|\bRPE) (?=\d)/g, "$1\u00a0");
}

/** A word of letters joined by hyphens: "push-up", "Front-foot-elevated". */
const HYPHENATED = /\p{L}+(?:-\p{L}+)+/gu;

/**
 * A name held together at its hyphens ("Archer push-up", "Off-season Hypertrophy"): a word
 * joiner after a hyphen between two letters, so a line breaks between the name's words but
 * never leaves "push-" at a line's end. Only a short compound (ten letters or fewer, "T-bar",
 * "Single-arm") is held whole, and a longer one only at a short tail ("Front-foot"): held
 * whole, "Front-foot-elevated" would be one word too wide for a narrow line at large text, so it
 * may still break at "foot-". The hyphen stays the one the name was written with (a face need
 * not draw a non-breaking hyphen, U+2011, of its own), and a word too long for a line of its own
 * still breaks (overflow-wrap).
 */
export function holdHyphens(name: string): string {
  return name.replace(HYPHENATED, (word) => {
    const [first, ...rest] = word.split("-");
    return rest.reduce(
      (held, part) => `${held}-${word.length <= 10 || part.length <= 4 ? "\u2060" : ""}${part}`,
      first!,
    );
  });
}

/**
 * Whether two texts read the same: a no-break space as a space, the joiners above as nothing,
 * case aside. A name that only repeats the figure beside it ("6 × 800 m" over "6 × 800 m") is
 * said once.
 */
export function readsAs(a: string, b: string): boolean {
  const read = (text: string) =>
    text.replace(/⁠/g, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  return read(a) === read(b);
}
