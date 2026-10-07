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

export type SportTotal = {
  sport: string;
  label: string;
  count: number;
  days: number;
  durationMs: number;
  unknownDurations: number;
  distanceMetres: number | null;
  unknownDistances: number;
};

/** Everything the Progress page draws, read once on the server for every section. */
export type ProgressData = {
  /** Today in the account's time zone: "Today", "This week" and a year are said from it. */
  today: string;
  /** Dates or a week the reader asked for that could not be read. */
  error: string | null;
  /** The span every graph is drawn over; null while dates chosen by hand hold. */
  preset: RangePreset | null;
  /** This month so far, for Overview's calendar: every activity of every day. */
  month: { month: string; today: number; activities: readonly DayActivity[] };
  /**
   * Per-sport totals over the range, counted in SQL rather than sampled: a total is a total.
   */
  overview: { range: GraphRange; totals: readonly SportTotal[] };
  strength: { range: GraphRange; graph: StrengthGraph };
  exercise: ExerciseGraphData;
  /** `truncated`: more runs than a graph reads, so the oldest are left out (and said so). */
  running: { range: GraphRange; graph: RunningGraph; truncated: boolean };
  food: {
    range: GraphRange;
    graph: FoodGraph;
    /** Today's targets, drawn as the rule a day is read against. */
    targets: { kcal: number | null; protein: number | null };
  };
  body: {
    range: GraphRange;
    /** Readings in the account's own unit, oldest first. */
    points: { date: string; value: number }[];
    unit: BodyLoadUnit;
    /** The body map's week, stepped by its own arrows. */
    week: { from: string; to: string; volume: MuscleVolume; totalSets: number };
  };
  recovery: { range: GraphRange; graph: RecoveryGraph };
};
