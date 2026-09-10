import type { Metadata } from "next";

import { TodayView } from "@/app/(app)/today/today-view";
import type { TodayPlan } from "@/server/repositories/schedule";

import { PreviewShell } from "../preview-shell";

export const metadata: Metadata = { title: "Preview · Today" };

const PROGRAM: TodayPlan["program"] = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "8-Week Strength + Aesthetics Hybrid",
  slug: "strength-aesthetics-hybrid-8wk",
  startDate: "2026-09-08",
  endDate: null,
  weeks: 8,
  startDayIndex: 1,
  notes: null,
};

const DAY: NonNullable<TodayPlan["suggestedDay"]> = {
  id: "00000000-0000-4000-8000-000000000002",
  dayOfWeek: 4,
  dayIndex: 3,
  name: "Easy Run + Arms",
  focus: "Aerobic + arms/forearms",
  includesLifting: true,
  includesRun: true,
  timeNote: "70–100 min",
  effortNote: "1–2 RIR arms",
  notes: "Run first, arms after",
  warmupProtocolId: null,
};

const EXERCISES: TodayPlan["suggestedExercises"] = [
  {
    programExerciseId: "e1",
    exerciseId: "x1",
    name: "Barbell curl",
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
    supersetGroup: null,
  },
  {
    programExerciseId: "e2",
    exerciseId: "x2",
    name: "Rope triceps pushdown",
    sets: 3,
    prescriptionType: "reps",
    repMin: 12,
    repMax: 15,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: null,
    distanceMaxMeters: null,
    perSide: false,
    rirMin: 1,
    rirMax: 1,
    supersetGroup: null,
  },
  {
    // The change worth seeing: a carry prescribed in metres, not in reps it does not have.
    programExerciseId: "e3",
    exerciseId: "x3",
    name: "Farmer's carry",
    sets: 3,
    prescriptionType: "distance",
    repMin: null,
    repMax: null,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: 20,
    distanceMaxMeters: 40,
    perSide: false,
    rirMin: 1,
    rirMax: 2,
    supersetGroup: "forearms",
  },
  {
    programExerciseId: "e4",
    exerciseId: "x4",
    name: "Wrist curl",
    sets: 2,
    prescriptionType: "reps",
    repMin: 12,
    repMax: 20,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: null,
    distanceMaxMeters: null,
    perSide: false,
    rirMin: 1,
    rirMax: 1,
    supersetGroup: "forearms",
  },
];

/** The day the bug happened on: it lifts and it runs, and the workout is already logged. */
function plan(overrides: Partial<TodayPlan> = {}): TodayPlan {
  return {
    program: PROGRAM,
    today: "2026-09-11",
    progress: { total: 56, completed: 2, skipped: 0, remaining: 54, currentCycle: 1 },
    behind: 0,
    projectedEnd: null,
    suggestion: {
      slot: { cycleIndex: 1, dayIndex: 3 },
      restSlotsBefore: [],
      nextTrainingSlot: null,
    },
    suggestedDay: DAY,
    suggestedExercises: EXERCISES,
    nextTrainingDay: null,
    runTarget: {
      id: "00000000-0000-4000-8000-000000000003",
      durationMinMinutes: 25,
      durationMaxMinutes: 30,
      rpeMin: 3,
      rpeMax: 4,
      paceNote: "Talk-test; slower than push pace",
      progressionNote: "Complete without escalation",
      shinRule: "Pain rising each km → stop",
      comment: "Consistency",
    },
    sessionStatus: "completed",
    runStatus: "pending",
    loggedRunId: null,
    cycleDays: [],
    ...overrides,
  };
}

export default async function TodayPreviewPage(props: PageProps<"/preview">) {
  // ?state=before shows the day with nothing done yet; the default is the state the run used
  // to disappear in — workout finished, run still owed.
  const { state } = await props.searchParams;
  const before = state === "before";

  return (
    <PreviewShell tab="/today">
      <TodayView
        today="2026-09-11"
        timeZone="Asia/Kolkata"
        gyms={[
          { id: "g1", name: "Anytime Fitness", kind: "gym", isDefault: true },
          { id: "g2", name: "Home", kind: "home", isDefault: false },
        ]}
        plan={before ? plan({ sessionStatus: "pending" }) : plan()}
        inProgress={null}
        restProtocol={null}
      />
    </PreviewShell>
  );
}
