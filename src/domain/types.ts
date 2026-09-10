/**
 * Closed vocabularies shared by the database schema, seeds and domain rules.
 * The Postgres enums in `src/db/schema/enums.ts` are built from these arrays so
 * the domain layer never depends on the database layer.
 */
export const LOAD_PORTABILITY = ["global", "equipment_specific", "context_dependent"] as const;
export type LoadPortability = (typeof LOAD_PORTABILITY)[number];

export const RESISTANCE_MODES = [
  "free_weight",
  "plate_loaded",
  "selectorized",
  "bodyweight",
  "cardio",
] as const;
export type ResistanceMode = (typeof RESISTANCE_MODES)[number];

export const LOAD_UNITS = ["kg", "lb", "plate_count", "stack_index", "none"] as const;
export type LoadUnit = (typeof LOAD_UNITS)[number];

/** The units a person weighs a barbell in. Machines may also count plates or stack steps. */
export const BODY_LOAD_UNITS = ["kg", "lb"] as const;
export type BodyLoadUnit = (typeof BODY_LOAD_UNITS)[number];

export const EXERCISE_CATEGORIES = ["strength", "hypertrophy", "cardio", "mobility"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/** What the movement is performed with. Free-weight and bodyweight modalities are assumed to exist at every real gym. */
export const EXERCISE_MODALITIES = [
  "barbell",
  "dumbbell",
  "bodyweight",
  "cable",
  "machine",
  "smith_machine",
  "cardio",
  "mobility",
] as const;
export type ExerciseModality = (typeof EXERCISE_MODALITIES)[number];

export const EQUIPMENT_CATEGORIES = [
  "free_weight",
  "machine",
  "cable",
  "bodyweight",
  "cardio",
  "accessory",
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const GYM_KINDS = ["gym", "outdoor", "home"] as const;
export type GymKind = (typeof GYM_KINDS)[number];

/**
 * How a set of an exercise is measured, and therefore what the third column of the set grid
 * asks for. A curl counts reps, a plank counts seconds, a farmer's carry counts metres —
 * asking a carry for "reps" is asking a question the movement has no answer to.
 */
export const PRESCRIPTION_TYPES = ["reps", "duration", "distance"] as const;
export type PrescriptionType = (typeof PRESCRIPTION_TYPES)[number];

export const PROGRAM_STATUSES = ["draft", "active", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const SET_TYPES = ["warmup", "working", "backoff", "drop", "amrap", "failure"] as const;
export type SetType = (typeof SET_TYPES)[number];

export const RUN_MODES = ["outdoor", "treadmill"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const PROPOSAL_SOURCES = ["manual", "ai", "rule_engine"] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

export const PROPOSAL_STATUSES = ["proposed", "approved", "rejected", "applied"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const SLOT_EVENT_STATUSES = ["completed", "skipped"] as const;
export type SlotEventStatus = (typeof SLOT_EVENT_STATUSES)[number];

/**
 * The two things a day of a programme can ask for. They are separate tasks that happen to
 * fall on the same day: the lifting session is started, logged and finished; the run is
 * logged on the run screen. Either can be done or skipped without the other, and the day is
 * only behind it when both have been answered.
 */
export const SLOT_PARTS = ["session", "run"] as const;
export type SlotPart = (typeof SLOT_PARTS)[number];

/** A coach plan's life: waiting for its session, replaced by a newer plan, used by a session, or dropped. */
export const PLAN_STATUSES = ["active", "superseded", "consumed", "void"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** What produced a plan: the nightly run, or a re-plan the user asked for. */
export const PLAN_TRIGGERS = ["nightly", "replan"] as const;
export type PlanTrigger = (typeof PLAN_TRIGGERS)[number];

/** What a plan does with one programme slot. */
export const PLAN_ACTIONS = ["keep", "substitute", "drop"] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

export const COACH_REQUEST_STATUSES = ["requested", "planned", "failed"] as const;
export type CoachRequestStatus = (typeof COACH_REQUEST_STATUSES)[number];

export const MUSCLE_GROUPS = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "lats",
  "upper_back",
  "traps",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "calves",
  "abs",
  "obliques",
  "lower_back",
  "hip_flexors",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Structured progression hint stored on a programme exercise; Phase 5 consumes it. */
export type ProgressionRule =
  | {
      /** All working sets at the top of the rep range at target RIR → add the smallest increment. */
      kind: "double_progression";
      /** Load increment in the exercise's unit; null means "use the equipment/exercise default". */
      loadIncrement: number | null;
    }
  | {
      /** Strength compounds: conservative increments, never to failure. */
      kind: "conservative_strength";
      loadIncrement: number;
      /** Reps every working set must reach before adding load, e.g. 6 for "+2.5 kg after 3×6". */
      repsRequired: number;
    }
  | {
      /** Timed work: extend duration before adding load. */
      kind: "time_first";
    };

/** One drill inside a warm-up protocol. Warm-ups are shown as a checklist, not logged per drill. */
export type WarmupDrill = {
  order: number;
  name: string;
  dose: string;
  cue: string;
  purpose: string;
  formUrl?: string;
};
