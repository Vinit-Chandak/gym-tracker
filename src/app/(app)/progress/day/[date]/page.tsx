import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { enduranceName } from "@/components/activities/endurance-line";
import { Art } from "@/components/art/art";
import { ART_SPORT, dayParts, type DayPiece } from "@/components/progress/calendar";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Figures } from "@/components/ui/figures";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { ActivitySport } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { todayInTimeZone } from "@/domain/program-calendar";
import { workingSetCount } from "@/domain/sets";
import { DEFAULT_SPORT_UNITS, formatSportDistance, METRES_PER_MILE } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { formatIsoDate, formatTime } from "@/lib/format";
import { ENDURANCE_PLACE_LABELS, SWIM_STROKE_LABELS, UNPLANNED_SESSION } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readActivityDays } from "@/server/repositories/activity-analytics";
import { unitsBySport } from "@/server/repositories/sport-preferences";
import { readWorkouts } from "@/server/repositories/training-data";
import { civilDate, parseDateRange } from "@/server/validation/date-range";

export const metadata: Metadata = { title: "Day" };

type Entry = {
  key: string;
  sport: ActivitySport;
  at: Date;
  title: string;
  meta: string;
  href: Route;
  piece: DayPiece;
};

/**
 * A day (board Day): its record as a print, in full ink, in the day's order, then each thing
 * done: its mark, what it was and how far or how much, and the time it began.
 */
export default async function DayPage(props: PageProps<"/progress/day/[date]">) {
  const { date } = await props.params;
  if (!civilDate.safeParse(date).success) notFound();
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  if (date > today) notFound();
  const range = parseDateRange({ from: date, to: date }, profile.timeZone);

  const { endurance, workouts, units } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      // Every sport on the day it was recorded on, as the calendar marks it: a lift too, not
      // on the day its start falls on in the profile's zone today. The workout still open is
      // on its day as well, in progress, rather than leaving the day "nothing logged".
      const [days, lifted, units] = await Promise.all([
        readActivityDays(tx, user.id, { from: date, to: date }),
        readWorkouts(tx, user.id, range, 0, 20, { onDays: true }),
        unitsBySport(tx, user.id),
      ]);
      return {
        endurance: days.items.filter((item) => item.sport !== "strength"),
        workouts: lifted.workouts,
        units,
      };
    },
    { readOnly: true },
  );

  const entries: Entry[] = [
    ...endurance.map((item): Entry => {
      const seconds = item.durationMs === null ? null : Math.round(item.durationMs / 1000);
      // Named as History and its own page name it, its title or "Run", "Ride", "Swim"; where it
      // happened leads the line under it, as a workout's gym does.
      const name = item.title ?? enduranceName(item.sport);
      const place = item.environment ? ENDURANCE_PLACE_LABELS[item.environment] : null;
      // In the unit the athlete reads the sport in, as the activity's own page says it.
      const sportUnits = units[item.sport as keyof typeof units] ?? DEFAULT_SPORT_UNITS;
      const distance =
        item.distanceMetres === null
          ? null
          : formatSportDistance(item.distanceMetres, item.sport, sportUnits);
      const perKm =
        item.sport === "running" && seconds && item.distanceMetres
          ? seconds / (item.distanceMetres / 1000)
          : null;
      const pace =
        perKm === null
          ? null
          : sportUnits.distanceUnit === "mi"
            ? `${formatPace((perKm * METRES_PER_MILE) / 1000)}/mi`
            : `${formatPace(perKm)}/km`;
      const stroke =
        item.sport === "swimming" && item.stroke && item.stroke !== "unspecified"
          ? SWIM_STROKE_LABELS[item.stroke]
          : null;
      return {
        key: item.id,
        sport: item.sport,
        at: item.startedAt,
        title: joinFacts([name, distance]),
        meta: joinFacts([place, seconds === null ? null : formatDuration(seconds), pace, stroke]),
        href: `/training/activities/${item.id}` as Route,
        piece: { sport: item.sport as Exclude<ActivitySport, "strength"> },
      };
    }),
    ...workouts.map((workout): Entry => {
      const sets = workingSetCount(workout.exercises.flatMap((exercise) => exercise.sets));
      const minutes = workout.completedAt
        ? Math.round((workout.completedAt.getTime() - workout.startedAt.getTime()) / 60_000)
        : null;
      return {
        key: workout.id,
        sport: "strength",
        at: workout.startedAt,
        title: workout.day?.name ?? UNPLANNED_SESSION,
        // Each figure kept with its word ("12 sets", never "12 / sets") when the line wraps.
        meta: joinFacts([
          workout.gym.name,
          minutes === null ? "In progress" : `${minutes}\u00a0min`,
          // The open workout's sets are its own page's to count: this one can be held on Back.
          minutes === null ? null : `${sets}\u00a0${sets === 1 ? "set" : "sets"}`,
        ]),
        href: `/workouts/${workout.id}` as Route,
        piece: {
          sport: "strength",
          columns: workout.exercises
            .filter((exercise) => exercise.sets.length > 0)
            .map((exercise) => ({
              sets: exercise.sets.length,
              done: exercise.sets.length,
              warm: exercise.sets.filter((set) => set.setType === "warmup").length,
            })),
        },
      };
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  // The calendar reaches back two years: a day in another year is named with it.
  const title = formatIsoDate(date, today.slice(0, 4));
  const parts = dayParts(entries.map((entry) => entry.piece));

  return (
    <>
      <PageHeader title={title} backHref="/progress/calendar" />
      <PageContent className="!pt-3">
        {parts.length > 0 && (
          <figure className="day-print m-0">
            <Art
              kind="print"
              parts={parts}
              label={`${formatIsoDate(date)} in full ink, in the day's order: ${entries
                .map((entry) => entry.title)
                .join(", ")}`}
              className="size-full"
            />
          </figure>
        )}
        {entries.length === 0 ? (
          <p className="type-body text-ink-2">Nothing logged on {formatIsoDate(date)}.</p>
        ) : (
          <ul className="mt-1.5">
            {entries.map((entry) => (
              <li key={entry.key}>
                <Link href={entry.href} className="day-row">
                  <span className="mark-cell">
                    <Art kind="mark" sport={ART_SPORT[entry.sport]} size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="plan-row-name tabular-nums">{entry.title}</span>
                    {entry.meta && (
                      <span className="type-meta-small [overflow-wrap:break-word] text-ink-2 tabular-nums">
                        <Figures>{entry.meta}</Figures>
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 type-meta-small font-semibold text-ink-2 tabular-nums">
                    {/* Its time in Jost, as History's is: "07:11", its zero plain. */}
                    <Figures>{formatTime(entry.at, profile.timeZone)}</Figures>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageContent>
    </>
  );
}
