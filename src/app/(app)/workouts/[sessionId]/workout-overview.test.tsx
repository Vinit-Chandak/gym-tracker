// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ExerciseVM, SessionVM, SetVM } from "./view-model";
import { WorkoutOverview } from "./workout-overview";

const actions = vi.hoisted(() => ({ warmup: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({ setWarmupCompletedAction: actions.warmup }));

const set = (setIndex: number, weight: number, reps: number): SetVM => ({
  id: `set-${setIndex}`,
  setIndex,
  setType: "working",
  weight,
  unit: "kg",
  reps,
  rir: 2,
  rpe: null,
  effortReported: true,
  durationSeconds: null,
  distanceMeters: null,
  completedAt: "2026-09-29T07:40:00.000Z",
});

function exercise(name: string, patch: Partial<ExerciseVM> = {}): ExerciseVM {
  const slug = name.toLowerCase().replace(/\W+/g, "-");
  return {
    id: slug,
    orderIndex: 1,
    exercise: {
      id: slug,
      name,
      slug,
      modality: "barbell",
      loadPortability: "global",
      requiresEquipment: true,
      defaultPrescriptionType: "reps",
      rirNote: null,
    },
    equipment: null,
    planned: {
      programExerciseId: `${slug}-slot`,
      plannedExerciseName: name,
      sets: 4,
      prescriptionType: "reps",
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

// Upper A, cycle 3 (sessions.test.ts): the bench under way at 60 × 4, the rest to come.
const SESSION: SessionVM = {
  id: "00000000-0000-4000-8000-00000000c0de",
  gym: { id: "gym", name: "Anytime Fitness", kind: "gym" },
  day: { id: "day", name: "Upper A", focus: null, includesRun: false, timeNote: "70–90 min" },
  cycleIndex: 3,
  startedAt: "2026-09-29T07:30:00.000Z",
  completedAt: null,
  bodyWeightKg: null,
  sleepHours: 5,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  warmupCompleted: false,
  notes: null,
  warmup: {
    name: "Upper-body warm-up",
    drills: [
      { order: 1, name: "Easy cardio", dose: "3–5 min", cue: "Easy", purpose: "Temperature" },
      {
        order: 2,
        name: "Arm circles + shoulder rotations",
        dose: "8 each",
        cue: "Pain-free",
        purpose: "Shoulder motion",
      },
    ],
  },
  restTimerEnabled: false,
  warnings: [
    {
      code: "short_sleep",
      title: "Sleep 5 h",
      advice: "Hold loads today rather than adding, and keep the RIR honest.",
    },
  ],
  coachPlan: null,
  timeZone: "UTC",
  preferredUnit: "kg",
  exercises: [
    exercise("Barbell bench press", { sets: [set(1, 60, 4), set(2, 60, 4)] }),
    exercise("Barbell curl", { completedAt: "2026-09-29T07:58:00.000Z" }),
    exercise("Cable crunch", {
      skippedAt: "2026-09-29T07:30:00.000Z",
      coachNote: "Back is sore today.",
    }),
    exercise("Face pull", {
      planned: null,
      coachNote: "Light, for the shoulders.",
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "The coach's plan for today.",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          {
            setIndex: 1,
            setType: "working",
            weight: 15,
            reps: 15,
            rir: 2,
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      },
    }),
  ],
};

function show(patch: Partial<ComponentProps<typeof WorkoutOverview>> = {}) {
  const open = vi.fn();
  render(
    <WorkoutOverview
      session={SESSION}
      readOnly={false}
      hasDrafts={false}
      onOpenExercise={open}
      onOpenDetails={() => {}}
      onEditSuperset={() => {}}
      title="Upper A"
      layer
      {...patch}
    />,
  );
  return { open };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  actions.warmup.mockReset();
});
afterEach(cleanup);

it("is the session's layer: Minimise to Today, Finish and More", () => {
  show();
  expect(screen.getByRole("heading", { level: 1, name: "Upper A" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Minimise the workout" }).getAttribute("href")).toBe(
    "/today",
  );
  expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe(
    `/workouts/${SESSION.id}/finish`,
  );
  expect(
    screen.getByRole("button", { name: "Session details, add exercise, superset" }),
  ).toBeTruthy();
  expect(screen.getByText("70–90 min")).toBeTruthy();
});

it("holds Finish back while a set draft is unsaved", () => {
  show({ hasDrafts: true });
  expect(screen.queryByRole("link", { name: "Finish" })).toBeNull();
  expect(screen.getByText(/Unsaved set drafts on this device/)).toBeTruthy();
});

it("says where a row stands only when that is news", () => {
  const { open } = show();
  const bench = screen.getByRole("button", { name: /Barbell bench press/ });
  expect(bench.textContent).toContain("60 kg × 4, 60 kg × 4");
  expect(bench.textContent).toContain("in progress, 2 of 4 sets done. Resume");
  expect(
    within(screen.getByRole("button", { name: /Barbell curl/ })).getByRole("img", { name: "Done" }),
  ).toBeTruthy();
  const crunch = screen.getByRole("button", { name: /Cable crunch/ });
  expect(crunch.textContent).toContain("Skipped");
  expect(crunch.textContent).toContain("Back is sore today.");
  expect(screen.getByRole("button", { name: /Face pull/ }).textContent).toContain(
    "15 kg · 1 × 15 @ 2 RIR",
  );
  expect(screen.getByText(/Added\. Light, for the shoulders\./)).toBeTruthy();

  fireEvent.click(bench);
  expect(open).toHaveBeenCalledWith("barbell-bench-press");
});

it("gives the recovery check its own note", () => {
  show();
  const note = screen.getByRole("complementary", { name: "Recovery check" });
  expect(note.textContent).toContain("Sleep 5 h");
  expect(note.textContent).toContain("Hold loads today rather than adding");
});

it("opens the warm-up and marks it done once the server answers", async () => {
  let answer!: (value: { ok: true }) => void;
  actions.warmup.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  show();
  fireEvent.click(screen.getByRole("button", { name: /Upper-body warm-up/ }));
  const sheet = within(screen.getByRole("dialog", { name: "Upper-body warm-up", hidden: true }));
  expect(sheet.getByText("Arm circles + shoulder rotations")).toBeTruthy();
  fireEvent.click(sheet.getByRole("button", { name: "Mark done", hidden: true }));
  expect(sheet.getByRole("button", { name: "Saving…", hidden: true })).toBeTruthy();
  answer({ ok: true });
  await sheet.findByRole("button", { name: "Done", hidden: true });
  expect(actions.warmup).toHaveBeenCalledWith(SESSION.id, true);
});
