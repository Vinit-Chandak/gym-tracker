import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { AD_HOC_ORIGIN, plannedOrigin, reportedEffort } from "@/domain/activity";
import type { ActivityRecord } from "@/server/repositories/activities";
import type { NamedOccurrence } from "@/server/repositories/occurrences";

import ActivityPage from "./page";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  named: vi.fn(),
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
vi.mock("@/server/repositories/activities", () => ({ getActivity: mocks.activity }));
vi.mock("@/server/repositories/occurrences", () => ({ namedOccurrence: mocks.named }));
vi.mock("@/server/repositories/sport-preferences", () => ({
  unitsFor: async () => ({ distanceUnit: "km", poolUnit: "m" }),
}));
// What More would offer, as the question its delete asks will put it.
vi.mock("./activity-more", () => ({
  ActivityMore: ({ answered }: { answered: string | null }) => <p>On delete: {`${answered}`}</p>,
}));
vi.mock("@/components/shell/back-link", () => ({ BackLink: () => null }));
vi.mock("@/components/art/art", () => ({ Art: () => null }));
vi.mock("@/components/ui/fit-title", () => ({
  FitTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const OCCURRENCE = "7550772c-0000-4000-8000-000000000001";

// Liam's run of 14 February, which answered a session of a block he has since moved on from.
const run: ActivityRecord = {
  id: "fc0aa2bc-9610-4174-86a3-58d01aaef9a2",
  sport: "running",
  startedAt: new Date("2026-02-14T07:00:00Z"),
  occurredOn: "2026-02-14",
  recordedTimeZone: "UTC",
  timeZoneSource: "profile_at_entry",
  durationMs: null,
  effort: reportedEffort(3),
  outcome: "logged",
  title: null,
  notes: null,
  origin: plannedOrigin(OCCURRENCE, "revision"),
  revision: 1,
  actual: null,
};

const session: NamedOccurrence = {
  id: OCCURRENCE,
  sport: "running",
  scheduledOn: "2026-02-14",
  familyId: "266e74e2-0000-4000-8000-000000000001",
  cycleIndex: 6,
  dayName: "Easy run",
  dayFocus: "Zone 2",
  closed: false,
};

const props = {
  params: Promise.resolve({ activityId: run.id }),
  searchParams: Promise.resolve({}),
} as unknown as PageProps<"/training/activities/[activityId]">;

beforeEach(() => {
  mocks.activity.mockResolvedValue(run);
  mocks.named.mockResolvedValue(session);
});

it("gives a running programme's session back to be logged when its activity is deleted", async () => {
  expect(renderToStaticMarkup(await ActivityPage(props))).toContain("On delete: reopens");
});

/**
 * ADR 0054: the session's programme has ended, so deleting the run leaves it unlogged for good.
 * The question before the delete must not promise it back (review of 12 October).
 */
it("does not offer a closed programme's session back when its activity is deleted", async () => {
  mocks.named.mockResolvedValue({ ...session, closed: true });
  expect(renderToStaticMarkup(await ActivityPage(props))).toContain("On delete: closed");
});

it("speaks of no session when the activity answered none", async () => {
  mocks.activity.mockResolvedValue({ ...run, origin: AD_HOC_ORIGIN });
  expect(renderToStaticMarkup(await ActivityPage(props))).toContain("On delete: null");
});
