import type { AvailabilityStatus } from "@/domain/equipment-resolution";
import { setTargetIn, type SetLengthUnit } from "@/lib/distance-units";
import type { BodyRegion } from "@/domain/muscles";
import type { FoodUnit, Meal } from "@/domain/nutrition";
import type { SuggestionKind } from "@/domain/progression";
import type {
  EquipmentCategory,
  ExerciseCategory,
  ExerciseModality,
  GymKind,
  LoadPortability,
  LoadUnit,
  MuscleGroup,
  PrescriptionType,
  RunMode,
  ResistanceMode,
  Sex,
  TrainingGoal,
} from "@/domain/types";

export const GYM_KIND_LABELS: Record<GymKind, string> = {
  gym: "Gym",
  outdoor: "Outdoor",
  home: "Home",
};

export const RESISTANCE_MODE_LABELS: Record<ResistanceMode, string> = {
  free_weight: "Free weight",
  plate_loaded: "Plate-loaded",
  selectorized: "Weight stack",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
};

/**
 * How a piece of equipment is loaded, as a gym's list says it. A bench, a rack or a foam roller
 * carries no load of its own (its type is filed as bodyweight, the one mode for that): it is an
 * accessory, never "Bodyweight", which reads as the athlete's body being the load.
 */
export function equipmentLoadLabel(category: EquipmentCategory, mode: ResistanceMode): string {
  return category === "accessory" && mode === "bodyweight"
    ? "Accessory"
    : RESISTANCE_MODE_LABELS[mode];
}

export const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
  kg: "kg",
  lb: "lb",
  plate_count: "Plates",
  stack_index: "Stack #",
  none: "None",
};

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  free_weight: "Free weights",
  machine: "Machines",
  cable: "Cables",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
  accessory: "Accessories",
};

export const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionType, string> = {
  reps: "Reps",
  duration: "Time",
  distance: "Distance",
};

/**
 * The set grid's third column: what one set of this exercise is actually counted in, a carry
 * in the athlete's own length ("Yards" beside miles, ADR 0056).
 */
export function measureColumnLabel(measure: PrescriptionType, length: SetLengthUnit): string {
  switch (measure) {
    case "duration":
      return "Seconds";
    case "distance":
      return length === "yd" ? "Yards" : "Metres";
    default:
      return "Reps";
  }
}

/** The unit that follows a number of this measure, e.g. "25 m", "27 yd". */
export function measureUnitSuffix(measure: PrescriptionType, length: SetLengthUnit): string {
  switch (measure) {
    case "duration":
      return " s";
    case "distance":
      return ` ${length}`;
    default:
      return "";
  }
}

/**
 * A range of a set's metres in the athlete's length: "20–40 m", or "22–44 yd" beside miles.
 * Each end is the least figure that, logged, reaches it (`setTargetIn`): 15–45 m is "17–50 yd",
 * since 16 yd is kept as 14.6 m and 49 yd as 44.8 m, and a set logged at the figure shown meets
 * the bound the progression engine judges it by.
 */
export function lengthRangeLabel(
  minMetres: number | null,
  maxMetres: number | null,
  length: SetLengthUnit,
): string {
  const read = (metres: number | null) => (metres === null ? null : setTargetIn(metres, length));
  return rangeLabel(read(minMetres), read(maxMetres), measureUnitSuffix("distance", length));
}

/**
 * What one exercise's RIR target means, in the words of that exercise.
 *
 * Reps in reserve is a rep count everywhere the movement has reps; on timed and
 * distance-measured work there are no reps to leave, so the same number has to be said as time
 * or ground left instead. The exercise's own note, when the library has one, replaces this.
 */
export function rirMeaning(measure: PrescriptionType): string {
  switch (measure) {
    case "duration":
      return "Reps in reserve, read as time: 2 RIR means you could have held it roughly two more repetitions' worth — a few more seconds — not that you held to failure.";
    case "distance":
      return "Reps in reserve, read as ground: 2 RIR means you could have carried it a fair way further at the same quality. Put it down before the grip or the posture goes, not after.";
    default:
      return "Reps in reserve: how many more good reps you could have done. 2 RIR means you stopped two reps short of failure; 0 RIR means the next rep would not have moved.";
  }
}

/** "1 machine", "3 machines", "No equipment yet". */
export function equipmentCountLabel(count: number): string {
  if (count === 0) return "No equipment yet";
  return count === 1 ? "1 machine" : `${count} machines`;
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  abductors: "Abductors",
  calves: "Calves",
  abs: "Abs",
  obliques: "Obliques",
  lower_back: "Lower back",
  hip_flexors: "Hip flexors",
};

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  hips: "Hips",
  calves: "Calves",
  core: "Core",
};

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  cardio: "Cardio",
  mobility: "Mobility",
};

export const EXERCISE_MODALITY_LABELS: Record<ExerciseModality, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  bodyweight: "Bodyweight",
  cable: "Cable",
  machine: "Machine",
  smith_machine: "Smith machine",
  cardio: "Cardio",
  mobility: "Mobility",
};

export const LOAD_PORTABILITY_LABELS: Record<LoadPortability, string> = {
  global: "Comparable across gyms",
  equipment_specific: "Compared per machine",
  context_dependent: "Compared per setup",
};

/**
 * The library row's tag: where history is kept, when it is not kept across gyms. A push-up off a
 * bench is kept per setup (its height is the load), never "per machine".
 */
export const LOAD_PORTABILITY_TAGS: Record<LoadPortability, string | null> = {
  global: null,
  equipment_specific: "Per machine",
  context_dependent: "Per setup",
};

export const LOAD_PORTABILITY_HELP: Record<LoadPortability, string> = {
  global: "The load means the same everywhere, so history from any gym counts.",
  equipment_specific:
    "Stack numbers differ between machines, so history only counts on the exact machine.",
  context_dependent:
    "Depends on the bar or setup used, so history is kept per machine to stay honest.",
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  direct: "Available",
  fallback: "Fallback",
  unknown: "Unknown",
  unavailable: "Unavailable",
};

/**
 * Whether an exercise's name already says what it is done on ("High-bar barbell squat" with a
 * barbell, "Smith machine calf raise" on the Smith machine, "45° leg press" on the 45° leg press),
 * so a line naming both would say it twice.
 */
export function nameSaysEquipment(exerciseName: string, equipmentName: string): boolean {
  const words = (text: string) =>
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}°]+/u)
      .filter(Boolean)
      .map((word) => word.replace(/s$/, ""));
  const named = new Set(words(exerciseName));
  return words(equipmentName).every((word) => named.has(word));
}

/**
 * An exercise and the machine it is done on, "Lat pulldown on Cable station"; the exercise alone
 * where there is no machine or its name already says it ("Shoulder press machine").
 */
export function exerciseOnMachine(exerciseName: string, machineName: string | null | undefined) {
  return machineName && !nameSaysEquipment(exerciseName, machineName)
    ? `${exerciseName} on ${machineName}`
    : exerciseName;
}

/** "6–10" or "20–45 s"; single values collapse to one number. */
export function rangeLabel(min: number | null, max: number | null, suffix = ""): string {
  if (min === null && max === null) return "—";
  if (min === null || max === null || min === max) return `${min ?? max}${suffix}`;
  return `${min}–${max}${suffix}`;
}

/** "2 min", "90 s", "3–4 min". */
export function restLabel(minSeconds: number | null, maxSeconds: number | null): string {
  if (minSeconds === null && maxSeconds === null) return "—";
  const lo = minSeconds ?? maxSeconds ?? 0;
  const hi = maxSeconds ?? minSeconds ?? 0;
  // Two minutes and over reads in minutes, halves included, so a single exercise's rest
  // target matches how the programme states it: 210 s is "3.5 min", not "210 s". A rest the
  // coach set off the half-minute says its seconds rather than rounding: 200 s is "3 min 20 s".
  const inMinutes = (s: number) => String(s / 60);
  const halves = (s: number) => s % 30 === 0;
  if (lo >= 120 && hi >= 120 && halves(lo) && halves(hi)) {
    return lo === hi ? `${inMinutes(lo)} min` : `${inMinutes(lo)}–${inMinutes(hi)} min`;
  }
  if (lo === hi && lo >= 120) return `${Math.floor(lo / 60)} min ${lo % 60} s`;
  return lo === hi ? `${lo} s` : `${lo}–${hi} s`;
}

export const SET_TYPE_LABELS: Record<import("@/domain/types").SetType, string> = {
  warmup: "Warm-up",
  working: "Working",
  backoff: "Back-off",
  drop: "Drop",
  amrap: "AMRAP",
  failure: "To failure",
};

export const SLOT_STATUS_LABELS = {
  pending: "Pending",
  completed: "Done",
  skipped: "Skipped",
  not_in_programme: "Not this cycle",
} as const;

export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  increase: "Add load",
  hold: "Hold",
  repeat: "Repeat",
  reduce: "Reduce",
  revert: "Step back",
  extend: "Add time",
  lengthen: "Add distance",
  transfer: "Starting guess",
  start: "No history",
  resume: "Back after a break",
  coach: "Coach plan",
};

export const SEX_LABELS: Record<Sex, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
};

export const TRAINING_GOAL_LABELS: Record<TrainingGoal, string> = {
  build_muscle: "Build muscle",
  lose_fat: "Lose fat",
  get_stronger: "Get stronger",
  endurance: "Build endurance",
  general_fitness: "General fitness",
};

export const RUN_MODE_LABELS: Record<RunMode, string> = {
  outdoor: "Outdoor",
  treadmill: "Treadmill",
};

/**
 * Where a run, ride or swim happened, as its log form offers it. Said beside the session's name
 * (Run, Ride, Swim), as a workout's gym is beside its day, never in place of it.
 */
export const ENDURANCE_PLACE_LABELS: Readonly<Record<string, string>> = {
  outdoor: "Outdoor",
  treadmill: "Treadmill",
  indoor: "Indoor",
  pool: "Pool",
  open_water: "Open water",
};

/** ISO weekday (1 = Monday) to its name. Index 0 is unused, so the day number indexes it. */
/** A swim's stroke, as the swim form names it. */
export const SWIM_STROKE_LABELS: Record<import("@/domain/activity").SwimStroke, string> = {
  freestyle: "Freestyle",
  backstroke: "Backstroke",
  breaststroke: "Breaststroke",
  butterfly: "Butterfly",
  mixed: "Mixed",
  drill: "Drill",
  unspecified: "Not stated",
};

export const WEEKDAY_NAMES: readonly string[] = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** ISO weekday (1 = Monday) to a short name. */
export const WEEKDAY_SHORT: readonly string[] = [
  "",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

/** The day's meals, as the Food screen names them (ADR 0033). */
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  morning_snack: "Morning snack",
  lunch: "Lunch",
  afternoon_snack: "Afternoon snack",
  evening_snack: "Evening snack",
  dinner: "Dinner",
  late_night_snack: "Late-night snack",
};

/**
 * A food's unit as written after its amount. Litres are a capital L, as on a milk carton, so
 * "1 L" is never read as eleven.
 */
export const FOOD_UNIT_LABELS: Record<FoodUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  oz: "oz",
  cup: "cup",
  tbsp: "tbsp",
  tsp: "tsp",
  piece: "piece",
  slice: "slice",
  scoop: "scoop",
  serving: "serving",
};

/** The units spelt as words, which take a plural: 2 slices, where 2 g stays 2 g. */
export const FOOD_UNIT_PLURALS: Partial<Record<FoodUnit, string>> = {
  cup: "cups",
  piece: "pieces",
  slice: "slices",
  scoop: "scoops",
  serving: "servings",
};

/** A workout that is not a programme day: its name wherever a day's name would stand. */
export const UNPLANNED_SESSION = "Unplanned session";

/**
 * The active programme by its name, said to be complete once nothing but rest is left in it
 * (ADR 0051), as Today says "Programme complete": its fit at a gym is still read, for repeating
 * the block, but not as though it were still being trained.
 */
export function programmeLabel(program: { name: string; complete: boolean }): string {
  return program.complete ? `${program.name} (complete)` : program.name;
}
