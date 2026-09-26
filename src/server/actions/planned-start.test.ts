import { beforeEach, expect, it, vi } from "vitest";

import type { Schedule } from "@/server/repositories/schedule";

const mocks = vi.hoisted(() => ({
  withUser: vi.fn(),
  getSchedule: vi.fn(),
  getInProgressSession: vi.fn(),
  startPlannedSession: vi.fn(),
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

import { completeRestSlotAction, startPlannedSessionAction } from "./sessions";

function schedule(): Schedule {
  const days = [
    { id: "combined", dayIndex: 1, name: "Lift and run", includesLifting: true, includesRun: true },
    { id: "rest", dayIndex: 2, name: "Rest", includesLifting: false, includesRun: false },
    { id: "run", dayIndex: 3, name: "Run", includesLifting: false, includesRun: true },
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
});

it("starts the next pending lift when the previous cycle only owes its run", async () => {
  const current = schedule();
  current.state.events = [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" }];
  mocks.getSchedule.mockResolvedValue(current);

  await expect(startPlannedSessionAction("gym", "combined", 1, 1)).rejects.toThrow(
    "redirect:/workouts/new-workout/check-in",
  );
  expect(mocks.startPlannedSession).toHaveBeenCalledWith({}, "athlete", {
    gymId: "gym",
    programDayId: "combined",
    cycleIndex: 2,
  });
});

it.each([
  ["retired-programme-day", 1],
  ["combined", 2],
  ["run", 3],
])(
  "refreshes a stale or non-lifting selection %s without changing the schedule",
  async (id, index) => {
    await expect(startPlannedSessionAction("gym", id, index)).rejects.toThrow("redirect:/today");
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
  await expect(startPlannedSessionAction("gym", "combined", 1)).rejects.toThrow("redirect:/today");
  expect(mocks.startPlannedSession).not.toHaveBeenCalled();
  expect(mocks.completeRestSlotsBefore).not.toHaveBeenCalled();
});

it("still reopens the skipped lifting cycle the athlete explicitly chose", async () => {
  const current = schedule();
  current.state.events = [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "skipped" }];
  mocks.getSchedule.mockResolvedValue(current);
  await expect(startPlannedSessionAction("gym", "combined", 1, 1)).rejects.toThrow(
    "redirect:/workouts/new-workout/check-in",
  );
  expect(mocks.reopenSkippedSession).toHaveBeenCalledWith({}, "athlete", "current-programme", {
    cycleIndex: 1,
    dayIndex: 1,
  });
  expect(mocks.startPlannedSession).toHaveBeenCalledWith({}, "athlete", {
    gymId: "gym",
    programDayId: "combined",
    cycleIndex: 1,
  });
});

it("returns the open workout even when the chosen programme has since changed", async () => {
  mocks.getInProgressSession.mockResolvedValue({ id: "open-workout" });
  await expect(startPlannedSessionAction("gym", "old-day", 1)).rejects.toThrow(
    "redirect:/workouts/open-workout/check-in",
  );
  expect(mocks.startPlannedSession).not.toHaveBeenCalled();
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
