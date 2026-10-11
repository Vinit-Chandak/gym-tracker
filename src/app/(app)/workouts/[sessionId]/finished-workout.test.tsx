// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { FinishedWorkout } from "./finished-workout";
import type { ExerciseVM, SessionVM, SetVM } from "./view-model";

/**
 * The innermost element whose whole text, its spaces read as the default matcher reads them, is
 * `text`: a figure's digits stand in a span of their own (Figures).
 */
const whole = (text: string | RegExp) => (_: string, element: Element | null) => {
  const reads = (node: Element) => {
    if (node.classList.contains("figures")) return false;
    const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof text === "string" ? value === text : text.test(value);
  };
  return element !== null && reads(element) && ![...element.children].some(reads);
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _, ...props }: ComponentProps<"a"> & { prefetch?: unknown }) => (
    <a {...props} />
  ),
}));

afterEach(cleanup);

const set = (setIndex: number, setType: SetVM["setType"], weight: number, reps: number): SetVM => ({
  id: `set-${setIndex}`,
  setIndex,
  setType,
  weight,
  unit: "kg",
  reps,
  rir: setType === "warmup" ? null : 2,
  rpe: null,
  effortReported: true,
  durationSeconds: null,
  distanceMeters: null,
  completedAt: "2026-09-08T11:10:00.000Z",
});

const exercise = (id: string, name: string, sets: SetVM[]): ExerciseVM => ({
  id,
  orderIndex: 1,
  exercise: {
    id,
    name,
    slug: id,
    modality: "barbell",
    loadPortability: "global",
    requiresEquipment: true,
    defaultPrescriptionType: "reps",
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
  equipment: null,
  planned: null,
  supersetGroup: null,
  substitutionReason: null,
  notes: null,
  completedAt: null,
  skippedAt: null,
  weightStep: 2.5,
  sets,
  previous: null,
  basis: null,
  suggestion: null,
  regressionStreak: 0,
  decision: null,
  coachNote: null,
  coachRestSeconds: null,
  coachPerSide: null,
  guidance: null,
});

const session = (patch: Partial<SessionVM> = {}): SessionVM => ({
  id: "session",
  gym: { id: "gym", name: "Test gym", kind: "gym" },
  day: null,
  cycleIndex: null,
  startedAt: "2026-09-08T11:00:00.000Z",
  completedAt: "2026-09-08T12:09:00.000Z",
  bodyWeightKg: null,
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  warmupCompleted: false,
  notes: null,
  warmup: null,
  restTimerEnabled: false,
  coachPlan: null,
  warnings: [],
  timeZone: "UTC",
  preferredUnit: "kg",
  today: "2026-10-11",
  exercises: [
    exercise("bench", "Bench press", [
      set(1, "warmup", 40, 8),
      set(2, "warmup", 50, 3),
      set(3, "working", 60, 5),
      set(4, "working", 62.5, 4),
    ]),
    exercise("row", "Barbell row", [set(1, "working", 50, 8), set(2, "backoff", 40, 10)]),
    exercise("curl", "Curl", []),
  ],
  ...patch,
});

function show(over: Partial<SessionVM> = {}) {
  return render(
    <FinishedWorkout
      session={session(over)}
      title="Unplanned session"
      justFinished={false}
      backHref="/progress/history"
      records={null}
      routine={null}
      onOpenExercise={() => {}}
      onOpenDetails={() => {}}
    />,
  );
}

/** A stat's figure, read from the term that names it. */
const stat = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

it("counts the sets it lists, warm-ups aside, as its volume does", () => {
  show();
  // Two of the bench press's four, and both of the row's: the back-off is work.
  expect(stat("Sets")).toBe("4");
  expect(screen.getByText(whole("60 kg × 5, 62.5 kg × 4"))).toBeTruthy();
  expect(stat("Volume")).toBe("1,350 kg");
  expect(stat("Time")).toBe("69 min");
});

it("says each check-in reading on its own scale, as the check-in asked it", () => {
  show({ sleepHours: 7.75, sleepQuality: 2, fatigue: 4, soreness: 1 });
  // A night's sleep as every other time is said, not "7.75 h".
  expect(stat("Sleep")).toBe("7 h 45 min");
  expect(stat("Sleep quality")).toBe("2 / 5");
  expect(stat("Fatigue")).toBe("4 / 5");
  expect(stat("Soreness")).toBe("1 / 5");
  // Energy is no longer asked, and a check-in without it says nothing of it.
  expect(screen.queryByText("Energy")).toBeNull();
});

it("names the year of a workout from another, as a friend's copy of it does", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T08:00:00.000Z"));
  try {
    show({ startedAt: "2025-10-13T17:30:00.000Z", completedAt: "2025-10-13T18:41:00.000Z" });
    expect(screen.getByText("Mon 13 Oct 2025")).toBeTruthy();
    cleanup();
    show();
    expect(screen.getByText("Tue 8 Sept")).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});
