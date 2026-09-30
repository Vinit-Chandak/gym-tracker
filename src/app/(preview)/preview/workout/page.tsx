import type { Metadata } from "next";

import type { ExerciseVM, SessionVM, SetVM } from "@/app/(app)/workouts/[sessionId]/view-model";
import { WorkoutView } from "@/app/(app)/workouts/[sessionId]/workout-view";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Workout" };

/**
 * A workout part way through, without a database: the session screen and, with
 * `?exercise=curl`, the logger for one exercise with two sets saved and one to go.
 */

function set(setIndex: number, weight: number, reps: number, rir: number): SetVM {
  return {
    id: `set-${setIndex}-${weight}`,
    setIndex,
    setType: "working",
    weight,
    unit: "kg",
    reps,
    rir,
    rpe: null,
    effortReported: true,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: "2026-09-11T07:20:00.000Z",
  };
}

function exercise(
  id: string,
  orderIndex: number,
  name: string,
  patch: Partial<ExerciseVM> = {},
): ExerciseVM {
  return {
    id,
    orderIndex,
    exercise: {
      id: `x-${id}`,
      name,
      slug: id,
      modality: "barbell",
      loadPortability: "global",
      requiresEquipment: false,
      defaultPrescriptionType: "reps",
      rirNote: null,
    },
    equipment: null,
    planned: {
      programExerciseId: `p-${id}`,
      plannedExerciseName: name,
      sets: 3,
      prescriptionType: "reps",
      repMin: 8,
      repMax: 12,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      distanceMinMeters: null,
      distanceMaxMeters: null,
      perSide: false,
      rirMin: 1,
      rirMax: 2,
      restMinSeconds: 90,
      restMaxSeconds: 120,
      targetLoadNote: null,
      progressionNotes: "Add 2.5 kg once every set reaches 12.",
      keyCue: "Elbows pinned; no swing.",
    },
    supersetGroup: null,
    substitutionReason: null,
    notes: null,
    completedAt: null,
    skippedAt: null,
    weightStep: 2.5,
    sets: [],
    previous: null,
    basis: null,
    suggestion: null,
    regressionStreak: 0,
    decision: null,
    coachNote: null,
    coachRestSeconds: null,
    ...patch,
  };
}

const PREVIOUS = {
  gymName: "Anytime Fitness",
  equipmentName: null,
  performedAt: "2026-09-04T07:10:00.000Z",
  sameMachine: false,
  sets: [set(1, 27.5, 12, 1), set(2, 27.5, 12, 1), set(3, 27.5, 11, 0)],
};

const SESSION: SessionVM = {
  id: "00000000-0000-4000-8000-0000000000aa",
  gym: { id: "g1", name: "Anytime Fitness", kind: "gym" },
  day: { id: "d1", name: "Easy Run + Arms", focus: "Aerobic + arms/forearms", includesRun: true },
  cycleIndex: 1,
  startedAt: "2026-09-11T07:05:00.000Z",
  completedAt: null,
  bodyWeightKg: null,
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  warmupCompleted: true,
  notes: null,
  warmup: {
    name: "Upper warm-up",
    drills: [
      { order: 1, name: "Band pull-apart", dose: "2 × 15", cue: "", purpose: "" },
      { order: 2, name: "Wrist circles", dose: "20 each way", cue: "", purpose: "" },
    ],
  },
  restTimerEnabled: true,
  coachPlan: null,
  warnings: [],
  timeZone: "Asia/Kolkata",
  preferredUnit: "kg",
  exercises: [
    exercise("curl", 1, "Barbell curl", {
      sets: [set(1, 30, 10, 2), set(2, 30, 9, 1)],
      previous: PREVIOUS,
      basis: PREVIOUS,
      suggestion: {
        kind: "increase",
        basis: "exercise",
        reason: "Every set reached 12 at 1 RIR or more last time.",
        advice: null,
        loadIncrement: 2.5,
        sets: [1, 2, 3].map((setIndex) => ({
          setIndex,
          setType: "working" as const,
          weight: 30,
          reps: 10,
          rir: null,
          durationSeconds: null,
          distanceMeters: null,
        })),
      },
    }),
    exercise("pushdown", 2, "Rope triceps pushdown", {
      equipment: { id: "m1", name: "Cable stack 2", unit: "kg", ladder: null },
    }),
    exercise("carry", 3, "Farmer's carry", { supersetGroup: "forearms" }),
    exercise("wrist", 4, "Wrist curl", { supersetGroup: "forearms" }),
  ],
};

export default function WorkoutPreviewPage() {
  return (
    <PreviewShell tab="/today">
      <PageHeader
        title={SESSION.day?.name ?? "Ad hoc session"}
        meta={SESSION.gym.name}
        backHref="/preview"
      />
      <PageContent>
        <WorkoutView session={SESSION} seenSetChanges={0} userId="preview" />
      </PageContent>
    </PreviewShell>
  );
}
