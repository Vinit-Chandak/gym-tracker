/**
 * The programmes the year's personas train on, written as an athlete would write them in the
 * manual builder: blueprints naming the shared library by slug. None of them is a template the
 * app ships; they exist so a year of history spans different splits, cycle lengths, rest
 * patterns, combined lift-and-run days, supersets and gym fallbacks.
 */
import {
  BLUEPRINT_VERSION,
  type BlueprintDay,
  type BlueprintExercise,
  type BlueprintRun,
  type ProgramBlueprint,
} from "@/domain/program-blueprint";

type Range = [number, number];
type Extra = Partial<
  Pick<
    BlueprintExercise,
    "progressionRule" | "supersetGroup" | "fallbacks" | "keyCue" | "targetLoadNote" | "perSide"
  >
>;

const double = (loadIncrement: number | null = null) =>
  ({ kind: "double_progression", loadIncrement }) as const;
const strength = (loadIncrement: number, repsRequired: number) =>
  ({ kind: "conservative_strength", loadIncrement, repsRequired }) as const;
const timeFirst = { kind: "time_first" } as const;

/** A rep-counted slot. */
function reps(
  exerciseSlug: string,
  sets: number,
  range: Range,
  rir: Range,
  rest: Range,
  extra: Extra = {},
): BlueprintExercise {
  return { exerciseSlug, sets, reps: range, rir, rest, progressionRule: double(), ...extra };
}

/** A slot held for time, such as a plank. */
function hold(exerciseSlug: string, sets: number, seconds: Range, rest: Range): BlueprintExercise {
  return { exerciseSlug, sets, duration: seconds, rir: null, rest, progressionRule: timeFirst };
}

/** A slot covered for distance, such as a carry. */
function carry(exerciseSlug: string, sets: number, metres: Range, rest: Range): BlueprintExercise {
  return { exerciseSlug, sets, distance: metres, rir: null, rest };
}

function day(
  dayIndex: number,
  dayOfWeek: number,
  name: string,
  focus: string,
  exercises: BlueprintExercise[],
  options: { run?: boolean; warmup?: string; effort?: string; time?: string } = {},
): BlueprintDay {
  return {
    dayIndex,
    dayOfWeek,
    name,
    focus,
    timeNote: options.time ?? (exercises.length ? "60–75 min" : ""),
    effortNote: options.effort ?? "",
    notes: "",
    includesLifting: exercises.length > 0,
    includesRun: options.run ?? false,
    warmupSlug: options.warmup ?? "",
    exercises,
  };
}

function rest(dayIndex: number, dayOfWeek: number, name = "Rest"): BlueprintDay {
  return day(dayIndex, dayOfWeek, name, "", [], { time: "" });
}

/** Planned runs for every week of a block: `weekly(week)` gives that week's numbers. */
function runs(
  weeks: number,
  dayOfWeek: number,
  weekly: (week: number) => { minutes: Range; km?: Range; rpe: Range; pace?: string },
  stopRule = "",
): BlueprintRun[] {
  return Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    const w = weekly(week);
    const tenth = (value: number) => Math.round(value * 10) / 10;
    return {
      weekIndex: week,
      dayOfWeek,
      duration: [Math.round(w.minutes[0]), Math.round(w.minutes[1])],
      ...(w.km ? { distanceKm: [tenth(w.km[0]), tenth(w.km[1])] as Range } : {}),
      rpe: w.rpe,
      paceNote: w.pace ?? "",
      progressionNote: "",
      stopRule,
    };
  });
}

const blueprint = (
  slug: string,
  name: string,
  weeks: number,
  notes: string,
  days: BlueprintDay[],
  planned: BlueprintRun[] = [],
): ProgramBlueprint => ({
  blueprintVersion: BLUEPRINT_VERSION,
  slug,
  name,
  weeks,
  notes,
  days,
  runs: planned,
});

// --- Aarav: an absolute beginner who becomes an intermediate ------------------------------------

export const BEGINNER_FULL_BODY = blueprint(
  "beginner-full-body",
  "Beginner Full Body",
  12,
  "Three full-body days a week on machines and dumbbells. Learn the movements, add reps, then load.",
  [
    day(
      1,
      1,
      "Full body A",
      "Squat pattern + push",
      [
        reps("goblet-squat", 3, [8, 12], [2, 3], [90, 120]),
        reps("chest-press-machine", 3, [8, 12], [2, 3], [90, 120]),
        reps("lat-pulldown", 3, [8, 12], [2, 3], [90, 120]),
        reps("seated-leg-curl", 2, [10, 15], [2, 3], [60, 90]),
        reps("db-lateral-raise", 2, [12, 15], [2, 3], [60, 90]),
        hold("plank", 3, [20, 45], [45, 60]),
      ],
      { warmup: "lower" },
    ),
    rest(2, 2),
    day(
      3,
      3,
      "Full body B",
      "Hinge + pull",
      [
        reps("leg-press-45", 3, [10, 15], [2, 3], [90, 120]),
        reps("seated-db-shoulder-press", 3, [8, 12], [2, 3], [90, 120]),
        reps("seated-cable-row", 3, [10, 12], [2, 3], [90, 120]),
        reps("db-romanian-deadlift", 3, [8, 12], [2, 3], [90, 120]),
        reps("cable-triceps-pushdown", 2, [10, 15], [1, 2], [60, 90]),
        reps("db-curl", 2, [10, 15], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    rest(4, 4),
    day(
      5,
      5,
      "Full body C",
      "Mixed",
      [
        reps("goblet-squat", 3, [10, 12], [2, 3], [90, 120]),
        reps("incline-db-press", 3, [8, 12], [2, 3], [90, 120]),
        reps("chest-supported-row", 3, [10, 12], [2, 3], [90, 120]),
        reps("leg-extension", 2, [12, 15], [1, 2], [60, 90]),
        reps("hanging-knee-raise", 2, [8, 15], [1, 3], [60, 90]),
        carry("farmers-carry", 3, [30, 40], [90, 120]),
      ],
      { warmup: "lower" },
    ),
    rest(6, 6),
    rest(7, 7),
  ],
);

export const UPPER_LOWER_4 = blueprint(
  "upper-lower-4",
  "Upper / Lower 4-day",
  12,
  "Two upper and two lower days. Barbell basics with machine accessories; reps first, then load.",
  [
    day(
      1,
      1,
      "Upper A",
      "Bench + row",
      [
        reps("barbell-bench-press", 3, [6, 8], [1, 3], [150, 180], {
          progressionRule: double(2.5),
        }),
        reps("barbell-row", 3, [8, 10], [1, 3], [120, 150], { progressionRule: double(2.5) }),
        reps("overhead-press", 2, [8, 10], [1, 3], [120, 150]),
        reps("lat-pulldown", 3, [10, 12], [1, 2], [90, 120]),
        reps("cable-triceps-pushdown", 2, [12, 15], [1, 2], [60, 90], { supersetGroup: "Arms" }),
        reps("hammer-curl", 2, [12, 15], [1, 2], [60, 90], { supersetGroup: "Arms" }),
      ],
      { warmup: "upper" },
    ),
    day(
      2,
      2,
      "Lower A",
      "Squat",
      [
        reps("high-bar-squat", 3, [5, 8], [2, 3], [180, 240], {
          progressionRule: strength(2.5, 8),
        }),
        reps("barbell-romanian-deadlift", 3, [8, 10], [2, 3], [150, 180]),
        reps("leg-press-45", 2, [10, 12], [1, 2], [120, 150]),
        reps("seated-leg-curl", 3, [10, 12], [1, 2], [90, 120]),
        reps("standing-calf-raise-machine", 3, [12, 15], [1, 2], [60, 90]),
        reps("cable-crunch", 2, [12, 15], [1, 2], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    rest(3, 3),
    day(
      4,
      4,
      "Upper B",
      "Incline + vertical pull",
      [
        reps("incline-db-press", 3, [8, 12], [1, 2], [120, 150]),
        reps("seated-cable-row", 3, [10, 12], [1, 2], [90, 120]),
        reps("seated-db-shoulder-press", 3, [8, 12], [1, 2], [90, 120]),
        reps("assisted-pull-up", 3, [6, 10], [1, 3], [120, 150], {
          keyCue: "Less help each month",
        }),
        reps("db-lateral-raise", 3, [12, 20], [0, 2], [60, 90]),
        reps("ez-bar-curl", 2, [10, 12], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      5,
      5,
      "Lower B",
      "Deadlift",
      [
        reps("conventional-deadlift", 3, [4, 6], [2, 3], [180, 240], {
          progressionRule: strength(5, 6),
        }),
        reps("bulgarian-split-squat", 3, [8, 10], [1, 3], [90, 120], { perSide: true }),
        reps("leg-extension", 3, [12, 15], [1, 2], [60, 90]),
        reps("lying-leg-curl", 2, [10, 12], [1, 2], [60, 90]),
        reps("seated-calf-raise", 3, [12, 15], [1, 2], [60, 90]),
        hold("plank", 2, [45, 60], [60, 60]),
      ],
      { warmup: "lower" },
    ),
    rest(6, 6),
    rest(7, 7),
  ],
);

export const PUSH_PULL_LEGS_6 = blueprint(
  "push-pull-legs-6",
  "Push Pull Legs",
  16,
  "Six days on, Sunday off. Heavy first day of each pair, lighter and higher-rep second.",
  [
    day(
      1,
      1,
      "Push heavy",
      "Chest + shoulders",
      [
        reps("barbell-bench-press", 4, [5, 7], [1, 2], [180, 210], {
          progressionRule: double(2.5),
        }),
        reps("overhead-press", 3, [6, 8], [1, 2], [150, 180]),
        reps("incline-db-press", 3, [8, 10], [1, 2], [120, 150]),
        reps("cable-lateral-raise", 3, [12, 15], [0, 2], [60, 90]),
        reps("overhead-cable-triceps-extension", 3, [10, 12], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      2,
      2,
      "Pull heavy",
      "Back + biceps",
      [
        reps("conventional-deadlift", 3, [3, 5], [2, 3], [210, 240], {
          progressionRule: strength(5, 5),
        }),
        reps("pull-up", 4, [5, 8], [1, 2], [150, 180]),
        reps("barbell-row", 3, [8, 10], [1, 2], [120, 150]),
        reps("face-pull", 3, [15, 20], [1, 2], [60, 90]),
        reps("barbell-curl", 3, [8, 10], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      3,
      3,
      "Legs heavy",
      "Squat",
      [
        reps("high-bar-squat", 4, [5, 7], [1, 2], [210, 240], {
          progressionRule: strength(2.5, 7),
        }),
        reps("barbell-romanian-deadlift", 3, [8, 10], [1, 2], [150, 180]),
        reps("leg-press-45", 3, [10, 12], [1, 2], [120, 150]),
        reps("seated-leg-curl", 3, [10, 12], [1, 2], [90, 120]),
        reps("standing-calf-raise-machine", 4, [10, 15], [0, 2], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    day(
      4,
      4,
      "Push volume",
      "Chest + triceps",
      [
        reps("incline-barbell-bench", 3, [8, 10], [1, 2], [150, 180]),
        reps("flat-db-press", 3, [10, 12], [1, 2], [120, 150]),
        reps("pec-deck-fly", 3, [12, 15], [0, 1], [60, 90]),
        reps("db-lateral-raise", 4, [12, 20], [0, 1], [60, 90]),
        reps("rope-triceps-pushdown", 3, [12, 15], [0, 1], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      5,
      5,
      "Pull volume",
      "Lats + rear delts",
      [
        reps("lat-pulldown", 4, [10, 12], [1, 2], [90, 120]),
        reps("chest-supported-row", 3, [10, 12], [1, 2], [90, 120]),
        reps("single-arm-cable-row", 3, [12, 15], [1, 2], [60, 90], { perSide: true }),
        reps("reverse-pec-deck", 3, [15, 20], [0, 1], [60, 90]),
        reps("hammer-curl", 3, [10, 12], [0, 1], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      6,
      6,
      "Legs volume",
      "Quads + hamstrings",
      [
        reps("hack-squat", 3, [8, 12], [1, 2], [150, 180]),
        reps("walking-lunge", 3, [10, 12], [1, 2], [90, 120], { perSide: true }),
        reps("leg-extension", 3, [12, 15], [0, 1], [60, 90]),
        reps("lying-leg-curl", 3, [12, 15], [0, 1], [60, 90]),
        reps("seated-calf-raise", 3, [15, 20], [0, 1], [60, 90]),
        reps("hanging-leg-raise", 3, [10, 15], [1, 2], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    rest(7, 7),
  ],
);

// --- Meera: a beginner who lifts three times a week and learns to run --------------------------

const STOP = "Shin or knee pain that rises during the run → walk home";

export const STRENGTH_RUN_STARTER = blueprint(
  "strength-run-starter",
  "Strength & Run Starter",
  8,
  "Three short full-body sessions and two easy runs. Run slowly enough to talk.",
  [
    day(
      1,
      1,
      "Full body A",
      "Legs + push",
      [
        reps("goblet-squat", 3, [10, 12], [2, 3], [90, 90]),
        reps("chest-press-machine", 3, [10, 12], [2, 3], [90, 90]),
        reps("assisted-pull-up", 3, [6, 10], [2, 3], [90, 120]),
        reps("glute-bridge", 3, [12, 15], [2, 3], [60, 60]),
        hold("plank", 2, [20, 40], [45, 45]),
      ],
      { warmup: "lower" },
    ),
    day(2, 2, "Easy run", "Run/walk", [], { run: true, warmup: "run", time: "25–35 min" }),
    day(
      3,
      3,
      "Full body B",
      "Hinge + pull",
      [
        reps("leg-press-45", 3, [12, 15], [2, 3], [90, 90]),
        reps("seated-cable-row", 3, [10, 12], [2, 3], [90, 90]),
        reps("db-romanian-deadlift", 3, [10, 12], [2, 3], [90, 90]),
        reps("seated-db-shoulder-press", 2, [10, 12], [2, 3], [90, 90]),
        reps("dead-bug", 2, [8, 12], [2, 3], [45, 45]),
      ],
      { warmup: "lower" },
    ),
    rest(4, 4),
    day(
      5,
      5,
      "Full body C",
      "Single leg + arms",
      [
        reps("step-up", 3, [8, 10], [2, 3], [90, 90], { perSide: true }),
        reps("incline-push-up", 3, [8, 12], [2, 3], [60, 90]),
        reps("lat-pulldown", 3, [10, 12], [2, 3], [90, 90]),
        reps("hip-abduction", 2, [15, 20], [1, 2], [60, 60]),
        reps("db-curl", 2, [10, 12], [1, 2], [60, 60]),
      ],
      { warmup: "lower" },
    ),
    day(6, 6, "Long easy run", "Time on feet", [], { run: true, warmup: "run", time: "30–45 min" }),
    rest(7, 7),
  ],
  [
    ...runs(
      8,
      2,
      (w) => ({
        minutes: [20 + w, 25 + w],
        km: [2 + w * 0.2, 2.6 + w * 0.25],
        rpe: [2, 3],
        pace: "Conversational",
      }),
      STOP,
    ),
    ...runs(
      8,
      6,
      (w) => ({
        minutes: [28 + w * 2, 35 + w * 2],
        km: [3 + w * 0.3, 3.8 + w * 0.35],
        rpe: [2, 3],
        pace: "Walk breaks are fine",
      }),
      STOP,
    ),
  ],
);

export const STRENGTH_5K_BUILDER = blueprint(
  "strength-5k-builder",
  "Strength & 5K Builder",
  10,
  "Lift three times, run three times. Monday lifts and then jogs easy; Thursday is a tempo run.",
  [
    day(
      1,
      1,
      "Lower + easy run",
      "Squat + hinge, then 20 min easy",
      [
        reps("goblet-squat", 3, [8, 12], [2, 3], [90, 120]),
        reps("db-romanian-deadlift", 3, [8, 12], [2, 3], [90, 120]),
        reps("leg-press-45", 2, [12, 15], [1, 2], [90, 90]),
        reps("seated-leg-curl", 2, [12, 15], [1, 2], [60, 90]),
      ],
      { run: true, warmup: "lower" },
    ),
    rest(2, 2),
    day(
      3,
      3,
      "Upper",
      "Push + pull",
      [
        reps("chest-press-machine", 3, [8, 12], [1, 2], [90, 120]),
        reps("assisted-pull-up", 3, [6, 10], [1, 2], [90, 120]),
        reps("seated-db-shoulder-press", 3, [8, 12], [1, 2], [90, 120]),
        reps("seated-cable-row", 3, [10, 12], [1, 2], [90, 90]),
        reps("cable-triceps-pushdown", 2, [12, 15], [1, 2], [60, 60], { supersetGroup: "Arms" }),
        reps("db-curl", 2, [12, 15], [1, 2], [60, 60], { supersetGroup: "Arms" }),
      ],
      { warmup: "upper" },
    ),
    day(4, 4, "Tempo run", "Comfortably hard", [], { run: true, warmup: "run", time: "30–40 min" }),
    day(
      5,
      5,
      "Full body",
      "Glutes + core",
      [
        reps("barbell-hip-thrust", 3, [8, 12], [1, 2], [90, 120]),
        reps("bulgarian-split-squat", 3, [8, 10], [1, 2], [90, 90], { perSide: true }),
        reps("lat-pulldown", 3, [10, 12], [1, 2], [90, 90]),
        hold("side-plank", 2, [20, 40], [45, 45]),
      ],
      { warmup: "lower" },
    ),
    day(6, 6, "Long run", "Easy, longer", [], { run: true, warmup: "run", time: "40–60 min" }),
    rest(7, 7),
  ],
  [
    ...runs(10, 1, () => ({ minutes: [18, 22], km: [2.6, 3.1], rpe: [2, 2] }), STOP),
    ...runs(
      10,
      4,
      (w) => ({
        minutes: [20 + w, 25 + w],
        km: [(20 + w) / 6.2, (25 + w) / 6.2],
        rpe: [3, 4],
        pace: "10K effort",
      }),
      STOP,
    ),
    ...runs(
      10,
      6,
      (w) => ({
        minutes: [35 + w * 1.5, 45 + w * 1.5],
        km: [(35 + w * 1.5) / 7.25, (45 + w * 1.5) / 7.25],
        rpe: [2, 3],
      }),
      STOP,
    ),
  ],
);

// --- Jordan: an intermediate who splits time between a big-box gym and a garage ----------------

/** Planet Fitness has no barbells or power racks, so every barbell slot says what replaces it. */
const NO_RACK = {
  squat: [
    { exerciseSlug: "smith-machine-squat", equipmentTypeSlug: "smith_machine", rank: 1 },
    { exerciseSlug: "goblet-squat", equipmentTypeSlug: "dumbbells", rank: 2 },
  ],
  bench: [
    { exerciseSlug: "smith-machine-bench-press", equipmentTypeSlug: "smith_machine", rank: 1 },
    { exerciseSlug: "flat-db-press", equipmentTypeSlug: "dumbbells", rank: 2 },
  ],
  row: [
    { exerciseSlug: "chest-supported-row", rank: 1 },
    { exerciseSlug: "single-arm-db-row", equipmentTypeSlug: "dumbbells", rank: 2 },
  ],
  hinge: [
    { exerciseSlug: "smith-machine-rdl", equipmentTypeSlug: "smith_machine", rank: 1 },
    { exerciseSlug: "db-romanian-deadlift", equipmentTypeSlug: "dumbbells", rank: 2 },
  ],
  press: [
    {
      exerciseSlug: "shoulder-press-machine",
      equipmentTypeSlug: "shoulder_press_machine",
      rank: 1,
    },
    { exerciseSlug: "standing-db-shoulder-press", equipmentTypeSlug: "dumbbells", rank: 2 },
  ],
  legCurl: [{ exerciseSlug: "nordic-hamstring-curl", rank: 1 }],
  pulldown: [{ exerciseSlug: "pull-up", equipmentTypeSlug: "pull_up_bar", rank: 1 }],
};

export const UPPER_LOWER_STRENGTH = blueprint(
  "upper-lower-strength",
  "Upper / Lower Strength",
  10,
  "Heavy Monday and Tuesday, volume Thursday and Friday. Fallbacks cover the gym without racks.",
  [
    day(
      1,
      1,
      "Upper heavy",
      "Bench",
      [
        reps("barbell-bench-press", 4, [4, 6], [1, 2], [180, 240], {
          progressionRule: strength(5, 6),
          fallbacks: NO_RACK.bench,
        }),
        reps("barbell-row", 4, [6, 8], [1, 2], [150, 180], { fallbacks: NO_RACK.row }),
        reps("overhead-press", 3, [6, 8], [1, 2], [150, 180], { fallbacks: NO_RACK.press }),
        reps("lat-pulldown", 3, [8, 10], [1, 2], [90, 120], { fallbacks: NO_RACK.pulldown }),
        reps("hammer-curl", 3, [10, 12], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      2,
      2,
      "Lower heavy",
      "Squat",
      [
        reps("high-bar-squat", 4, [4, 6], [1, 2], [180, 240], {
          progressionRule: strength(5, 6),
          fallbacks: NO_RACK.squat,
        }),
        reps("barbell-romanian-deadlift", 3, [6, 8], [1, 2], [150, 180], {
          fallbacks: NO_RACK.hinge,
        }),
        reps("walking-lunge", 3, [10, 12], [1, 2], [90, 120], { perSide: true }),
        reps("seated-leg-curl", 3, [8, 12], [1, 2], [90, 120], { fallbacks: NO_RACK.legCurl }),
        hold("plank", 3, [45, 75], [60, 60]),
      ],
      { warmup: "lower" },
    ),
    rest(3, 3),
    day(
      4,
      4,
      "Upper volume",
      "Incline + vertical",
      [
        reps("incline-db-press", 4, [8, 12], [1, 2], [120, 150]),
        reps("chin-up", 4, [6, 10], [1, 2], [120, 150]),
        reps("seated-db-shoulder-press", 3, [8, 12], [1, 2], [90, 120]),
        reps("seated-cable-row", 3, [10, 12], [1, 2], [90, 120], { fallbacks: NO_RACK.row }),
        reps("cable-triceps-pushdown", 3, [12, 15], [0, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    day(
      5,
      5,
      "Lower volume",
      "Deadlift",
      [
        reps("conventional-deadlift", 3, [5, 5], [2, 3], [180, 240], {
          progressionRule: strength(10, 5),
          fallbacks: NO_RACK.hinge,
        }),
        reps("leg-press-45", 3, [10, 15], [1, 2], [120, 150]),
        reps("bulgarian-split-squat", 3, [8, 10], [1, 2], [90, 120], { perSide: true }),
        reps("standing-calf-raise-machine", 3, [10, 15], [1, 2], [60, 90]),
        carry("farmers-carry", 3, [30, 40], [90, 120]),
      ],
      { warmup: "lower" },
    ),
    rest(6, 6),
    rest(7, 7),
  ],
);

export const STRENGTH_CONDITIONING = blueprint(
  "strength-conditioning",
  "Strength + Conditioning",
  12,
  "Three strength days and a conditioning finisher; the fourth day is optional cardio.",
  [
    day(
      1,
      1,
      "Squat + press",
      "Lower/upper",
      [
        reps("high-bar-squat", 5, [3, 5], [1, 2], [180, 240], { fallbacks: NO_RACK.squat }),
        reps("overhead-press", 4, [5, 6], [1, 2], [150, 180], { fallbacks: NO_RACK.press }),
        reps("chin-up", 3, [6, 10], [1, 2], [120, 150]),
        hold("rowing-erg", 1, [480, 720], [60, 60]),
      ],
      { warmup: "lower" },
    ),
    rest(2, 2),
    day(
      3,
      3,
      "Bench + row",
      "Upper",
      [
        reps("barbell-bench-press", 5, [3, 5], [1, 2], [180, 240], { fallbacks: NO_RACK.bench }),
        reps("barbell-row", 4, [6, 8], [1, 2], [120, 150], { fallbacks: NO_RACK.row }),
        reps("db-lateral-raise", 3, [12, 15], [0, 2], [60, 90]),
        reps("ez-bar-curl", 3, [8, 12], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    rest(4, 4),
    day(
      5,
      5,
      "Deadlift + carries",
      "Posterior chain",
      [
        reps("conventional-deadlift", 4, [3, 5], [1, 2], [180, 240], { fallbacks: NO_RACK.hinge }),
        reps("leg-press-45", 3, [8, 12], [1, 2], [120, 150]),
        carry("farmers-carry", 4, [40, 40], [90, 120]),
        hold("side-plank", 3, [30, 45], [45, 60]),
      ],
      { warmup: "lower" },
    ),
    rest(6, 6),
    rest(7, 7),
  ],
);

// --- Kenji: an advanced powerlifter --------------------------------------------------------------

export const POWERLIFTING_PEAK = blueprint(
  "powerlifting-peak",
  "Powerlifting Peak",
  12,
  "Competition lifts four days a week: a top set by RPE, back-off sets, and paused bench.",
  [
    day(
      1,
      1,
      "Squat day",
      "Comp squat + paused bench",
      [
        reps("low-bar-squat", 4, [2, 4], [1, 2], [240, 300], {
          progressionRule: strength(2.5, 4),
          keyCue: "Top set, then back-offs at −8%",
        }),
        reps("paused-bench-press", 4, [3, 5], [1, 2], [180, 240]),
        reps("pause-squat", 2, [3, 3], [2, 3], [180, 180]),
        reps("barbell-row", 3, [6, 8], [2, 2], [120, 150]),
      ],
      { warmup: "lower", effort: "RPE 8 top set" },
    ),
    rest(2, 2),
    day(
      3,
      3,
      "Bench day",
      "Comp bench",
      [
        reps("barbell-bench-press", 5, [2, 4], [1, 2], [210, 270], {
          progressionRule: strength(2.5, 4),
        }),
        reps("close-grip-bench-press", 3, [5, 7], [1, 2], [150, 180]),
        reps("pull-up", 4, [5, 8], [1, 2], [150, 180], {
          targetLoadNote: "Weighted: belt and plates",
        }),
        reps("face-pull", 3, [15, 20], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    rest(4, 4),
    day(
      5,
      5,
      "Deadlift day",
      "Comp deadlift",
      [
        reps("conventional-deadlift", 4, [2, 3], [1, 2], [240, 300], {
          progressionRule: strength(5, 3),
        }),
        reps("front-squat", 3, [4, 6], [2, 3], [180, 210]),
        reps("good-morning", 3, [6, 8], [2, 3], [120, 150]),
        hold("weighted-plank", 3, [30, 45], [60, 60]),
      ],
      { warmup: "lower" },
    ),
    day(
      6,
      6,
      "Bench volume",
      "Volume + arms",
      [
        reps("barbell-bench-press", 4, [6, 8], [2, 3], [150, 180]),
        reps("overhead-press", 3, [5, 7], [1, 2], [150, 180]),
        reps("dip", 3, [8, 12], [1, 2], [90, 120]),
        reps("skull-crusher", 3, [8, 12], [1, 2], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    rest(7, 7),
  ],
);

export const OFFSEASON_HYPERTROPHY = blueprint(
  "offseason-hypertrophy",
  "Off-season Hypertrophy",
  8,
  "Five days of bodybuilding work between meets: higher reps, more variation, joints first.",
  [
    day(
      1,
      1,
      "Chest + back",
      "Upper",
      [
        reps("incline-barbell-bench", 4, [6, 10], [1, 2], [150, 180]),
        reps("t-bar-row", 4, [8, 10], [1, 2], [120, 150]),
        reps("cable-fly", 3, [12, 15], [0, 1], [60, 90], { supersetGroup: "Finisher" }),
        reps("straight-arm-pulldown", 3, [12, 15], [0, 1], [60, 90], { supersetGroup: "Finisher" }),
      ],
      { warmup: "upper" },
    ),
    day(
      2,
      2,
      "Legs",
      "Quads",
      [
        reps("safety-bar-squat", 4, [6, 8], [1, 2], [180, 210]),
        reps("hack-squat", 3, [10, 12], [1, 2], [120, 150]),
        reps("leg-extension", 3, [12, 15], [0, 1], [60, 90]),
        reps("seated-calf-raise", 4, [10, 15], [0, 1], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    rest(3, 3),
    day(
      4,
      4,
      "Shoulders + arms",
      "Delts",
      [
        reps("seated-db-shoulder-press", 4, [8, 10], [1, 2], [120, 150]),
        reps("cable-lateral-raise", 4, [12, 20], [0, 1], [60, 90]),
        reps("ez-bar-curl", 3, [10, 12], [0, 1], [60, 90], { supersetGroup: "Arms" }),
        reps("rope-triceps-pushdown", 3, [10, 12], [0, 1], [60, 90], { supersetGroup: "Arms" }),
      ],
      { warmup: "upper" },
    ),
    day(
      5,
      5,
      "Posterior chain",
      "Hinge",
      [
        reps("sumo-deadlift", 4, [5, 6], [2, 3], [180, 240]),
        reps("lying-leg-curl", 3, [10, 12], [0, 1], [60, 90]),
        reps("barbell-hip-thrust", 3, [8, 10], [1, 2], [90, 120]),
        reps("back-extension", 3, [12, 15], [1, 2], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    day(
      6,
      6,
      "Upper pump",
      "Volume",
      [
        reps("flat-db-press", 4, [10, 12], [1, 2], [90, 120]),
        reps("neutral-grip-lat-pulldown", 4, [10, 12], [1, 2], [90, 120]),
        reps("reverse-pec-deck", 3, [15, 20], [0, 1], [60, 90]),
        reps("hammer-curl", 3, [10, 12], [0, 1], [60, 90]),
      ],
      { warmup: "upper" },
    ),
    rest(7, 7),
  ],
);

// --- Sofia: an advanced hypertrophy athlete ------------------------------------------------------

export const PPL_HYPERTROPHY = blueprint(
  "ppl-hypertrophy",
  "PPL Hypertrophy",
  12,
  "Push, pull, legs twice a week. Supersets to keep sessions under 75 minutes; last isolation set is a drop set.",
  [
    day(
      1,
      1,
      "Push A",
      "Chest",
      [
        reps("incline-db-press", 4, [8, 10], [1, 2], [120, 150]),
        reps("smith-machine-bench-press", 3, [8, 10], [1, 2], [120, 150]),
        reps("cable-lateral-raise", 4, [12, 15], [0, 1], [45, 60], { supersetGroup: "Delts" }),
        reps("face-pull", 3, [15, 20], [0, 1], [45, 60], { supersetGroup: "Delts" }),
        reps("rope-triceps-pushdown", 3, [12, 15], [0, 1], [45, 60]),
      ],
      { warmup: "upper" },
    ),
    day(
      2,
      2,
      "Pull A",
      "Back width",
      [
        reps("wide-grip-lat-pulldown", 4, [8, 12], [1, 2], [90, 120]),
        reps("chest-supported-row", 3, [10, 12], [1, 2], [90, 120]),
        reps("single-arm-lat-pulldown", 3, [12, 15], [0, 1], [60, 90], { perSide: true }),
        reps("bayesian-cable-curl", 3, [10, 12], [0, 1], [45, 60]),
      ],
      { warmup: "upper" },
    ),
    day(
      3,
      3,
      "Legs A",
      "Glutes + hamstrings",
      [
        reps("barbell-hip-thrust", 4, [8, 10], [1, 2], [120, 150]),
        reps("barbell-romanian-deadlift", 3, [8, 10], [1, 2], [120, 150]),
        reps("hip-abduction", 3, [15, 20], [0, 1], [45, 60]),
        reps("lying-leg-curl", 3, [10, 12], [0, 1], [60, 90]),
        reps("cable-kickback", 3, [12, 15], [0, 1], [45, 60], { perSide: true }),
      ],
      { warmup: "lower" },
    ),
    day(
      4,
      4,
      "Push B",
      "Shoulders",
      [
        reps("shoulder-press-machine", 4, [8, 12], [1, 2], [90, 120]),
        reps("pec-deck-fly", 3, [12, 15], [0, 1], [60, 90]),
        reps("db-lateral-raise", 4, [15, 20], [0, 1], [45, 60]),
        reps("overhead-cable-triceps-extension", 3, [12, 15], [0, 1], [45, 60]),
      ],
      { warmup: "upper" },
    ),
    day(
      5,
      5,
      "Pull B",
      "Back thickness",
      [
        reps("t-bar-row", 4, [8, 10], [1, 2], [90, 120]),
        reps("neutral-grip-lat-pulldown", 3, [10, 12], [1, 2], [90, 120]),
        reps("reverse-pec-deck", 3, [15, 20], [0, 1], [45, 60]),
        reps("incline-db-curl", 3, [10, 12], [0, 1], [45, 60]),
      ],
      { warmup: "upper" },
    ),
    day(
      6,
      6,
      "Legs B",
      "Quads",
      [
        reps("hack-squat", 4, [8, 10], [1, 2], [150, 180]),
        reps("bulgarian-split-squat", 3, [10, 12], [1, 2], [90, 120], { perSide: true }),
        reps("leg-extension", 3, [12, 15], [0, 1], [60, 90]),
        reps("standing-calf-raise-machine", 4, [10, 15], [0, 1], [45, 60]),
        hold("plank", 2, [60, 90], [45, 60]),
      ],
      { warmup: "lower" },
    ),
    rest(7, 7),
  ],
);

export const GLUTE_SHOULDER_SPECIAL = blueprint(
  "glute-shoulder-special",
  "Glute & Shoulder Specialisation",
  8,
  "Five days: glutes and delts three times a week each, everything else held.",
  [
    day(
      1,
      1,
      "Glutes heavy",
      "Hip thrust",
      [
        reps("barbell-hip-thrust", 5, [6, 8], [1, 2], [150, 180]),
        reps("b-stance-rdl", 3, [8, 10], [1, 2], [90, 120], { perSide: true }),
        reps("hip-abduction", 4, [15, 25], [0, 1], [45, 60]),
      ],
      { warmup: "lower" },
    ),
    day(
      2,
      2,
      "Delts + back",
      "Shoulders",
      [
        reps("seated-db-shoulder-press", 4, [8, 10], [1, 2], [90, 120]),
        reps("cable-lateral-raise", 4, [12, 15], [0, 1], [45, 60], { supersetGroup: "Delts" }),
        reps("reverse-pec-deck", 4, [15, 20], [0, 1], [45, 60], { supersetGroup: "Delts" }),
        reps("chest-supported-row", 3, [10, 12], [1, 2], [90, 90]),
      ],
      { warmup: "upper" },
    ),
    rest(3, 3),
    day(
      4,
      4,
      "Glutes volume",
      "Unilateral",
      [
        reps("bulgarian-split-squat", 4, [10, 12], [1, 2], [90, 120], { perSide: true }),
        reps("cable-kickback", 3, [15, 20], [0, 1], [45, 60], { perSide: true }),
        reps("back-extension", 3, [12, 15], [1, 2], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    day(
      5,
      5,
      "Delts + arms",
      "Pump",
      [
        reps("db-lateral-raise", 5, [15, 20], [0, 1], [45, 60]),
        reps("face-pull", 3, [15, 20], [0, 1], [45, 60]),
        reps("bayesian-cable-curl", 3, [10, 12], [0, 1], [45, 60], { supersetGroup: "Arms" }),
        reps("rope-triceps-pushdown", 3, [12, 15], [0, 1], [45, 60], { supersetGroup: "Arms" }),
      ],
      { warmup: "upper" },
    ),
    day(
      6,
      6,
      "Legs",
      "Quads",
      [
        reps("hack-squat", 4, [8, 10], [1, 2], [150, 180]),
        reps("leg-extension", 3, [12, 15], [0, 1], [60, 90]),
        reps("lying-leg-curl", 3, [10, 12], [0, 1], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    rest(7, 7),
  ],
);

// --- Liam: a returning lifter training for a half marathon -------------------------------------

const CALF = "Calf tightness that changes your stride → stop and walk";

export const HYBRID_HALF_MARATHON = blueprint(
  "hybrid-half-marathon",
  "Hybrid Half Marathon",
  16,
  "Three runs and three lifts. The long run grows to 18 km; lifting holds strength, not chases it.",
  [
    day(
      1,
      1,
      "Upper",
      "Strength maintenance",
      [
        reps("barbell-bench-press", 3, [5, 8], [2, 3], [150, 180]),
        reps("pull-up", 3, [5, 8], [2, 3], [120, 150]),
        reps("seated-db-shoulder-press", 3, [8, 10], [2, 2], [90, 120]),
        reps("seated-cable-row", 3, [10, 12], [2, 2], [90, 90]),
      ],
      { warmup: "upper" },
    ),
    day(2, 2, "Easy run", "Zone 2", [], { run: true, warmup: "run", time: "40–50 min" }),
    day(
      3,
      3,
      "Lower",
      "Single leg + hinge",
      [
        reps("trap-bar-deadlift", 3, [4, 6], [2, 3], [180, 210]),
        reps("bulgarian-split-squat", 3, [8, 10], [2, 2], [90, 120], { perSide: true }),
        reps("single-leg-calf-raise", 3, [12, 15], [1, 2], [60, 60], { perSide: true }),
        hold("side-plank", 2, [30, 45], [45, 45]),
      ],
      { warmup: "lower" },
    ),
    day(4, 4, "Tempo run", "Threshold", [], { run: true, warmup: "run", time: "35–55 min" }),
    day(
      5,
      5,
      "Full body",
      "Power + core",
      [
        reps("goblet-squat", 3, [8, 10], [2, 3], [90, 120]),
        reps("kettlebell-swing", 3, [12, 15], [2, 3], [60, 90]),
        reps("push-up", 3, [10, 20], [1, 2], [60, 90]),
        carry("suitcase-carry", 3, [40, 40], [60, 90]),
      ],
      { warmup: "lower" },
    ),
    day(6, 6, "Long run", "Easy, long", [], { run: true, warmup: "run", time: "60–120 min" }),
    rest(7, 7),
  ],
  [
    ...runs(16, 2, () => ({ minutes: [40, 50], km: [7, 9], rpe: [2, 2] }), CALF),
    ...runs(
      16,
      4,
      (w) => ({
        minutes: [30 + w * 0.5, 40 + w * 0.5],
        km: [(30 + w * 0.5) / 4.9, (40 + w * 0.5) / 4.9],
        rpe: [3, 4],
        pace: "Half-marathon pace",
      }),
      CALF,
    ),
    ...runs(
      16,
      6,
      (w) => {
        const km: Range = [Math.min(9 + w * 0.6, 18), Math.min(10 + w * 0.6, 19)];
        return { minutes: [km[0] * 6, km[1] * 6], km, rpe: [2, 3] };
      },
      CALF,
    ),
  ],
);

export const STRENGTH_MAINTENANCE_RUNS = blueprint(
  "strength-maintenance-runs",
  "Strength Maintenance + 2 Runs",
  12,
  "After the race: three lifting days to rebuild strength and two easy runs to keep the base.",
  [
    day(
      1,
      1,
      "Squat + bench",
      "Strength",
      [
        reps("high-bar-squat", 4, [5, 6], [1, 2], [180, 210]),
        reps("barbell-bench-press", 4, [5, 6], [1, 2], [180, 210]),
        reps("chin-up", 3, [6, 10], [1, 2], [120, 150]),
      ],
      { warmup: "lower" },
    ),
    day(2, 2, "Easy run", "Zone 2", [], { run: true, warmup: "run", time: "35–45 min" }),
    day(
      3,
      3,
      "Deadlift + press",
      "Strength",
      [
        reps("conventional-deadlift", 3, [3, 5], [1, 2], [210, 240]),
        reps("overhead-press", 4, [5, 7], [1, 2], [150, 180]),
        reps("barbell-row", 3, [8, 10], [1, 2], [120, 150]),
      ],
      { warmup: "lower" },
    ),
    rest(4, 4),
    day(
      5,
      5,
      "Accessories",
      "Arms + core",
      [
        reps("incline-db-press", 3, [8, 12], [1, 2], [90, 120]),
        reps("lat-pulldown", 3, [10, 12], [1, 2], [90, 90]),
        reps("ez-bar-curl", 3, [10, 12], [1, 2], [60, 60]),
        reps("cable-triceps-pushdown", 3, [12, 15], [1, 2], [60, 60]),
        hold("plank", 3, [45, 75], [45, 60]),
      ],
      { warmup: "upper" },
    ),
    day(6, 6, "Long easy run", "Base", [], { run: true, warmup: "run", time: "50–70 min" }),
    rest(7, 7),
  ],
  [
    ...runs(12, 2, () => ({ minutes: [35, 45], km: [6, 7], rpe: [2, 2] }), CALF),
    ...runs(12, 6, (w) => ({ minutes: [50 + w, 70 + w], km: [9, 12], rpe: [2, 3] }), CALF),
  ],
);

/** Every blueprint, for the checks that each one names only what the library has. */
export const ALL_PROGRAMMES: readonly ProgramBlueprint[] = [
  BEGINNER_FULL_BODY,
  UPPER_LOWER_4,
  PUSH_PULL_LEGS_6,
  STRENGTH_RUN_STARTER,
  STRENGTH_5K_BUILDER,
  UPPER_LOWER_STRENGTH,
  STRENGTH_CONDITIONING,
  POWERLIFTING_PEAK,
  OFFSEASON_HYPERTROPHY,
  PPL_HYPERTROPHY,
  GLUTE_SHOULDER_SPECIAL,
  HYBRID_HALF_MARATHON,
  STRENGTH_MAINTENANCE_RUNS,
];
