import type { ProgressionRule } from "../../../domain/types";

export type ProgramFallbackSeed = {
  exerciseSlug: string;
  equipmentTypeSlug?: string;
  rank: number;
  notes?: string;
};

export type ProgramExerciseSeed = {
  exerciseSlug: string;
  sets: number;
  /** [min, max] reps, or omitted for timed work. */
  reps?: [number, number];
  /** [min, max] seconds for timed work. */
  duration?: [number, number];
  perSide?: boolean;
  rir: [number, number];
  /** [min, max] seconds. */
  rest: [number, number];
  targetLoadNote?: string;
  progressionNotes?: string;
  progressionRule?: ProgressionRule;
  keyCue?: string;
  supersetGroup?: string;
  notes?: string;
  fallbacks?: ProgramFallbackSeed[];
};

export type ProgramDaySeed = {
  dayIndex: number;
  dayOfWeek: number;
  name: string;
  focus: string;
  timeNote: string;
  effortNote: string;
  notes: string;
  includesLifting: boolean;
  includesRun: boolean;
  warmupSlug: string;
  exercises: ProgramExerciseSeed[];
};

export type ProgramRunSeed = {
  weekIndex: number;
  dayOfWeek: number;
  duration: [number, number];
  rpe: [number, number];
  paceNote: string;
  progressionNote: string;
  shinRule: string;
  comment?: string;
};

export type ProgramSeed = {
  slug: string;
  name: string;
  startDate: string;
  weeks: number;
  notes: string;
  days: ProgramDaySeed[];
  runs: ProgramRunSeed[];
};

const strength = (increment: number, repsRequired: number): ProgressionRule => ({
  kind: "conservative_strength",
  loadIncrement: increment,
  repsRequired,
});
const double = (increment: number | null = null): ProgressionRule => ({
  kind: "double_progression",
  loadIncrement: increment,
});
const timeFirst: ProgressionRule = { kind: "time_first" };

const SHIN_RULE = "Pain rising each km → stop";

/**
 * The 8-week strength + aesthetics hybrid, transcribed from the LIFTING and RUNNING sheets.
 * Set counts follow the per-exercise sheet, not the WEEK summary: 16 / 19 / 14 / 13 / 18 / 10 per
 * day. Day 3's forearm pair counts as 2 sets of each movement. The original weekday labels
 * are shifted one day so Lower A starts Tuesday and Rest + Mobility falls on Monday.
 */
export const PROGRAM: ProgramSeed = {
  slug: "strength-aesthetics-hybrid-8wk",
  name: "8-Week Strength + Aesthetics Hybrid",
  startDate: "2026-09-08",
  weeks: 8,
  notes:
    "Priorities: strength → aesthetics/muscle → staying lean → running base. Anchors: bench 70×2, high-bar squat 70×5, conventional deadlift 110×3. Two easy runs are included. Weighted hyperextensions are excluded because they reliably provoke transient low-back pain.",
  days: [
    {
      dayIndex: 1,
      dayOfWeek: 2,
      name: "Lower A",
      focus: "Squat + quads",
      timeNote: "70–90 min",
      effortNote: "2–3 RIR compounds",
      notes: "Hard lower",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "lower",
      exercises: [
        {
          exerciseSlug: "high-bar-squat",
          sets: 3,
          reps: [4, 6],
          rir: [2, 3],
          rest: [180, 240],
          targetLoadNote: "~55–60 kg by RIR",
          progressionNotes: "+2.5 kg after 3×6",
          progressionRule: strength(2.5, 6),
          keyCue: "Brace; whole foot; controlled depth",
        },
        {
          exerciseSlug: "leg-press-45",
          sets: 3,
          reps: [6, 10],
          rir: [1, 2],
          rest: [120, 180],
          targetLoadNote: "Below 180 kg max-effort",
          progressionNotes: "3×10 then add plates",
          progressionRule: double(),
          keyCue: "Pelvis/back on pad; no bounce",
        },
        {
          exerciseSlug: "seated-leg-curl",
          sets: 3,
          reps: [8, 12],
          rir: [1, 2],
          rest: [120, 120],
          progressionNotes: "Reps then smallest stack jump",
          progressionRule: double(),
          keyCue: "Hips down; slow return",
        },
        {
          exerciseSlug: "leg-extension",
          sets: 2,
          reps: [10, 15],
          rir: [1, 2],
          rest: [90, 90],
          progressionNotes: "Full controlled reps; don't chase stack",
          progressionRule: double(),
          keyCue: "Knee aligned with pivot",
        },
        {
          exerciseSlug: "smith-machine-calf-raise",
          sets: 3,
          reps: [8, 15],
          rir: [1, 2],
          rest: [90, 90],
          progressionNotes: "Pause stretch/top; then load",
          progressionRule: double(2.5),
          keyCue: "No bouncing",
          fallbacks: [
            {
              exerciseSlug: "leg-press-calf-press",
              equipmentTypeSlug: "leg_press_45",
              rank: 1,
              notes: "Leg-press calf press when no Smith machine is available.",
            },
            {
              exerciseSlug: "leg-press-calf-press",
              equipmentTypeSlug: "leg_press_horizontal",
              rank: 2,
            },
          ],
        },
        {
          exerciseSlug: "cable-crunch",
          sets: 2,
          reps: [8, 15],
          rir: [1, 2],
          rest: [90, 90],
          targetLoadNote: "54–59 kg only with clean trunk flexion",
          progressionRule: double(),
          keyCue: "Don't hip-hinge",
        },
      ],
    },
    {
      dayIndex: 2,
      dayOfWeek: 3,
      name: "Upper A",
      focus: "Bench + back",
      timeNote: "70–90 min",
      effortNote: "1–3 RIR",
      notes: "Bench priority",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "upper",
      exercises: [
        {
          exerciseSlug: "barbell-bench-press",
          sets: 4,
          reps: [3, 5],
          rir: [2, 2],
          rest: [180, 240],
          targetLoadNote: "~57.5–62.5 kg",
          progressionNotes: "+2.5 kg after 4×5",
          progressionRule: strength(2.5, 5),
          keyCue: "Stable upper back; controlled touch",
        },
        {
          exerciseSlug: "pull-up",
          sets: 3,
          reps: [6, 10],
          rir: [1, 2],
          rest: [120, 180],
          targetLoadNote: "Bodyweight",
          progressionNotes: "After clean 3×10 add 2.5–5 kg",
          progressionRule: double(2.5),
          keyCue: "No kicking; controlled hang",
        },
        {
          exerciseSlug: "seated-cable-row",
          sets: 3,
          reps: [6, 10],
          rir: [1, 2],
          rest: [120, 120],
          progressionNotes: "Reps then stack",
          progressionRule: double(),
          keyCue: "Torso quiet",
        },
        {
          exerciseSlug: "incline-db-press",
          sets: 2,
          reps: [8, 12],
          rir: [1, 2],
          rest: [120, 120],
          targetLoadNote: "Below 25 kg × 12 max",
          progressionNotes: "Both sets at 12 then add",
          progressionRule: double(2.5),
          keyCue: "15–30° bench",
        },
        {
          exerciseSlug: "cable-lateral-raise",
          sets: 3,
          reps: [12, 20],
          rir: [1, 1],
          rest: [60, 90],
          progressionNotes: "Small jumps only",
          progressionRule: double(),
          keyCue: "No swing",
        },
        {
          exerciseSlug: "reverse-pec-deck",
          sets: 2,
          reps: [12, 20],
          rir: [1, 1],
          rest: [60, 90],
          progressionNotes: "Reps first",
          progressionRule: double(),
          keyCue: "Avoid shrugging",
        },
        {
          exerciseSlug: "overhead-cable-triceps-extension",
          sets: 2,
          reps: [10, 15],
          rir: [1, 1],
          rest: [60, 90],
          progressionNotes: "Reps then stack",
          progressionRule: double(),
          keyCue: "Ribs controlled",
        },
      ],
    },
    {
      dayIndex: 3,
      dayOfWeek: 4,
      name: "Easy Run + Arms",
      focus: "Aerobic + arms/forearms",
      timeNote: "70–100 min",
      effortNote: "Easy run; 1–2 RIR lifts",
      notes: "Run first or separate",
      includesLifting: true,
      includesRun: true,
      warmupSlug: "run",
      exercises: [
        {
          exerciseSlug: "preacher-curl",
          sets: 3,
          reps: [8, 12],
          rir: [1, 1],
          rest: [90, 90],
          targetLoadNote: "Below ~30 kg max effort",
          progressionNotes: "Earn 12s",
          progressionRule: double(2.5),
          keyCue: "Upper arm on pad",
        },
        {
          exerciseSlug: "cable-triceps-pushdown",
          sets: 3,
          reps: [8, 15],
          rir: [1, 1],
          rest: [90, 90],
          progressionNotes: "Reps then stack",
          progressionRule: double(),
          keyCue: "Elbows near sides",
        },
        {
          exerciseSlug: "hammer-curl",
          sets: 2,
          reps: [10, 15],
          rir: [1, 1],
          rest: [75, 90],
          targetLoadNote: "Below 15 kg if form loosens",
          progressionRule: double(2.5),
          keyCue: "No hip swing",
        },
        {
          exerciseSlug: "single-arm-overhead-cable-triceps-extension",
          sets: 2,
          reps: [10, 15],
          perSide: true,
          rir: [1, 1],
          rest: [75, 90],
          progressionNotes: "Smooth ROM",
          progressionRule: double(),
          keyCue: "Don't arch back",
        },
        {
          exerciseSlug: "wrist-curl",
          sets: 2,
          reps: [12, 20],
          rir: [1, 2],
          rest: [60, 60],
          progressionNotes: "Progress slowly",
          progressionRule: double(2.5),
          keyCue: "Move at wrist",
          supersetGroup: "forearms",
        },
        {
          exerciseSlug: "reverse-wrist-curl",
          sets: 2,
          reps: [12, 20],
          rir: [1, 2],
          rest: [60, 60],
          progressionNotes: "Progress slowly",
          progressionRule: double(2.5),
          keyCue: "Move at wrist",
          supersetGroup: "forearms",
        },
      ],
    },
    {
      dayIndex: 4,
      dayOfWeek: 5,
      name: "Lower B",
      focus: "Deadlift + posterior chain",
      timeNote: "70–90 min",
      effortNote: "2–3 RIR deadlift",
      notes: "No hyperextensions",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "lower",
      exercises: [
        {
          exerciseSlug: "conventional-deadlift",
          sets: 3,
          reps: [3, 5],
          rir: [2, 3],
          rest: [180, 240],
          targetLoadNote: "~85–95 kg by RIR",
          progressionNotes: "+2.5–5 kg after clean 3×5",
          progressionRule: strength(2.5, 5),
          keyCue: "Brace; bar close; no lean-back lockout",
        },
        {
          exerciseSlug: "db-romanian-deadlift",
          sets: 2,
          reps: [6, 10],
          rir: [2, 2],
          rest: [120, 180],
          targetLoadNote: "Conservative; DB history 17.5–22.5 kg each",
          progressionRule: double(2.5),
          keyCue: "Hips back; stop at hamstring limit",
        },
        {
          exerciseSlug: "split-squat",
          sets: 2,
          reps: [8, 12],
          perSide: true,
          rir: [1, 2],
          rest: [120, 120],
          progressionNotes: "Light first; load after balance",
          progressionRule: double(2.5),
          keyCue: "Front foot planted",
        },
        {
          exerciseSlug: "leg-press-horizontal",
          sets: 2,
          reps: [10, 15],
          rir: [1, 2],
          rest: [120, 120],
          progressionNotes: "Moderate volume, not max effort",
          progressionRule: double(),
          keyCue: "No pelvis roll",
        },
        {
          exerciseSlug: "seated-leg-curl",
          sets: 2,
          reps: [10, 15],
          rir: [1, 1],
          rest: [90, 90],
          progressionNotes: "Higher-rep work",
          progressionRule: double(),
          keyCue: "Slow eccentric",
        },
        {
          exerciseSlug: "hip-abduction",
          sets: 2,
          reps: [12, 20],
          rir: [1, 1],
          rest: [75, 90],
          progressionNotes: "Reps then load",
          progressionRule: double(),
          keyCue: "Pelvis still",
        },
      ],
    },
    {
      dayIndex: 5,
      dayOfWeek: 6,
      name: "Upper B",
      focus: "Pull-up + incline + shoulders",
      timeNote: "70–90 min",
      effortNote: "1–3 RIR",
      notes: "Pull-up strength",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "upper",
      exercises: [
        {
          exerciseSlug: "incline-barbell-bench",
          sets: 3,
          reps: [4, 6],
          rir: [2, 2],
          rest: [180, 180],
          targetLoadNote: "~50–55 kg",
          progressionNotes: "+2.5 kg after 3×6",
          progressionRule: strength(2.5, 6),
          keyCue: "Low incline",
        },
        {
          exerciseSlug: "pull-up",
          sets: 4,
          reps: [4, 6],
          rir: [2, 2],
          rest: [120, 180],
          targetLoadNote: "Bodyweight; if >6 easily add 2.5–5 kg",
          progressionRule: strength(2.5, 6),
          keyCue: "Full ROM",
          notes: "Pull-up — strength",
        },
        {
          exerciseSlug: "lat-pulldown",
          sets: 2,
          reps: [8, 12],
          rir: [1, 2],
          rest: [120, 120],
          progressionNotes: "Use RIR, not machine-stack comparison",
          progressionRule: double(),
          keyCue: "To upper chest",
        },
        {
          exerciseSlug: "seated-cable-row",
          sets: 2,
          reps: [8, 12],
          rir: [1, 2],
          rest: [120, 120],
          progressionNotes: "Alternate comfortable handle",
          progressionRule: double(),
          keyCue: "No back rocking",
        },
        {
          exerciseSlug: "seated-db-shoulder-press",
          sets: 3,
          reps: [6, 10],
          rir: [1, 2],
          rest: [120, 120],
          targetLoadNote: "17.5–20 kg by RIR",
          progressionRule: double(2.5),
          keyCue: "Back supported",
        },
        {
          exerciseSlug: "pec-deck-fly",
          sets: 2,
          reps: [10, 15],
          rir: [1, 1],
          rest: [90, 90],
          progressionNotes: "Reps then stack",
          progressionRule: double(),
          keyCue: "Controlled stretch",
        },
        {
          exerciseSlug: "db-lateral-raise",
          sets: 2,
          reps: [12, 20],
          rir: [1, 1],
          rest: [60, 90],
          targetLoadNote: "Reduce below 10 kg if swinging",
          progressionRule: double(1),
          keyCue: "Control down",
        },
      ],
    },
    {
      dayIndex: 6,
      dayOfWeek: 7,
      name: "Easy Run + Light Upper",
      focus: "Aerobic + delts/core",
      timeNote: "60–90 min",
      effortNote: "Easy / 2 RIR",
      notes: "Keep easy",
      includesLifting: true,
      includesRun: true,
      warmupSlug: "run",
      exercises: [
        {
          exerciseSlug: "face-pull",
          sets: 2,
          reps: [12, 20],
          rir: [2, 2],
          rest: [60, 90],
          progressionNotes: "Light clean reps",
          progressionRule: double(),
          keyCue: "Don't lean back",
        },
        {
          exerciseSlug: "cable-lateral-raise",
          sets: 2,
          reps: [12, 20],
          rir: [2, 2],
          rest: [60, 90],
          progressionNotes: "Light volume",
          progressionRule: double(),
          keyCue: "No swing",
        },
        {
          exerciseSlug: "incline-db-curl",
          sets: 2,
          reps: [10, 15],
          rir: [1, 2],
          rest: [75, 90],
          progressionNotes: "Controlled",
          progressionRule: double(2.5),
          keyCue: "Shoulder behind torso",
        },
        {
          exerciseSlug: "reverse-curl",
          sets: 2,
          reps: [10, 15],
          rir: [1, 2],
          rest: [75, 90],
          progressionNotes: "Progress slowly",
          progressionRule: double(2.5),
          keyCue: "Neutral wrists",
        },
        {
          exerciseSlug: "side-plank",
          sets: 2,
          duration: [20, 45],
          perSide: true,
          rir: [2, 2],
          rest: [60, 60],
          progressionNotes: "Add time first",
          progressionRule: timeFirst,
          keyCue: "Ribs/pelvis stacked",
        },
      ],
    },
    {
      dayIndex: 7,
      dayOfWeek: 1,
      name: "Rest + Mobility",
      focus: "Recovery",
      timeNote: "10–15 min",
      effortNote: "Easy",
      notes: "Walking fine",
      includesLifting: false,
      includesRun: false,
      warmupSlug: "daily-mobility",
      exercises: [],
    },
  ],
  runs: [
    {
      weekIndex: 1,
      dayOfWeek: 4,
      duration: [20, 25],
      rpe: [3, 4],
      paceNote: "Talk-test; slower than push pace",
      progressionNote: "Complete without escalation",
      shinRule: SHIN_RULE,
      comment: "Consistency",
    },
    {
      weekIndex: 1,
      dayOfWeek: 7,
      duration: [25, 30],
      rpe: [3, 4],
      paceNote: "Talk-test; slower than push pace",
      progressionNote: "Complete without escalation",
      shinRule: SHIN_RULE,
      comment: "Consistency",
    },
    {
      weekIndex: 2,
      dayOfWeek: 4,
      duration: [25, 25],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Add only if settled",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 2,
      dayOfWeek: 7,
      duration: [30, 30],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Add only if settled",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 3,
      dayOfWeek: 4,
      duration: [25, 30],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Small time increase",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 3,
      dayOfWeek: 7,
      duration: [30, 35],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Small time increase",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 4,
      dayOfWeek: 4,
      duration: [30, 30],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "No speed work",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 4,
      dayOfWeek: 7,
      duration: [35, 35],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "No speed work",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 5,
      dayOfWeek: 4,
      duration: [25, 25],
      rpe: [3, 3],
      paceNote: "Easy",
      progressionNote: "Reduce if lifting fatigue high",
      shinRule: SHIN_RULE,
      comment: "Optional deload",
    },
    {
      weekIndex: 5,
      dayOfWeek: 7,
      duration: [30, 30],
      rpe: [3, 3],
      paceNote: "Easy",
      progressionNote: "Reduce if lifting fatigue high",
      shinRule: SHIN_RULE,
      comment: "Optional deload",
    },
    {
      weekIndex: 6,
      dayOfWeek: 4,
      duration: [30, 30],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Resume if stable",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 6,
      dayOfWeek: 7,
      duration: [35, 40],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Resume if stable",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 7,
      dayOfWeek: 4,
      duration: [30, 35],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Time, not pace",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 7,
      dayOfWeek: 7,
      duration: [40, 40],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Time, not pace",
      shinRule: SHIN_RULE,
    },
    {
      weekIndex: 8,
      dayOfWeek: 4,
      duration: [35, 35],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Finish capable of more",
      shinRule: SHIN_RULE,
      comment: "Next block may add faster work",
    },
    {
      weekIndex: 8,
      dayOfWeek: 7,
      duration: [40, 45],
      rpe: [3, 4],
      paceNote: "Conversational",
      progressionNote: "Finish capable of more",
      shinRule: SHIN_RULE,
      comment: "Next block may add faster work",
    },
  ],
};
