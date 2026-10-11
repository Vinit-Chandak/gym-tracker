// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { SessionSummary } from "@/server/repositories/sessions";
import type { TodayPlan } from "@/server/repositories/schedule";
import { writeDraft } from "@/lib/workout-drafts";

import { TodayView } from "./today-view";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/server/actions/sessions", () => ({
  skipSlotAction: vi.fn(),
  completeRestSlotAction: vi.fn(),
  discardSessionAction: vi.fn(),
  finishLeftOpenAction: vi.fn(),
}));
vi.mock("@/server/actions/coach", () => ({ requestCoachPlanAction: vi.fn() }));
vi.mock("@/server/actions/gyms", () => ({ setDefaultGymAction: vi.fn() }));
vi.mock("@/server/actions/coaching-workflow", () => ({ startWaitingCoachJobAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  refresh.mockClear();
});

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
      repeats: null,
      cycles: 8,
      startDayIndex: 1,
      notes: null,
    },
    today: "2026-09-11",
    progress: { total: 56, completed: 2, skipped: 0, remaining: 54, currentCycle: 1 },
    behind: 0,
    missed: [],
    pickUpDay: null,
    projectedEnd: null,
    finishedOn: null,
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
    workingSetCount: 0,
    ...patch,
  }) as SessionSummary;

function show(patch: Partial<ComponentProps<typeof TodayView>> = {}) {
  return render(
    <TodayView
      today="2026-09-11"
      timeZone="Asia/Kolkata"
      userId="user"
      now={new Date("2026-09-11T07:40:00.000Z")}
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
  // Its figures in Jost, the dash and the unit in Atkinson: one fact, in three runs.
  expect(
    workout.getAllByText((_, element) => element?.textContent === "70–100 min").length,
  ).toBeGreaterThan(0);
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

it("keeps other training accessible after lifting is logged while the run is still owed", () => {
  show({ plan: { ...plan(), sessionStatus: "completed" } });
  expect(screen.getByRole("button", { name: /More options/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log run: 25–30 min" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Start workout: Easy Run + Arms" })).toBeNull();
});

it("keeps other training accessible on a day with only endurance planned", () => {
  show({ plan: { ...plan(), suggestedDay: { ...DAY, includesLifting: false } } });
  expect(screen.getByRole("button", { name: /More options/ })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Start workout: Easy Run + Arms" })).toBeNull();
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

it("never offers Discard once a set is in, and counts the work, not the warm-ups", () => {
  show({ inProgress: session({ setCount: 3, workingSetCount: 2 }) });
  expect(screen.queryByRole("button", { name: "Discard empty session" })).toBeNull();
  expect(card("Easy Run + Arms").textContent).toContain("2 sets");
  cleanup();
  // Warmed up and nothing more: no work to count, but something logged that Discard would lose.
  show({ inProgress: session({ setCount: 1, workingSetCount: 0 }) });
  expect(screen.queryByRole("button", { name: "Discard empty session" })).toBeNull();
  expect(card("Easy Run + Arms").textContent).toContain("0 sets");
  // Trained a moment ago, it is in progress, not left open: nothing offers to finish it here.
  expect(screen.queryByRole("button", { name: /^Finish it as of/ })).toBeNull();
});

it("offers to finish a workout left open as of its last set, and nothing closes it unasked", () => {
  const open = session({ setCount: 12, lastSetAt: new Date("2026-09-11T08:10:00.000Z") });
  // The next morning: nothing logged in it since 13:40 yesterday.
  show({ today: "2026-09-12", now: new Date("2026-09-12T03:00:00.000Z"), inProgress: open });
  const workout = within(screen.getAllByRole("article")[0]!);
  expect(workout.getByRole("button", { name: "Finish it as of Fri 11 Sept, 13:40" })).toBeTruthy();
  // Resume is still the card's next step; the finish is its quiet way out.
  expect(workout.getByRole("link", { name: /^Resume session/ })).toBeTruthy();
  cleanup();

  // A set typed on this device and not saved holds it, and says why.
  writeDraft(
    localStorage,
    {
      userId: "user",
      sessionId: open.id,
      workoutExerciseId: "slot",
      exerciseId: "curl",
      equipmentId: null,
    },
    {
      setIndex: 3,
      setType: "working",
      weight: "15",
      reps: "",
      rir: "",
      duration: "",
      distance: "",
      baseCompletedAt: null,
    },
  );
  show({ today: "2026-09-12", now: new Date("2026-09-12T03:00:00.000Z"), inProgress: open });
  expect(
    (screen.getByRole("button", { name: /^Finish it as of/ }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText(/A set on this device is not saved yet/)).toBeTruthy();
  localStorage.clear();
  cleanup();

  // Six hours after the last set is not yet left open.
  show({ now: new Date("2026-09-11T14:00:00.000Z"), inProgress: open });
  expect(screen.queryByRole("button", { name: /^Finish it as of/ })).toBeNull();
  cleanup();

  // Left open with nothing in it, Discard is the way out, as it always is for an empty one.
  show({ now: new Date("2026-09-12T03:00:00.000Z"), inProgress: session() });
  expect(screen.getByRole("button", { name: "Discard empty session" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Finish it as of/ })).toBeNull();
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

describe("what is scheduled today, without a programme day to stand under", () => {
  const ride = run("ride-1", [60, 60]);

  it("is shown to an athlete with no gym and no programme", () => {
    show({ gyms: [], plan: null, programmeOccurrences: [], standaloneOccurrences: [ride] });
    expect(screen.getByRole("link", { name: "Log run: 60 min" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add a gym to start training" })).toBeTruthy();
  });

  it("is shown beside a programme that is finished", () => {
    show({
      plan: { ...plan(), suggestion: null, suggestedDay: null, finishedOn: "2026-09-05" },
      programmeOccurrences: [],
      standaloneOccurrences: [ride],
    });
    expect(screen.getByText("Programme complete")).toBeTruthy();
    // Finished the day its last day was answered, not the day it was written to end.
    expect(screen.getByText("Finished Sat 5 Sept")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log run: 60 min" })).toBeTruthy();
  });

  it("does not ask for a gym on a day with no lifting", () => {
    show({
      gyms: [],
      plan: { ...plan(), suggestedDay: { ...DAY, name: "Easy run", includesLifting: false } },
    });
    expect(screen.queryByRole("heading", { name: "Add a gym to start training" })).toBeNull();
    expect(screen.getByRole("link", { name: "Log run: 25–30 min" })).toBeTruthy();
  });
});

it("offers no start on a rest day for a next day that only runs", () => {
  const rest = {
    ...DAY,
    id: "rest",
    dayIndex: 4,
    name: "Rest",
    includesLifting: false,
    includesRun: false,
  };
  const runDay = { ...DAY, id: "run-day", dayIndex: 5, name: "Easy run", includesLifting: false };
  const restPlan: TodayPlan = {
    ...plan(),
    suggestion: {
      slot: { cycleIndex: 1, dayIndex: 4 },
      restSlotsBefore: [],
      nextTrainingSlot: { cycleIndex: 1, dayIndex: 5 },
    },
    suggestedDay: rest,
    suggestedExercises: [],
  };
  show({
    plan: { ...restPlan, nextTrainingDay: { ...runDay, cycleIndex: 1 } },
    programmeOccurrences: [],
  });
  // Nothing to start: the check-in it led to went back to Today with nothing started.
  expect(screen.queryByRole("link", { name: /instead/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Mark rest day done" })).toBeTruthy();

  cleanup();
  const lifting = { ...runDay, name: "Lower B", includesLifting: true, includesRun: false };
  show({
    plan: { ...restPlan, nextTrainingDay: { ...lifting, cycleIndex: 1 } },
    programmeOccurrences: [],
  });
  expect(screen.getByRole("link", { name: "Start Lower B instead" })).toBeTruthy();
});

it("keeps the run of a day finished today on today, and the next day up next", () => {
  const logged: ScheduledOccurrence = {
    ...run("run-done", [30, 30]),
    familyId: "family",
    resolution: {
      kind: "logged",
      activityId: "activity-1",
      outcome: "logged",
      occurredOn: "2026-09-11",
    },
    loggable: false,
  };
  const easyRun = { ...DAY, id: "easy-run", dayIndex: 2, name: "Easy run", includesLifting: false };
  show({
    plan: { ...plan(), finishedToday: { ...easyRun, cycleIndex: 1 } },
    finishedOccurrences: [logged],
  });
  const today = within(screen.getByRole("region", { name: "Today" }));
  const [ran, ...others] = today.getAllByRole("article");
  expect(others).toHaveLength(0);
  // A day that only runs is its run: its card is named for the day and says it is done, and no
  // second card says the same.
  expect(within(ran!).getByRole("heading").textContent).toContain("Easy run");
  expect(ran!.textContent).toContain("Logged");
  expect(ran!.textContent).not.toContain("Part of");
  expect(within(ran!).getByRole("link", { name: /See what you logged/ })).toBeTruthy();
  expect(screen.getByRole("list", { name: "Up next: Easy Run + Arms" })).toBeTruthy();
});

it("names a day that only runs for the day, with its focus, as a lifting day's card is", () => {
  // Liam's Today in the year audit: "Run 4.6–5.9 mi", where Training says "Tempo run · Threshold".
  const tempo = {
    ...DAY,
    id: "tempo",
    dayIndex: 4,
    name: "Tempo run",
    focus: "Threshold",
    includesLifting: false,
  };
  const threshold: ScheduledOccurrence = { ...run("run-tempo", [37, 47]), familyId: "family" };
  show({
    plan: { ...plan(), suggestedDay: tempo, suggestedExercises: [] },
    programmeOccurrences: [threshold],
  });
  const tempoCard = card("Tempo run");
  expect(within(tempoCard).getByText("Threshold")).toBeTruthy();
  // The pace note keeps its place beside the focus, and in the plan under the fold.
  expect(within(tempoCard).getAllByText("Talk-test; slower than push pace")).toHaveLength(2);
  expect(within(tempoCard).getByRole("link", { name: "Log run: 37–47 min" })).toBeTruthy();
  // Unfolded, the time is one range with its unit said once, as everywhere else.
  expect(tempoCard.textContent).toContain("37–47\u00a0min");
  expect(tempoCard.textContent).not.toContain("37 min–47 min");
});

it("keeps what was logged today with no card of its own on the day, inked done", () => {
  // Sofia's rest day in the year audit: an indoor ride nobody scheduled, which Today left out.
  const rest = { ...DAY, id: "rest", dayIndex: 7, name: "Rest", includesLifting: false };
  show({
    plan: {
      ...plan(),
      suggestedDay: { ...rest, includesRun: false },
      suggestedExercises: [],
    },
    programmeOccurrences: [],
    logged: [
      {
        id: "ride-1",
        sport: "cycling",
        startedAt: new Date("2026-09-11T04:18:00.000Z"),
        durationMs: 3_092_000,
        distanceMetres: null,
        environment: "indoor",
        occurrenceId: null,
        sessionId: null,
        programDayId: null,
        dayName: null,
        gymName: null,
      },
    ],
  });
  const ride = card("Ride");
  expect(ride.textContent).toContain("51:32");
  expect(ride.textContent).toContain("09:48");
  expect(ride.textContent).toContain("Logged");
  expect(
    within(ride)
      .getByRole("link", { name: /See what you logged/ })
      .getAttribute("href"),
  ).toBe("/training/activities/ride-1");
  // The rest day is still the day's, with its own way to be marked done.
  expect(screen.getByRole("button", { name: "Mark rest day done" })).toBeTruthy();
});

it("draws no run in the print for one a revision withdrew", () => {
  const withdrawn: ScheduledOccurrence = {
    ...run("run-cancelled", [25, 30]),
    disposition: "cancelled",
    resolution: { kind: "cancelled" },
    loggable: false,
  };
  show({ programmeOccurrences: [withdrawn] });
  expect(screen.getByRole("img", { name: /^Easy Run \+ Arms:/ }).getAttribute("aria-label")).toBe(
    "Easy Run + Arms: 2 exercises as columns of their sets, to do.",
  );
});

it("says skipping a day that also runs skips only its workout", () => {
  // jsdom has no <dialog> implementation; the sheet only needs these to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  show();
  fireEvent.click(screen.getByRole("button", { name: /More options/ }));
  fireEvent.click(screen.getByRole("button", { name: "Skip the workout" }));
  expect(screen.getByText("Skip the workout?")).toBeTruthy();
  expect(
    screen.getByText(
      "The run stays on Today. Skip it from its own card if you are not running either.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Skip workout" })).toBeTruthy();
});
