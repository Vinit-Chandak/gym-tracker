import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

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
  ActivityEditor: ({ occurrence }: { occurrence: { id: string } | null }) => (
    <form>Logging {occurrence?.id}</form>
  ),
}));
vi.mock("@/components/shell/session-page", () => ({
  SessionPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
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

const props = (occurrence = ID) =>
  ({
    searchParams: Promise.resolve({ occurrence }),
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
  expect(html).not.toContain("<form>");
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
  expect(html).toContain(`<form>Logging ${ID}</form>`);
  expect(mocks.closure).not.toHaveBeenCalled();
});
