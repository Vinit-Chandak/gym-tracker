/**
 * Six people and a year of their training, from 13 October 2025 to 11 October 2026: two
 * beginners who become intermediates, an intermediate, two advanced lifters and a returning
 * hybrid athlete. Each trains on programmes of their own, in their own time zone and units,
 * misses days the way people do, and follows some of the others.
 */
import type { ActivitySport } from "@/domain/activity";
import type { Food } from "@/domain/nutrition";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import type { BodyLoadUnit, Sex, TrainingExperience, TrainingGoal } from "@/domain/types";

import {
  BEGINNER_FULL_BODY,
  GLUTE_SHOULDER_SPECIAL,
  HYBRID_HALF_MARATHON,
  OFFSEASON_HYPERTROPHY,
  POWERLIFTING_PEAK,
  PPL_HYPERTROPHY,
  PUSH_PULL_LEGS_6,
  STRENGTH_5K_BUILDER,
  STRENGTH_CONDITIONING,
  STRENGTH_MAINTENANCE_RUNS,
  STRENGTH_RUN_STARTER,
  UPPER_LOWER_4,
  UPPER_LOWER_STRENGTH,
} from "./programmes";

/** The first day of the year simulated, a Monday. */
export const YEAR_START = "2025-10-13";
/** The last day: the audit's today. */
export const YEAR_END = "2026-10-11";

export type GymSpec = {
  key: string;
  name: string;
  kind: "gym" | "home";
  address: string | null;
  /** Equipment type slugs registered there; `all` is every published type. */
  equipment: "all" | readonly string[];
  /** Types a commercial gym does not have, taken out of `all`. */
  without?: readonly string[];
  /** Machines whose steps are known, by type slug: the increment in the machine's unit. */
  known?: Readonly<Record<string, { increment: number; unit?: BodyLoadUnit }>>;
  /** How this gym's stacks read against the athlete's real strength (machines differ). */
  stackFactor?: number;
};

export type Block = {
  /** The day the athlete starts it, or the first training day after the previous one ends. */
  on: string;
  programme: ProgramBlueprint;
  /** Starts even when the previous block is unfinished, as switching early does. */
  replaces?: boolean;
};

/** A change to the running programme that keeps its schedule: the next version, continued. */
export type Revision = {
  on: string;
  what: string;
  revise: (blueprint: ProgramBlueprint) => ProgramBlueprint;
};

export type Break = { from: string; to: string; reason: string; detrain?: boolean };

export type FoodHabit = {
  from: string;
  /** Share of days anything is logged. */
  days: number;
  targets: { dailyKcal: number; proteinPerKg: number; fatPercent: number };
  foods: readonly (Food & { usual: number; meal: string })[];
};

export type Persona = {
  username: string;
  name: string;
  sex: Sex;
  dateOfBirth: string;
  heightCm: number;
  unit: BodyLoadUnit;
  timeZone: string;
  goal: TrainingGoal;
  experience: TrainingExperience;
  level: "beginner" | "intermediate" | "advanced";
  /** Body weight in kilograms at the start and at the end of the year. */
  bodyWeight: [number, number];
  privacy: {
    followApproval: boolean;
    shareTraining: boolean;
    shareBodyWeight: boolean;
    discoverableByEmail: boolean;
  };
  sports: readonly ActivitySport[];
  /** Cycling and swimming are shared only when chosen. */
  shareSports?: readonly ("cycling" | "swimming")[];
  distanceUnit?: "km" | "mi";
  poolUnit?: "m" | "yd";
  gyms: readonly GymSpec[];
  /** Which gym a day is trained at; the first gym otherwise. */
  gymFor?: (date: string, weekday: number) => string;
  blocks: readonly Block[];
  revisions?: readonly Revision[];
  /** Local time training usually starts. */
  trainAt: string;
  /** Minutes either side of it. */
  jitter: number;
  /** Share of sessions started at 23:35 and finished after midnight. */
  lateNight?: number;
  /** Share of planned training days actually trained, by month of the year (0–11 from YEAR_START). */
  adherence: (monthIndex: number) => number;
  /** Share of missed days marked skipped, with a reason, rather than left owed. */
  explicitSkip: number;
  breaks: readonly Break[];
  /** Share of sessions with a check-in answered. */
  checkIn: number;
  /** Share of sets taken at the suggested load when the app suggests one. */
  followSuggestion: number;
  /** Warm-up ramps logged before the first heavy barbell lift. */
  warmupSets: boolean;
  /** Days between body-weight readings at the finish. */
  weighEvery: number;
  /** Estimated one-rep maximum in kilograms, at the start, for lifts that need their own number. */
  strength: Readonly<Record<string, number>>;
  /** Everything else: a multiplier on the library's typical starting loads. */
  baseline: number;
  /** Strength gained per exposure: [first month, last month]. */
  growth: [number, number];
  food?: FoodHabit;
};

const weekdays = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

export const PERSONAS: readonly Persona[] = [
  {
    username: "aarav",
    name: "Aarav Sharma",
    sex: "male",
    dateOfBirth: "2001-03-14",
    heightCm: 176,
    unit: "kg",
    timeZone: "Asia/Kolkata",
    goal: "build_muscle",
    experience: "new",
    level: "beginner",
    bodyWeight: [64, 71.5],
    privacy: {
      followApproval: false,
      shareTraining: true,
      shareBodyWeight: true,
      discoverableByEmail: true,
    },
    sports: ["strength"],
    gyms: [
      {
        key: "golds",
        name: "Gold's Gym Andheri",
        kind: "gym",
        address: "Andheri West, Mumbai",
        equipment: "all",
        known: { dumbbells: { increment: 2.5 }, barbell: { increment: 2.5 } },
        stackFactor: 1,
      },
    ],
    blocks: [
      { on: "2025-10-13", programme: BEGINNER_FULL_BODY },
      { on: "2026-02-02", programme: UPPER_LOWER_4 },
      { on: "2026-06-01", programme: PUSH_PULL_LEGS_6 },
    ],
    trainAt: "19:00",
    jitter: 45,
    // Keen for six weeks, then the usual dip, then the habit sticks.
    adherence: (m) =>
      [0.92, 0.8, 0.62, 0.7, 0.78, 0.82, 0.85, 0.86, 0.88, 0.86, 0.9, 0.9][m] ?? 0.85,
    explicitSkip: 0.35,
    breaks: [
      { from: "2025-12-22", to: "2026-01-04", reason: "Home for the holidays", detrain: true },
      { from: "2026-04-13", to: "2026-04-19", reason: "Viral fever" },
    ],
    checkIn: 0.55,
    followSuggestion: 0.75,
    warmupSets: false,
    weighEvery: 7,
    strength: {
      "goblet-squat": 24,
      "high-bar-squat": 55,
      "conventional-deadlift": 70,
      "barbell-bench-press": 42,
      "overhead-press": 28,
      "barbell-row": 40,
    },
    baseline: 0.75,
    growth: [0.012, 0.0025],
    food: {
      from: "2026-03-01",
      days: 0.45,
      targets: { dailyKcal: 2800, proteinPerKg: 1.8, fatPercent: 25 },
      foods: [
        {
          name: "Poha",
          portionAmount: 1,
          unit: "serving",
          kcal: 270,
          carbsG: 48,
          fatG: 7,
          proteinG: 5,
          usual: 1,
          meal: "breakfast",
        },
        {
          name: "Whey protein",
          portionAmount: 1,
          unit: "scoop",
          kcal: 120,
          carbsG: 3,
          fatG: 1.5,
          proteinG: 24,
          usual: 1,
          meal: "morning_snack",
        },
        {
          name: "Chicken biryani",
          portionAmount: 1,
          unit: "serving",
          kcal: 650,
          carbsG: 75,
          fatG: 22,
          proteinG: 34,
          usual: 1,
          meal: "lunch",
        },
        {
          name: "Banana",
          portionAmount: 1,
          unit: "piece",
          kcal: 105,
          carbsG: 27,
          fatG: 0.4,
          proteinG: 1.3,
          usual: 2,
          meal: "afternoon_snack",
        },
        {
          name: "Dal and rice",
          portionAmount: 1,
          unit: "serving",
          kcal: 520,
          carbsG: 85,
          fatG: 9,
          proteinG: 18,
          usual: 1,
          meal: "dinner",
        },
        {
          name: "Paneer bhurji",
          portionAmount: 100,
          unit: "g",
          kcal: 265,
          carbsG: 6,
          fatG: 20,
          proteinG: 17,
          usual: 150,
          meal: "dinner",
        },
      ],
    },
  },
  {
    username: "meera",
    name: "Meera Iyer",
    sex: "female",
    dateOfBirth: "1994-08-02",
    heightCm: 162,
    unit: "kg",
    timeZone: "Asia/Kolkata",
    goal: "lose_fat",
    experience: "new",
    level: "beginner",
    bodyWeight: [72, 64.5],
    privacy: {
      followApproval: true,
      shareTraining: true,
      shareBodyWeight: false,
      discoverableByEmail: true,
    },
    sports: ["strength", "running"],
    distanceUnit: "km",
    gyms: [
      {
        key: "cult",
        name: "Cult Fit Koramangala",
        kind: "gym",
        address: "Koramangala, Bengaluru",
        equipment: "all",
        without: ["power_rack", "safety_squat_bar", "belt_squat", "pendulum_squat"],
        stackFactor: 0.9,
      },
      {
        key: "home",
        name: "Home",
        kind: "home",
        address: null,
        equipment: ["dumbbells", "resistance_bands", "adjustable_bench", "stability_ball"],
        known: { dumbbells: { increment: 1 } },
      },
    ],
    // Fridays at home when work runs late.
    gymFor: (date, weekday) => (weekday === 5 && Number(date.slice(8)) % 2 === 0 ? "home" : "cult"),
    blocks: [
      { on: "2025-10-13", programme: STRENGTH_RUN_STARTER },
      { on: "2025-12-15", programme: STRENGTH_5K_BUILDER },
      { on: "2026-03-09", programme: STRENGTH_5K_BUILDER },
      { on: "2026-06-15", programme: STRENGTH_5K_BUILDER, replaces: true },
    ],
    trainAt: "06:30",
    jitter: 20,
    adherence: (m) =>
      [0.85, 0.82, 0.75, 0.8, 0.85, 0.8, 0.7, 0.88, 0.9, 0.85, 0.9, 0.92][m] ?? 0.85,
    explicitSkip: 0.6,
    breaks: [{ from: "2026-07-20", to: "2026-07-31", reason: "Family wedding in Chennai" }],
    checkIn: 0.85,
    followSuggestion: 0.85,
    warmupSets: false,
    weighEvery: 3,
    strength: { "goblet-squat": 18, "barbell-hip-thrust": 50, "chest-press-machine": 28 },
    baseline: 0.5,
    growth: [0.01, 0.002],
    food: {
      from: "2025-10-13",
      days: 0.92,
      targets: { dailyKcal: 1650, proteinPerKg: 1.6, fatPercent: 30 },
      foods: [
        {
          name: "Idli",
          portionAmount: 1,
          unit: "piece",
          kcal: 39,
          carbsG: 8,
          fatG: 0.2,
          proteinG: 2,
          usual: 3,
          meal: "breakfast",
        },
        {
          name: "Sambar",
          portionAmount: 1,
          unit: "cup",
          kcal: 130,
          carbsG: 18,
          fatG: 4,
          proteinG: 6,
          usual: 1,
          meal: "breakfast",
        },
        {
          name: "Greek yoghurt",
          portionAmount: 100,
          unit: "g",
          kcal: 97,
          carbsG: 3.9,
          fatG: 5,
          proteinG: 9,
          usual: 150,
          meal: "morning_snack",
        },
        {
          name: "Curd rice",
          portionAmount: 1,
          unit: "serving",
          kcal: 330,
          carbsG: 50,
          fatG: 9,
          proteinG: 10,
          usual: 1,
          meal: "lunch",
        },
        {
          name: "Sprouts salad",
          portionAmount: 1,
          unit: "cup",
          kcal: 120,
          carbsG: 18,
          fatG: 1,
          proteinG: 9,
          usual: 1,
          meal: "afternoon_snack",
        },
        {
          name: "Grilled fish",
          portionAmount: 100,
          unit: "g",
          kcal: 140,
          carbsG: 0,
          fatG: 4,
          proteinG: 26,
          usual: 150,
          meal: "dinner",
        },
        {
          name: "Chapati",
          portionAmount: 1,
          unit: "piece",
          kcal: 104,
          carbsG: 18,
          fatG: 2.5,
          proteinG: 3,
          usual: 2,
          meal: "dinner",
        },
      ],
    },
  },
  {
    username: "jordan",
    name: "Jordan Reyes",
    sex: "male",
    dateOfBirth: "1996-11-21",
    heightCm: 180,
    unit: "lb",
    timeZone: "America/New_York",
    goal: "get_stronger",
    experience: "experienced",
    level: "intermediate",
    bodyWeight: [84, 86.5],
    privacy: {
      followApproval: false,
      shareTraining: true,
      shareBodyWeight: true,
      discoverableByEmail: false,
    },
    sports: ["strength"],
    gyms: [
      {
        key: "pf",
        name: "Planet Fitness Brooklyn",
        kind: "gym",
        address: "Atlantic Ave, Brooklyn",
        equipment: "all",
        without: [
          "barbell",
          "power_rack",
          "trap_bar",
          "ez_bar",
          "safety_squat_bar",
          "swiss_bar",
          "landmine",
          "flat_bench_press_station",
          "incline_bench_press_station",
          "decline_bench",
        ],
        known: { dumbbells: { increment: 5 }, smith_machine: { increment: 5 } },
        stackFactor: 1.15,
      },
      {
        key: "garage",
        name: "Garage gym",
        kind: "home",
        address: null,
        equipment: [
          "barbell",
          "power_rack",
          "flat_bench",
          "adjustable_bench",
          "dumbbells",
          "pull_up_bar",
          "weight_plates",
          "trap_bar",
          "ez_bar",
        ],
        // The plates in the garage are kilogram plates, bought second-hand.
        known: { barbell: { increment: 2.5, unit: "kg" }, dumbbells: { increment: 5 } },
      },
    ],
    // Weekends and the odd weekday at home.
    gymFor: (date, weekday) =>
      weekday >= 6 || (weekday === 2 && Number(date.slice(8)) % 3 === 0) ? "garage" : "pf",
    blocks: [
      { on: "2025-10-13", programme: UPPER_LOWER_STRENGTH },
      { on: "2026-01-05", programme: UPPER_LOWER_STRENGTH },
      { on: "2026-04-06", programme: STRENGTH_CONDITIONING },
      { on: "2026-07-13", programme: UPPER_LOWER_STRENGTH, replaces: true },
    ],
    revisions: [
      {
        on: "2025-11-17",
        what: "Higher reps on the volume day's presses",
        revise: (blueprint) => ({
          ...blueprint,
          days: blueprint.days.map((day) =>
            day.dayIndex !== 4
              ? day
              : {
                  ...day,
                  exercises: day.exercises.map((exercise) =>
                    exercise.exerciseSlug === "seated-db-shoulder-press"
                      ? { ...exercise, reps: [10, 15] as [number, number] }
                      : exercise,
                  ),
                },
          ),
        }),
      },
    ],
    trainAt: "18:30",
    jitter: 60,
    lateNight: 0.07,
    adherence: (m) =>
      [0.88, 0.8, 0.85, 0.8, 0.86, 0.82, 0.78, 0.84, 0.8, 0.75, 0.86, 0.88][m] ?? 0.82,
    explicitSkip: 0.25,
    breaks: [{ from: "2026-08-10", to: "2026-08-16", reason: "Vacation in Puerto Rico" }],
    checkIn: 0.4,
    followSuggestion: 0.6,
    warmupSets: true,
    weighEvery: 14,
    strength: {
      "barbell-bench-press": 105,
      "high-bar-squat": 140,
      "conventional-deadlift": 175,
      "overhead-press": 65,
      "barbell-row": 90,
      "smith-machine-squat": 130,
      "smith-machine-bench-press": 100,
    },
    baseline: 1.25,
    growth: [0.004, 0.0015],
  },
  {
    username: "kenji",
    name: "Kenji Watanabe",
    sex: "male",
    dateOfBirth: "1990-05-30",
    heightCm: 172,
    unit: "kg",
    timeZone: "Asia/Tokyo",
    goal: "get_stronger",
    experience: "experienced",
    level: "advanced",
    bodyWeight: [82.5, 83],
    privacy: {
      followApproval: true,
      shareTraining: true,
      shareBodyWeight: true,
      discoverableByEmail: true,
    },
    sports: ["strength"],
    gyms: [
      {
        key: "powerhouse",
        name: "Tokyo Powerhouse",
        kind: "gym",
        address: "Shibuya, Tokyo",
        equipment: "all",
        known: { barbell: { increment: 2.5 }, safety_squat_bar: { increment: 2.5 } },
        stackFactor: 1,
      },
    ],
    blocks: [
      { on: "2025-10-13", programme: POWERLIFTING_PEAK },
      { on: "2026-01-19", programme: OFFSEASON_HYPERTROPHY },
      { on: "2026-03-23", programme: POWERLIFTING_PEAK },
      { on: "2026-07-06", programme: OFFSEASON_HYPERTROPHY },
      { on: "2026-09-07", programme: POWERLIFTING_PEAK },
    ],
    trainAt: "18:00",
    jitter: 25,
    adherence: () => 0.95,
    explicitSkip: 0.7,
    breaks: [
      { from: "2026-01-10", to: "2026-01-18", reason: "Meet, then a week off", detrain: false },
    ],
    checkIn: 0.95,
    followSuggestion: 0.4,
    warmupSets: true,
    weighEvery: 2,
    strength: {
      "low-bar-squat": 225,
      "paused-bench-press": 140,
      "barbell-bench-press": 150,
      "conventional-deadlift": 265,
      "front-squat": 170,
      "close-grip-bench-press": 135,
      "pause-squat": 195,
      "good-morning": 130,
      "overhead-press": 92,
      "sumo-deadlift": 240,
      "safety-bar-squat": 200,
      "incline-barbell-bench": 125,
    },
    baseline: 1.7,
    growth: [0.0018, 0.0008],
  },
  {
    username: "sofia",
    name: "Sofia Rossi",
    sex: "female",
    dateOfBirth: "1998-01-09",
    heightCm: 168,
    unit: "kg",
    timeZone: "Europe/London",
    goal: "build_muscle",
    experience: "experienced",
    level: "advanced",
    bodyWeight: [61, 62.5],
    privacy: {
      followApproval: false,
      shareTraining: true,
      shareBodyWeight: false,
      discoverableByEmail: true,
    },
    sports: ["strength", "cycling"],
    shareSports: ["cycling"],
    gyms: [
      {
        key: "puregym",
        name: "PureGym Shoreditch",
        kind: "gym",
        address: "Old Street, London",
        equipment: "all",
        known: { cable_station: { increment: 2.5 }, dumbbells: { increment: 2 } },
        stackFactor: 1.05,
      },
      {
        key: "milan",
        name: "Hotel gym, Milan",
        kind: "gym",
        address: "Via Torino, Milano",
        equipment: [
          "dumbbells",
          "flat_bench",
          "adjustable_bench",
          "cable_station",
          "treadmill",
          "bike",
        ],
        known: { dumbbells: { increment: 2 } },
        stackFactor: 0.85,
      },
    ],
    blocks: [
      { on: "2025-10-13", programme: PPL_HYPERTROPHY },
      { on: "2026-01-12", programme: GLUTE_SHOULDER_SPECIAL },
      { on: "2026-03-16", programme: PPL_HYPERTROPHY },
      { on: "2026-07-06", programme: GLUTE_SHOULDER_SPECIAL },
      { on: "2026-09-07", programme: PPL_HYPERTROPHY },
    ],
    trainAt: "07:00",
    jitter: 30,
    adherence: (m) => [0.9, 0.9, 0.78, 0.9, 0.92, 0.9, 0.88, 0.9, 0.85, 0.8, 0.9, 0.92][m] ?? 0.9,
    explicitSkip: 0.5,
    breaks: [
      { from: "2025-12-24", to: "2025-12-28", reason: "Christmas in Bologna" },
      { from: "2026-08-17", to: "2026-08-30", reason: "Holiday", detrain: true },
    ],
    checkIn: 0.7,
    followSuggestion: 0.8,
    warmupSets: true,
    weighEvery: 7,
    strength: {
      "barbell-hip-thrust": 150,
      "barbell-romanian-deadlift": 95,
      "hack-squat": 120,
      "incline-db-press": 22,
      "smith-machine-bench-press": 60,
      "t-bar-row": 70,
    },
    baseline: 1.0,
    growth: [0.0025, 0.001],
    food: {
      from: "2025-10-13",
      days: 0.75,
      targets: { dailyKcal: 2200, proteinPerKg: 2, fatPercent: 28 },
      foods: [
        {
          name: "Overnight oats",
          portionAmount: 1,
          unit: "serving",
          kcal: 380,
          carbsG: 52,
          fatG: 10,
          proteinG: 22,
          usual: 1,
          meal: "breakfast",
        },
        {
          name: "Flat white",
          portionAmount: 1,
          unit: "serving",
          kcal: 110,
          carbsG: 9,
          fatG: 6,
          proteinG: 6,
          usual: 1,
          meal: "morning_snack",
        },
        {
          name: "Chicken caesar wrap",
          portionAmount: 1,
          unit: "piece",
          kcal: 520,
          carbsG: 45,
          fatG: 22,
          proteinG: 34,
          usual: 1,
          meal: "lunch",
        },
        {
          name: "Protein bar",
          portionAmount: 1,
          unit: "piece",
          kcal: 200,
          carbsG: 20,
          fatG: 7,
          proteinG: 20,
          usual: 1,
          meal: "afternoon_snack",
        },
        {
          name: "Salmon fillet",
          portionAmount: 100,
          unit: "g",
          kcal: 208,
          carbsG: 0,
          fatG: 13,
          proteinG: 20,
          usual: 140,
          meal: "dinner",
        },
        {
          name: "Basmati rice, cooked",
          portionAmount: 100,
          unit: "g",
          kcal: 130,
          carbsG: 28,
          fatG: 0.3,
          proteinG: 2.7,
          usual: 180,
          meal: "dinner",
        },
      ],
    },
  },
  {
    username: "liam",
    name: "Liam O'Connor",
    sex: "male",
    dateOfBirth: "1985-02-17",
    heightCm: 183,
    unit: "lb",
    timeZone: "America/Los_Angeles",
    goal: "endurance",
    experience: "experienced",
    level: "intermediate",
    bodyWeight: [88, 82],
    privacy: {
      followApproval: false,
      shareTraining: true,
      shareBodyWeight: false,
      discoverableByEmail: false,
    },
    sports: ["strength", "running", "swimming"],
    distanceUnit: "mi",
    poolUnit: "yd",
    gyms: [
      {
        key: "24h",
        name: "24 Hour Fitness Santa Monica",
        kind: "gym",
        address: "Santa Monica, CA",
        equipment: "all",
        known: { barbell: { increment: 5 }, dumbbells: { increment: 5 } },
        stackFactor: 1.1,
      },
    ],
    blocks: [
      { on: "2025-11-03", programme: HYBRID_HALF_MARATHON },
      { on: "2026-04-06", programme: STRENGTH_MAINTENANCE_RUNS },
      { on: "2026-07-06", programme: HYBRID_HALF_MARATHON, replaces: true },
    ],
    trainAt: "06:00",
    jitter: 30,
    adherence: (m) =>
      [0.8, 0.88, 0.85, 0.9, 0.65, 0.75, 0.9, 0.85, 0.8, 0.85, 0.82, 0.86][m] ?? 0.85,
    explicitSkip: 0.5,
    breaks: [{ from: "2026-02-09", to: "2026-02-22", reason: "Calf strain", detrain: true }],
    checkIn: 0.6,
    followSuggestion: 0.7,
    warmupSets: true,
    weighEvery: 10,
    strength: {
      "barbell-bench-press": 95,
      "trap-bar-deadlift": 160,
      "high-bar-squat": 120,
      "conventional-deadlift": 150,
      "overhead-press": 60,
    },
    baseline: 1.1,
    growth: [0.004, 0.0012],
  },
];

/** Follows over the year: who asks whom, when, and whether it is accepted. */
export const FOLLOWS: readonly {
  on: string;
  from: string;
  to: string;
  outcome: "accept" | "decline" | "leave";
}[] = [
  { on: "2025-10-20", from: "aarav", to: "meera", outcome: "accept" },
  { on: "2025-10-22", from: "meera", to: "aarav", outcome: "accept" },
  { on: "2025-10-25", from: "sofia", to: "kenji", outcome: "accept" },
  { on: "2025-10-26", from: "kenji", to: "sofia", outcome: "accept" },
  { on: "2025-11-02", from: "jordan", to: "liam", outcome: "accept" },
  { on: "2025-11-03", from: "liam", to: "jordan", outcome: "accept" },
  { on: "2025-11-15", from: "aarav", to: "kenji", outcome: "leave" },
  { on: "2025-12-01", from: "jordan", to: "kenji", outcome: "decline" },
  { on: "2026-02-10", from: "jordan", to: "kenji", outcome: "accept" },
  { on: "2026-01-05", from: "liam", to: "sofia", outcome: "accept" },
  { on: "2026-03-03", from: "meera", to: "sofia", outcome: "accept" },
  { on: "2026-04-18", from: "aarav", to: "jordan", outcome: "accept" },
  { on: "2026-05-02", from: "kenji", to: "aarav", outcome: "accept" },
  { on: "2026-06-12", from: "sofia", to: "meera", outcome: "leave" },
  { on: "2026-08-01", from: "liam", to: "meera", outcome: "decline" },
];

export function isoWeekdayOf(date: string): number {
  return weekdays(date);
}
