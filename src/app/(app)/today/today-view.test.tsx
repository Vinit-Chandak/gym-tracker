// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { OpenSessionSummary } from "@/server/repositories/sessions";
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
  pickUpFromTodayAction: vi.fn(),
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
    sessionPrint: null,
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
  closed: false,
  loggable: true,
});

const session = (patch: Partial<OpenSessionSummary> = {}): OpenSessionSummary =>
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
    print: { drills: 0, warmupCompleted: false, completed: false, exercises: [] },
    ...patch,
  }) as OpenSessionSummary;

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
  // Its figures as figures, the dash and the unit as words: one fact, in three runs, held at its
  // dash and to its unit where the line wraps.
  expect(
    workout.getAllByText((_, element) => element?.textContent === "70\u2060–\u2060100\u00a0min")
      .length,
  ).toBeGreaterThan(0);
  expect(workout.getByText("Aerobic + arms/forearms")).toBeTruthy();
  // Two runs on one day are told apart by what each asks for.
  expect(screen.getByRole("link", { name: "Log run: 25–30 min" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log run: 40 min" })).toBeTruthy();
});

it("folds the plan until asked for, then unfolds it in place", () => {
  show();
  const workout = card("Easy Run + Arms");
  // The plan's row names it, at the card's foot, under the card's next step.
  const toggle = within(workout).getByRole("button", { name: "Exercises" });
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

/** ADR 0058: anything the cards do not offer is Log's, one control at the top of the day. */
const logLink = () => screen.getByRole("link", { name: "Log" });

it("keeps the run owed, and Log for anything else, once the day's lifting is logged", () => {
  show({ plan: { ...plan(), sessionStatus: "completed" } });
  expect(screen.getByRole("link", { name: "Log run: 25–30 min" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Start workout: Easy Run + Arms" })).toBeNull();
  expect(logLink().getAttribute("href")).toBe("/today/log");
});

it("offers Log for other training on a day with only endurance planned", () => {
  show({ plan: { ...plan(), suggestedDay: { ...DAY, includesLifting: false } } });
  expect(screen.queryByRole("link", { name: "Start workout: Easy Run + Arms" })).toBeNull();
  expect(screen.queryByRole("button", { name: /More options/ })).toBeNull();
  expect(logLink().getAttribute("href")).toBe("/today/log");
});

it("keeps Resume and Discard in the day's card while its session is open, and nothing else", () => {
  show({ inProgress: session() });
  const workout = within(card("Easy Run + Arms"));
  expect(workout.getByRole("link", { name: "Resume session: Easy Run + Arms" })).toBeTruthy();
  expect(workout.getByRole("button", { name: "Discard empty session" })).toBeTruthy();
  expect(card("Easy Run + Arms").textContent).toContain(
    "In progress ·\u00a0Started 12:35 ·\u00a00 sets",
  );
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
  expect(
    workout.getByRole("button", { name: "Finish it as of Fri\u00a011\u00a0Sept, 13:40" }),
  ).toBeTruthy();
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
  expect(screen.getByText("Unsaved set: resume to save or remove it.")).toBeTruthy();
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
  // In Log's words for the same state.
  expect(
    within(card("Easy Run + Arms")).getByText("Finish or discard your open workout first."),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Start workout/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Start workout/ })).toBeNull();
  // Nothing on the day's card can start, so its gym is a fact, not a choice.
  expect(screen.queryByRole("button", { name: /Gym: .*Change/ })).toBeNull();
  expect(within(card("Easy Run + Arms")).getByText("Anytime Fitness")).toBeTruthy();
});

it("names a workout started from a saved routine after the routine, open and finished", () => {
  const name = "Push day at the hotel gym, with the long band finisher";
  const { unmount } = show({
    inProgress: session({ programDayId: null, dayName: null, title: name }),
  });
  const [first] = screen.getAllByRole("article");
  expect(within(first!).getByRole("heading").textContent).toBe(name);
  expect(within(first!).getByRole("link", { name: `Resume session: ${name}` })).toBeTruthy();
  unmount();

  show({
    logged: [
      {
        id: "lift-1",
        sport: "strength",
        startedAt: new Date("2026-09-11T04:18:00.000Z"),
        durationMs: 2_880_000,
        distanceMetres: null,
        environment: null,
        occurrenceId: null,
        sessionId: "lift-1",
        programDayId: null,
        dayName: null,
        title: name,
        gymName: "Anytime Fitness",
      },
    ],
  });
  // Done, it is a row of what was done, named for the routine, opening its record.
  const done = within(screen.getByRole("region", { name: "Done" }));
  const lift = done.getByRole("link", { name: new RegExp(name) });
  expect(lift.getAttribute("href")).toBe("/workouts/lift-1?from=today");
  expect(lift.textContent).toContain("Unplanned");
  expect(lift.textContent).toContain("48\u00a0min");
  expect(screen.queryByText("Unplanned session")).toBeNull();
});

it("names a finished unplanned workout in Done by its first two exercises", () => {
  const unplanned = {
    id: "lift-2",
    sport: "strength" as const,
    startedAt: new Date("2026-09-11T04:18:00.000Z"),
    durationMs: 2_880_000,
    distanceMetres: null,
    environment: null,
    occurrenceId: null,
    sessionId: "lift-2",
    programDayId: null,
    dayName: null,
    title: null,
    gymName: "Anytime Fitness",
  };
  const { unmount } = show({
    logged: [{ ...unplanned, exercises: ["Pull-up", "Bent-over row", "Barbell curl"] }],
  });
  const done = within(screen.getByRole("region", { name: "Done" }));
  // Each name held at its hyphen (a word joiner after it), as every row holds one.
  const lift = done.getByRole("link", { name: /Pull-\u2060up, Bent-\u2060over row/ });
  expect(lift.getAttribute("href")).toBe("/workouts/lift-2?from=today");
  // Its name no longer says it was unplanned, so the row does.
  expect(lift.textContent).toContain("Unplanned");
  unmount();

  // With nothing logged in it, it is still the unplanned session it was.
  show({ logged: [{ ...unplanned, exercises: [] }] });
  const empty = within(screen.getByRole("region", { name: "Done" })).getByRole("link", {
    name: /Unplanned session/,
  });
  expect(empty.textContent).not.toMatch(/Unplanned session.*Unplanned/);
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

  it("is shown to an athlete who does not lift, with Log for anything else", () => {
    show({
      gyms: [],
      plan: null,
      programmeOccurrences: [],
      standaloneOccurrences: [ride],
      sports: ["running"],
    });
    expect(screen.getByRole("link", { name: "Log run: 60 min" })).toBeTruthy();
    expect(logLink().getAttribute("href")).toBe("/today/log");
    expect(screen.queryByRole("heading", { name: "Add a gym to start training" })).toBeNull();
  });

  it("is shown to an athlete who logs their own workouts, who starts one from Log", () => {
    show({ plan: null, programmeOccurrences: [], standaloneOccurrences: [ride], tracking: true });
    expect(screen.getByRole("link", { name: "Log run: 60 min" })).toBeTruthy();
    expect(logLink().getAttribute("href")).toBe("/today/log");
  });

  it("is shown beside a programme that is finished, whose end is Plan's to say", () => {
    show({
      plan: { ...plan(), suggestion: null, suggestedDay: null, finishedOn: "2026-09-05" },
      programmeOccurrences: [],
      standaloneOccurrences: [ride],
    });
    expect(screen.getByRole("link", { name: "Log run: 60 min" })).toBeTruthy();
    expect(screen.queryByText(/complete/)).toBeNull();
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
  expect(screen.queryByRole("link", { name: /^Start / })).toBeNull();
  expect(screen.getByRole("button", { name: "Mark rest day done" })).toBeTruthy();

  cleanup();
  const lifting = { ...runDay, name: "Lower B", includesLifting: true, includesRun: false };
  show({
    plan: { ...restPlan, nextTrainingDay: { ...lifting, cycleIndex: 1 } },
    programmeOccurrences: [],
  });
  expect(screen.getByRole("link", { name: "Start Lower B" })).toBeTruthy();
  cleanup();

  // The cycle's last day a rest day: the next lift begins the next cycle, and says so with its
  // name, as Choose a day and the day's own page do.
  show({
    plan: { ...restPlan, nextTrainingDay: { ...lifting, name: "Push A", cycleIndex: 2 } },
    programmeOccurrences: [],
  });
  expect(screen.getByRole("link", { name: "Start cycle 2 with Push A" })).toBeTruthy();
});

it("keeps what a day finished today did as rows, and leaves the next day to Plan", () => {
  const easyRun = { ...DAY, id: "easy-run", dayIndex: 2, name: "Easy run", includesLifting: false };
  show({
    plan: { ...plan(), finishedToday: { ...easyRun, cycleIndex: 1 } },
    programmeOccurrences: [],
    logged: [
      {
        id: "activity-1",
        sport: "running",
        startedAt: new Date("2026-09-11T01:30:00.000Z"),
        durationMs: 1_800_000,
        distanceMetres: 5_100,
        environment: "outdoor",
        occurrenceId: "run-done",
        sessionId: null,
        programDayId: null,
        dayName: null,
        title: null,
        gymName: null,
      },
    ],
  });
  // ADR 0058: the next programme day is not today's, so Today shows no card for it.
  expect(screen.queryAllByRole("article")).toHaveLength(0);
  expect(screen.queryByText(/Up next/)).toBeNull();
  const ran = within(screen.getByRole("region", { name: "Done" })).getByRole("link", {
    name: /Run/,
  });
  expect(ran.getAttribute("href")).toBe("/progress/activities/activity-1?from=today");
  expect(ran.textContent).toContain("5.1");
  expect(ran.textContent).not.toContain("Unplanned");
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
  // The pace note is said once, in the plan under the fold, not again beside the focus.
  expect(within(tempoCard).getAllByText("Talk-test; slower than push pace")).toHaveLength(1);
  const toggle = within(tempoCard).getByRole("button", { name: "Steps and pace" });
  const fold = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(within(fold).getByText("Talk-test; slower than push pace")).toBeTruthy();
  expect(within(tempoCard).getByRole("link", { name: "Log run: 37–47 min" })).toBeTruthy();
  // Skipping or moving it is the card's second button, beside Log.
  expect(within(tempoCard).getByRole("link", { name: "Skip or move" }).getAttribute("href")).toBe(
    "/plan/sessions/run-tempo",
  );
  // The time is one range with its unit said once, at the head beside the name: the fold does
  // not say it again, nor as "37 min–47 min".
  expect(within(tempoCard).getByRole("heading", { level: 2 }).textContent).toContain("37–47 min");
  expect(fold.textContent).not.toContain("47");
  expect(tempoCard.textContent).not.toContain("37 min–47 min");
});

it("folds under a run's head only what its head does not already say", () => {
  const easy: ScheduledOccurrence = {
    ...run("run-easy", [30, 30]),
    prescription: endurancePrescriptionSchema.parse({
      prescriptionVersion: PRESCRIPTION_VERSION,
      sport: "running",
      sessionTargets: { durationMs: [30 * 60_000, 30 * 60_000], effort: [2, 3] },
    }),
  };
  show({ programmeOccurrences: [easy] });
  const runCard = card("Run");
  const toggle = within(runCard).getByRole("button", { name: "Steps and pace" });
  const fold = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  // "30 min" beside the name; under the fold, the effort alone, held whole where it wraps.
  expect(within(runCard).getByRole("heading", { level: 2 }).textContent).toContain("30 min");
  expect(fold.textContent).toContain("Effort 2\u2060–\u20603 of\u00a05");
  expect(fold.textContent).not.toContain("30");
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
        title: null,
        gymName: null,
      },
    ],
  });
  const ride = within(screen.getByRole("region", { name: "Done" })).getByRole("link", {
    name: /Ride/,
  });
  expect(ride.textContent).toContain("Unplanned");
  expect(ride.textContent).toContain("51:32");
  expect(ride.getAttribute("href")).toBe("/progress/activities/ride-1?from=today");
  // The rest day is still the day's, with its own way to be marked done.
  expect(screen.getByRole("button", { name: "Mark rest day done" })).toBeTruthy();
});

it("names a run, ride or swim logged today by its own title, as History does", () => {
  const ride = {
    id: "ride-1",
    sport: "cycling" as const,
    startedAt: new Date("2026-09-11T04:18:00.000Z"),
    durationMs: 3_092_000,
    distanceMetres: null,
    environment: "indoor" as const,
    occurrenceId: null,
    sessionId: null,
    programDayId: null,
    dayName: null,
    gymName: null,
  };
  show({
    programmeOccurrences: [],
    logged: [
      { ...ride, title: "Sunday spin with the club" },
      { ...ride, id: "ride-2", title: null },
    ],
  });
  const done = within(screen.getByRole("region", { name: "Done" }));
  expect(done.getByRole("link", { name: /Sunday spin with the club/ }).textContent).toContain(
    "51:32",
  );
  // Untitled, it is its sport.
  expect(done.getByRole("link", { name: /^Ride/ })).toBeTruthy();
});

it("gives a run a revision withdrew no card and no row", () => {
  const withdrawn: ScheduledOccurrence = {
    ...run("run-cancelled", [25, 30]),
    disposition: "cancelled",
    resolution: { kind: "cancelled" },
    loggable: false,
  };
  show({ programmeOccurrences: [withdrawn] });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.queryByRole("link", { name: /^Log run/ })).toBeNull();
  expect(screen.queryByRole("region", { name: "Done" })).toBeNull();
});

it("says a run skipped today once, as a row that opens it to undo the skip", () => {
  // Still loggable, as a skipped session is: logging it would answer it after all.
  const skipped: ScheduledOccurrence = {
    ...run("run-skipped", [25, 30]),
    disposition: "skipped",
    resolution: { kind: "skipped" },
  };
  show({ programmeOccurrences: [skipped] });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.queryByRole("link", { name: /^Log run/ })).toBeNull();
  const row = within(screen.getByRole("region", { name: "Done" })).getByRole("link", {
    name: /Run/,
  });
  expect(row.textContent).toContain("Skipped");
  expect(row.getAttribute("href")).toBe("/plan/sessions/run-skipped");
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
  expect(screen.getByText("Your run stays on Today.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Skip workout" })).toBeTruthy();
});

/** Today's head after a gap: "36 missed" (ADR 0058, Words), never "sessions behind". */
it("counts the missed days under the date, with Pick up from today", () => {
  const missed = Array.from({ length: 3 }, (_, i) => ({
    cycleIndex: 1,
    dayIndex: i + 1,
    name: `Day ${i + 1}`,
  }));
  show({ plan: { ...plan(), missed } });
  expect(
    screen.getByText(
      (_, element) => element?.tagName === "P" && element.textContent === "3 missed",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/behind/)).toBeNull();
  expect(screen.getByRole("button", { name: "Pick up from today" })).toBeTruthy();
});

/**
 * Said once: with gyms to choose from and none set, the gym's chip says "Choose a gym", and no
 * line under the facts says it again; Start waits until one is chosen.
 */
it("asks for a gym on the chip alone, and holds Start until one is chosen", () => {
  show({
    gyms: [
      { id: "g1", name: "Anytime Fitness", kind: "gym", isDefault: false },
      { id: "g2", name: "Home", kind: "home", isDefault: false },
    ],
  });
  const workout = within(card("Easy Run + Arms"));
  expect(workout.getByRole("button", { name: "Choose a gym" })).toBeTruthy();
  expect(workout.queryByText(/to start/)).toBeNull();
  expect(
    (workout.getByRole("button", { name: "Start workout: Easy Run + Arms" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

/** Audit B1: an account that only swims was told to add a gym, as its only way forward. */
it("never asks someone who does not lift for a gym, and leads with Log instead", () => {
  show({ gyms: [], plan: null, programmeOccurrences: [], sports: ["swimming", "running"] });
  expect(screen.queryByText("Add a gym to start training")).toBeNull();
  expect(screen.getByText("Nothing planned")).toBeTruthy();
  // Nothing planned and nothing done: Log is the page itself, its sports their own (ADR 0058).
  expect(screen.getByRole("link", { name: "Log a session" }).getAttribute("href")).toBe(
    "/today/log",
  );
  expect(screen.queryByRole("link", { name: "Log" })).toBeNull();
});

it("still asks a lifter with nowhere to train to add a gym", () => {
  show({ gyms: [], plan: null, programmeOccurrences: [], sports: ["strength"] });
  expect(screen.getByText("Add a gym to start training")).toBeTruthy();
  // The heading and its button carry the task; how planning uses a gym is not said here.
  expect(screen.queryByText(/equipment/)).toBeNull();
  expect(screen.getByRole("link", { name: "Add your first gym" }).getAttribute("href")).toBe(
    "/gyms/new",
  );
});

/** Audit B7: after choosing to log their own workouts, Today led with "Choose a programme". */
it("leads with Log for someone who logs their own workouts", () => {
  show({ plan: null, programmeOccurrences: [], tracking: true });
  expect(screen.getByText("Nothing planned")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log a session" }).getAttribute("href")).toBe(
    "/today/log",
  );
});

it("leaves choosing a programme to Plan, for an account without one", () => {
  show({ plan: null, programmeOccurrences: [] });
  expect(screen.getByText("Nothing planned")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /programme/ })).toBeNull();
  expect(screen.getByRole("link", { name: "Log a session" })).toBeTruthy();
});

/** What the head's line under the day says, as read: no-break spaces as spaces. */
const meta = () => document.querySelector(".page-root-meta")!.textContent!.replace(/\s+/g, " ");

/** Owner, 21 and 28 October 2026: a tab's root opens on its subject, its date its second tone. */
it("opens on the day, its date under it, Log at its end", () => {
  show();
  // The h1 names the tab first, then the day whole; the weekday alone is shown.
  const heading = screen.getByRole("heading", {
    level: 1,
    name: "Today, Friday 11\u00a0September",
  });
  expect(heading.textContent?.replace(/\s+/g, " ")).toBe("Today, Friday 11 September");
  // The date the h1 already says is shown, not read again; what is done is Done's to say.
  expect(meta()).toBe("11 September");
  const date = document.querySelector('.page-root-meta [aria-hidden="true"]')!;
  expect(date.textContent).toBe("11\u00a0September");
  expect(logLink().closest(".page-root-action")).not.toBeNull();
});

it("says what is done once, as Done's rows, never as a count in the header", () => {
  const lift = {
    id: "lift-1",
    sport: "strength" as const,
    startedAt: new Date("2026-09-11T04:18:00.000Z"),
    durationMs: 2_880_000,
    distanceMetres: null,
    environment: null,
    occurrenceId: null,
    sessionId: "lift-1",
    programDayId: DAY.id,
    dayName: DAY.name,
    title: null,
    gymName: "Anytime Fitness",
  };
  const { unmount } = show({ plan: { ...plan(), sessionStatus: "completed" }, logged: [lift] });
  // The workout done, the run still owed: the header says the date alone, and the workout is
  // a row under Done.
  expect(meta()).toBe("11 September");
  expect(
    within(screen.getByRole("region", { name: "Done" })).getByRole("link", { name: /Easy Run/ }),
  ).toBeTruthy();
  unmount();
  // Done for the day: no count, only the date.
  show({
    plan: { ...plan(), sessionStatus: "completed" },
    logged: [lift],
    programmeOccurrences: [],
  });
  expect(meta()).toBe("11 September");
});

it("stands the rest day's crescent over Nothing planned, Log a session its one filled action", () => {
  const { container } = show({ plan: null, programmeOccurrences: [] });
  const empty = within(screen.getByRole("region", { name: "Nothing planned" }));
  // A heading, not a title: the day's headline is the day.
  expect(empty.getByRole("heading", { level: 2, name: "Nothing planned" }).className).toContain(
    "type-heading",
  );
  // The crescent on its paper, decoration beside the words that say it.
  const print = container.querySelector(".today-empty-print")!;
  expect(print.getAttribute("aria-hidden")).toBe("true");
  expect(print.className).toContain("bg-paper");
  expect(empty.getByRole("link", { name: "Log a session" })).toBeTruthy();
  // Nothing owed: no count under the day, and no Log beside it.
  expect(meta()).toBe("11 September");
  expect(document.querySelector(".page-root-action")).toBeNull();
});
