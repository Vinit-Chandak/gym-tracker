"use client";

import { useEffect, useMemo, useState } from "react";

import { ExerciseLogger } from "@/app/(app)/workouts/[sessionId]/exercise-logger";
import {
  LoggerActionsProvider,
  type LoggerActions,
} from "@/app/(app)/workouts/[sessionId]/logger-actions";
import type { ExerciseVM, SessionVM, SetVM } from "@/app/(app)/workouts/[sessionId]/view-model";
import { startRestTimer } from "@/components/shell/rest-timer";
import type { TargetSet } from "@/domain/progression";
import type { SetType } from "@/domain/types";

export type Scenario =
  "log" | "warmups" | "pounds" | "superset" | "first" | "done" | "basic" | "unknown";

/** The drawings the machine questions show, from the server: slug to address. */
export type PreviewArt = Record<string, string>;

const SESSION_ID = "00000000-0000-4000-8000-00000000c0de";
const STARTED = "2026-09-29T07:30:00.000Z";

function done(
  setIndex: number,
  setType: SetType,
  weight: number,
  reps: number | null,
  effort: { rir?: number; rpe?: number; distance?: number } = {},
  unit: "kg" | "lb" = "kg",
): SetVM {
  return {
    id: `set-${setIndex}`,
    setIndex,
    setType,
    weight,
    unit,
    reps,
    rir: effort.rir ?? null,
    rpe: effort.rpe ?? null,
    effortReported: true,
    durationSeconds: null,
    distanceMeters: effort.distance ?? null,
    completedAt: new Date(Date.parse(STARTED) + setIndex * 180_000).toISOString(),
  };
}

function target(
  setIndex: number,
  setType: SetType,
  weight: number,
  reps: number | null,
  rir: number | null,
  distanceMeters: number | null = null,
): TargetSet {
  return { setIndex, setType, weight, reps, rir, durationSeconds: null, distanceMeters };
}

const base = {
  substitutionReason: null,
  notes: null,
  completedAt: null,
  skippedAt: null,
  previous: null,
  regressionStreak: 0,
  decision: null,
  coachNote: null,
  coachRestSeconds: null,
  supersetGroup: null,
  equipment: null,
} satisfies Partial<ExerciseVM>;

const slot = (patch: Partial<NonNullable<ExerciseVM["planned"]>>) => ({
  programExerciseId: "planned",
  plannedExerciseName: "",
  sets: 4,
  prescriptionType: "reps" as const,
  repMin: 3,
  repMax: 5,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  perSide: false,
  rirMin: 2,
  rirMax: 2,
  restMinSeconds: 180,
  restMaxSeconds: 240,
  targetLoadNote: null,
  progressionNotes: null,
  keyCue: null,
  ...patch,
});

// Upper A's barbell bench press, cycle 3 (src/server/repositories/sessions.test.ts): the ramp
// in front of 62.5 kg done, sets 1 and 2 at 60 × 4 @ 2, set 3 offered the hold.
function bench(scenario: Scenario): ExerciseVM {
  const warmups = [
    target(1, "warmup", 25, 8, null),
    target(2, "warmup", 35, 5, null),
    target(3, "warmup", 45, 3, null),
  ];
  const sets =
    scenario === "warmups"
      ? [done(1, "warmup", 25, 8)]
      : scenario === "first"
        ? []
        : [
            done(1, "warmup", 25, 8),
            done(2, "warmup", 35, 5),
            done(3, "warmup", 45, 3),
            done(4, "working", 60, 4, { rir: 2 }),
            done(5, "working", 60, 4, { rir: 2 }),
            ...(scenario === "done"
              ? [done(6, "working", 60, 4, { rir: 2 }), done(7, "working", 60, 3, { rir: 1 })]
              : []),
          ];
  return {
    ...base,
    id: "bench",
    orderIndex: 2,
    completedAt: scenario === "done" ? "2026-09-29T08:10:00.000Z" : null,
    exercise: {
      id: "barbell-bench-press",
      name: "Barbell bench press",
      slug: "barbell-bench-press",
      modality: "barbell",
      loadPortability: "global",
      requiresEquipment: true,
      defaultPrescriptionType: "reps",
      rirNote: null,
    },
    planned: slot({
      plannedExerciseName: "Barbell bench press",
      keyCue: "Stable upper back; controlled touch",
      targetLoadNote: "Pick the load by RIR, not by a number",
      progressionNotes: "+2.5 kg after 4×5",
    }),
    weightStep: 2.5,
    sets,
    basis: {
      gymName: "Anytime Fitness",
      equipmentName: null,
      performedAt: "2026-09-22T07:40:00.000Z",
      sameMachine: false,
      sets: [],
    },
    suggestion: {
      kind: "hold",
      basis: "exercise",
      reason: "One low performance does not lower the baseline.",
      advice:
        "Repeat the planned range and check effort, rest and why the set stopped. A persistent reduction needs repeated comparable evidence.",
      loadIncrement: 2.5,
      sets: [...warmups, ...[4, 5, 6, 7].map((i) => target(i, "working", 62.5, 3, 2))],
    },
  };
}

// Lower A's high-bar squat in pounds (scripts/dev/audit-workout.mjs): 135 × 5 and 140 × 6.
function squat(): ExerciseVM {
  return {
    ...base,
    id: "squat",
    orderIndex: 1,
    exercise: {
      id: "high-bar-barbell-squat",
      name: "High-bar barbell squat",
      slug: "high-bar-barbell-squat",
      modality: "barbell",
      loadPortability: "global",
      requiresEquipment: true,
      defaultPrescriptionType: "reps",
      rirNote: null,
    },
    planned: slot({
      plannedExerciseName: "High-bar barbell squat",
      sets: 3,
      repMin: 4,
      repMax: 6,
      rirMin: 2,
      rirMax: 3,
    }),
    weightStep: 5,
    sets: [
      done(1, "working", 135, 5, { rir: 2 }, "lb"),
      done(2, "working", 140, 6, { rir: 2 }, "lb"),
    ],
    basis: null,
    suggestion: null,
  };
}

// Easy Run + Arms: the farmer's carry, in its superset with the wrist curl, as the old preview's
// set grid suggested it (32 kg × 30 m), rated by RPE.
function carry(): ExerciseVM[] {
  return [
    {
      ...base,
      id: "carry",
      orderIndex: 3,
      supersetGroup: "forearms",
      exercise: {
        id: "farmers-carry",
        name: "Farmer’s carry",
        slug: "farmers-carry",
        modality: "dumbbell",
        loadPortability: "global",
        requiresEquipment: true,
        defaultPrescriptionType: "distance",
        rirNote: null,
      },
      planned: slot({
        plannedExerciseName: "Farmer’s carry",
        sets: 3,
        prescriptionType: "distance",
        repMin: null,
        repMax: null,
        distanceMinMeters: 20,
        distanceMaxMeters: 40,
        rirMin: null,
        rirMax: null,
        restMinSeconds: 90,
        restMaxSeconds: 90,
      }),
      weightStep: 2,
      sets: [],
      // Last time's carries prefill the entry; no rule has a suggestion to name for them.
      previous: {
        gymName: "Anytime Fitness",
        equipmentName: null,
        performedAt: "2026-09-24T07:40:00.000Z",
        sameMachine: false,
        sets: [1, 2, 3].map((i) => ({
          setIndex: i,
          setType: "working" as const,
          weight: 32,
          unit: "kg" as const,
          reps: null,
          rir: null,
          rpe: 7,
          durationSeconds: null,
          distanceMeters: 30,
        })),
      },
      basis: null,
      suggestion: null,
    },
    {
      ...base,
      id: "wrist-curl",
      orderIndex: 4,
      supersetGroup: "forearms",
      exercise: {
        id: "wrist-curl",
        name: "Wrist curl",
        slug: "wrist-curl",
        modality: "dumbbell",
        loadPortability: "global",
        requiresEquipment: true,
        defaultPrescriptionType: "reps",
        rirNote: null,
      },
      planned: slot({
        plannedExerciseName: "Wrist curl",
        sets: 2,
        repMin: 12,
        repMax: 20,
        rirMin: 1,
        rirMax: 1,
        restMinSeconds: 60,
        restMaxSeconds: 90,
      }),
      weightStep: 1,
      sets: [],
      basis: null,
      suggestion: null,
    },
  ];
}

/**
 * A machine to settle before the first set (plan: gradual confirmation during workouts): the
 * 45° leg press, a gym basic nobody has confirmed, or a hack squat nobody has answered for, with
 * the goblet squat as its programme fallback.
 */
function machineToSettle(scenario: "basic" | "unknown", art: PreviewArt): ExerciseVM {
  const basic = scenario === "basic";
  const ref = {
    id: basic ? "leg-press-45" : "hack-squat",
    name: basic ? "45° leg press" : "Hack squat",
    slug: basic ? "leg-press-45" : "hack-squat",
    modality: "machine" as const,
    loadPortability: "equipment_specific" as const,
    requiresEquipment: true,
    defaultPrescriptionType: "reps" as const,
    rirNote: null,
  };
  return {
    ...base,
    id: ref.slug,
    orderIndex: 1,
    exercise: ref,
    planned: slot({ plannedExerciseName: ref.name, repMin: 8, repMax: 12, rirMin: 2, rirMax: 2 }),
    weightStep: 5,
    sets: [],
    basis: null,
    suggestion: null,
    decision: {
      resolution: basic
        ? ({
            status: "direct",
            exercise: ref,
            equipmentInstance: null,
            basis: "assumed",
            primaryTypeId: "leg_press_45",
            assumedTypeIds: ["leg_press_45"],
          } as unknown as NonNullable<ExerciseVM["decision"]>["resolution"])
        : { status: "unknown", exercise: ref, missingEquipmentTypeIds: ["hack_squat"] },
      resolvedExerciseName: ref.name,
      fallbackOptions: basic
        ? []
        : [
            {
              fallbackId: "goblet",
              exerciseId: "goblet-squat",
              exerciseName: "Goblet squat",
              equipmentInstanceId: null,
              equipmentInstanceName: null,
              available: true,
            },
          ],
      missingTypes: basic ? [] : [{ id: "hack_squat", name: "Hack squat" }],
      machines: [],
      ask: basic
        ? {
            kind: "confirm_basic",
            typeId: "leg_press_45",
            slug: "leg_press_45",
            name: "45° leg press",
            art: art.leg_press_45 ?? null,
            family: {
              name: "Leg press",
              variants: [
                {
                  typeId: "leg_press_horizontal",
                  slug: "leg_press_horizontal",
                  name: "Horizontal leg press",
                  art: art.leg_press_horizontal ?? null,
                },
                {
                  typeId: "leg_press_vertical",
                  slug: "leg_press_vertical",
                  name: "Vertical leg press",
                  art: art.leg_press_vertical ?? null,
                },
              ],
            },
          }
        : {
            kind: "unknown",
            typeId: "hack_squat",
            slug: "hack_squat",
            name: "Hack squat",
            art: art.hack_squat ?? null,
            family: null,
          },
    },
  };
}

function sessionFor(
  scenario: Scenario,
  art: PreviewArt,
): { session: SessionVM; exercise: ExerciseVM } {
  const exercises =
    scenario === "basic" || scenario === "unknown"
      ? [machineToSettle(scenario, art)]
      : scenario === "pounds"
        ? [squat()]
        : scenario === "superset"
          ? carry()
          : [bench(scenario)];
  const day =
    scenario === "pounds" ? "Lower A" : scenario === "superset" ? "Easy Run + Arms" : "Upper A";
  const session: SessionVM = {
    id: SESSION_ID,
    gym: { id: "gym", name: "Anytime Fitness", kind: "gym" },
    day: { id: "day", name: day } as SessionVM["day"],
    cycleIndex: 3,
    startedAt: STARTED,
    completedAt: null,
    bodyWeightKg: null,
    sleepHours: null,
    sleepQuality: null,
    energy: null,
    fatigue: null,
    soreness: null,
    warmupCompleted: true,
    notes: null,
    warmup: null,
    restTimerEnabled: true,
    coachPlan: null,
    warnings: [],
    timeZone: "Asia/Kolkata",
    preferredUnit: scenario === "pounds" ? "lb" : "kg",
    exercises,
  };
  return { session, exercise: exercises[0]! };
}

/** Answers like the server's, a beat later; with `fail`, a connection that never came back. */
function fakeActions(fail: boolean): LoggerActions {
  const wait = <T,>(value: T, ms = 900) =>
    new Promise<T>((resolve, reject) =>
      setTimeout(() => (fail ? reject(new TypeError("Failed to fetch")) : resolve(value)), ms),
    );
  return {
    logSet: async (input) => {
      const set = input as {
        setIndex: number;
        setType: SetType;
        weight: number | null;
        unit: "kg" | "lb";
        reps: number | null;
        rir: number | null;
        rpe: number | null;
        durationSeconds: number | null;
        distanceMeters: number | null;
      };
      return wait({
        ok: true as const,
        set: {
          id: `set-${set.setIndex}`,
          setIndex: set.setIndex,
          setType: set.setType,
          weight: set.weight,
          unit: set.unit,
          reps: set.reps,
          rir: set.rir,
          rpe: set.rpe,
          effortReported: true,
          durationSeconds: set.durationSeconds,
          distanceMeters: set.distanceMeters,
          completedAt: new Date().toISOString(),
        },
      });
    },
    deleteSet: async () => wait({ ok: true as const }, 300),
    setCompleted: async () => wait({ ok: true as const }, 300),
    skip: async () => wait({ ok: true as const }, 300),
    applyFallback: async () => wait({ ok: true as const }, 300),
    confirmHere: async () => wait({ ok: true as const }, 500),
    notHere: async () => wait({ ok: true as const }, 500),
    chooseVariant: async () => wait({ ok: true as const }, 500),
    archiveMachine: async () => wait({ ok: true as const }, 500),
    readHistory: async () => ({
      more: false,
      entries: [
        {
          workoutExerciseId: "cycle-2",
          workoutSessionId: "s2",
          performedAt: "2026-09-22T07:40:00.000Z",
          gymName: "Anytime Fitness",
          equipmentName: null,
          sets: [
            [62.5, 2, 1],
            [62.5, 3, 1],
            [62.5, 3, 1],
            [62.5, 3, 1],
          ].map(([weight, reps, rir], i) => ({
            setIndex: i + 1,
            setType: "working" as const,
            weight: weight!,
            unit: "kg" as const,
            reps: reps!,
            rir: rir!,
            durationSeconds: null,
            distanceMeters: null,
          })),
        },
        {
          workoutExerciseId: "cycle-1",
          workoutSessionId: "s1",
          performedAt: "2026-09-15T07:35:00.000Z",
          gymName: "Anytime Fitness",
          equipmentName: null,
          sets: [1, 2, 3, 4].map((i) => ({
            setIndex: i,
            setType: "working" as const,
            weight: 60,
            unit: "kg" as const,
            reps: 5,
            rir: 2,
            durationSeconds: null,
            distanceMeters: null,
          })),
        },
      ],
    }),
  };
}

export function LoggingPreview({
  scenario,
  fail,
  rest,
  art = {},
}: {
  scenario: Scenario;
  fail: boolean;
  rest: boolean;
  art?: PreviewArt;
}) {
  const { session, exercise } = useMemo(() => sessionFor(scenario, art), [scenario, art]);
  const actions = useMemo(() => fakeActions(fail), [fail]);
  const [ready, setReady] = useState(false);

  // The boards' moment: 2:14 of a three-minute rest left. Drafts from an earlier look go.
  useEffect(() => {
    try {
      for (const key of Object.keys(localStorage))
        if (key.includes(SESSION_ID) || key.startsWith("overload:draft"))
          localStorage.removeItem(key);
    } catch {}
    if (rest && scenario !== "superset" && scenario !== "first") {
      startRestTimer(SESSION_ID, 180);
      try {
        localStorage.setItem(`overload:rest-timer:${SESSION_ID}`, String(Date.now() + 134_000));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount once storage is clean
    setReady(true);
  }, [rest, scenario]);

  if (!ready) return null;
  return (
    <LoggerActionsProvider value={actions}>
      <ExerciseLogger
        key={scenario}
        exercise={exercise}
        session={session}
        userId="preview"
        readOnly={false}
        onBack={() => {}}
        onDirtyChange={() => {}}
        onLogged={(seconds) => startRestTimer(SESSION_ID, seconds)}
        onEditSuperset={() => {}}
      />
    </LoggerActionsProvider>
  );
}
