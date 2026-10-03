import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { FigureText } from "@/components/ui/figure-text";
import { Glyph } from "@/components/ui/glyphs";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { enduranceName, enduranceNote, enduranceTarget } from "./endurance-line";
import { cn } from "@/lib/utils";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

/**
 * One scheduled session on Today, whatever put it there (plan §2.3), as a row of the day's
 * list (DESIGN.md, Today): its name and what it asks for, its note under them, and Log it.
 *
 * Two sources meet here and neither is allowed to pretend to be the other. Work the athlete put
 * on the calendar is here because it is dated today. The programme's own endurance is here
 * because the sequence has reached the day it belongs to — never because its original date
 * happens to be today, which is what showed a run from a day nobody had got to yet (TODAY-01).
 * The caller decides which it is asking for; the row only says so.
 */
export function OccurrenceRow({
  occurrence,
  meta,
  last = false,
}: {
  /** `preparedByCoach` when the prescription is the coach's preparation for today. */
  occurrence: ScheduledOccurrence & { preparedByCoach?: boolean };
  /** Where this came from, when that is not obvious: the programme day it belongs to. */
  meta?: string | null;
  last?: boolean;
}) {
  const logged = occurrence.resolution.kind === "logged";
  const skipped = occurrence.disposition === "skipped";
  const target = enduranceTarget(occurrence.prescription);
  const note = enduranceNote(occurrence.prescription);
  const name =
    occurrence.sport === "strength"
      ? ACTIVITY_SPORT_LABELS.strength
      : enduranceName(occurrence.sport);
  const second = [
    note,
    meta,
    occurrence.scheduledLocalTime ? occurrence.scheduledLocalTime.slice(0, 5) : null,
  ].filter(Boolean);
  return (
    <li className={cn("plan-row today-endurance", last && "plan-row-last")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              "text-[length:var(--ov-type-heading)] font-bold",
              skipped && "text-ink-2",
            )}
          >
            {name}
          </span>
          {target ? (
            <span className="whitespace-nowrap">
              <span className="type-figure">
                <FigureText>{target.figure}</FigureText>
              </span>{" "}
              <span className="type-meta-small font-semibold text-ink-2">{target.unit}</span>
            </span>
          ) : (
            occurrence.prescription && (
              <span className="type-meta-small text-ink-2">
                {describePrescription(occurrence.prescription)}
              </span>
            )
          )}
        </span>
        {second.length > 0 && (
          <span className="mt-0.5 type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums">
            {second.join(" · ")}
          </span>
        )}
        {occurrence.preparedByCoach && !skipped && (
          <span className="mt-0.5 flex items-center gap-1.5 type-meta-small text-ink-2">
            <Glyph name="coach" className="glyph-14" />
            Prepared by the coach
          </span>
        )}
      </span>
      {skipped ? (
        <span className="shrink-0 type-meta-small font-semibold text-ink-2">Skipped</span>
      ) : logged && occurrence.resolution.kind === "logged" ? (
        <Link
          href={`/training/activities/${occurrence.resolution.activityId}`}
          className="flex min-h-11 shrink-0 items-center gap-1 type-meta-small font-bold"
        >
          See what you logged
          <Glyph name="chevronRight" className="glyph-16" />
        </Link>
      ) : (
        <LinkButton
          href={`/training/new?occurrence=${occurrence.id}`}
          variant="tonal"
          className="shrink-0"
        >
          Log it
        </LinkButton>
      )}
    </li>
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
      <ul>
        {occurrences.map((occurrence, index) => (
          <OccurrenceRow
            key={occurrence.id}
            occurrence={occurrence}
            last={index === occurrences.length - 1}
          />
        ))}
      </ul>
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
