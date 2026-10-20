import type { Route } from "next";

import { enduranceName } from "@/components/activities/endurance-line";
import { NavRow } from "@/components/ui/nav-row";
import { joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import type { NamedOccurrence } from "@/server/repositories/occurrences";

/**
 * The scheduled session an activity answered, as its Counts as row names it: its day's name,
 * else its sport, and the day it was planned for ("Tempo run · Thu 20 Aug"). The planned day is
 * said because a run done late is still that day's run: it is how a run on 31 August answers a
 * programme whose dates ran out on the 23rd, the sequence having waited for it.
 */
export function answeredName(session: NamedOccurrence, year: string): string {
  return joinFacts([
    session.dayName ?? enduranceName(session.sport),
    formatIsoDate(session.scheduledOn, year),
  ]);
}

/**
 * What a logged run, ride or swim counts as, in one ruled row (Information map: its page ›
 * Counts as): the session it answered, or Unplanned, opening Counts as, where it can change and
 * where the session it answers opens its page. It said "This answered Tempo run, cycle 10,
 * planned for Thu 20 Aug." over a second line offering to change it: two lines for one fact.
 * Without Counts as to open (its session's programme has ended, ADR 0054), it opens the session.
 */
export function CountsAsRow({ value, href }: { value: string; href: Route | null }) {
  return (
    <ul className="mt-3 ruled-list">
      <NavRow href={href ?? undefined} label="Counts as" value={value} />
    </ul>
  );
}
