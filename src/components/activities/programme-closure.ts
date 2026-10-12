import { holdHyphens } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import type { ProgrammeClosure } from "@/server/repositories/occurrences";

/**
 * How a closed session's programme stopped being the athlete's, said plainly and once (ADR
 * 0054): "Strength Maintenance + 2 Runs was replaced by Hybrid Half Marathon on Mon 6 Jul". A
 * block replaced by a new one of the same programme is not said as replacing itself, and a
 * programme archived with nothing in its place says when it was archived. Without its rows to
 * read, it says only that the programme ended. A date of `year` is said without it.
 */
export function programmeClosureLine(closure: ProgrammeClosure | null, year?: string): string {
  if (!closure) return "Its programme has ended";
  const name = holdHyphens(closure.name);
  const on = formatIsoDate(closure.closedOn, year);
  if (closure.replacedBy === null) return `${name} was archived on ${on}`;
  if (closure.replacedBy === closure.name)
    return `This block of ${name} was replaced by a new one on ${on}`;
  return `${name} was replaced by ${holdHyphens(closure.replacedBy)} on ${on}`;
}
