"use client";

import { monthsBetween } from "@/components/progress/calendar";
import Link from "@/components/ui/app-link";
import { GLYPH_LABELS, Glyph, type GlyphName } from "@/components/ui/glyphs";
import { InkBars } from "@/components/ui/ink-chart";
import { formatSet, formatSets } from "@/domain/sets";
import { metricLabel, type MetricExercise } from "@/domain/shared-stats";
import type { BodyLoadUnit, ExerciseModality, LoadUnit, SetType } from "@/domain/types";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoShortMonth, formatIsoWeekdayDay, formatSharedMetric } from "@/lib/format";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { fromKilograms } from "@/lib/units";
import type { ExerciseMonth } from "@/server/repositories/exercise-life";
import type { ExerciseBest } from "@/server/repositories/shared-stats";

/** Equipment as its glyph (DESIGN.md, Shapes). */
function glyphFor(modality: ExerciseModality): GlyphName {
  switch (modality) {
    case "barbell":
    case "dumbbell":
      return "dumbbell";
    case "cable":
      return "cable";
    case "machine":
    case "cardio":
      return "machine";
    case "smith_machine":
      return "smith";
    default:
      return "bodyweight";
  }
}

type Set = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  unit: LoadUnit;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type LatestPerformance = {
  id: string;
  sessionId: string;
  performedAt: string;
  gymName: string;
  machineName: string | null;
  sets: Set[];
};

/** The session's heaviest working set, the figure a row of Latest leads with: "72.5 kg × 6". */
function topSet(sets: readonly Set[]): string | null {
  const working = sets.filter((set) => set.setType !== "warmup" && set.weight !== null);
  if (working.length === 0) return null;
  const top = working.reduce((best, set) => (set.weight! > best.weight! ? set : best));
  return formatSet(top, LOAD_UNIT_LABELS[top.unit]);
}

/**
 * An exercise across its whole life (board Exercise): its equipment and where, the heaviest
 * working set of each month as a bar, the latest in ink, then the count of sessions and its
 * records, and the latest sessions, each led by its heaviest set.
 */
export function ExerciseLife({
  exercise,
  life,
  machineName,
  bests,
  unit,
  timeZone,
  performances,
}: {
  exercise: MetricExercise & { modality: ExerciseModality; loadPortability: string };
  life: { months: ExerciseMonth[]; sessions: number };
  /** The machine the months are read on, for a movement bound to its machine. */
  machineName: string | null;
  bests: readonly ExerciseBest[];
  unit: BodyLoadUnit;
  timeZone: string;
  performances: readonly LatestPerformance[];
}) {
  const glyph = glyphFor(exercise.modality);
  const where = performances[0]?.gymName ?? null;
  // A machine's loads are in its own unit; anything else in the account's.
  const shownUnit: LoadUnit =
    exercise.loadPortability === "global"
      ? unit
      : (performances.find((p) => p.machineName === machineName)?.sets[0]?.unit ?? unit);
  // Loads are read in kilograms; a machine's own scale (a stack's pins) is read as it is.
  const inUnit = (kg: number) =>
    Math.round(
      (shownUnit === "kg" || shownUnit === "lb" ? fromKilograms(kg, shownUnit) : kg) * 10,
    ) / 10;
  const label = LOAD_UNIT_LABELS[shownUnit];

  const byMonth = new Map(life.months.map((month) => [month.month, month.topKg]));
  const first = life.months[0];
  const last = life.months.at(-1);
  const months = first && last ? monthsBetween(`${first.month}-01`, `${last.month}-01`) : [];
  const points = months.map((month) => {
    const kg = byMonth.get(month);
    return { date: `${month}-01`, value: kg === undefined ? null : inUnit(kg) };
  });
  const top = life.months.length ? inUnit(Math.max(...life.months.map((m) => m.topKg))) : null;

  const stats: { key: string; figure: string; unit?: string; label: string }[] = [
    { key: "sessions", figure: String(life.sessions), label: "Sessions" },
    ...bests.slice(0, 2).map((best) => {
      const [figure, ...rest] = formatSharedMetric(best.metric, best.value, unit).split(" ");
      return {
        key: best.metric,
        figure: figure!,
        unit: rest.join(" ") || undefined,
        label: metricLabel(best.metric, exercise),
      };
    }),
    ...(bests.length === 0 && top !== null
      ? [{ key: "top", figure: String(top), unit: label, label: "Top weight" }]
      : []),
  ];

  return (
    <>
      <p className="meta-line mt-1">
        <span className="meta-fact">
          <Glyph name={glyph} className="glyph-16" />
          {GLYPH_LABELS[glyph]}
        </span>
        {machineName && <span className="meta-fact">{machineName}</span>}
        {where && (
          <span className="meta-fact">
            <Glyph name="pin" label="Gym" className="glyph-16" />
            {where}
          </span>
        )}
      </p>

      {first && last && (
        <section aria-label="Heaviest set each month">
          <p className="chart-head mt-3.5">
            <span>Heaviest set each month</span>
            <span className="font-medium tabular-nums">
              {inUnit(first.topKg)} → {inUnit(last.topKg)} {label}
            </span>
          </p>
          <InkBars
            points={points}
            label={`The heaviest working set each month, from ${inUnit(first.topKg)} ${label} in ${formatIsoShortMonth(
              first.month,
            )} to ${inUnit(last.topKg)} ${label} in ${formatIsoShortMonth(last.month)}`}
            format={(value) => String(Math.round(value))}
            ends={[formatIsoShortMonth(first.month), formatIsoShortMonth(last.month)]}
          />
        </section>
      )}

      <dl className="exercise-stats">
        {stats.map((stat) => (
          // The name first for a screen reader, the figure first for the eye.
          <div key={stat.key}>
            <dt className="type-caption font-medium text-ink-2">{stat.label}</dt>
            <dd className="whitespace-nowrap">
              <span className="type-figure-l">{stat.figure}</span>
              {stat.unit && (
                <span className="ml-0.5 type-caption font-semibold text-ink-2">{stat.unit}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="caption-head mt-4">Latest</h2>
      {performances.length === 0 ? (
        <p className="type-meta text-ink-2">Not logged yet.</p>
      ) : (
        <ul>
          {performances.map((performance, index) => {
            const best = topSet(performance.sets);
            return (
              <li key={performance.id}>
                <Link
                  href={`/workouts/${performance.sessionId}`}
                  className={
                    index === performances.length - 1 ? "latest-row plan-row-last" : "latest-row"
                  }
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-[min(100%,8rem)] flex-1 type-meta font-bold">
                      {formatIsoWeekdayDay(
                        todayInTimeZone(timeZone, new Date(performance.performedAt)),
                      )}
                      {exercise.loadPortability !== "global" && performance.machineName
                        ? ` · ${performance.machineName}`
                        : ""}
                    </span>
                    {best && <span className="type-figure-s whitespace-nowrap">{best}</span>}
                  </span>
                  <span className="type-caption font-medium [overflow-wrap:anywhere] text-ink-2 tabular-nums">
                    {formatSets(performance.sets, (loadUnit) => LOAD_UNIT_LABELS[loadUnit])}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
