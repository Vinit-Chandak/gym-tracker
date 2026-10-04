import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { Art } from "@/components/art/art";
import { ART_SPORT, dayParts, type DayPiece } from "@/components/progress/calendar";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { ActivitySport } from "@/domain/activity";
import { formatDuration, formatPace } from "@/domain/pace";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate, formatIsoWeekdayDay, formatRunKm, formatTime } from "@/lib/format";
import { SWIM_STROKE_LABELS, UNPLANNED_SESSION } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readActivityDays } from "@/server/repositories/activity-analytics";
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

const RUN_PLACE: Record<string, string> = { outdoor: "Outdoor", treadmill: "Treadmill" };
const RIDE_PLACE: Record<string, string> = { outdoor: "Ride", indoor: "Indoor ride" };
const SWIM_PLACE: Record<string, string> = { pool: "Pool", open_water: "Open water" };

/**
 * A day (board Day): its record as a print, in full ink, in the day's order, then each thing
 * done: its mark, what it was and how far or how much, and the time it began.
 */
export default async function DayPage(props: PageProps<"/progress/day/[date]">) {
  const { date } = await props.params;
  if (!civilDate.safeParse(date).success) notFound();
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  if (date > todayInTimeZone(profile.timeZone)) notFound();
  const range = parseDateRange({ from: date, to: date }, profile.timeZone);

  const { endurance, workouts } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [days, lifted] = await Promise.all([
        readActivityDays(tx, user.id, { from: date, to: date }),
        readWorkouts(tx, user.id, range, 0, 20, { completedOnly: true }),
      ]);
      return {
        endurance: days.items.filter((item) => item.sport !== "strength"),
        workouts: lifted.workouts,
      };
    },
    { readOnly: true },
  );

  const entries: Entry[] = [
    ...endurance.map((item): Entry => {
      const seconds = item.durationMs === null ? null : Math.round(item.durationMs / 1000);
      const minutes = item.durationMs === null ? null : Math.round(item.durationMs / 60_000);
      const place =
        item.sport === "running"
          ? (RUN_PLACE[item.environment ?? ""] ?? "Run")
          : item.sport === "cycling"
            ? (RIDE_PLACE[item.environment ?? ""] ?? "Ride")
            : (SWIM_PLACE[item.environment ?? ""] ?? "Swim");
      const distance =
        item.distanceMetres === null
          ? null
          : item.sport === "swimming"
            ? `${Math.round(item.distanceMetres).toLocaleString("en-GB")} m`
            : `${formatRunKm(item.distanceMetres)} km`;
      const pace =
        item.sport === "running" && seconds && item.distanceMetres
          ? `${formatPace(seconds / (item.distanceMetres / 1000))}/km`
          : null;
      const stroke =
        item.sport === "swimming" && item.stroke && item.stroke !== "unspecified"
          ? SWIM_STROKE_LABELS[item.stroke]
          : null;
      return {
        key: item.id,
        sport: item.sport,
        at: item.startedAt,
        title: [place, distance].filter(Boolean).join(" · "),
        meta: [seconds === null ? null : formatDuration(seconds), pace, stroke]
          .filter(Boolean)
          .join(" · "),
        href: `/training/activities/${item.id}` as Route,
        piece: { sport: item.sport as Exclude<ActivitySport, "strength">, minutes },
      };
    }),
    ...workouts.map((workout): Entry => {
      const sets = workout.exercises.flatMap((exercise) => exercise.sets);
      const minutes = workout.completedAt
        ? Math.round((workout.completedAt.getTime() - workout.startedAt.getTime()) / 60_000)
        : null;
      return {
        key: workout.id,
        sport: "strength",
        at: workout.startedAt,
        title: workout.day?.name ?? UNPLANNED_SESSION,
        meta: [
          workout.gym.name,
          minutes === null ? null : `${minutes} min`,
          `${sets.length} ${sets.length === 1 ? "set" : "sets"}`,
        ]
          .filter(Boolean)
          .join(" · "),
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

  const title = formatIsoWeekdayDay(date);
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
                      <span className="type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums">
                        {entry.meta}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 type-meta-small font-semibold text-ink-2 tabular-nums">
                    {formatTime(entry.at, profile.timeZone)}
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
