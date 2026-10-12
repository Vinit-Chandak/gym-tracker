import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";

import OccurrencePage from "./page";

const mocks = vi.hoisted(() => ({
  occurrence: vi.fn(),
  named: vi.fn(),
  closure: vi.fn(),
  focus: null as string | null,
  events: [] as unknown[],
}));

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
vi.mock("@/server/repositories/occurrences", () => ({
  getOccurrence: mocks.occurrence,
  namedOccurrence: mocks.named,
  programmeClosure: mocks.closure,
}));
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
      events: mocks.events,
    },
  }),
}));
vi.mock("@/components/activities/occurrence-actions", () => ({
  OccurrenceActions: ({ putBackGoesNext }: { putBackGoesNext?: boolean }) => (
    <p>{putBackGoesNext ? "Put back, Today offers it next." : "Skip, put back or move."}</p>
  ),
}));
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
  closed: false,
  loggable: false,
} as ProgrammeOccurrence;

/** The session's distance as its line says it, held at its dash. */
const DISTANCE = "4.2\u2060–\u20605.0\u00a0km";

const props = {
  params: Promise.resolve({ occurrenceId: tempo.id }),
} as unknown as PageProps<"/training/programme/occurrences/[occurrenceId]">;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  mocks.occurrence.mockResolvedValue(tempo);
  mocks.named.mockResolvedValue(null);
  mocks.closure.mockResolvedValue(null);
  mocks.closure.mockClear();
  mocks.focus = null;
  mocks.events = [];
});
afterEach(() => {
  vi.useRealTimers();
});

it("is named for its day, and keeps a line of its plan once it is logged", async () => {
  const html = renderToStaticMarkup(await OccurrencePage(props));
  expect(html).toContain("<h1>Tempo run</h1>");
  expect(html).toContain("Running ·\u00a0Cycle 5 ·\u00a0planned for Thu\u00a023\u00a0Jul");
  // What was asked for stays beside what was done: how far, how long, how hard, and how, each
  // range held at its dash.
  expect(html).toContain(
    `${DISTANCE} ·\u00a026\u2060–\u206031\u00a0min ·\u00a0Effort 3\u2060–\u20604 of\u00a05`,
  );
  expect(html).toContain("10K effort");
  // Said once: the card is not also headed by the distance the line under it starts with.
  expect(html.split(DISTANCE)).toHaveLength(2);
  // A date of this year is said without its year.
  expect(html).toContain("Logged on Thu\u00a06\u00a0Aug.");
  expect(html).not.toContain("2026");
});

it("is headed by what its day is for, and the target is said once", async () => {
  mocks.focus = "Threshold";
  const logged = renderToStaticMarkup(await OccurrencePage(props));
  expect(logged).toMatch(/<h2[^>]*>Threshold<\/h2>/);
  expect(logged.split(DISTANCE)).toHaveLength(2);
  // Still to do, the plan's own card says the target; the card over it says what it is for.
  mocks.occurrence.mockResolvedValue({
    ...tempo,
    resolution: { kind: "incomplete" },
    loggable: true,
  });
  const pending = renderToStaticMarkup(await OccurrencePage(props));
  expect(pending).toMatch(/<h2[^>]*>Threshold<\/h2>/);
  expect(pending.split(DISTANCE)).toHaveLength(2);
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

/**
 * Review, 12 October 2026: "Put it back" on a run the sequence went past sends the programme
 * back to it, and nothing said so until after the tap. The page tells its actions when it does.
 */
it("says before the tap that a run put back is Today's next, once the sequence passed it", async () => {
  const skipped = {
    ...tempo,
    disposition: "skipped",
    resolution: { kind: "skipped" },
    loggable: true,
  };
  mocks.occurrence.mockResolvedValue(skipped);
  const run = (cycleIndex: number, status: "completed" | "skipped") => ({
    cycleIndex,
    dayIndex: 4,
    part: "run",
    status,
  });
  // Cycles 1 to 4 run, cycle 5's tempo run skipped: the sequence is at cycle 6.
  mocks.events = [1, 2, 3, 4].map((cycle) => run(cycle, "completed")).concat(run(5, "skipped"));
  expect(renderToStaticMarkup(await OccurrencePage(props))).toContain(
    "Put back, Today offers it next.",
  );
  // Skipped ahead of where the sequence is, it is simply to come again.
  mocks.events = [1, 2, 3].map((cycle) => run(cycle, "completed"));
  expect(renderToStaticMarkup(await OccurrencePage(props))).not.toContain("Today offers it next");
});

/** Wrapped under the headline at large text, the badge starts the line, as the plan card's does. */
it("leaves a badge wrapped under its headline at the line's start", async () => {
  mocks.focus = "Threshold";
  mocks.occurrence.mockResolvedValue({
    ...tempo,
    disposition: "skipped",
    resolution: { kind: "skipped" },
    loggable: true,
  });
  const html = renderToStaticMarkup(await OccurrencePage(props));
  expect(html).toMatch(/<h2[^>]*>Threshold<\/h2><span><span[^>]*>Skipped<\/span><\/span>/);
  expect(html).not.toContain("ml-auto");
});

/**
 * ADR 0054: a session of a programme the athlete has moved on from reads as it did when that
 * programme ended — Liam's old block's run, left owed, opened by its URL in October — and says
 * how the programme ended where Log it, Skip and Move would be.
 */
it("reads a replaced programme's session as it was, and offers nothing to do about it", async () => {
  const owed = {
    ...tempo,
    familyId: "old-block",
    scheduledOn: "2026-06-27",
    originalScheduledOn: "2026-06-27",
    resolution: { kind: "incomplete" },
    closed: true,
    loggable: false,
  };
  mocks.occurrence.mockResolvedValue(owed);
  // Its day as its own block named it: the running programme has no such day.
  mocks.named.mockResolvedValue({ dayName: "Easy run", dayFocus: "Zone 2" });
  mocks.closure.mockResolvedValue({
    name: "Strength Maintenance + 2 Runs",
    closedOn: "2026-07-06",
    followedBy: "Hybrid Half Marathon",
  });
  const html = renderToStaticMarkup(await OccurrencePage(props));
  // Named for its day and headed by its focus, so its target is said once, on the plan.
  expect(html).toContain("<h1>Easy run</h1>");
  expect(html).toMatch(/<h2[^>]*>Zone 2<\/h2>/);
  expect(html.split(DISTANCE)).toHaveLength(2);
  // Not done, as it was when the block ended: it is not offered as still to do.
  expect(html).toContain(">Not done<");
  expect(html).not.toContain("still to do");
  // How the programme ended, which is not said to be a replacement: the one before may have
  // finished weeks before the next began.
  expect(html).toContain(
    "Strength Maintenance + 2 Runs made way for Hybrid Half Marathon on Mon\u00a06\u00a0Jul, so this session can no longer be logged.",
  );
  expect(html).not.toContain("replaced");
  expect(html).not.toContain("Log it");
  expect(html).not.toContain("Skip, put back or move.");
  // Its plan is still there to read, no longer called the athlete's programme.
  expect(html).toContain(DISTANCE);
  expect(html).not.toContain("Your programme");

  // Skipped, it stays skipped, and cannot be put back.
  mocks.occurrence.mockResolvedValue({
    ...owed,
    disposition: "skipped",
    resolution: { kind: "skipped" },
  });
  const skipped = renderToStaticMarkup(await OccurrencePage(props));
  expect(skipped).toContain(">Skipped<");
  expect(skipped).not.toContain("Skip, put back or move.");
  expect(skipped).toContain("so this session can no longer be logged.");

  // Archived with nothing in its place; a block followed by a new one of the same programme.
  mocks.closure.mockResolvedValue({
    name: "Hybrid Half Marathon",
    closedOn: "2026-07-06",
    followedBy: null,
  });
  expect(renderToStaticMarkup(await OccurrencePage(props))).toContain(
    "Hybrid Half Marathon was archived on Mon\u00a06\u00a0Jul, so this session can no longer be logged.",
  );
  mocks.closure.mockResolvedValue({
    name: "Hybrid Half Marathon",
    closedOn: "2025-12-01",
    followedBy: "Hybrid Half Marathon",
  });
  expect(renderToStaticMarkup(await OccurrencePage(props))).toContain(
    "This block of Hybrid Half Marathon made way for a new one on Mon\u00a01\u00a0Dec\u00a02025, so this session can no longer be logged.",
  );
});

/** Logged before its programme ended, it says what was logged, and nothing reads how it ended. */
it("reads a replaced programme's logged session by what was logged", async () => {
  mocks.occurrence.mockResolvedValue({ ...tempo, familyId: "old-block", closed: true });
  mocks.named.mockResolvedValue({ dayName: "Tempo run", dayFocus: null });
  const html = renderToStaticMarkup(await OccurrencePage(props));
  expect(html).toContain("<h1>Tempo run</h1>");
  expect(html).toContain("See what you logged");
  expect(html).not.toContain("can no longer be logged");
  expect(mocks.closure).not.toHaveBeenCalled();
});

it("offers the running programme's session its actions", async () => {
  mocks.occurrence.mockResolvedValue({
    ...tempo,
    resolution: { kind: "incomplete" },
    loggable: true,
  });
  const html = renderToStaticMarkup(await OccurrencePage(props));
  expect(html).toContain("Log it");
  expect(html).toContain("Skip, put back or move.");
  expect(html).toContain("Your programme");
  expect(html).not.toContain("can no longer be logged");
  expect(mocks.closure).not.toHaveBeenCalled();
});
