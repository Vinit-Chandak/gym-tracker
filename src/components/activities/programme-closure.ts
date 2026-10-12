import { holdHyphens } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import type { ProgrammeClosure, ScheduledOccurrence } from "@/server/repositories/occurrences";

/**
 * How a closed session's programme stopped being the athlete's, said plainly and once (ADR
 * 0054): "Strength Maintenance + 2 Runs made way for Hybrid Half Marathon on Mon 6 Jul". It does
 * not say the programme was replaced, or that it ended that day: the next block often starts
 * weeks after the last one finished, and a finished programme is not replaced (the profile's
 * "Start this programme"). A block followed by a new one of the same programme is not said as
 * following itself, and a programme archived with nothing in its place says when it was
 * archived. Without its rows to read, it says only that the programme ended. A date of `year` is
 * said without it.
 */
export function programmeClosureLine(closure: ProgrammeClosure | null, year?: string): string {
  if (!closure) return "Its programme has ended";
  const name = holdHyphens(closure.name);
  const on = formatIsoDate(closure.closedOn, year);
  if (closure.followedBy === null) return `${name} was archived on ${on}`;
  if (closure.followedBy === closure.name)
    return `This block of ${name} made way for a new one on ${on}`;
  return `${name} made way for ${holdHyphens(closure.followedBy)} on ${on}`;
}

/**
 * Whether a session is told by how its programme ended: closed while it was owed or skipped,
 * the two it could otherwise still be logged from. A closed session that was logged, cancelled
 * or completed before the record was kept is told by what became of it, as it always was, so
 * nothing reads its programme's rows for it.
 */
export function showsClosure<
  T extends Pick<ScheduledOccurrence, "closed" | "familyId" | "resolution">,
>(occurrence: T): occurrence is T & { familyId: string } {
  return (
    occurrence.closed &&
    occurrence.familyId !== null &&
    (occurrence.resolution.kind === "incomplete" || occurrence.resolution.kind === "skipped")
  );
}
