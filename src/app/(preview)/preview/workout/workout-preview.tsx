"use client";

import { useEffect, useMemo, useState } from "react";

import type { ExerciseVM, SessionVM, SetVM } from "@/app/(app)/workouts/[sessionId]/view-model";
import { WorkoutOverview } from "@/app/(app)/workouts/[sessionId]/workout-overview";
import { startRestTimer } from "@/components/shell/rest-timer";
import type { TargetSet } from "@/domain/progression";
import type { ExerciseModality } from "@/domain/types";

export type Scenario = "upper" | "arms" | "coach";

const SESSION_ID = "00000000-0000-4000-8000-00000000c0de";
const STARTED = "2026-09-29T07:30:00.000Z";

function working(setIndex: number, weight: number, reps: number, rir: number): SetVM {
  return {
    id: `set-${setIndex}`,
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
    completedAt: new Date(Date.parse(STARTED) + setIndex * 180_000).toISOString(),
  };
}

type Slot = {
  name: string;
  modality: ExerciseModality;
  sets: number;
  reps?: [number, number];
  rir?: [number, number];
  metres?: [number, number];
  done?: SetVM[];
  state?: "done" | "skipped";
  superset?: string;
  instead?: string;
  machine?: string;
  coach?: { note?: string; targets?: TargetSet[]; added?: boolean };
};

const target = (setIndex: number, weight: number, reps: number, rir: number): TargetSet => ({
  setIndex,
  setType: "working",
  weight,
  reps,
  rir,
  durationSeconds: null,
  distanceMeters: null,
});

function exercise(slot: Slot, index: number): ExerciseVM {
  const slug = slot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const distance = slot.metres !== undefined;
  return {
    id: slug,
    orderIndex: index + 1,
    exercise: {
      id: slug,
      name: slot.name,
      slug,
      modality: slot.modality,
      loadPortability: "global",
      requiresEquipment: slot.modality !== "bodyweight",
      defaultPrescriptionType: distance ? "distance" : "reps",
      rirNote: null,
      defaults: {
        repMin: null,
        repMax: null,
        durationMinSeconds: null,
        durationMaxSeconds: null,
        distanceMinMeters: null,
        distanceMaxMeters: null,
        rir: null,
        restSeconds: null,
      },
    },
    equipment: slot.machine
      ? { id: `${slug}-machine`, name: slot.machine, unit: "kg", ladder: null }
      : null,
    planned: slot.coach?.added
      ? null
      : {
          programExerciseId: `${slug}-slot`,
          plannedExerciseName: slot.instead ?? slot.name,
          sets: slot.sets,
          prescriptionType: distance ? "distance" : "reps",
          repMin: slot.reps?.[0] ?? null,
          repMax: slot.reps?.[1] ?? null,
          durationMinSeconds: null,
          durationMaxSeconds: null,
          distanceMinMeters: slot.metres?.[0] ?? null,
          distanceMaxMeters: slot.metres?.[1] ?? null,
          perSide: false,
          rirMin: slot.rir?.[0] ?? null,
          rirMax: slot.rir?.[1] ?? null,
          restMinSeconds: 120,
          restMaxSeconds: 180,
          targetLoadNote: null,
          progressionNotes: null,
          keyCue: null,
        },
    supersetGroup: slot.superset ?? null,
    substitutionReason: null,
    notes: null,
    completedAt: slot.state === "done" ? "2026-09-29T07:58:00.000Z" : null,
    skippedAt: slot.state === "skipped" ? STARTED : null,
    weightStep: 2.5,
    sets: slot.done ?? [],
    previous: null,
    basis: null,
    suggestion: slot.coach?.targets
      ? {
          kind: "coach",
          basis: "exercise",
          reason: "The coach's plan for today.",
          advice: null,
          loadIncrement: 2.5,
          sets: slot.coach.targets,
        }
      : null,
    regressionStreak: 0,
    decision: null,
    coachNote: slot.coach?.note ?? null,
    coachRestSeconds: null,
    guidance: null,
  };
}

// Upper A (src/db/seed/data/program.ts) in its third cycle (sessions.test.ts): the warm-up done,
// the bench's first two sets saved at 60 × 4.
const UPPER: Slot[] = [
  {
    name: "Barbell bench press",
    modality: "barbell",
    sets: 4,
    reps: [3, 5],
    rir: [2, 2],
    done: [working(4, 60, 4, 2), working(5, 60, 4, 2)],
  },
  { name: "Pull-up", modality: "bodyweight", sets: 3, reps: [6, 10], rir: [1, 2] },
  {
    name: "Seated cable row",
    modality: "cable",
    sets: 3,
    reps: [6, 10],
    rir: [1, 2],
    machine: "Cable station",
  },
  { name: "Incline dumbbell press", modality: "dumbbell", sets: 2, reps: [8, 12], rir: [1, 2] },
  { name: "Cable lateral raise", modality: "cable", sets: 3, reps: [12, 20], rir: [1, 1] },
  { name: "Reverse pec deck", modality: "machine", sets: 2, reps: [12, 20], rir: [1, 1] },
  {
    name: "Overhead cable triceps extension",
    modality: "cable",
    sets: 2,
    reps: [10, 15],
    rir: [1, 1],
  },
];

// Easy Run + Arms as the preview's open session: the curl done, two sets of the pushdown, the
// forearms superset to do.
const ARMS: Slot[] = [
  {
    name: "Barbell curl",
    modality: "barbell",
    sets: 3,
    reps: [8, 12],
    rir: [1, 2],
    state: "done",
    done: [working(1, 30, 10, 2), working(2, 30, 9, 1), working(3, 30, 8, 1)],
  },
  {
    name: "Rope triceps pushdown",
    modality: "cable",
    sets: 3,
    reps: [12, 15],
    rir: [1, 1],
    machine: "Cable station",
    done: [working(1, 25, 14, 1), working(2, 25, 12, 1)],
  },
  {
    name: "Farmer’s carry",
    modality: "dumbbell",
    sets: 3,
    metres: [20, 40],
    superset: "forearms",
  },
  {
    name: "Wrist curl",
    modality: "dumbbell",
    sets: 2,
    reps: [12, 20],
    rir: [1, 1],
    superset: "forearms",
  },
];

// The coach's Lower A (coach-plans.test.ts): its targets, a substitution, a drop and an addition.
const LOWER: Slot[] = [
  {
    name: "High-bar barbell squat",
    modality: "barbell",
    sets: 3,
    reps: [4, 6],
    rir: [2, 3],
    coach: {
      note: "Add 2.5 kg after clean sets.",
      targets: [target(1, 60, 5, 2), target(2, 60, 5, 2), target(3, 60, 5, 1)],
    },
  },
  {
    name: "Horizontal leg press",
    modality: "machine",
    sets: 1,
    reps: [8, 12],
    rir: [2, 2],
    instead: "45° leg press",
    coach: { targets: [target(1, 100, 10, 2)] },
  },
  { name: "Seated leg curl", modality: "machine", sets: 3, reps: [8, 12], rir: [1, 2] },
  { name: "Leg extension", modality: "machine", sets: 2, reps: [10, 15], rir: [1, 2] },
  {
    name: "Smith machine calf raise",
    modality: "smith_machine",
    sets: 3,
    reps: [8, 15],
    rir: [1, 2],
  },
  {
    name: "Cable crunch",
    modality: "cable",
    sets: 2,
    reps: [10, 15],
    rir: [1, 2],
    state: "skipped",
    coach: { note: "Back is sore today." },
  },
  {
    name: "Face pull",
    modality: "cable",
    sets: 1,
    machine: "Cable station",
    coach: { note: "Light, for the shoulders.", targets: [target(1, 15, 15, 2)], added: true },
  },
];

function sessionFor(scenario: Scenario): { session: SessionVM; title: string } {
  const slots = scenario === "arms" ? ARMS : scenario === "coach" ? LOWER : UPPER;
  const title =
    scenario === "arms" ? "Easy Run + Arms" : scenario === "coach" ? "Lower A" : "Upper A";
  const session: SessionVM = {
    id: SESSION_ID,
    gym: { id: "gym", name: "Anytime Fitness", kind: "gym" },
    day: {
      id: "day",
      name: title,
      focus: null,
      includesRun: scenario === "arms",
      timeNote: scenario === "arms" ? "70–100 min" : "70–90 min",
    },
    cycleIndex: 3,
    startedAt: STARTED,
    completedAt: null,
    bodyWeightKg: null,
    sleepHours: scenario === "upper" ? 5 : null,
    sleepQuality: null,
    energy: null,
    fatigue: null,
    soreness: null,
    warmupCompleted: scenario === "upper",
    notes: null,
    warmup:
      scenario === "upper"
        ? // src/db/seed/data/warmups.ts
          {
            name: "Upper-body warm-up",
            drills: [
              {
                order: 1,
                name: "Easy cardio",
                dose: "3–5 min",
                cue: "Easy",
                purpose: "Temperature",
              },
              {
                order: 2,
                name: "Arm circles + shoulder rotations",
                dose: "8 each",
                cue: "Pain-free",
                purpose: "Shoulder motion",
              },
              {
                order: 3,
                name: "Light cable row / face pull",
                dose: "1 × 12–15",
                cue: "Very light",
                purpose: "Scapular rehearsal",
              },
              {
                order: 4,
                name: "First compound ramp",
                dose: "40% × 8; 55–60% × 5; 70–75% × 2–3",
                cue: "Never grind",
                purpose: "Specific prep",
              },
            ],
          }
        : null,
    restTimerEnabled: true,
    warnings:
      scenario === "upper"
        ? [
            {
              code: "short_sleep",
              title: "Sleep 5 h",
              advice: "Hold loads today rather than adding, and keep the RIR honest.",
            },
          ]
        : [],
    coachPlan:
      scenario === "coach"
        ? {
            summary: null,
            warmup: ["Bike 4 min", "Squat ramp 40×6, 50×3"],
            generatedAt: "2026-09-29T06:45:00.000Z",
          }
        : null,
    timeZone: "Asia/Kolkata",
    preferredUnit: "kg",
    exercises: slots.map(exercise),
  };
  return { session, title };
}

export function WorkoutPreview({ scenario }: { scenario: Scenario }) {
  const { session, title } = useMemo(() => sessionFor(scenario), [scenario]);
  const [ready, setReady] = useState(false);

  // The boards' moment: 2:14 of a three-minute rest left, except on the coach's board.
  useEffect(() => {
    try {
      for (const key of Object.keys(localStorage))
        if (key.includes(SESSION_ID)) localStorage.removeItem(key);
    } catch {}
    if (scenario !== "coach") {
      startRestTimer(SESSION_ID, 180);
      try {
        localStorage.setItem(`overload:rest-timer:${SESSION_ID}`, String(Date.now() + 134_000));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount once storage is clean
    setReady(true);
  }, [scenario]);

  if (!ready) return null;
  return (
    <WorkoutOverview
      session={session}
      readOnly={false}
      hasDrafts={false}
      onOpenExercise={() => {}}
      onOpenDetails={() => {}}
      onEditSuperset={() => {}}
      title={title}
      layer
    />
  );
}
