import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { ChevronRight } from "@/components/ui/icons";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { cn } from "@/lib/utils";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

import { SPORT_ICONS } from "./sport-icons";

/**
 * One scheduled session as a row of the sheet: the sport's glyph in the margin, the target in
 * the data voice ("5 km", "8 × 50 m") or the sport's name when nothing was asked for, and one
 * line under it saying which sport and when. What can be done about it sits at the trailing
 * edge: a ruled "Log it" while it still waits, the pen word to what answered it once it is
 * logged.
 */
function title(occurrence: ScheduledOccurrence): { text: string; measure: boolean } {
  if (occurrence.prescription)
    return { text: describePrescription(occurrence.prescription), measure: true };
  return { text: ACTIVITY_SPORT_LABELS[occurrence.sport], measure: false };
}

function Identity({
  occurrence,
  when,
  badge,
  fallbackTitle,
}: {
  occurrence: ScheduledOccurrence;
  when: string;
  badge?: ReactNode;
  /** What to call a session with no target, when "Running" alone would be too little. */
  fallbackTitle?: string;
}) {
  const named = title(occurrence);
  const text = !named.measure && fallbackTitle ? fallbackTitle : named.text;
  const detail = [
    named.measure || fallbackTitle ? ACTIVITY_SPORT_LABELS[occurrence.sport] : null,
    when,
    occurrence.scheduledLocalTime ? occurrence.scheduledLocalTime.slice(0, 5) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const Icon = SPORT_ICONS[occurrence.sport];
  return (
    <div className="flex min-w-0 flex-[1_1_10rem] items-start gap-3">
      <Icon scale="row" className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={cn(
              "min-w-0 [overflow-wrap:anywhere]",
              named.measure ? "font-data text-lg font-semibold tabular-nums" : "font-medium",
            )}
          >
            {text}
          </p>
          {badge}
        </div>
        {detail && (
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

export function OccurrenceRow({
  occurrence,
  when,
  badge,
  fallbackTitle,
}: {
  occurrence: ScheduledOccurrence;
  /** The date, said the way the list says dates: "Today", "Tue 8 Sept 2026"; "" under a date label. */
  when: string;
  badge?: ReactNode;
  fallbackTitle?: string;
}) {
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <Identity occurrence={occurrence} when={when} badge={badge} fallbackTitle={fallbackTitle} />
      {occurrence.loggable ? (
        <LinkButton
          href={`/training/new?occurrence=${occurrence.id}`}
          variant="secondary"
          size="sm"
          className="ml-auto shrink-0"
        >
          Log it
        </LinkButton>
      ) : (
        occurrence.resolution.kind === "logged" && (
          <Link
            href={`/training/activities/${occurrence.resolution.activityId}`}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-pen"
          >
            See what you logged
          </Link>
        )
      )}
    </li>
  );
}

/** The same row leading to the session's own page, where it can be logged, skipped or moved. */
export function OccurrenceLinkRow({
  occurrence,
  when,
  badge,
}: {
  occurrence: ScheduledOccurrence;
  when: string;
  badge?: ReactNode;
}) {
  return (
    <li>
      <Link
        prefetch="intent"
        href={`/training/programme/occurrences/${occurrence.id}`}
        transitionTypes={["nav-forward"]}
        className={cn(PRESSABLE_ROW_CLASS, "flex-wrap")}
      >
        <Identity occurrence={occurrence} when={when} badge={badge} />
        <ChevronRight className="ml-auto shrink-0 text-ink-subtle" aria-hidden />
      </Link>
    </li>
  );
}
