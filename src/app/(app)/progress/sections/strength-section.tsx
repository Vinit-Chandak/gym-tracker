"use client";

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
import { useUrlChoice } from "@/components/graph/use-url-choice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { STRENGTH_GROUP_CHOICES, type StrengthGroupChoice } from "@/domain/progress-graphs";

import type { ProgressData } from "../progress-types";

const VIEWS = [
  { value: "muscles", label: "Muscle groups" },
  { value: "exercise", label: "Exercise" },
] as const;
type StrengthView = (typeof VIEWS)[number]["value"];

const GROUP_LABELS: Record<StrengthGroupChoice, string> = {
  all: "All muscle groups",
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
};

/**
 * Strength (ADR 0042): the muscle groups first, then one exercise. Two graphs, one at a time,
 * each with only the choices it needs.
 */
export function StrengthSection({
  strength,
  exercise,
  today,
}: Pick<ProgressData, "strength" | "exercise" | "today">) {
  const [view, setView] = useUrlChoice<StrengthView>(
    "strength",
    VIEWS.map((v) => v.value),
    "muscles",
  );
  return (
    <div className="mt-3 space-y-3">
      <SegmentedControl
        name="strength-view"
        aria-label="Strength graph"
        options={VIEWS}
        value={view}
        onChange={setView}
        columns={2}
      />
      {view === "muscles" ? (
        <MuscleGroups strength={strength} today={today} />
      ) : (
        <ExerciseGraph data={exercise} today={today} origin="history" picker />
      )}
    </div>
  );
}

/**
 * Working sets by muscle group, a bar per day, week or month. A set counts once per group, so
 * a compound lift is never counted once for each muscle it names.
 */
function MuscleGroups({ strength, today }: Pick<ProgressData, "strength" | "today">) {
  const { range, graph } = strength;
  const [group, setGroup] = useUrlChoice<StrengthGroupChoice>(
    "group",
    STRENGTH_GROUP_CHOICES,
    "all",
  );
  const total = graph.totals[group];
  const workouts = graph.workouts[group];
  const sets = (value: number) => (value === 1 ? "set" : "sets");

  return (
    <>
      <Select
        aria-label="Muscle group"
        value={group}
        onChange={(event) => setGroup(event.target.value as StrengthGroupChoice)}
      >
        {STRENGTH_GROUP_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {GROUP_LABELS[choice]}
          </option>
        ))}
      </Select>
      <Graph
        name={`Working sets, ${GROUP_LABELS[group].toLowerCase()}`}
        mark="bar"
        placement="bucket"
        range={range}
        // A bucket with no sets has nothing to draw or list, though it can still be read.
        data={graph.buckets.map((bucket) => ({
          date: bucket.start,
          value: bucket.sets[group] > 0 ? bucket.sets[group] : null,
        }))}
        format={(value) => decimal(value, 0)}
        scale={{ integral: true }}
        summary={{
          label: "Working sets",
          figure: total > 0 ? decimal(total) : null,
          unit: sets(total),
          context:
            total > 0 && graph.weeksTrained > 0
              ? `${decimal(total / graph.weeksTrained)} a week · ${counted(workouts, "workout")}`
              : null,
        }}
        describe={(index) => {
          const bucket = graph.buckets[index]!;
          const value = bucket.sets[group];
          const held = bucket.workouts[group];
          const label = bucketLabel(bucket, range.bucket, today);
          if (value <= 0)
            return {
              label,
              figure: null,
              context: group === "all" ? "No workouts" : `No ${GROUP_LABELS[group].toLowerCase()}`,
            };
          const one = bucket.sessionId[group];
          return {
            label,
            figure: decimal(value),
            unit: sets(value),
            context: counted(held, "workout"),
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
          label: "About working sets",
          content:
            "Working sets from finished workouts; warm-ups are left out. A set counts once for each muscle group it trains: in full where the group holds one of the exercise's main muscles, half where it holds only supporting ones, so a squat is one set of legs, never three. The weekly figure is taken over the weeks you trained.",
        }}
        empty="No workouts in this range."
      />
    </>
  );
}
