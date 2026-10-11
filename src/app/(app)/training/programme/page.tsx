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
import { adherenceBySport, isOverdue } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { programmeOccurrences } from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";
import { unitsBySport } from "@/server/repositories/sport-preferences";

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
        units: await unitsBySport(tx, user.id),
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

  const units = data.units;
  const adherence = adherenceBySport(
    data.occurrences.map((occurrence) => ({
      sport: occurrence.sport,
      resolution: occurrence.resolution,
    })),
  );
  // Unanswered is not the same as missed: a session whose day has not come is still to come,
  // and only one whose day has gone by is not done (SCHED-04). Lateness is about today's date,
  // so it is worked out here rather than counted as a state.
  const late = (occurrence: (typeof data.occurrences)[number]) =>
    isOverdue(occurrence, occurrence.resolution, today);
  const notDone = new Map<ActivitySport, number>();
  for (const occurrence of data.occurrences.filter(late))
    notDone.set(occurrence.sport, (notDone.get(occurrence.sport) ?? 0) + 1);
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
            {Object.entries(adherence).map(([sport, counts]) => {
              const missed = notDone.get(sport as ActivitySport) ?? 0;
              return (
                <p key={sport} className="text-sm tabular-nums">
                  <span className="font-medium">
                    {ACTIVITY_SPORT_LABELS[sport as ActivitySport]}
                  </span>{" "}
                  · {counts.logged} logged · {missed} not done · {counts.incomplete - missed} to
                  come · {counts.skipped} skipped
                  {counts.cancelled > 0 ? ` · ${counts.cancelled} cancelled` : ""}
                </p>
              );
            })}
            {/* Each sport's record is its own: an unfinished run cannot fail a finished lift. */}
            <p className="text-sm text-ink-muted">
              Counted per sport, against the week each session was first placed in.
            </p>
          </Card>
        </Section>

        <Section title="Cycle">
          {[...byDate.entries()].map(([date, occurrences]) => (
            <Card key={date}>
              {/* Named as the scheduled page names a day: its weekday, and its year when it is
                  not this one. */}
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase tabular-nums">
                {formatIsoDate(date, today.slice(0, 4))}
                {date < today ? " · earlier" : ""}
              </p>
              {occurrences.map((occurrence) => {
                // A session still to come has had no answer yet, and is not one to badge.
                const status =
                  occurrence.resolution.kind === "incomplete" && !late(occurrence)
                    ? null
                    : STATUS[occurrence.resolution.kind]!;
                return (
                  <div key={occurrence.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        prefetch="intent"
                        href={`/training/programme/occurrences/${occurrence.id}`}
                        className="tap-area text-base font-medium [overflow-wrap:break-word]"
                      >
                        {ACTIVITY_SPORT_LABELS[occurrence.sport]}
                        {occurrence.prescription
                          ? ` · ${describePrescription(occurrence.prescription, units[occurrence.sport])}`
                          : ""}
                      </Link>
                    </div>
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
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
