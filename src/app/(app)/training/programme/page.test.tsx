import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { OccurrenceResolution } from "@/domain/occurrences";
import type { ScheduleState } from "@/domain/schedule";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";

import ProgrammePage from "./page";

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), occurrences: vi.fn() }));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "liam@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/schedule", () => ({ getSchedule: mocks.schedule }));
vi.mock("@/server/repositories/occurrences", () => ({
  programmeOccurrences: mocks.occurrences,
}));
vi.mock("@/server/repositories/sport-preferences", () => ({ unitsBySport: async () => ({}) }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const DAYS = [
  { id: "d1", dayIndex: 1, name: "Upper", includesLifting: true, includesRun: false },
  { id: "d2", dayIndex: 2, name: "Tempo run", includesLifting: false, includesRun: true },
];

const state = (cycles: number): ScheduleState => ({
  slots: DAYS,
  cycles,
  startDayIndex: 1,
  events: [{ cycleIndex: 1, dayIndex: 1, part: "session", status: "completed" }],
});

function run(cycleIndex: number, scheduledOn: string, resolution?: OccurrenceResolution) {
  return {
    id: `tempo-${cycleIndex}`,
    sport: "running",
    disposition: "pending",
    scheduledOn,
    scheduledLocalTime: null,
    orderIndex: 0,
    revisionId: `r${cycleIndex}`,
    prescription: null,
    familyId: "family",
    originalWeekIndex: cycleIndex,
    originalScheduledOn: scheduledOn,
    cycleIndex,
    cycleDayIndex: 2,
    resolution: resolution ?? { kind: "incomplete" },
    loggable: !resolution,
  } as ProgrammeOccurrence;
}

const props = () => ({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("titles its lists by what they hold, and says a run's date is where it was planned", async () => {
  // Liam, 11 October: the Tempo run Today offers was planned for 1 October, ten days gone.
  mocks.schedule.mockResolvedValue({
    program: { familyId: "family", name: "Hybrid Half Marathon" },
    days: DAYS,
    state: state(3),
  });
  mocks.occurrences.mockResolvedValue([
    run(1, "2026-09-24", {
      kind: "logged",
      activityId: "a1",
      outcome: "logged",
      occurredOn: "2026-09-26",
    }),
    run(2, "2026-10-01"),
    run(3, "2026-10-08"),
  ]);
  const html = renderToStaticMarkup(
    await ProgrammePage(props() as unknown as PageProps<"/training/programme">),
  );
  // The adherence counts lifting too; the lists hold runs, and say so.
  expect(html).toContain("Lifting");
  expect(html).toContain(">Runs to come<");
  expect(html).toContain(">Earlier runs<");
  expect(html).not.toContain(">To come<");
  // Every row says its cycle and its planned date the same way, on a line of their own.
  expect(html).toContain("Cycle 2 ·\u00a0planned for Thu\u00a01\u00a0Oct");
  expect(html).toContain("Cycle 3 ·\u00a0planned for Thu\u00a08\u00a0Oct");
  expect(html).toContain("Cycle 1 ·\u00a0planned for Thu\u00a024\u00a0Sept");
  expect(html).toContain("logged Sat\u00a026\u00a0Sept");
});

it("leads a lifter to the lifting days its page does not list", async () => {
  mocks.schedule.mockResolvedValue({
    program: { familyId: "family", name: "Upper / Lower Strength" },
    days: [DAYS[0]],
    state: { ...state(2), slots: [DAYS[0]!] },
  });
  mocks.occurrences.mockResolvedValue([]);
  const html = renderToStaticMarkup(
    await ProgrammePage(props() as unknown as PageProps<"/training/programme">),
  );
  expect(html).toContain("Its lifting days are on Training, a cycle at a time.");
  expect(html).toContain('href="/training"');
  expect(html).toContain("See its days on Training");
});
