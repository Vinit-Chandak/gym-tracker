import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

/**
 * One scheduled session on Today, whatever put it there (plan §2.3).
 *
 * Two sources meet on this card and neither is allowed to pretend to be the other. Work the
 * athlete put on the calendar is here because it is dated today. The programme's own endurance
 * is here because the sequence has reached the day it belongs to — never because its original
 * date happens to be today, which is what showed a run from a day nobody had got to yet
 * (TODAY-01). The caller decides which it is asking for; the card only says so.
 *
 * Strength keeps its own card, drawn by Today from the same sequence. These sit beside it.
 */

function line(occurrence: ScheduledOccurrence): string {
  if (occurrence.prescription) return describePrescription(occurrence.prescription);
  return ACTIVITY_SPORT_LABELS[occurrence.sport];
}

export function OccurrenceCard({
  occurrence,
  meta,
}: {
  /** `preparedByCoach` when the prescription is the coach's preparation for today. */
  occurrence: ScheduledOccurrence & { preparedByCoach?: boolean };
  /** Where this came from, when that is not obvious — the programme day it belongs to. */
  meta?: string | null;
}) {
  const logged = occurrence.resolution.kind === "logged";
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {ACTIVITY_SPORT_LABELS[occurrence.sport]}
          </p>
          <h2 className="mt-1 text-lg font-medium [overflow-wrap:anywhere]">{line(occurrence)}</h2>
          {meta && <p className="mt-1.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{meta}</p>}
          {occurrence.scheduledLocalTime && (
            <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
              {occurrence.scheduledLocalTime.slice(0, 5)}
            </p>
          )}
        </div>
        {occurrence.disposition === "skipped" ? (
          <Badge tone="neutral">Skipped</Badge>
        ) : (
          occurrence.preparedByCoach && <Badge tone="accent">Coach</Badge>
        )}
      </div>
      {logged && occurrence.resolution.kind === "logged" ? (
        <Link
          href={`/training/activities/${occurrence.resolution.activityId}`}
          className="text-sm text-accent"
        >
          See what you logged
        </Link>
      ) : (
        <LinkButton
          href={`/training/new?occurrence=${occurrence.id}`}
          variant="secondary"
          className="w-full"
        >
          Log it
        </LinkButton>
      )}
    </Card>
  );
}

/**
 * What is already answered, out of the way but not gone. Today is about what is left to do,
 * and a run logged at seven this morning is not that — but it is still the proof the day was
 * trained, so it stays one tap away rather than disappearing until History.
 */
export function CompletedOccurrences({
  occurrences,
}: {
  occurrences: readonly ScheduledOccurrence[];
}) {
  if (occurrences.length === 0) return null;
  return (
    <Disclosure summary="Completed" meta={`${occurrences.length}`}>
      <div className="space-y-3">
        {occurrences.map((occurrence) => (
          <OccurrenceCard key={occurrence.id} occurrence={occurrence} />
        ))}
      </div>
    </Disclosure>
  );
}

/**
 * Still owed an answer and able to take one: what Today puts on the page.
 *
 * `loggable` rather than "not logged", so a session the programme withdrew is not offered
 * with a button that leads to a page explaining it was withdrawn. Work nobody can answer any
 * more is not today's business; it is in the programme, with what became of it.
 */
export function isOutstanding(occurrence: ScheduledOccurrence): boolean {
  return occurrence.loggable;
}

/** Answered by a log. Kept on the day it belongs to, behind the disclosure. */
export function isAnswered(occurrence: ScheduledOccurrence): boolean {
  return occurrence.resolution.kind === "logged";
}
