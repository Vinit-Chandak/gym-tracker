import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

import NewActivityPage from "./page";

const mocks = vi.hoisted(() => ({
  occurrence: vi.fn(),
  closure: vi.fn(),
}));

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
vi.mock("@/server/repositories/occurrences", () => ({
  getOccurrence: mocks.occurrence,
  programmeClosure: mocks.closure,
}));
vi.mock("@/server/repositories/coach-plans", () => ({
  withPreparedTargets: async (_tx: unknown, _id: string, found: unknown[]) => found,
}));
vi.mock("@/server/repositories/sport-preferences", () => ({
  readSportUnits: async () => ({ distanceUnit: "km", poolUnit: "m" }),
}));
vi.mock("@/server/actions/activities", () => ({ saveActivityAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// The form itself is the editor's to test: here it is only whether the page opens it.
vi.mock("@/components/activities/activity-editor", () => ({
  ActivityEditor: ({
    occurrence,
    origin,
    target,
  }: {
    occurrence: { id: string } | null;
    origin?: string | null;
    target?: { lines: string[] } | null;
  }) => (
    <form data-origin={origin ?? ""}>
      Logging {occurrence?.id}
      {target?.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </form>
  ),
}));
// Zones of a 190 maximum, as shares of it.
vi.mock("@/server/repositories/heart-rate", () => ({
  readHeartRate: async () => ({
    resolved: {
      zones: [
        { zone: 1, name: "Recovery", low: 95, high: 113 },
        { zone: 2, name: "Easy", low: 114, high: 132 },
        { zone: 3, name: "Aerobic", low: 133, high: 151 },
        { zone: 4, name: "Threshold", low: 152, high: 170 },
        { zone: 5, name: "Maximum", low: 171, high: 190 },
      ],
    },
  }),
}));
vi.mock("@/components/shell/session-page", () => ({
  SessionPage: ({
    title,
    back,
    children,
  }: {
    title: string;
    back?: { href: string };
    children: ReactNode;
  }) => (
    <main data-back={back?.href ?? ""}>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const ID = "30d14b71-0000-4000-8000-000000000001";

/** The markup as read: no-break spaces as spaces, word joiners gone. */
const plain = (html: string) => html.replace(/\u00a0|&nbsp;/g, " ").replace(/\u2060/g, "");

// Liam's run of Sat 27 June, owed when Strength Maintenance + 2 Runs made way for the next block.
const owed = {
  id: ID,
  sport: "running",
  disposition: "pending",
  scheduledOn: "2026-06-27",
  scheduledLocalTime: null,
  orderIndex: 0,
  revisionId: "revision",
  prescription: null,
  familyId: "old-block",
  originalWeekIndex: 3,
  originalScheduledOn: "2026-06-27",
  resolution: { kind: "incomplete" },
  closed: true,
  loggable: false,
} as ScheduledOccurrence;

const props = (occurrence = ID, from?: string) =>
  ({
    searchParams: Promise.resolve(from ? { occurrence, from } : { occurrence }),
  }) as unknown as PageProps<"/training/new">;

beforeEach(() => {
  mocks.occurrence.mockReset();
  mocks.closure.mockReset();
  mocks.occurrence.mockResolvedValue(owed);
  mocks.closure.mockResolvedValue({
    name: "Strength Maintenance + 2 Runs",
    closedOn: "2026-07-06",
    followedBy: "Hybrid Half Marathon",
  });
});

/**
 * ADR 0054: a session of a programme the athlete has moved on from is refused by its URL, with
 * how its programme ended and the sport on its own, never with the form.
 */
it("refuses a closed programme's session, says how its programme ended, and offers the run", async () => {
  const html = renderToStaticMarkup(await NewActivityPage(props()));
  expect(html).not.toContain("<form");
  expect(html).toContain("Its programme has ended");
  expect(html).toContain(
    "Strength Maintenance + 2 Runs made way for Hybrid Half Marathon on Mon 6 Jul 2026, so the run scheduled for Sat 27 Jun 2026 can no longer be logged. You can still log a run on its own.",
  );
  expect(html).toContain('<a href="/training/new?sport=running">Log a run anyway</a>');
  expect(mocks.closure).toHaveBeenCalledWith({}, "me", "old-block", "UTC");
});

/** Logged before its programme ended, it is refused for being logged: its programme is not read. */
it("refuses a closed programme's logged session as logged, without reading how it ended", async () => {
  mocks.occurrence.mockResolvedValue({
    ...owed,
    resolution: { kind: "logged", activityId: "a1", outcome: "logged", occurredOn: "2026-06-27" },
  });
  const html = renderToStaticMarkup(await NewActivityPage(props()));
  expect(html).toContain("You have already logged this");
  expect(html).not.toContain("can no longer be logged");
  expect(mocks.closure).not.toHaveBeenCalled();
});

it("opens the form for a session of the athlete's programme", async () => {
  mocks.occurrence.mockResolvedValue({
    ...owed,
    familyId: "family",
    closed: false,
    loggable: true,
  });
  const html = renderToStaticMarkup(await NewActivityPage(props()));
  expect(html).toContain(`>Logging ${ID}</form>`);
  expect(mocks.closure).not.toHaveBeenCalled();
});

/** ADR 0059: a planned run's steps are in view while it is logged, its zones in the athlete's beats. */
it("shows a planned run's steps, a line each, with its zones in beats", async () => {
  mocks.occurrence.mockResolvedValue({
    ...owed,
    familyId: "family",
    closed: false,
    loggable: true,
    prescription: endurancePrescriptionSchema.parse({
      prescriptionVersion: 1,
      sport: "running",
      nodes: [
        {
          kind: "step",
          id: "warm",
          phase: "warmup",
          action: "run",
          target: { kind: "distance", metres: [2000, 2000] },
          heartRateZones: [1, 2],
        },
        {
          kind: "repeat",
          id: "reps",
          repetitions: 6,
          steps: [
            {
              kind: "step",
              id: "rep",
              phase: "work",
              action: "run",
              target: { kind: "distance", metres: [800, 800], unit: "m" },
              heartRateZones: [4, 4],
            },
          ],
        },
      ],
    }),
  });
  const html = plain(renderToStaticMarkup(await NewActivityPage(props())));
  expect(html).toContain("<p>Warm-up: Run 2 km · Zones 1–2 (95–132 bpm)</p>");
  expect(html).toContain("<p>6 × Run 800 m · Zone 4 (152–170 bpm)</p>");
});

/**
 * NAV-03: what it saves opens under the tab it was opened from and goes back to it, as this page
 * does: Today's unless a link says otherwise, logging being Today's (ADR 0058).
 */
it("names where it was opened from to the activity it saves", async () => {
  mocks.occurrence.mockResolvedValue({
    ...owed,
    familyId: "family",
    closed: false,
    loggable: true,
  });
  const fromToday = renderToStaticMarkup(await NewActivityPage(props(ID, "today")));
  expect(fromToday).toContain('data-back="/today"');
  expect(fromToday).toContain('data-origin="today"');
  const unnamed = renderToStaticMarkup(await NewActivityPage(props()));
  expect(unnamed).toContain('data-back="/today"');
  expect(unnamed).toContain('data-origin="today"');
  // A link from while Plan was Training still means Plan.
  const fromTraining = renderToStaticMarkup(await NewActivityPage(props(ID, "training")));
  expect(fromTraining).toContain('data-back="/plan"');
  expect(fromTraining).toContain('data-origin="plan"');
  // Only an origin it knows: anything else is Today's.
  const unknown = renderToStaticMarkup(await NewActivityPage(props(ID, "https://example.test")));
  expect(unknown).toContain('data-origin="today"');
});
