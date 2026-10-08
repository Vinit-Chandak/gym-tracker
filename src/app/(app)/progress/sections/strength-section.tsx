"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { ExerciseGraph } from "@/components/graph/exercise-graph";
import { Graph } from "@/components/graph/graph";
import {
  bucketLabel,
  counted,
  dayHref,
  decimal,
  historyHref,
  workoutHref,
} from "@/components/graph/labels";
import { Select } from "@/components/ui/select";
import { STRENGTH_GROUP_CHOICES, type StrengthGroupChoice } from "@/domain/progress-graphs";
import { fromKilograms } from "@/lib/units";

import type { ProgressData } from "../progress-types";

const GROUP_LABELS: Record<StrengthGroupChoice, string> = {
  all: "All muscle groups",
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
};

const isGroup = (value: string | null): value is StrengthGroupChoice =>
  (STRENGTH_GROUP_CHOICES as readonly (string | null)[]).includes(value);

/**
 * Strength (ADR 0043): a muscle group, then one of its exercises, as a training log filters
 * by category and then exercise. With no exercise chosen, the group's volume; with one, that
 * exercise's graph. Both choices live in the URL. Only an exercise needs the server, to read
 * its sets: a group's volume is already here, so choosing a group costs no request.
 */
export function StrengthSection({
  strength,
  exercise,
  today,
}: Pick<ProgressData, "strength" | "exercise" | "today">) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { options } = exercise;

  // The exercise the URL names, once the server has read it. "All exercises" drops it from the
  // URL at once, so the series still on the page is no longer drawn.
  const shown = exercise.selected?.id === params.get("series") ? exercise.selected : null;
  const wanted = params.get("group");
  const shownGroup = shown ? options.find((option) => option.id === shown.id)?.group : null;
  // An exercise filed under another group (a link that named both) is listed under All.
  const group: StrengthGroupChoice =
    !isGroup(wanted) || (shown && wanted !== "all" && shownGroup !== wanted) ? "all" : wanted;
  // Every series is one option; the list names each exercise once, in the reader's order.
  const names = [
    ...new Set(
      options
        .filter((option) => group === "all" || option.group === group)
        .map((option) => option.name),
    ),
  ];

  /** Changes the URL in place, without a request: what it chooses is already on the page. */
  const replace = (change: (query: URLSearchParams) => void) => {
    const query = new URLSearchParams(window.location.search);
    change(query);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  };
  // A group is chosen afresh: its volume, with no exercise chosen inside it yet.
  const chooseGroup = (next: StrengthGroupChoice) =>
    replace((query) => {
      if (next === "all") query.delete("group");
      else query.set("group", next);
      query.delete("series");
    });
  const chooseExercise = (name: string) => {
    if (!name) return replace((query) => query.delete("series"));
    // The series of that name done most often; its machines are chosen on its graph.
    const first = options.find((option) => option.name === name);
    if (!first) return;
    const query = new URLSearchParams(window.location.search);
    query.set("series", first.id);
    startTransition(() => router.replace(`${pathname}?${query}` as Route, { scroll: false }));
  };

  return (
    <div className="mt-3 space-y-3">
      <Select
        aria-label="Muscle group"
        value={group}
        onChange={(event) => chooseGroup(event.target.value as StrengthGroupChoice)}
      >
        {STRENGTH_GROUP_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {GROUP_LABELS[choice]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Exercise"
        value={shown?.name ?? ""}
        disabled={pending}
        onChange={(event) => chooseExercise(event.target.value)}
      >
        <option value="">All exercises</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
      <div
        className={
          pending ? "opacity-50 transition-opacity duration-[var(--ov-duration-feedback)]" : ""
        }
      >
        {shown ? (
          <ExerciseGraph data={{ ...exercise, selected: shown }} today={today} origin="history" />
        ) : (
          <GroupVolume strength={strength} group={group} today={today} />
        )}
      </div>
    </div>
  );
}

/** "12.5k": a volume on the scale, in thousands once it reaches them. */
const compact = (value: number) =>
  value >= 1000 ? `${decimal(value / 1000)}k` : decimal(value, 0);

/**
 * A group's volume, load × reps, a bar per day, week or month: what the group's exercises
 * lifted. A bodyweight or timed set is work with no load, so it adds no volume but is still
 * counted among the sets a bar's readout names.
 */
function GroupVolume({
  strength,
  group,
  today,
}: Pick<ProgressData, "strength" | "today"> & { group: StrengthGroupChoice }) {
  const { range, graph, unit } = strength;
  const inUnit = (kilograms: number) => fromKilograms(kilograms, unit);
  const amount = (kilograms: number) => decimal(inUnit(kilograms), 0);
  const total = graph.totals.volume[group];
  const sets = graph.totals.sets[group];
  const workouts = graph.workouts[group];
  const named = GROUP_LABELS[group].toLowerCase();

  return (
    <Graph
      name={`Total volume, ${named}`}
      mark="bar"
      placement="bucket"
      range={range}
      // A bucket with no sets has nothing to draw or list; one whose sets carried no load is
      // still read, as nothing lifted. A group that lifted nothing at all says so instead.
      data={graph.buckets.map((bucket) => ({
        date: bucket.start,
        value: total > 0 && bucket.sets[group] > 0 ? inUnit(bucket.volume[group]) : null,
      }))}
      format={compact}
      summary={{
        label: "Total volume",
        figure: total > 0 ? amount(total) : null,
        unit,
        context:
          total > 0 && graph.weeksTrained > 0
            ? `${amount(total / graph.weeksTrained)} ${unit} a week · ${counted(workouts, "workout")}`
            : null,
      }}
      describe={(index) => {
        const bucket = graph.buckets[index]!;
        const label = bucketLabel(bucket, range.bucket, today);
        const held = bucket.sets[group];
        if (held <= 0)
          return {
            label,
            figure: null,
            context: group === "all" ? "No workouts" : `No ${named} exercises`,
          };
        const volume = bucket.volume[group];
        const many = bucket.workouts[group];
        const one = bucket.sessionId[group];
        return {
          label,
          figure: amount(volume),
          unit,
          context: [
            `${counted(held, "set")}${volume > 0 ? "" : ", none loaded"}`,
            many > 1 ? counted(many, "workout") : null,
          ]
            .filter(Boolean)
            .join(" · "),
          ...(one
            ? { href: workoutHref(one, "history"), action: "Open workout" }
            : range.bucket === "day"
              ? { href: dayHref(bucket.start), action: "Open day" }
              : {
                  href: historyHref(bucket.start, bucket.end, "workout"),
                  action: range.bucket === "week" ? "Open week" : "Open month",
                }),
        };
      }}
      note={{
        label: "About volume",
        content: `Load × reps of every working set from finished workouts, in ${unit}; warm-ups are left out. Each exercise counts under one muscle group, the one its main muscle is in, and is listed there, so the groups add up to All. Bodyweight, timed and machine-stack sets carry no load and add nothing here: choose the exercise to see its reps or time. The weekly figure is taken over the weeks you trained.`,
      }}
      empty={
        sets > 0
          ? `Nothing ${group === "all" ? "" : `for ${named} `}with a load in this range: bodyweight and timed sets add no volume. Choose an exercise to see its reps or time.`
          : group === "all"
            ? "No workouts in this range."
            : `No ${named} exercises in this range.`
      }
    />
  );
}
