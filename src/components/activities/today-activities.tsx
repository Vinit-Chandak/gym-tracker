import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Bicycle, Dumbbell, Run, Waves, type AppIcon } from "@/components/ui/icons";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

/**
 * One scheduled session on Today, whatever put it there (plan §2.3).
 *
 * Two sources meet on this row and neither is allowed to pretend to be the other. Work the
 * athlete put on the calendar is here because it is dated today. The programme's own endurance
 * is here because the sequence has reached the day it belongs to — never because its original
 * date happens to be today. The caller decides which it is asking for; the row only says so.
 *
 * Strength keeps its own block, drawn by Today from the same sequence. These sit beside it.
 */

const SPORT_ICONS: Record<ScheduledOccurrence["sport"], AppIcon> = {
  strength: Dumbbell,
  running: Run,
  cycling: Bicycle,
  swimming: Waves,
};

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
  const Icon = SPORT_ICONS[occurrence.sport];
  const detail = [
    ACTIVITY_SPORT_LABELS[occurrence.sport],
    occurrence.scheduledLocalTime ? occurrence.scheduledLocalTime.slice(0, 5) : null,
    meta,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="box space-y-3 py-4">
      <div className="flex items-start gap-3">
        <Icon scale="row" className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{line(occurrence)}</h2>
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
            {detail}
          </p>
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
          className="inline-flex min-h-11 items-center text-sm font-medium text-pen"
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
    </section>
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
