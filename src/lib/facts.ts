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
