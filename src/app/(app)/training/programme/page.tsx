import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport, type ActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { adherenceBySport } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { programmeOccurrences } from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";

export const metadata: Metadata = { title: "Programme" };

const STATUS: Record<string, { label: string; tone: "accent" | "neutral" }> = {
  logged: { label: "Logged", tone: "accent" },
  skipped: { label: "Skipped", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  legacy_completed: { label: "Completed earlier", tone: "neutral" },
  incomplete: { label: "Not done", tone: "neutral" },
};

/**
 * The programme, in full (plan §2.3).
 *
 * One place where every session of the block lives, including the ones behind. Earlier
 * incomplete work is here rather than on Today: it can be logged late, skipped or moved from
 * this page, and doing any of those touches that session alone.
 */
export default async function ProgrammePage(props: PageProps<"/training/programme">) {
  const search = await props.searchParams;
  const requested = typeof search.sport === "string" ? search.sport : null;
  const sportFilter: ActivitySport | null =
    requested && isActivitySport(requested) ? requested : null;
  if (requested && !sportFilter) notFound();

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const schedule = await getSchedule(tx, user.id);
      if (!schedule) return { schedule: null, occurrences: [] };
      return {
        schedule,
        occurrences: await programmeOccurrences(tx, user.id, schedule.program.familyId, {
          sport: sportFilter ?? undefined,
        }),
      };
    },
    { readOnly: true },
  );

  if (!data.schedule) {
    return (
      <>
        <PageHeader title="Programme" backHref="/training" />
        <PageContent>
          <EmptyState
            icon={CalendarDays}
            title="No active programme"
            description="A programme keeps several weeks of training in one place, across every sport you train."
            action={
              <LinkButton href="/profile/programme/create" variant="secondary">
                Create a programme
              </LinkButton>
            }
          />
        </PageContent>
      </>
    );
  }

  const adherence = adherenceBySport(
    data.occurrences.map((occurrence) => ({
      sport: occurrence.sport,
      resolution: occurrence.resolution,
    })),
  );
  const byDate = new Map<string, typeof data.occurrences>();
  for (const occurrence of data.occurrences) {
    byDate.set(occurrence.scheduledOn, [...(byDate.get(occurrence.scheduledOn) ?? []), occurrence]);
  }

  return (
    <>
      <PageHeader title="Programme" meta={data.schedule.program.name} backHref="/training" />
      <PageContent>
        <Section title="Adherence">
          <Card>
            {Object.entries(adherence).map(([sport, counts]) => (
              <p key={sport} className="text-sm tabular-nums">
                <span className="font-medium">{ACTIVITY_SPORT_LABELS[sport as ActivitySport]}</span>{" "}
                · {counts.logged} logged · {counts.incomplete} outstanding · {counts.skipped}{" "}
                skipped
                {counts.cancelled > 0 ? ` · ${counts.cancelled} cancelled` : ""}
              </p>
            ))}
            {/* Each sport's record is its own: an unfinished run cannot fail a finished lift. */}
            <p className="text-sm text-ink-muted">
              Counted per sport, against the week each session was first placed in.
            </p>
          </Card>
        </Section>

        <Section title="Cycle">
          {[...byDate.entries()].map(([date, occurrences]) => (
            <Card key={date}>
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase tabular-nums">
                {date}
                {date < today ? " · earlier" : ""}
              </p>
              {occurrences.map((occurrence) => {
                const status = STATUS[occurrence.resolution.kind]!;
                return (
                  <div key={occurrence.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        prefetch="intent"
                        href={`/training/programme/occurrences/${occurrence.id}`}
                        className="text-base font-medium [overflow-wrap:anywhere]"
                      >
                        {ACTIVITY_SPORT_LABELS[occurrence.sport]}
                        {occurrence.prescription
                          ? ` · ${describePrescription(occurrence.prescription)}`
                          : ""}
                      </Link>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                );
              })}
            </Card>
          ))}
          {data.occurrences.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled in this programme"
              description="Endurance sessions of the active programme appear here, week by week."
            />
          )}
        </Section>
      </PageContent>
    </>
  );
}
