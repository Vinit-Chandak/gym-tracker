import { z } from "zod";

import {
  ACTIVITY_METRICS,
  BOARD_MODES,
  DEFAULT_ACTIVITY_METRIC,
  type ActivityMetric,
  type BoardMetric,
  type BoardMode,
} from "@/domain/leaderboard";
import type { TrainingSport } from "@/domain/sport-scope";

type Param = string | string[] | undefined;

/** The leaderboard's search parameters: an unknown value is the default, never an error. */
export function parseBoardMode(value: Param): BoardMode {
  return BOARD_MODES.find((mode) => mode === value) ?? "activity";
}

/** A metric among the sport's own; the sport's first is its default. */
export function parseActivityMetric(value: Param, sport: TrainingSport): ActivityMetric {
  return (
    ACTIVITY_METRICS[sport].find((metric) => metric === value) ?? DEFAULT_ACTIVITY_METRIC[sport]
  );
}

/** A metric among those the chosen movement can be ranked by; the first is its primary. */
export function parseBoardMetric(value: Param, allowed: readonly BoardMetric[]): BoardMetric {
  return allowed.find((metric) => metric === value) ?? allowed[0]!;
}

const uuid = z.uuid();

/** The preselected movement, if the parameter is an id at all; the board picks otherwise. */
export function parseExerciseParam(value: Param): string | null {
  return typeof value === "string" && uuid.safeParse(value).success ? value : null;
}
