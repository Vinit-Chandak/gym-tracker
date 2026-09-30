import type { Route } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SportChip } from "@/components/ui/sport-chip";
import type { ActivitySport } from "@/domain/activity";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import { formatIsoDate } from "@/lib/format";
import { SPORT_TONE } from "@/lib/sport-tone";

/**
 * A scheduled session that cannot be logged again, and why.
 *
 * Refusing is right — one occurrence is answered once — but "that page or item does not
 * exist, or it belongs to a different account" is untrue of a session this account owns and
 * has already done. It says what became of it, and offers the thing they probably wanted:
 * what they logged, or the programme the cancelled session came from.
 */
const SPORT_NOUNS: Record<ActivitySport, string> = {
  strength: "session",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

export function OccurrenceSettled({ occurrence }: { occurrence: ScheduledOccurrence }) {
  const noun = SPORT_NOUNS[occurrence.sport];
  const when = formatIsoDate(occurrence.scheduledOn);
  const settled =
    occurrence.resolution.kind === "logged"
      ? {
          title: "You have already logged this",
          description: `The ${noun} scheduled for ${when} was answered by an activity you logged. A scheduled session is logged once; correct that activity rather than logging a second one.`,
          href: `/training/activities/${occurrence.resolution.activityId}` as Route,
          label: "See what you logged",
        }
      : occurrence.resolution.kind === "cancelled"
        ? {
            title: "This session was cancelled",
            description: `The ${noun} scheduled for ${when} was removed from your programme, so there is nothing to log against it. You can still log a ${noun} on its own.`,
            href: `/training/new?sport=${occurrence.sport}` as Route,
            label: `Log a ${noun} anyway`,
          }
        : {
            title: "This session is already settled",
            description: `The ${noun} scheduled for ${when} is no longer waiting to be logged.`,
            href: "/training" as Route,
            label: "Go to Training",
          };
  return (
    <>
      <PageHeader title="Already done" backHref="/training" />
      <PageContent>
        <Card>
          <div className="flex items-center gap-3">
            <SportChip sport={occurrence.sport} />
            <h2 className="text-headline leading-snug font-semibold">{settled.title}</h2>
          </div>
          <p className="text-sm text-ink-muted">{settled.description}</p>
          <LinkButton
            href={settled.href}
            variant="secondary"
            tone={SPORT_TONE[occurrence.sport]}
            className="w-full"
          >
            {settled.label}
          </LinkButton>
        </Card>
      </PageContent>
    </>
  );
}
