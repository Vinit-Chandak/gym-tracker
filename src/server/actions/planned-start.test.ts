import { beforeEach, expect, it, vi } from "vitest";

import type { Schedule } from "@/server/repositories/schedule";

const mocks = vi.hoisted(() => ({
  withUser: vi.fn(),
  getSchedule: vi.fn(),
  getInProgressSession: vi.fn(),
  startPlannedSession: vi.fn(),
  startAdHocSession: vi.fn(),
  saveCheckIn: vi.fn(),
  completeRestSlotsBefore: vi.fn(),
  recordSlotEvent: vi.fn(),
  reopenSkippedSession: vi.fn(),
  voidPlanForSlot: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({ withUser: mocks.withUser }));
vi.mock("@/server/auth", () => ({ requireUser: async () => ({ id: "athlete" }) }));
vi.mock("@/server/queries/profile", () => ({
  ensureProfile: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/server/repositories/schedule", async (original) => ({
  ...(await original<typeof import("@/server/repositories/schedule")>()),
  getSchedule: mocks.getSchedule,
  completeRestSlotsBefore: mocks.completeRestSlotsBefore,
  recordSlotEvent: mocks.recordSlotEvent,
  reopenSkippedSession: mocks.reopenSkippedSession,
}));
vi.mock("@/server/repositories/sessions", async (original) => ({
  ...(await original<typeof import("@/server/repositories/sessions")>()),
  getInProgressSession: mocks.getInProgressSession,
  startPlannedSession: mocks.startPlannedSession,
  startAdHocSession: mocks.startAdHocSession,
  saveCheckIn: mocks.saveCheckIn,
}));
vi.mock("@/server/repositories/coach-plans", async (original) => ({
  ...(await original<typeof import("@/server/repositories/coach-plans")>()),
  voidPlanForSlot: mocks.voidPlanForSlot,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { INITIAL_FORM_STATE } from "@/server/validation/form";

import { completeRestSlotAction, startSessionAction, type StartRequest } from "./sessions";

// Start's request is checked like any input, so the ids are what the address would carry.
const GYM = "00000000-0000-4000-8000-0000000000a1";
const COMBINED = "00000000-0000-4000-8000-0000000000d1";
const REST = "00000000-0000-4000-8000-0000000000d2";
const RUN = "00000000-0000-4000-8000-0000000000d3";
const RETIRED = "00000000-0000-4000-8000-0000000000d9";

const planned = (
  programDayId: string,
  dayIndex: number,
  fromCycleIndex?: number,
): StartRequest => ({
  kind: "planned",
  gymId: GYM,
  programDayId,
  dayIndex,
  fromCycleIndex,
});

/** The check-in as the form sends it: answers, or Skip check-in. */
function form(answers: Record<string, string> | "skip" = "skip"): FormData {
  const data = new FormData();
  if (answers === "skip") data.set("intent", "skip");
  else for (const [key, value] of Object.entries(answers)) data.set(key, value);
  return data;
}

const start = (request: StartRequest, answers?: Record<string, string> | "skip") =>
  startSessionAction(request, INITIAL_FORM_STATE, form(answers));

function schedule(): Schedule {
  const days = [
    { id: COMBINED, dayIndex: 1, name: "Lift and run", includesLifting: true, includesRun: true },
    { id: REST, dayIndex: 2, name: "Rest", includesLifting: false, includesRun: false },
    { id: RUN, dayIndex: 3, name: "Run", includesLifting: false, includesRun: true },
  ].map((day) => ({
    ...day,
    dayOfWeek: day.dayIndex,
    focus: null,
    timeNote: null,
    effortNote: null,
    notes: null,
    warmupProtocolId: null,
  }));
  return {
    program: {
      id: "current-programme",
      familyId: "programme-family",
      name: "Training",
      slug: "training",
      startDate: "2026-09-01",
      endDate: null,
      weeks: 2,
      startDayIndex: 1,
      notes: null,
    },
    days,
    state: { slots: days, cycles: 2, startDayIndex: 1, events: [] },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.withUser.mockImplementation(async (_db, _user, run) => run({}));
  mocks.getSchedule.mockResolvedValue(schedule());
  mocks.getInProgressSession.mockResolvedValue(null);
  mocks.startPlannedSession.mockResolvedValue({ sessionId: "new-workout" });
  mocks.startAdHocSession.mockResolvedValue({ sessionId: "new-unplanned" });
});

it("starts the next pending lift when the previous cycle only owes its run", async () => {
  const current = schedule();
  current.state.events = [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" }];
  mocks.getSchedule.mockResolvedValue(current);

  await expect(start(planned(COMBINED, 1, 1))).rejects.toThrow("redirect:/workouts/new-workout");
  expect(mocks.startPlannedSession).toHaveBeenCalledWith({}, "athlete", {
    gymId: GYM,
    programDayId: COMBINED,
    cycleIndex: 2,
  });
});

it.each([
  ["a retired programme day", RETIRED, 1],
  ["the wrong place in the cycle", COMBINED, 2],
  ["a day with no lifting", RUN, 3],
])(
  "refreshes a stale or non-lifting selection (%s) without changing the schedule",
  async (_case, id, index) => {
    await expect(start(planned(id, index))).rejects.toThrow("redirect:/today");
    expect(mocks.startPlannedSession).not.toHaveBeenCalled();
    expect(mocks.completeRestSlotsBefore).not.toHaveBeenCalled();
  },
);

it("does not create another planned lift when all its cycles are complete", async () => {
  const current = schedule();
  current.state.events = [1, 2].map((cycleIndex) => ({
    cycleIndex,
    dayIndex: 1,
    part: "session",
    status: "completed",
  }));
  mocks.getSchedule.mockResolvedValue(current);
  await expect(start(planned(COMBINED, 1))).rejects.toThrow("redirect:/today");
  expect(mocks.startPlannedSession).not.toHaveBeenCalled();
  expect(mocks.completeRestSlotsBefore).not.toHaveBeenCalled();
});

it("still reopens the skipped lifting cycle the athlete explicitly chose", async () => {
  const current = schedule();
  current.state.events = [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "skipped" }];
  mocks.getSchedule.mockResolvedValue(current);
  await expect(start(planned(COMBINED, 1, 1))).rejects.toThrow("redirect:/workouts/new-workout");
  expect(mocks.reopenSkippedSession).toHaveBeenCalledWith({}, "athlete", "current-programme", {
    cycleIndex: 1,
    dayIndex: 1,
  });
  expect(mocks.startPlannedSession).toHaveBeenCalledWith({}, "athlete", {
    gymId: GYM,
    programDayId: COMBINED,
    cycleIndex: 1,
  });
});

it("returns the open workout even when the chosen programme has since changed", async () => {
  mocks.getInProgressSession.mockResolvedValue({ id: "open-workout" });
  await expect(start(planned(RETIRED, 1), { sleepHours: "7" })).rejects.toThrow(
    "redirect:/workouts/open-workout",
  );
  expect(mocks.startPlannedSession).not.toHaveBeenCalled();
  // The answers were for a session that was never started; the open one keeps its own.
  expect(mocks.saveCheckIn).not.toHaveBeenCalled();
});

it("starts the session with the check-in's answers, in the one transaction", async () => {
  await expect(
    start(planned(COMBINED, 1), {
      sleepHours: "6,5",
      sleepQuality: "4",
      fatigue: "",
      soreness: "2",
    }),
  ).rejects.toThrow("redirect:/workouts/new-workout");
  expect(mocks.withUser).toHaveBeenCalledTimes(1);
  expect(mocks.saveCheckIn).toHaveBeenCalledWith({}, "athlete", "new-workout", {
    sleepHours: 6.5,
    sleepQuality: 4,
    fatigue: null,
    soreness: 2,
  });
});

it("starts it with nothing answered when the check-in is skipped", async () => {
  await expect(start(planned(COMBINED, 1), "skip")).rejects.toThrow(
    "redirect:/workouts/new-workout",
  );
  expect(mocks.startPlannedSession).toHaveBeenCalled();
  expect(mocks.saveCheckIn).not.toHaveBeenCalled();
});

it("creates nothing while an answer needs correcting", async () => {
  const state = await start(planned(COMBINED, 1), { sleepHours: "30" });
  expect(state.fieldErrors?.sleepHours).toBe("Enter a value from 0 to 24.");
  expect(mocks.withUser).not.toHaveBeenCalled();
  expect(mocks.startPlannedSession).not.toHaveBeenCalled();
});

it("starts an unplanned session at the gym alone", async () => {
  await expect(start({ kind: "unplanned", gymId: GYM }, { fatigue: "3" })).rejects.toThrow(
    "redirect:/workouts/new-unplanned",
  );
  expect(mocks.startAdHocSession).toHaveBeenCalledWith({}, "athlete", { gymId: GYM });
  expect(mocks.saveCheckIn).toHaveBeenCalledWith({}, "athlete", "new-unplanned", {
    sleepHours: null,
    sleepQuality: null,
    fatigue: 3,
    soreness: null,
  });
});

it("refuses a request the address could not have made", async () => {
  await expect(
    start({ kind: "planned", gymId: "not-a-gym", programDayId: COMBINED, dayIndex: 1 }),
  ).rejects.toThrow("redirect:/today");
  expect(mocks.withUser).not.toHaveBeenCalled();
});

it("only marks actual rest days done through the rest-day action", async () => {
  for (const dayIndex of [1, 3, 99]) {
    await expect(completeRestSlotAction(dayIndex)).resolves.toEqual({
      ok: false,
      error: "That day is not a rest day.",
    });
  }
  expect(mocks.recordSlotEvent).not.toHaveBeenCalled();
  await expect(completeRestSlotAction(2)).resolves.toEqual({ ok: true });
  expect(mocks.recordSlotEvent).toHaveBeenCalledWith(
    {},
    "athlete",
    "current-programme",
    { cycleIndex: 1, dayIndex: 2 },
    "session",
    "completed",
    expect.objectContaining({ note: "Rest day done" }),
  );
});
