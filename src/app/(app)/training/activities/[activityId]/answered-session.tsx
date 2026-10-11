import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { formatIsoDate } from "@/lib/format";
import type { NamedOccurrence } from "@/server/repositories/occurrences";

const NOUN = { strength: "session", running: "run", cycling: "ride", swimming: "swim" } as const;

/** A link set in the meta line: ink and underlined, never a pigment (DESIGN.md). */
const LINK = "tap-area font-bold underline underline-offset-4";

/**
 * Which scheduled session an activity answered, named and one tap from it: "This answered
 * Tempo run, cycle 10, planned for Thu 20 Aug." It used to say only that it answered "a
 * scheduled session", which named nothing and led nowhere. The planned day is said because a
 * run done late is still that day's run: it is how a run on 31 August answers a programme whose
 * dates ran out on the 23rd, the sequence having waited for it.
 */
export function AnsweredSession({ session, year }: { session: NamedOccurrence; year: string }) {
  const href = `/training/programme/occurrences/${session.id}` as Route;
  const noun = NOUN[session.sport];
  const on = formatIsoDate(session.scheduledOn, year);
  return (
    <p className="mt-3 type-meta text-ink-2">
      This answered{" "}
      {session.familyId === null ? (
        <>
          <Link href={href} className={LINK}>
            the {noun} you scheduled
          </Link>{" "}
          for {on}.
        </>
      ) : (
        <>
          <Link href={href} className={LINK}>
            {session.dayName ?? `the programme's ${noun}`}
          </Link>
          {session.dayName && session.cycleIndex !== null ? `, cycle ${session.cycleIndex},` : ""}{" "}
          planned for {on}.
        </>
      )}
    </p>
  );
}
