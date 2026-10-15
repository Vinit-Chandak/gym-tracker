import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import type { ScheduleState } from "@/domain/schedule";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
import type { ScheduleDay, TodayPlan } from "@/server/repositories/schedule";

import ChooseDayPage from "./page";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  schedule: vi.fn(),
  occurrences: vi.fn(),
  active: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "liam@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/server/queries/active-session", () => ({ getActiveSession: mocks.active }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/gyms", () => ({
  listGyms: async () => [{ id: "g1", isActive: true, isDefault: true }],
}));
vi.mock("@/server/repositories/schedule", () => ({
  getSchedule: mocks.schedule,
  getTodayPlan: mocks.plan,
  listExercisesByDay: async () => new Map(),
}));
vi.mock("@/server/repositories/occurrences", () => ({ occurrencesForSlot: mocks.occurrences }));
// The buttons have their own tests: here, only what each is called and where it leads.
vi.mock("../plan-actions", () => ({
  StartPlannedButton: ({ label, dayName }: { label: string; dayName?: string }) => (
    <button aria-label={dayName ? `${label}: ${dayName}` : undefined}>{label}</button>
  ),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title, meta }: { title: string; meta?: string }) => (
    <header>
      <h1>{title}</h1>
      {meta}
    </header>
  ),
}));

const day = (dayIndex: number, name: string, lifts: boolean, runs: boolean): ScheduleDay => ({
  id: `day-${dayIndex}`,
  dayOfWeek: dayIndex,
  dayIndex,
  name,
  focus: null,
  includesLifting: lifts,
  includesRun: runs,
  timeNote: null,
  effortNote: null,
  notes: null,
  warmupProtocolId: null,
});

// Liam's hybrid week in the year audit, three days into cycle 13 of 16.
const DAYS = [
  day(1, "Upper", true, false),
  day(2, "Easy run", false, true),
  day(3, "Lower", true, false),
  day(4, "Tempo run", false, true),
  day(5, "Full body", true, false),
  day(6, "Long run", false, true),
  day(7, "Rest", false, false),
];

function schedule(done: number): ScheduleState {
  return {
    slots: DAYS.map((d) => ({
      dayIndex: d.dayIndex,
      name: d.name,
      includesLifting: d.includesLifting,
      includesRun: d.includesRun,
    })),
    cycles: 2,
    startDayIndex: 1,
    events: DAYS.slice(0, done).flatMap((d) => [
      ...(d.includesLifting
        ? [
            {
              cycleIndex: 1,
              dayIndex: d.dayIndex,
              part: "session" as const,
              status: "completed" as const,
            },
          ]
        : []),
      ...(d.includesRun
        ? [
            {
              cycleIndex: 1,
              dayIndex: d.dayIndex,
              part: "run" as const,
              status: "completed" as const,
            },
          ]
        : []),
      ...(!d.includesLifting && !d.includesRun
        ? [
            {
              cycleIndex: 1,
              dayIndex: d.dayIndex,
              part: "rest" as const,
              status: "completed" as const,
            },
          ]
        : []),
    ]),
  } as ScheduleState;
}

function plan(offered: number, done: number): TodayPlan {
  return {
    program: { id: "p", familyId: "family", name: "Hybrid Half Marathon", cycles: 2 },
    today: "2026-10-11",
    suggestion: {
      slot: { cycleIndex: 1, dayIndex: offered },
      restSlotsBefore: [],
      nextTrainingSlot: null,
    },
    suggestedDay: DAYS[offered - 1],
    cycleDays: DAYS.map((d) => ({
      day: d,
      cycleIndex: 1,
      status: d.dayIndex <= done ? "completed" : "pending",
    })),
  } as unknown as TodayPlan;
}

const tempo = {
  id: "tempo-13",
  sport: "running",
  loggable: true,
  resolution: { kind: "incomplete" },
} as unknown as ScheduledOccurrence;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.occurrences.mockResolvedValue([tempo]);
  mocks.active.mockResolvedValue(null);
});

it("marks the run Today offers as next, and logs it here as Today would", async () => {
  mocks.schedule.mockResolvedValue({ state: schedule(3), days: DAYS });
  mocks.plan.mockResolvedValue(plan(4, 3));
  const html = renderToStaticMarkup(await ChooseDayPage());
  // The Tempo run's row, from its name to the next day's.
  const row = html.slice(html.indexOf("Tempo run"), html.indexOf("Full body"));
  expect(row).toContain("Next");
  expect(row).toContain(`href="/training/new?occurrence=tempo-13&amp;from=today"`);
  expect(row).toContain("Log run");
  expect(mocks.occurrences).toHaveBeenCalledWith(expect.anything(), "me", {
    familyId: "family",
    cycleDayIndex: 4,
    cycleIndex: 1,
  });
  // No other day is next, and no other run is offered to log.
  expect(html.match(/>Next</g)).toHaveLength(1);
  expect(html.match(/Log run/g)).toHaveLength(2);
});

it("names the day a start begins the next cycle with", async () => {
  // Every day of the cycle trained but its rest day: Upper begins cycle 2.
  mocks.schedule.mockResolvedValue({ state: schedule(6), days: DAYS });
  mocks.plan.mockResolvedValue(plan(7, 6));
  mocks.occurrences.mockResolvedValue([]);
  const html = renderToStaticMarkup(await ChooseDayPage());
  expect(html).toContain(">Start cycle 2 with Upper<");
  expect(html).not.toContain("Start next cycle");
  // Said once: the label names the day, so the button's name does not repeat it.
  expect(html).not.toContain("Start cycle 2 with Upper: Upper");
});

it("says which workout is in progress: its day's, else the routine's it was started from", async () => {
  mocks.schedule.mockResolvedValue({ state: schedule(3), days: DAYS });
  mocks.plan.mockResolvedValue(plan(4, 3));
  const open = { id: "s1", programDayId: null, dayName: null, title: null };
  mocks.active.mockResolvedValue({ ...open, title: "Hotel gym push, with the band finisher" });
  expect(renderToStaticMarkup(await ChooseDayPage())).toContain(
    "Hotel gym push, with the band finisher is in progress.",
  );
  mocks.active.mockResolvedValue({ ...open, programDayId: "day-3", dayName: "Lower" });
  expect(renderToStaticMarkup(await ChooseDayPage())).toContain("Lower is in progress.");
  mocks.active.mockResolvedValue(open);
  expect(renderToStaticMarkup(await ChooseDayPage())).toContain("A workout is in progress.");
});
