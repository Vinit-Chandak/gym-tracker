import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { HeroCard } from "@/components/ui/hero-card";
import { ChevronRight } from "@/components/ui/icons";
import { SPORT_ICON, SportChip } from "@/components/ui/sport-chip";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { SPORT_TONE } from "@/lib/sport-tone";
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
 * Strength keeps its own card, drawn by Today from the same sequence. These sit beside it,
 * each in its sport's colour: the whole card when it is the day's main event, a soft chip and
 * button when it is not.
 */

function line(occurrence: ScheduledOccurrence): string {
  if (occurrence.prescription) return describePrescription(occurrence.prescription);
  return ACTIVITY_SPORT_LABELS[occurrence.sport];
}

type Occurrence = ScheduledOccurrence & { preparedByCoach?: boolean };

export function OccurrenceCard({
  occurrence,
  meta,
  hero = false,
}: {
  /** `preparedByCoach` when the prescription is the coach's preparation for today. */
  occurrence: Occurrence;
  /** Where this came from, when that is not obvious — the programme day it belongs to. */
  meta?: string | null;
  /** The day's main event: drawn filled with its sport's colour, its figure in display type. */
  hero?: boolean;
}) {
  const tone = SPORT_TONE[occurrence.sport];
  const time = occurrence.scheduledLocalTime?.slice(0, 5) ?? null;
  const badge =
    occurrence.disposition === "skipped" ? (
      <Badge tone="neutral">Skipped</Badge>
    ) : (
      occurrence.preparedByCoach && <Badge tone="accent">Coach</Badge>
    );
  const logHref = `/training/new?occurrence=${occurrence.id}` as const;

  if (hero) {
    const Icon = SPORT_ICON[occurrence.sport];
    return (
      <HeroCard tone={tone}>
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-h-7 items-center gap-2 text-sm font-semibold text-ink-muted tabular-nums">
            <Icon aria-hidden />
            {ACTIVITY_SPORT_LABELS[occurrence.sport]}
            {time ? `, ${time}` : ""}
          </p>
          {badge}
        </div>
        <div>
          <h2 className="font-display text-display-l [overflow-wrap:anywhere]">
            {line(occurrence)}
          </h2>
          {meta && <p className="mt-1 text-[0.9375rem] text-ink-muted">{meta}</p>}
        </div>
        {occurrence.resolution.kind === "logged" ? (
          <LinkButton
            href={`/training/activities/${occurrence.resolution.activityId}`}
            size="lg"
            className="w-full"
          >
            See what you logged
          </LinkButton>
        ) : (
          <LinkButton href={logHref} size="lg" className="w-full">
            Log it
          </LinkButton>
        )}
      </HeroCard>
    );
  }

  // Beside the day's main card, one line each: the sport, what it asks for, and the button.
  return (
    <Card className="flex items-center gap-3 space-y-0 py-4">
      <SportChip sport={occurrence.sport} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted tabular-nums">
          {ACTIVITY_SPORT_LABELS[occurrence.sport]}
          {time ? `, ${time}` : ""}
        </p>
        <h2 className="text-[1.0625rem] leading-snug font-semibold [overflow-wrap:anywhere]">
          {line(occurrence)}
        </h2>
        {meta && <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{meta}</p>}
        {badge && <div className="mt-1.5 flex">{badge}</div>}
      </div>
      {occurrence.resolution.kind === "logged" ? (
        <Link
          href={`/training/activities/${occurrence.resolution.activityId}`}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-accent"
        >
          See what you logged
        </Link>
      ) : (
        <LinkButton href={logHref} variant="secondary" tone={tone} size="sm" className="shrink-0">
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
      <ul className="-mx-1 space-y-1">
        {occurrences.map((occurrence) => (
          <li key={occurrence.id}>
            <CompletedRow occurrence={occurrence} />
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

/** One answered session: its sport, what it was, and the way to what was logged. */
function CompletedRow({ occurrence }: { occurrence: ScheduledOccurrence }) {
  const content = (
    <>
      <SportChip sport={occurrence.sport} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold [overflow-wrap:anywhere]">{line(occurrence)}</span>
        <span className="block text-sm text-ink-muted">
          {ACTIVITY_SPORT_LABELS[occurrence.sport]}
          {occurrence.resolution.kind === "logged" ? ", see what you logged" : ""}
        </span>
      </span>
    </>
  );
  if (occurrence.resolution.kind !== "logged") {
    return <div className="flex min-h-14 items-center gap-3 px-1 py-2">{content}</div>;
  }
  return (
    <Link
      href={`/training/activities/${occurrence.resolution.activityId}`}
      className="flex min-h-14 pressable items-center gap-3 rounded-tile px-1 py-2 active:bg-surface-raised"
    >
      {content}
      <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
    </Link>
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
