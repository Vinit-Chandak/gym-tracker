import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Section } from "@/components/ui/section";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

/**
 * Today's scheduled endurance work (plan §2.3).
 *
 * Exactly what is dated today, each card with its own state and its own action. Two swims on
 * one day are two cards. Nothing earlier appears here: a Wednesday swim that was not done is
 * still Wednesday's, and it is found in the programme rather than piling onto Friday
 * (TODAY-01). Ad hoc work never appears at all — it was not scheduled, so there is nothing
 * here for it to be the answer to.
 *
 * Strength keeps its own card, drawn by Today from its own flexible sequence. These sit
 * beside it without touching it.
 */

function line(occurrence: ScheduledOccurrence): string {
  if (occurrence.prescription) return describePrescription(occurrence.prescription);
  return ACTIVITY_SPORT_LABELS[occurrence.sport];
}

function OccurrenceCard({ occurrence }: { occurrence: ScheduledOccurrence }) {
  const logged = occurrence.resolution.kind === "logged";
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {ACTIVITY_SPORT_LABELS[occurrence.sport]}
          </p>
          <h2 className="mt-1 text-lg font-medium [overflow-wrap:anywhere]">{line(occurrence)}</h2>
          {occurrence.scheduledLocalTime && (
            <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
              {occurrence.scheduledLocalTime.slice(0, 5)}
            </p>
          )}
        </div>
        {occurrence.disposition === "skipped" && <Badge tone="neutral">Skipped</Badge>}
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

export function TodayActivities({ occurrences }: { occurrences: readonly ScheduledOccurrence[] }) {
  if (occurrences.length === 0) return null;
  const outstanding = occurrences.filter((occurrence) => occurrence.resolution.kind !== "logged");
  const done = occurrences.filter((occurrence) => occurrence.resolution.kind === "logged");

  return (
    <Section title="Scheduled today">
      {outstanding.map((occurrence) => (
        <OccurrenceCard key={occurrence.id} occurrence={occurrence} />
      ))}
      {done.length > 0 && (
        <Disclosure summary="Completed" meta={`${done.length}`}>
          <div className="space-y-3">
            {done.map((occurrence) => (
              <OccurrenceCard key={occurrence.id} occurrence={occurrence} />
            ))}
          </div>
        </Disclosure>
      )}
    </Section>
  );
}
