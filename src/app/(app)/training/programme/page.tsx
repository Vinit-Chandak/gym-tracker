import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays, ChevronRight } from "@/components/ui/icons";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SPORT_ICON, SportChip } from "@/components/ui/sport-chip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport, type ActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { adherenceBySport } from "@/domain/occurrences";
import { addDays, programWeekIndex, todayInTimeZone } from "@/domain/program-calendar";
import { dateTimeFormatter } from "@/lib/date-time-format";
import { formatIsoWeekdayDay } from "@/lib/format";
import { SPORT_TONE, TONE_SOFT } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { programmeOccurrences, type ScheduledOccurrence } from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";

export const metadata: Metadata = { title: "Programme" };

const STATUS: Record<string, { label: string; tone: "success" | "neutral" }> = {
  logged: { label: "Logged", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  legacy_completed: { label: "Completed earlier", tone: "neutral" },
};

/** "29 Sept": a day inside a week that is already named, so no weekday and no year. */
function shortDay(isoDate: string): string {
  return dateTimeFormatter("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

function weekSpan(start: string): string {
  return `${shortDay(start)} – ${shortDay(addDays(start, 6))}`;
}

/**
 * What became of a session, or nothing while it is still ahead: a session that has not come
 * round yet is not "not done", it is simply next.
 */
function statusBadge(occurrence: ScheduledOccurrence, today: string) {
  const status = STATUS[occurrence.resolution.kind];
  if (status) return <Badge tone={status.tone}>{status.label}</Badge>;
  if (occurrence.scheduledOn < today) return <Badge tone="neutral">Not done</Badge>;
  if (occurrence.scheduledOn === today) return <Badge tone="accent">Today</Badge>;
  return null;
}

/** One session: its sport, its day, what it asks for and what became of it. */
function SessionRow({ occurrence, today }: { occurrence: ScheduledOccurrence; today: string }) {
  const time = occurrence.scheduledLocalTime?.slice(0, 5) ?? null;
  return (
    <Link
      prefetch="intent"
      href={`/training/programme/occurrences/${occurrence.id}`}
      className={PRESSABLE_ROW_CLASS}
    >
      <SportChip sport={occurrence.sport} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold [overflow-wrap:anywhere]">
          {occurrence.prescription
            ? describePrescription(occurrence.prescription)
            : ACTIVITY_SPORT_LABELS[occurrence.sport]}
        </span>
        <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
          {[
            ACTIVITY_SPORT_LABELS[occurrence.sport],
            formatIsoWeekdayDay(occurrence.scheduledOn),
            time,
          ]
            .filter(Boolean)
            .join(", ")}
        </span>
      </span>
      {/* The badge gives way before the name does: at large text it wraps inside itself. */}
      <span className="flex max-w-[35%] min-w-0 justify-end">{statusBadge(occurrence, today)}</span>
      <ChevronRight className="-ml-1 shrink-0 text-ink-subtle" aria-hidden />
    </Link>
  );
}

function SessionList({
  occurrences,
  today,
  className,
}: {
  occurrences: readonly ScheduledOccurrence[];
  today: string;
  className?: string;
}) {
  return (
    <ul className={cn("min-w-0 ruled-list", className)}>
      {occurrences.map((occurrence) => (
        <li key={occurrence.id}>
          <SessionRow occurrence={occurrence} today={today} />
        </li>
      ))}
    </ul>
  );
}

/** The block as a strip of weeks: behind, this one, and still to come. */
function WeekStrip({ weeks, current }: { weeks: number; current: number | null }) {
  return (
    <div aria-hidden className="flex gap-1.5">
      {Array.from({ length: weeks }, (_, index) => {
        const week = index + 1;
        return (
          <span
            key={week}
            className={cn(
              "h-2.5 min-w-0 flex-1 rounded-full",
              current !== null && week < current
                ? "bg-ink-ghost"
                : week === current
                  ? "bg-ink"
                  : "bg-ink/15",
            )}
          />
        );
      })}
    </div>
  );
}

/**
 * The programme, in full (plan §2.3).
 *
 * One place where every session of the block lives, including the ones behind. Earlier
 * incomplete work is here rather than on Today: it can be logged late, skipped or moved from
 * this page, and doing any of those touches that session alone.
 *
 * It opens on the week the calendar is in, with the rest of the block around it: what is
 * behind folded away under one row, and what is ahead week by week.
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

  const { program } = data.schedule;
  const adherence = adherenceBySport(
    data.occurrences.map((occurrence) => ({
      sport: occurrence.sport,
      resolution: occurrence.resolution,
    })),
  );

  // Weeks run from the start date, as the rest of the calendar maths does. Without a start
  // there is no week to be in, and the sessions are listed by date alone.
  const start = program.startDate;
  const weekOf = (date: string) => (start ? programWeekIndex(start, program.weeks, date) : null);
  const current = weekOf(today);
  const currentStart = start && current !== null ? addDays(start, (current - 1) * 7) : null;
  const currentEnd = currentStart ? addDays(currentStart, 6) : null;
  const thisWeek = currentStart
    ? data.occurrences.filter((o) => o.scheduledOn >= currentStart && o.scheduledOn <= currentEnd!)
    : [];
  const earlier = data.occurrences.filter((o) =>
    currentStart ? o.scheduledOn < currentStart : o.scheduledOn < today,
  );
  const later = data.occurrences.filter((o) =>
    currentEnd ? o.scheduledOn > currentEnd : o.scheduledOn >= today,
  );
  // What is ahead, week by week: the programme's own weeks where it has them.
  const laterWeeks = new Map<string, ScheduledOccurrence[]>();
  for (const occurrence of later) {
    const week = weekOf(occurrence.scheduledOn);
    const key = week === null ? "Later" : `Week ${week}`;
    laterWeeks.set(key, [...(laterWeeks.get(key) ?? []), occurrence]);
  }
  const notDone = earlier.filter((o) => o.resolution.kind === "incomplete").length;
  const started = start !== null && today >= start;

  return (
    <>
      <PageHeader title="Programme" meta={program.name} backHref="/training" />
      <PageContent>
        {start && (
          <section aria-labelledby="programme-week" className="box">
            <div className="space-y-3 panel-padding">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2
                  id="programme-week"
                  className="font-display text-display-m font-extrabold tabular-nums"
                >
                  {current !== null
                    ? `Week ${current} of ${program.weeks}`
                    : started
                      ? "Block finished"
                      : "Not started"}
                </h2>
                <p className="text-sm text-ink-muted tabular-nums">
                  {currentStart
                    ? weekSpan(currentStart)
                    : started
                      ? `${program.weeks} weeks`
                      : `Starts ${formatIsoWeekdayDay(start)}`}
                </p>
              </div>
              <WeekStrip
                weeks={program.weeks}
                current={current ?? (started ? program.weeks + 1 : 0)}
              />
            </div>
            {current !== null &&
              (thisWeek.length > 0 ? (
                <SessionList
                  occurrences={thisWeek}
                  today={today}
                  className="border-t border-line"
                />
              ) : (
                <p className="border-t border-line px-[var(--panel-padding)] py-4 text-sm text-ink-muted">
                  Nothing scheduled this week.
                </p>
              ))}
          </section>
        )}

        {Object.keys(adherence).length > 0 && (
          <Section
            title="Adherence"
            info="Counted per sport, against the week each session was first placed in. A session moved to another day still counts in its first week."
          >
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
              {Object.entries(adherence).map(([key, counts]) => {
                const sport = key as ActivitySport;
                const Icon = SPORT_ICON[sport];
                return (
                  <li
                    key={sport}
                    className={cn(
                      "min-w-0 space-y-2 rounded-tile p-4",
                      TONE_SOFT[SPORT_TONE[sport]],
                    )}
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Icon aria-hidden />
                      {ACTIVITY_SPORT_LABELS[sport]}
                    </p>
                    <p className="text-ink tabular-nums">
                      <span className="font-display text-display-m font-extrabold">
                        {counts.logged}
                      </span>{" "}
                      <span className="text-sm font-semibold">logged</span>
                    </p>
                    <p className="text-sm text-ink-muted tabular-nums">
                      {[
                        `${counts.incomplete} to do`,
                        `${counts.skipped} skipped`,
                        counts.cancelled > 0 ? `${counts.cancelled} cancelled` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {earlier.length > 0 && (
          <Disclosure
            summary={started && current === null ? "Every week" : "Earlier weeks"}
            meta={`${earlier.length} ${earlier.length === 1 ? "session" : "sessions"}${
              notDone > 0 ? `, ${notDone} not done` : ""
            }`}
          >
            <SessionList occurrences={earlier} today={today} className="-mx-4 -mb-4" />
          </Disclosure>
        )}

        {[...laterWeeks.entries()].map(([week, occurrences]) => {
          const first = occurrences[0]!.scheduledOn;
          const index = weekOf(first);
          const span = start && index !== null ? weekSpan(addDays(start, (index - 1) * 7)) : null;
          return (
            <Section
              key={week}
              title={week}
              action={
                span ? (
                  <span className="text-sm text-ink-muted tabular-nums">{span}</span>
                ) : undefined
              }
            >
              <SessionList occurrences={occurrences} today={today} className="box-rows" />
            </Section>
          );
        })}

        {data.occurrences.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="Nothing scheduled in this programme"
            description="Endurance sessions of the active programme appear here, week by week."
          />
        )}
      </PageContent>
    </>
  );
}
