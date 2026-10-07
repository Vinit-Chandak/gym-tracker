import type { Metadata } from "next";
import { FreshAfterSets } from "@/components/fresh-after-sets";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { rangeOf, readWindowOf } from "@/domain/graph-range";
import { macroTargets } from "@/domain/nutrition";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  earliestOf,
  exerciseSessions,
  foodGraph,
  recoveryGraph,
  runningGraph,
  strengthGraph,
} from "@/domain/progress-graphs";
import { fromKilograms } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { readRangeChoice } from "@/server/queries/graph-range";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { readActivityDays, readSportTotals } from "@/server/repositories/activity-analytics";
import { listBodyWeights } from "@/server/repositories/body-weight";
import {
  pickSeries,
  readExerciseSeriesOptions,
  readExerciseSetRows,
  readFoodDayTotals,
  readStrengthRows,
} from "@/server/repositories/graphs";
import { readMuscleVolume } from "@/server/repositories/muscle-volume";
import { readTargets } from "@/server/repositories/nutrition";
import { readRecoveryHistory } from "@/server/repositories/recovery-history";
import { readRunActivities } from "@/server/repositories/training-data";
import { dateWindow, parseWeekRangeOrDefault } from "@/server/validation/date-range";
import Loading from "./loading";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once, except a set: a copy older
 * than the latest set is rendered again before it is shown (the open workout counts here). Only
 * a change made elsewhere, on another device or by the coach, can take up to the minute.
 */
export const unstable_dynamicStaleTime = 60;

/** Runs one graph reads at most: years of running, and a guard against a runaway account. */
const GRAPH_RUN_LIMIT = 5000;

export default async function ProgressPage(props: PageProps<"/progress">) {
  const user = await requireUser(),
    params = await props.searchParams;
  const profile = await getRequestProfile(user.id, user.email);
  const seen = await seenSetChanges();
  const timeZone = profile.timeZone;
  const today = todayInTimeZone(timeZone);
  // One span for every graph (ADR 0042): the dates in the URL, else the span this browser chose
  // last, else a month. "All" reads every day there could be a record on, and each graph is
  // then drawn from its own first record.
  const { choice, error: rangeError } = await readRangeChoice(params, today);
  const read = readWindowOf(choice, today);
  const window = dateWindow(read.from, read.to, timeZone);
  // The body map steps a week at a time, independent of the graphs' span.
  const { range: week, error: weekError } = parseWeekRangeOrDefault(params.week, timeZone);
  const month = today.slice(0, 7);
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";

  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [strength, options, runs, food, targets, weights, recovery, totals, days, body] =
        await Promise.all([
          readStrengthRows(tx, user.id, timeZone, window),
          readExerciseSeriesOptions(tx, user.id, window),
          readRunActivities(tx, user.id, window, 0, GRAPH_RUN_LIMIT),
          readFoodDayTotals(tx, user.id, window),
          readTargets(tx, user.id),
          listBodyWeights(tx, user.id, window),
          readRecoveryHistory(tx, user.id, window, timeZone),
          // Complete per-sport totals, from the canonical tables every sport is written to.
          readSportTotals(
            tx,
            user.id,
            choice.preset === "all" ? { to: today } : { from: window.from, to: window.to },
          ),
          readActivityDays(tx, user.id, { from: `${month}-01`, to: today }),
          readMuscleVolume(tx, user.id, week),
        ]);
      // Only the chosen exercise's sets are read: one series crosses the wire, not all of them.
      const selected = pickSeries(
        options,
        typeof params.series === "string" ? params.series : undefined,
      );
      const sets = selected
        ? await readExerciseSetRows(tx, user.id, timeZone, window, selected.id)
        : [];
      return {
        strength,
        options,
        selected,
        sets,
        runs,
        food,
        targets,
        weights,
        recovery,
        totals,
        days,
        body,
      };
    },
    { readOnly: true },
  );

  /** A graph's range: the shared one, or for "All" from that graph's own first record. */
  const rangeFor = (dates: Iterable<string>) =>
    rangeOf(choice, today, choice.preset === "all" ? earliestOf(dates) : null);

  const sessions = data.selected
    ? exerciseSessions(data.sets, data.selected.modality, data.selected.unit)
    : [];
  // Oldest first, as every graph draws; the reader hands them back newest first.
  const runs = data.runs.runs
    .map((run) => ({
      id: run.id,
      date: run.occurredOn,
      environment: run.environment,
      metres: run.distanceMeters,
      seconds: run.durationSeconds,
    }))
    .reverse();
  const strengthRange = rangeFor(data.strength.map((row) => row.date));
  const runningRange = rangeFor(runs.map((run) => run.date));
  const foodRange = rangeFor(data.food.map((day) => day.date));
  const bodyRange = rangeFor(data.weights.map((reading) => reading.measuredOn));
  const recoveryRange = rangeFor(data.recovery.map((reading) => reading.date));
  const overviewRange = rangeFor([
    ...data.strength.map((row) => row.date),
    ...runs.map((run) => run.date),
  ]);

  return (
    <FreshAfterSets seen={seen} loading={<Loading />}>
      <div className="progress page-width pt-safe">
        <ProgressView
          data={{
            today,
            error: rangeError || weekError || null,
            preset: choice.preset ?? null,
            month: {
              month,
              today: Number(today.slice(8, 10)),
              activities: data.days.items.map((item) => ({
                sport: item.sport,
                occurredOn: item.occurredOn,
                durationMs: item.durationMs,
                distanceMetres: item.distanceMetres,
                environment: item.environment,
              })),
            },
            overview: {
              range: overviewRange,
              totals: data.totals.map((total) => ({
                sport: total.sport,
                label: ACTIVITY_SPORT_LABELS[total.sport],
                count: total.count,
                days: total.days,
                durationMs: total.durationMs,
                unknownDurations: total.unknownDurations,
                distanceMetres: total.distanceMetres,
                unknownDistances: total.unknownDistances,
              })),
            },
            strength: {
              range: strengthRange,
              graph: strengthGraph(data.strength, strengthRange, today),
            },
            exercise: {
              range: rangeFor(sessions.map((session) => session.date)),
              options: data.options.map(({ id, name, machine, unit: loadUnit }) => ({
                id,
                name,
                machine,
                unit: loadUnit,
              })),
              selected: data.selected
                ? {
                    id: data.selected.id,
                    name: data.selected.name,
                    machine: data.selected.machine,
                    unit: data.selected.unit,
                    modality: data.selected.modality,
                    sessions,
                  }
                : null,
            },
            running: {
              range: runningRange,
              graph: runningGraph(runs, runningRange, today),
              truncated: data.runs.hasMore,
            },
            food: {
              range: foodRange,
              graph: foodGraph(data.food, foodRange, today),
              targets: data.targets
                ? {
                    kcal: data.targets.dailyKcal,
                    protein: macroTargets(data.targets, profile.bodyWeightKg, profile.trainingGoal)
                      .proteinG,
                  }
                : { kcal: null, protein: null },
            },
            body: {
              range: bodyRange,
              // Stored in kilograms, read in the account's own unit: the graph is about the
              // person, so it is drawn in the numbers they weigh themselves in.
              points: data.weights.map(({ measuredOn, weightKg }) => ({
                date: measuredOn,
                value: Math.round(fromKilograms(weightKg, unit) * 10) / 10,
              })),
              unit,
              week: { from: week.from, to: week.to, ...data.body },
            },
            recovery: {
              range: recoveryRange,
              graph: recoveryGraph(data.recovery, recoveryRange, today),
            },
          }}
        />
      </div>
    </FreshAfterSets>
  );
}
