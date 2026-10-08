import type { ExerciseGraphData } from "@/components/graph/exercise-graph";
import type { DayActivity } from "@/components/progress/calendar";
import type { GraphRange, RangePreset } from "@/domain/graph-range";
import type { MuscleVolume } from "@/domain/muscle-volume";
import type {
  FoodGraph,
  RecoveryGraph,
  RunningGraph,
  StrengthGraph,
} from "@/domain/progress-graphs";
import type { BodyLoadUnit } from "@/domain/types";

import type { HistoryItem } from "./history/history-list";

/** Everything the Progress page draws, read once on the server for every section. */
export type ProgressData = {
  /** Today in the account's time zone: "Today", "This week" and a year are said from it. */
  today: string;
  /** Dates the reader asked for that could not be read: said where a span is drawn. */
  rangeError: string | null;
  /** A week asked for that could not be read: said on Muscles, the one section on a week. */
  weekError: string | null;
  /** The span every graph is drawn over; null while dates chosen by hand hold. */
  preset: RangePreset | null;
  /** This month so far, for Overview's calendar: every activity of every day. */
  month: { month: string; today: number; activities: readonly DayActivity[] };
  /**
   * History's latest activities of every sport, newest first: the calendar read back from today,
   * past the month's first day when it holds fewer (ADR 0045).
   */
  overview: { latest: readonly HistoryItem[] };
  /** Volume by muscle group, read in the account's own unit. */
  strength: { range: GraphRange; graph: StrengthGraph; unit: BodyLoadUnit };
  exercise: ExerciseGraphData;
  /** `truncated`: more runs than a graph reads, so the oldest are left out (and said so). */
  running: { range: GraphRange; graph: RunningGraph; truncated: boolean };
  food: {
    range: GraphRange;
    graph: FoodGraph;
    /** Today's targets, drawn as the rule a day is read against. */
    targets: { kcal: number | null; protein: number | null };
  };
  /** Body weight. */
  body: {
    range: GraphRange;
    /** Readings in the account's own unit, oldest first. */
    points: { date: string; value: number }[];
    unit: BodyLoadUnit;
  };
  /** The body map's week, Monday to Sunday, stepped by its own arrows rather than the span. */
  muscles: { from: string; to: string; volume: MuscleVolume; totalSets: number };
  recovery: { range: GraphRange; graph: RecoveryGraph };
};
