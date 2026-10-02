import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OccurrenceLinkRow } from "@/components/activities/occurrence-row";
import { SPORT_ICONS } from "@/components/activities/sport-icons";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport, type ActivitySport } from "@/domain/activity";
import { adherenceBySport } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { programmeOccurrences } from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";

export const metadata: Metadata = { title: "Programme" };

const STATUS: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  logged: { label: "Logged", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  legacy_completed: { label: "Completed earlier", tone: "neutral" },
  incomplete: { label: "Not done", tone: "warning" },
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
            action={<LinkButton href="/profile/programme/create">Create a programme</LinkButton>}
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
        {/* Each sport's record is its own: an unfinished run cannot fail a finished lift. */}
        <Section
          title="Adherence"
          info="Counted per sport, against the week each session was first placed in."
        >
          <ul className="box-rows">
            {Object.entries(adherence).map(([sport, counts]) => {
              const Icon = SPORT_ICONS[sport as ActivitySport];
              return (
                <li key={sport} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <Icon scale="row" className="shrink-0 text-ink-muted" aria-hidden />
                  <p className="min-w-0 flex-[1_1_6rem] font-medium">
                    {ACTIVITY_SPORT_LABELS[sport as ActivitySport]}
                  </p>
                  <p className="min-w-0 font-data text-sm text-ink-muted tabular-nums">
                    {counts.logged} logged · {counts.incomplete} outstanding · {counts.skipped}{" "}
                    skipped
                    {counts.cancelled > 0 ? ` · ${counts.cancelled} cancelled` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Cycle">
          {[...byDate.entries()].map(([date, occurrences]) => (
            <div key={date}>
              <div className="flex items-baseline justify-between gap-3 pb-1">
                <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase tabular-nums">
                  {formatIsoDate(date)}
                </p>
                {date < today && (
                  <p className="font-data text-sm text-ink-muted tabular-nums">earlier</p>
                )}
              </div>
              <ul className="box-rows">
                {occurrences.map((occurrence) => {
                  const status = STATUS[occurrence.resolution.kind]!;
                  return (
                    <OccurrenceLinkRow
                      key={occurrence.id}
                      occurrence={occurrence}
                      when=""
                      badge={<Badge tone={status.tone}>{status.label}</Badge>}
                    />
                  );
                })}
              </ul>
            </div>
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
