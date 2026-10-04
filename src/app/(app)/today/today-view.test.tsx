// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { SessionSummary } from "@/server/repositories/sessions";
import type { TodayPlan } from "@/server/repositories/schedule";

import { TodayView } from "./today-view";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/server/actions/sessions", () => ({
  skipSlotAction: vi.fn(),
  completeRestSlotAction: vi.fn(),
  discardSessionAction: vi.fn(),
}));
vi.mock("@/server/actions/coach", () => ({ requestCoachPlanAction: vi.fn() }));
vi.mock("@/server/actions/gyms", () => ({ setDefaultGymAction: vi.fn() }));
vi.mock("@/server/actions/coaching-workflow", () => ({ startWaitingCoachJobAction: vi.fn() }));

afterEach(cleanup);

// The day the feature inventory samples: Easy Run + Arms, which lifts and runs.
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

const slot = (id: string, name: string, sets: number) => ({
  programExerciseId: id,
  exerciseId: `x-${id}`,
  name,
  modality: "barbell" as const,
  sets,
  prescriptionType: "reps" as const,
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
});

function plan(): TodayPlan {
  return {
    program: {
      id: "00000000-0000-4000-8000-000000000001",
      familyId: "00000000-0000-4000-8000-00000000000f",
      name: "8-Week Strength + Aesthetics Hybrid",
      slug: "strength-aesthetics-hybrid-8wk",
      startDate: "2026-09-08",
      endDate: null,
      weeks: 8,
      startDayIndex: 1,
      notes: null,
    },
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
    suggestedExercises: [slot("e1", "Barbell curl", 3), slot("e2", "Rope triceps pushdown", 3)],
    nextTrainingDay: null,
    sessionStatus: "pending",
    finishedToday: null,
    cycleDays: Array.from({ length: 7 }, (_, index) => ({
      day: { ...DAY, id: `day-${index + 1}`, dayIndex: index + 1 },
      cycleIndex: 1,
      status: index < 2 ? ("completed" as const) : ("pending" as const),
    })),
  } as TodayPlan;
}

const run = (id: string, minutes: [number, number]): ScheduledOccurrence => ({
  id,
  sport: "running",
  disposition: "pending",
  scheduledOn: "2026-09-11",
  scheduledLocalTime: null,
  orderIndex: 0,
  revisionId: `${id}-revision`,
  prescription: endurancePrescriptionSchema.parse({
    prescriptionVersion: PRESCRIPTION_VERSION,
    sport: "running",
    sessionTargets: { durationMs: minutes.map((m) => m * 60_000) },
    running: { paceNote: "Talk-test; slower than push pace" },
  }),
  familyId: null,
  originalWeekIndex: null,
  originalScheduledOn: null,
  resolution: { kind: "incomplete" },
  loggable: true,
});

const session = (patch: Partial<SessionSummary> = {}): SessionSummary =>
  ({
    id: "00000000-0000-4000-8000-000000000004",
    gymId: "g1",
    gymName: "Anytime Fitness",
    programDayId: DAY.id,
    dayName: DAY.name,
    cycleIndex: 1,
    startedAt: new Date("2026-09-11T07:05:00.000Z"),
    completedAt: null,
    exerciseCount: 2,
    setCount: 0,
    ...patch,
  }) as SessionSummary;

function show(patch: Partial<ComponentProps<typeof TodayView>> = {}) {
  return render(
    <TodayView
      today="2026-09-11"
      timeZone="Asia/Kolkata"
      gyms={[
        { id: "g1", name: "Anytime Fitness", kind: "gym", isDefault: true },
        { id: "g2", name: "Home", kind: "home", isDefault: false },
      ]}
      plan={plan()}
      inProgress={null}
      restProtocol={null}
      programmeOccurrences={[run("run-1", [25, 30])]}
      {...patch}
    />,
  );
}

const card = (name: string) => screen.getByRole("article", { name });

it("gives the workout and each run a card of its own, each with its own next step", () => {
  show({ standaloneOccurrences: [run("run-2", [40, 40])] });
  expect(screen.getAllByRole("article")).toHaveLength(3);
  const workout = within(card("Easy Run + Arms"));
  // Start goes on to the check-in, which is what creates the session.
  expect(
    workout.getByRole("link", { name: "Start workout: Easy Run + Arms" }).getAttribute("href"),
  ).toBe(`/workouts/start?gym=g1&day=${DAY.id}&index=3`);
  expect(workout.getByText("70–100 min")).toBeTruthy();
  expect(workout.getByText("Aerobic + arms/forearms")).toBeTruthy();
  // Two runs on one day are told apart by what each asks for.
  expect(screen.getByRole("link", { name: "Log run: 25–30 min" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log run: 40 min" })).toBeTruthy();
});

it("folds the plan until asked for, then unfolds it in place", () => {
  show();
  const workout = card("Easy Run + Arms");
  const toggle = within(workout).getByRole("button", { name: /^Easy Run \+ Arms/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  const plan = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(plan.hasAttribute("inert")).toBe(true);
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(plan.hasAttribute("inert")).toBe(false);
  expect(
    within(plan).getByRole("list", { name: "Easy Run + Arms: the exercises" }).textContent,
  ).toContain("Rope triceps pushdown");
});

it("keeps Resume and Discard in the day's card while its session is open, and nothing else", () => {
  show({ inProgress: session() });
  const workout = within(card("Easy Run + Arms"));
  expect(workout.getByRole("link", { name: "Resume session: Easy Run + Arms" })).toBeTruthy();
  expect(workout.getByRole("button", { name: "Discard empty session" })).toBeTruthy();
  expect(card("Easy Run + Arms").textContent).toContain("In progress · Started 12:35 · 0 sets");
  // One unfinished workout at a time: nothing to start, skip or re-plan, and the gym is fixed.
  expect(screen.queryByRole("link", { name: /Start workout/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Start workout/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /More options/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Gym: .*Change/ })).toBeNull();
});

it("never offers Discard once a set is in", () => {
  show({ inProgress: session({ setCount: 2 }) });
  expect(screen.queryByRole("button", { name: "Discard empty session" })).toBeNull();
  expect(card("Easy Run + Arms").textContent).toContain("2 sets");
});

it("puts another open session first, and says why the day cannot start", () => {
  show({ inProgress: session({ programDayId: null, dayName: null }) });
  const [first] = screen.getAllByRole("article");
  expect(within(first!).getByRole("heading").textContent).toBe("Unplanned session");
  expect(within(first!).getByRole("button", { name: "Discard empty session" })).toBeTruthy();
  expect(
    within(card("Easy Run + Arms")).getByText(
      "Finish or discard your open session to start this one.",
    ),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Start workout/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Start workout/ })).toBeNull();
  // Nothing on the day's card can start, so its gym is a fact, not a choice.
  expect(screen.queryByRole("button", { name: /Gym: .*Change/ })).toBeNull();
  expect(within(card("Easy Run + Arms")).getByText("Anytime Fitness")).toBeTruthy();
});

it("says once that an empty session was discarded, and drops it from the address", async () => {
  window.history.replaceState(null, "", "/today?discarded=1");
  show({ discarded: true });
  expect(await screen.findByText("Empty session discarded.")).toBeTruthy();
  expect(window.location.search).toBe("");
});
