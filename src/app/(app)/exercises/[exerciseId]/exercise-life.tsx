"use client";

import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Figures } from "@/components/ui/figures";
import { GLYPH_LABELS, Glyph, type GlyphName } from "@/components/ui/glyphs";
import { formatSet, formatSets, loadReadingOf, type LoadReading } from "@/domain/sets";
import { metricLabel, type MetricExercise } from "@/domain/shared-stats";
import type { BodyLoadUnit, ExerciseModality, LoadUnit, SetType } from "@/domain/types";
import { todayInTimeZone } from "@/domain/program-calendar";
import { FACT_SEPARATOR } from "@/lib/facts";
import { formatIsoDate, formatSharedMetric } from "@/lib/format";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { originQuery } from "@/lib/nav";
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

/**
 * The session's best working set, the figure a row of Latest leads with: "72.5 kg × 6". The
 * heaviest, and of the heaviest the most reps; on an assisted machine, where the number is help
 * given, the least help.
 */
function topSet(sets: readonly Set[], assisted: boolean, reading: LoadReading): string | null {
  const working = sets.filter(
    (set) => set.setType !== "warmup" && set.weight !== null && (!assisted || set.weight > 0),
  );
  if (working.length === 0) return null;
  const top = working.reduce((best, set) =>
    (assisted ? set.weight! < best.weight! : set.weight! > best.weight!) ||
    (set.weight === best.weight && (set.reps ?? 0) > (best.reps ?? 0))
      ? set
      : best,
  );
  return formatSet(top, LOAD_UNIT_LABELS[top.unit], reading);
}

/** Two names for one thing, as a reader would take them: "Smith machine" and "smith machine". */
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * An exercise across its whole life (board Exercise): its equipment and where, its graph (the
 * one Progress draws, ADR 0042), then the count of sessions and its records, and the latest
 * sessions, each led by its best set. Everything under the graph is read on the series the graph
 * draws: for a movement bound to its machine, the machine chosen over it, every other machine's
 * sessions listed apart; the figures are all time, and say so, as the graph's are its span.
 */
export function ExerciseLife({
  exercise,
  life,
  machineName,
  loadUnit,
  bests,
  unit,
  timeZone,
  today,
  graph,
  performances,
  elsewhere = [],
}: {
  exercise: MetricExercise & { modality: ExerciseModality; loadPortability: string };
  /** `assisted`: the machine's number is help given, so its best is the least of it. */
  life: { months: ExerciseMonth[]; sessions: number; assisted: boolean };
  /** The machine the graph, the figures and Latest are read on, for a movement bound to one. */
  machineName: string | null;
  /** The unit of the series the graph draws: a machine's loads are in its own. */
  loadUnit?: LoadUnit | null;
  bests: readonly ExerciseBest[];
  unit: BodyLoadUnit;
  timeZone: string;
  /** Today in the account's zone: a session in another year is named with it. */
  today: string;
  /** The exercise's graph, under its equipment and where. */
  graph: ReactNode;
  /** The latest sessions on the series the graph draws (on any equipment, when it is global). */
  performances: readonly LatestPerformance[];
  /** The latest on any other machine, listed apart: not this machine's history. */
  elsewhere?: readonly LatestPerformance[];
}) {
  const glyph = glyphFor(exercise.modality);
  const machine = machineName && !sameName(machineName, GLYPH_LABELS[glyph]) ? machineName : null;
  const global = exercise.loadPortability === "global";
  const where = performances[0]?.gymName ?? null;
  // A machine's loads are in its own unit; anything else in the account's.
  const shownUnit: LoadUnit = global ? unit : (loadUnit ?? performances[0]?.sets[0]?.unit ?? unit);
  // Loads are read in kilograms; a machine's own scale (a stack's pins) is read as it is.
  const inUnit = (kg: number) =>
    Math.round(
      (shownUnit === "kg" || shownUnit === "lb" ? fromKilograms(kg, shownUnit) : kg) * 10,
    ) / 10;
  const label = LOAD_UNIT_LABELS[shownUnit];

  const top = life.months.length
    ? inUnit((life.assisted ? Math.min : Math.max)(...life.months.map((m) => m.topKg)))
    : null;

  const stats: { key: string; figure: string; unit?: string; label: string }[] = [
    { key: "sessions", figure: String(life.sessions), label: "Sessions" },
    ...bests.slice(0, 2).map((best) => {
      const [figure, ...rest] = formatSharedMetric(best.metric, best.value, unit).split(/\s/);
      return {
        key: best.metric,
        figure: figure!,
        unit: rest.join(" ") || undefined,
        label: metricLabel(best.metric, exercise),
      };
    }),
    ...(bests.length === 0 && top !== null
      ? [
          {
            key: "top",
            figure: String(top),
            unit: label,
            label: life.assisted ? "Least assistance" : "Top weight",
          },
        ]
      : []),
  ];

  // What the figures and Latest are read on, said over them: the machine is chosen far above.
  const on = global ? null : (machineName ?? "an unrecorded machine");

  // A bodyweight movement's sets say the body ("Bodyweight × 12"), an assisted one's the help.
  const reading = loadReadingOf(exercise, life.assisted);
  const rows = (list: readonly LatestPerformance[], named: boolean) => (
    <ul>
      {list.map((performance, index) => {
        const best = topSet(performance.sets, life.assisted, reading);
        return (
          <li key={performance.id}>
            <Link
              // A past workout is History's, whichever page it is opened from.
              href={`/workouts/${performance.sessionId}${originQuery("history")}`}
              className={index === list.length - 1 ? "latest-row plan-row-last" : "latest-row"}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="min-w-[min(100%,8rem)] flex-1 type-meta font-bold">
                  {formatIsoDate(
                    todayInTimeZone(timeZone, new Date(performance.performedAt)),
                    today.slice(0, 4),
                  )}
                  {/* The machine goes to the next line whole, its dot with it, rather than
                      break inside its name ("Cable / station"); a name longer than a line wraps
                      within its own box. */}
                  {named && (
                    <>
                      {" "}
                      <span className="inline-block max-w-full">
                        {`${FACT_SEPARATOR.trimStart()}${performance.machineName ?? "Unrecorded machine"}`}
                      </span>
                    </>
                  )}
                </span>
                {best && <span className="type-figure-s whitespace-nowrap">{best}</span>}
              </span>
              <span className="type-caption font-medium [overflow-wrap:break-word] text-ink-2 tabular-nums">
                <Figures>
                  {formatSets(performance.sets, (setUnit) => LOAD_UNIT_LABELS[setUnit], reading)}
                </Figures>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <p className="meta-line mt-1">
        {/* The glyph says the kind and the machine is said in words, as a workout's rows say
            them: "Machine" and "Lat pulldown" side by side read as one name. A machine named
            after its kind ("Smith machine") is said once either way. */}
        <span className="meta-fact">
          <Glyph
            name={glyph}
            label={machine ? GLYPH_LABELS[glyph] : undefined}
            className="glyph-16"
          />
          {machine ?? GLYPH_LABELS[glyph]}
        </span>
        {where && (
          <span className="meta-fact">
            <Glyph name="pin" label="Gym" className="glyph-16" />
            {where}
          </span>
        )}
      </p>

      <section aria-label="Progress" className="mt-3.5">
        {graph}
      </section>

      {/* The graph's figures are its span's; these are every session's, and say so. */}
      <h2 className="caption-head exercise-stats-head">
        {on ? `All time on ${on}` : "All time, across gyms"}
      </h2>
      <dl className="exercise-stats">
        {stats.map((stat) => (
          // The name first for a screen reader, the figure first for the eye.
          <div key={stat.key}>
            <dt className="type-caption font-medium text-ink-2">{stat.label}</dt>
            <dd className="whitespace-nowrap">
              <span className="type-figure-l">{stat.figure}</span>
              {stat.unit && (
                <span className="type-caption font-semibold text-ink-2"> {stat.unit}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="caption-head mt-4">{on ? `Latest on ${on}` : "Latest"}</h2>
      {performances.length === 0 ? (
        <p className="type-meta text-ink-2">Not logged yet.</p>
      ) : (
        rows(performances, false)
      )}
      {elsewhere.length > 0 && (
        <>
          <h2 className="caption-head mt-4">Latest on other machines</h2>
          {rows(elsewhere, true)}
        </>
      )}
    </>
  );
}
