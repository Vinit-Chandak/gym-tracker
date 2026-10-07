"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, dayLabel, decimal, workoutHref } from "@/components/graph/labels";
import { thinRecords } from "@/components/graph/thin";
import { useUrlChoice } from "@/components/graph/use-url-choice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import type { GraphRange } from "@/domain/graph-range";
import { formatDuration } from "@/domain/pace";
import {
  EXERCISE_MEASURES,
  measuresWithData,
  type ExerciseMeasure,
  type ExerciseSession,
} from "@/domain/progress-graphs";
import type { ExerciseModality, LoadUnit } from "@/domain/types";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import type { NavOrigin } from "@/lib/nav";

/** One series to choose: an exercise on one machine in one unit. */
export type ExerciseSeriesChoice = { id: string; name: string; machine: string; unit: LoadUnit };

export type ExerciseGraphData = {
  range: GraphRange;
  /** Every series ever logged (on an exercise's page, that exercise's). */
  options: ExerciseSeriesChoice[];
  /** Only the chosen series' workouts cross the wire; the rest stay on the server. */
  selected:
    (ExerciseSeriesChoice & { modality: ExerciseModality; sessions: ExerciseSession[] }) | null;
};

/** Each measure: its segment, its name, and the summary over the range. */
const MEASURES: Record<ExerciseMeasure, { short: string; long: string; best: string }> = {
  e1rm: { short: "e1RM", long: "Estimated 1RM", best: "Best estimated 1RM" },
  maxWeight: { short: "Weight", long: "Max weight", best: "Heaviest set" },
  maxReps: { short: "Reps", long: "Max reps", best: "Most reps in a set" },
  maxVolume: { short: "Volume", long: "Max volume", best: "Biggest set, load × reps" },
  maxSeconds: { short: "Time", long: "Max time", best: "Longest set" },
  maxMetres: { short: "Distance", long: "Max distance", best: "Longest set" },
};

/**
 * One exercise, workout by workout (ADR 0042): its estimated 1RM, heaviest set, most reps and
 * biggest set, each a line with a point per workout that opens it. Progress passes the
 * exercises to choose from; an exercise's own page has already chosen. A machine's loads are
 * its own: an exercise done on two machines is two series, never one line.
 */
export function ExerciseGraph({
  data,
  today,
  origin,
  picker = false,
}: {
  data: ExerciseGraphData;
  today: string;
  /** Where an opened workout goes back to. */
  origin: NavOrigin | null;
  /** Offer every exercise, not only the machines of this one. */
  picker?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { selected, options, range } = data;

  const sessions = selected?.sessions ?? [];
  const available = measuresWithData(sessions);
  const [measure, setMeasure] = useUrlChoice<ExerciseMeasure>(
    "measure",
    available,
    available[0] ?? "maxWeight",
  );

  // The series lives in the URL, so the server sends one series rather than every one.
  const chooseSeries = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("series", id);
    startTransition(() => router.replace(`${pathname}?${next}` as Route, { scroll: false }));
  };
  const names = [...new Set(options.map((option) => option.name))];
  const machines = selected ? options.filter((option) => option.name === selected.name) : [];

  const unit = selected ? LOAD_UNIT_LABELS[selected.unit] : "";
  const figure = (value: number): { figure: string; unit?: string } => {
    if (measure === "maxReps") return { figure: String(value), unit: value === 1 ? "rep" : "reps" };
    if (measure === "maxSeconds") return { figure: formatDuration(value) };
    if (measure === "maxMetres") return { figure: decimal(value, 0), unit: "m" };
    return { figure: decimal(value), unit };
  };
  const setOf = (weight: number | null, reps: number | null) =>
    weight !== null && reps !== null ? `${decimal(weight)} ${unit} × ${reps}` : null;
  /** What the set behind a session's best was, in the readout's second line. */
  const detail = (session: ExerciseSession): string | null => {
    switch (measure) {
      case "e1rm":
        return session.e1rmSet ? setOf(session.e1rmSet.weight, session.e1rmSet.reps) : null;
      case "maxWeight":
        return session.maxWeightReps === null
          ? null
          : `${session.maxWeightReps} ${session.maxWeightReps === 1 ? "rep" : "reps"}`;
      case "maxReps":
        return session.maxRepsWeight === null
          ? null
          : `At ${decimal(session.maxRepsWeight)} ${unit}`;
      case "maxVolume":
        return session.maxVolumeSet
          ? setOf(session.maxVolumeSet.weight, session.maxVolumeSet.reps)
          : null;
      default:
        return null;
    }
  };

  const points = sessions.map((session) => ({ date: session.date, value: session[measure] }));
  // Past about sixty workouts, a point per week or month: that span's best workout.
  const line = thinRecords(points, range, { reduce: "max" });
  const bestIndex = points.reduce(
    (best, point, index) =>
      point.value !== null && (best < 0 || point.value > points[best]!.value!) ? index : best,
    -1,
  );
  const best = bestIndex >= 0 ? sessions[bestIndex]! : null;

  return (
    <div className="space-y-3">
      {picker && (
        <Select
          aria-label="Exercise"
          value={selected?.name ?? ""}
          disabled={options.length === 0 || pending}
          onChange={(event) => {
            const first = options.filter((option) => option.name === event.target.value).at(0);
            if (first) chooseSeries(first.id);
          }}
        >
          {options.length === 0 && <option value="">No logged exercises yet</option>}
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      )}
      {/* The machine, only where there is one to choose between. */}
      {machines.length > 1 && selected && (
        <Select
          aria-label="Machine"
          value={selected.id}
          disabled={pending}
          onChange={(event) => chooseSeries(event.target.value)}
        >
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.machine}
              {machine.unit === "kg" ? "" : ` · ${LOAD_UNIT_LABELS[machine.unit]}`}
            </option>
          ))}
        </Select>
      )}
      {available.length > 1 && (
        <SegmentedControl
          name="exercise-measure"
          aria-label="Measure"
          options={EXERCISE_MEASURES.filter((m) => available.includes(m)).map((m) => ({
            value: m,
            label: MEASURES[m].short,
            accessibleLabel: MEASURES[m].long,
          }))}
          value={measure}
          onChange={setMeasure}
          columns={available.length}
        />
      )}
      {selected ? (
        <div className={pending ? "opacity-50 transition-opacity" : undefined}>
          <Graph
            name={`${selected.name}, ${MEASURES[measure].long.toLowerCase()}`}
            mark="line"
            placement="record"
            range={range}
            data={line.points}
            format={(value) =>
              measure === "maxSeconds"
                ? formatDuration(value)
                : decimal(value, value >= 100 ? 0 : 1)
            }
            summary={{
              label: MEASURES[measure].best,
              ...(best ? figure(best[measure]!) : { figure: null }),
              context: best
                ? [detail(best), dayLabel(best.date, today)].filter(Boolean).join(" · ")
                : null,
            }}
            describe={(index) => {
              const group = line.groups[index]!;
              const session = sessions[group.pick ?? group.indices[0]!]!;
              const value = session[measure];
              const many = line.bucket !== null && group.indices.length > 1;
              return {
                label: line.bucket
                  ? `${bucketLabel(
                      { start: group.start, end: group.end, partial: group.end >= today },
                      line.bucket,
                      today,
                    )}${many ? ` · best of ${counted(group.indices.length, "workout")}` : ""}`
                  : dayLabel(session.date, today),
                ...(value === null ? { figure: null } : figure(value)),
                context: line.bucket
                  ? [detail(session), dayLabel(session.date, today)].filter(Boolean).join(" · ")
                  : detail(session),
                href: workoutHref(session.sessionId, origin),
                action: "Open workout",
              };
            }}
            note={{
              label: "About this graph",
              content: (
                <>
                  One point per finished workout: its best set by this measure; over many workouts,
                  one per week or month, the best of them. Warm-ups are left out.{" "}
                  {selected.machine === "Across gyms"
                    ? "The load means the same at every gym, so every workout counts."
                    : "Loads on different machines are not comparable, so each machine is its own line."}
                  {measure === "e1rm" &&
                    " Estimated 1RM is Epley's formula on barbell and dumbbell sets of 1–10 reps; a dumbbell counts as logged, not doubled per hand."}
                  {measure === "maxVolume" && " Volume is one set's load × reps."}
                </>
              ),
            }}
            empty={`No ${selected.name.toLowerCase()} in this range.`}
          />
        </div>
      ) : (
        <p className="type-meta text-ink-2">Finish a workout with logged sets to see its trends.</p>
      )}
    </div>
  );
}
