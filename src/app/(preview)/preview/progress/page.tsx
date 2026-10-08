import type { Metadata } from "next";

import {
  historyClock,
  LATEST_COUNT,
  newestFirst,
  runItem,
  workoutItem,
} from "@/app/(app)/progress/history/history-items";
import type { HistoryItem } from "@/app/(app)/progress/history/history-list";
import { ProgressSections } from "@/app/(app)/progress/progress-sections";
import { OverviewSection } from "@/app/(app)/progress/sections/overview-section";
import type { DayActivity } from "@/components/progress/calendar";

import { PreviewShell } from "../../preview-shell";
import { MonthPagesPreview } from "./month-pages-preview";

export const metadata: Metadata = { title: "Preview · Progress" };

const ZONE = "Asia/Kolkata";
const GYM = { id: "00000000-0000-4000-8000-0000000000a1", name: "Anytime Fitness" };

/** One thing done: a workout of the programme, or a run. */
type Done =
  | { sport: "strength"; at: string; day: string; minutes: number; sets: number; sleep?: number }
  | {
      sport: "running";
      at: string;
      km: number;
      seconds: number;
      where: "outdoor" | "treadmill";
      effort?: number;
    };

const lift = (at: string, day: string, minutes: number, sets: number, sleep?: number): Done => ({
  sport: "strength",
  at,
  day,
  minutes,
  sets,
  sleep,
});
const run = (
  at: string,
  km: number,
  seconds: number,
  where: "outdoor" | "treadmill" = "outdoor",
  effort?: number,
): Done => ({ sport: "running", at, km, seconds, where, effort });

/**
 * The owner's month as their screenshot of 8 October 2026 shows it (a lift and a run on the 1st,
 * lifts on the 2nd and 3rd, runs on the 6th and 7th: 3 lifts, 3 runs, 9.2 km), the end of the
 * September before it, and the rest of October as it might go, for the later states. Local
 * times, in India.
 */
const DONE: Done[] = [
  lift("2026-09-26T10:30", "Upper B", 64, 18, 7),
  run("2026-09-27T07:05", 2.8, 21 * 60 + 20, "outdoor", 3),
  lift("2026-09-27T07:40", "Easy Run + Light Upper", 41, 12),
  lift("2026-09-29T18:05", "Lower A", 70, 19, 6.5),
  lift("2026-09-30T18:15", "Upper A", 66, 20, 7.5),
  lift("2026-10-01T18:30", "Easy Run + Arms", 62, 12, 7),
  run("2026-10-01T19:40", 3, 22 * 60 + 30, "outdoor", 3),
  lift("2026-10-02T18:20", "Lower B", 71, 16, 6),
  lift("2026-10-03T10:30", "Upper B", 58, 18, 8),
  run("2026-10-06T07:10", 3.1, 23 * 60 + 10, "treadmill"),
  run("2026-10-07T18:45", 3.1, 23 * 60 + 40, "outdoor", 4),
  // After the screenshot: the rest of October.
  lift("2026-10-08T18:30", "Easy Run + Arms", 60, 12, 7),
  run("2026-10-08T19:35", 3.2, 23 * 60 + 50),
  lift("2026-10-09T18:10", "Lower B", 68, 16, 6.5),
  lift("2026-10-10T10:15", "Upper B", 61, 18, 8),
  run("2026-10-11T07:00", 4, 29 * 60 + 40, "outdoor", 3),
  lift("2026-10-13T18:00", "Lower A", 72, 19, 7),
  lift("2026-10-14T18:20", "Upper A", 65, 20),
  lift("2026-10-15T18:25", "Easy Run + Arms", 57, 12, 6),
  run("2026-10-15T19:30", 3.4, 25 * 60 + 5),
  lift("2026-10-17T10:40", "Lower B", 69, 16, 7.5),
  run("2026-10-18T06:55", 5, 36 * 60 + 15, "outdoor", 4),
  lift("2026-10-20T18:05", "Lower A", 74, 19, 7),
  lift("2026-10-21T18:10", "Upper A", 63, 20, 6.5),
  lift("2026-10-22T18:30", "Easy Run + Arms", 59, 12),
  run("2026-10-22T19:35", 3.5, 25 * 60 + 40, "treadmill"),
  lift("2026-10-23T18:15", "Lower B", 70, 16, 7),
  lift("2026-10-24T10:20", "Upper B", 62, 18, 8),
  run("2026-10-25T07:05", 4.2, 30 * 60 + 25, "outdoor", 3),
  lift("2026-10-27T18:00", "Lower A", 71, 19, 7),
  lift("2026-10-28T18:20", "Upper A", 64, 20, 6),
  run("2026-10-29T06:50", 3.3, 24 * 60 + 10, "outdoor", 3),
  lift("2026-10-30T18:10", "Lower B", 67, 16, 7),
  lift("2026-10-31T10:30", "Upper B", 60, 18, 7.5),
];

/** A local time in India as the instant it was. */
const instant = (local: string) => new Date(`${local}:00+05:30`);

const ids = new Map(
  DONE.map((done, index) => [
    done,
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);

function asActivity(done: Done): DayActivity {
  return done.sport === "strength"
    ? {
        sport: "strength",
        occurredOn: done.at.slice(0, 10),
        durationMs: done.minutes * 60_000,
        distanceMetres: null,
        environment: null,
      }
    : {
        sport: "running",
        occurredOn: done.at.slice(0, 10),
        durationMs: done.seconds * 1000,
        distanceMetres: done.km * 1000,
        environment: done.where,
      };
}

/** Each record as History words it, through the same builders the app's pages use. */
function asItem(done: Done): HistoryItem {
  const clock = historyClock(ZONE);
  const id = ids.get(done)!;
  if (done.sport === "strength")
    return workoutItem(
      {
        id,
        startedAt: instant(done.at),
        gymId: GYM.id,
        gymName: GYM.name,
        dayName: done.day,
        sleepHours: done.sleep ?? null,
        setCount: done.sets,
        exercises: [],
      } as unknown as Parameters<typeof workoutItem>[0],
      clock,
    );
  return runItem(
    {
      id,
      startedAt: instant(done.at),
      environment: done.where,
      distanceMeters: done.km * 1000,
      durationSeconds: done.seconds,
      averagePaceSecondsPerKm: done.seconds / done.km,
      gymId: null,
      effort:
        done.effort === undefined
          ? { status: "unknown", value: null }
          : { status: "reported", value: done.effort },
    } as unknown as Parameters<typeof runItem>[0],
    clock,
  );
}

/**
 * Where each state stands, in local time: the screenshot's day before its training, the month
 * nearly done (that morning's run in), and a month begun with nothing in it yet.
 */
const NOW: Record<string, string> = {
  early: "2026-10-08T12:00",
  late: "2026-10-29T12:00",
  first: "2026-11-01T09:00",
  new: "2026-10-08T12:00",
};

/**
 * Progress's Overview against made-up data (ADR 0045): `?state=early` (the default, the
 * screenshot's 8 October), `late` (29 October), `first` (1 November, nothing yet) and `new`
 * (nothing ever). `?list=pages` draws the alternative the owner weighed, the calendar's month in
 * pages of ten, in place of the latest ten.
 */
export default async function ProgressPreviewPage(props: PageProps<"/preview/progress">) {
  const { state: asked, list } = await props.searchParams;
  const state = typeof asked === "string" && asked in NOW ? asked : "early";
  const now = NOW[state]!;
  const today = now.slice(0, 10);
  const month = today.slice(0, 7);
  const done = state === "new" ? [] : DONE.filter((d) => d.at <= now);
  const items = done.map(asItem).sort(newestFirst);
  const pages = list === "pages";

  return (
    <PreviewShell tab="/progress">
      <div className="progress page-width pt-safe">
        <div className="progress-view">
          <ProgressSections value="overview" filters={null} />
          <section aria-label="Overview" className="min-w-0">
            <OverviewSection
              today={today}
              month={{
                month,
                today: Number(today.slice(8, 10)),
                activities: done.filter((d) => d.at.startsWith(month)).map(asActivity),
              }}
              overview={{ latest: pages ? [] : items.slice(0, LATEST_COUNT) }}
            />
            {pages && (
              <MonthPagesPreview
                items={items.filter((item) => item.day.startsWith(month))}
                today={today}
              />
            )}
          </section>
        </div>
      </div>
    </PreviewShell>
  );
}
