import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";

import OccurrencePage from "./page";

const mocks = vi.hoisted(() => ({ occurrence: vi.fn(), focus: null as string | null }));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "meera@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/occurrences", () => ({ getOccurrence: mocks.occurrence }));
vi.mock("@/server/repositories/coach-plans", () => ({
  activePlanForOccurrence: async () => null,
}));
vi.mock("@/server/repositories/sport-preferences", () => ({
  unitsFor: async () => ({ distanceUnit: "km", poolUnit: "m" }),
}));
vi.mock("@/server/repositories/schedule", () => ({
  getSchedule: async () => ({
    program: { familyId: "family" },
    days: [{ dayIndex: 4, name: "Tempo run", focus: mocks.focus }],
    state: {
      slots: [{ dayIndex: 4, name: "Tempo run", includesLifting: false, includesRun: true }],
      cycles: 10,
      startDayIndex: 4,
      events: [],
    },
  }),
}));
vi.mock("@/components/activities/occurrence-actions", () => ({ OccurrenceActions: () => null }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title, meta }: { title: string; meta?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{meta}</p>
    </header>
  ),
}));

// Meera's tempo run of cycle 5, planned for Thu 23 July and logged a fortnight later.
const tempo = {
  id: "00000000-0000-4000-8000-000000000048",
  sport: "running",
  disposition: "pending",
  scheduledOn: "2026-07-23",
  scheduledLocalTime: null,
  orderIndex: 0,
  revisionId: "revision",
  prescription: endurancePrescriptionSchema.parse({
    prescriptionVersion: PRESCRIPTION_VERSION,
    sport: "running",
    sessionTargets: {
      distanceMetres: [4200, 5000],
      durationMs: [26 * 60_000, 31 * 60_000],
      effort: [3, 4],
    },
    running: { paceNote: "10K effort" },
  }),
  familyId: "family",
  originalWeekIndex: 5,
  originalScheduledOn: "2026-07-23",
  cycleIndex: 5,
  cycleDayIndex: 4,
  resolution: { kind: "logged", activityId: "a1", outcome: "logged", occurredOn: "2026-08-06" },
  loggable: false,
} as ProgrammeOccurrence;

const props = {
  params: Promise.resolve({ occurrenceId: tempo.id }),
} as unknown as PageProps<"/training/programme/occurrences/[occurrenceId]">;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  mocks.occurrence.mockResolvedValue(tempo);
  mocks.focus = null;
});
afterEach(() => {
  vi.useRealTimers();
});

it("is named for its day, and keeps a line of its plan once it is logged", async () => {
  const html = renderToStaticMarkup(await OccurrencePage(props));
  expect(html).toContain("<h1>Tempo run</h1>");
  expect(html).toContain("Running ·\u00a0Cycle 5 ·\u00a0planned for Thu\u00a023\u00a0Jul");
  // What was asked for stays beside what was done: how far, how long, how hard, and how.
  expect(html).toContain(
    "4.2–5.0\u00a0km ·\u00a026–31\u00a0min ·\u00a0Effort 3\u2060–\u20604 of\u00a05",
  );
  expect(html).toContain("10K effort");
  // Said once: the card is not also headed by the distance the line under it starts with.
  expect(html.split("4.2–5.0\u00a0km")).toHaveLength(2);
  // A date of this year is said without its year.
  expect(html).toContain("Logged on Thu\u00a06\u00a0Aug.");
  expect(html).not.toContain("2026");
});

it("is headed by what its day is for, and the target is said once", async () => {
  mocks.focus = "Threshold";
  const logged = renderToStaticMarkup(await OccurrencePage(props));
  expect(logged).toMatch(/<h2[^>]*>Threshold<\/h2>/);
  expect(logged.split("4.2–5.0\u00a0km")).toHaveLength(2);
  // Still to do, the plan's own card says the target; the card over it says what it is for.
  mocks.occurrence.mockResolvedValue({
    ...tempo,
    resolution: { kind: "incomplete" },
    loggable: true,
  });
  const pending = renderToStaticMarkup(await OccurrencePage(props));
  expect(pending).toMatch(/<h2[^>]*>Threshold<\/h2>/);
  expect(pending.split("4.2–5.0\u00a0km")).toHaveLength(2);
});

/**
 * Skipped from Today or on this page, a run is skipped on the session itself (owner, 12 October
 * 2026), and its page says so as the programme's list does.
 */
it("says a skipped run is skipped, whichever way it was skipped", async () => {
  mocks.occurrence.mockResolvedValue({
    ...tempo,
    disposition: "skipped",
    resolution: { kind: "skipped" },
    loggable: true,
  });
  const html = renderToStaticMarkup(await OccurrencePage(props));
  expect(html).toContain(">Skipped<");
  expect(html).not.toContain(">Not done<");
});
