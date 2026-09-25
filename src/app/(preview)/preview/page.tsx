import type { Metadata } from "next";

import { TodayView } from "@/app/(app)/today/today-view";
import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { TodayPlan } from "@/server/repositories/schedule";

import { PreviewShell } from "../preview-shell";

export const metadata: Metadata = { title: "Preview · Today" };

const PROGRAM: TodayPlan["program"] = {
  id: "00000000-0000-4000-8000-000000000001",
  familyId: "00000000-0000-4000-8000-00000000000f",
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

/** The day before it in the cycle, for the state where that one was finished today. */
const PREVIOUS_DAY: NonNullable<TodayPlan["finishedToday"]> = {
  ...DAY,
  id: "00000000-0000-4000-8000-000000000007",
  dayIndex: 2,
  name: "Upper A",
  focus: "Chest, back, shoulders",
  includesRun: false,
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
    sessionStatus: "completed",
    finishedToday: null,
    cycleDays: [],
    ...overrides,
  };
}

/**
 * The run of that day, as the programme holds it.
 *
 * Today asks for this by the slot the sequence is offering, so the preview supplies it the
 * same way rather than by a date. Without it there is no run on the screen, and this page
 * exists to show a day that lifts and runs.
 */
const RUN_OCCURRENCE: ScheduledOccurrence = {
  id: "00000000-0000-4000-8000-000000000005",
  sport: "running",
  disposition: "pending",
  scheduledOn: "2026-09-11",
  scheduledLocalTime: null,
  orderIndex: 0,
  revisionId: "00000000-0000-4000-8000-000000000006",
  prescription: endurancePrescriptionSchema.parse({
    prescriptionVersion: PRESCRIPTION_VERSION,
    sport: "running",
    sessionTargets: { durationMs: [25 * 60_000, 30 * 60_000] },
    running: { paceNote: "Talk-test; slower than push pace" },
  }),
  familyId: PROGRAM.familyId,
  originalWeekIndex: 1,
  originalScheduledOn: "2026-09-11",
  resolution: { kind: "incomplete" },
  loggable: true,
};

/** The workout of that day, open. Its card becomes Resume; the run card is untouched. */
const OPEN_SESSION = {
  id: "00000000-0000-4000-8000-000000000004",
  gymId: "g1",
  gymName: "Anytime Fitness",
  programDayId: DAY.id,
  dayName: DAY.name,
  cycleIndex: 1,
  startedAt: new Date("2026-09-11T07:05:00.000Z"),
  completedAt: null,
  exerciseCount: 4,
  setCount: 5,
};

export default async function TodayPreviewPage(props: PageProps<"/preview">) {
  // The states of a day that lifts and runs. The default is the one the run used to
  // disappear in: workout finished, run still owed. `next` is the day offered after the one
  // before it was finished today, which is up next rather than today's.
  const { state } = await props.searchParams;

  return (
    <PreviewShell tab="/today">
      <TodayView
        today="2026-09-11"
        timeZone="Asia/Kolkata"
        gyms={[
          { id: "g1", name: "Anytime Fitness", kind: "gym", isDefault: true },
          { id: "g2", name: "Home", kind: "home", isDefault: false },
        ]}
        plan={
          state === "done"
            ? plan()
            : plan({
                sessionStatus: "pending",
                finishedToday: state === "next" ? PREVIOUS_DAY : null,
              })
        }
        inProgress={state === "training" ? OPEN_SESSION : null}
        restProtocol={null}
        programmeOccurrences={[RUN_OCCURRENCE]}
      />
    </PreviewShell>
  );
}
