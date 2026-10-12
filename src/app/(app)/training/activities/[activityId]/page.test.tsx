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
  readSportUnits: async () => ({ distanceUnit: "km", poolUnit: "m" }),
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

// Sofia's indoor ride of 27 September: 40:51 on the trainer, and no distance (AT-LOG-03).
const ride: ActivityRecord = {
  ...run,
  id: "f03911f7-7277-4d93-985d-5ae9083e4387",
  sport: "cycling",
  durationMs: 2_451_000,
  origin: AD_HOC_ORIGIN,
  actual: {
    sport: "cycling",
    environment: "indoor",
    durationMs: 2_451_000,
    distance: null,
    assistance: "unassisted",
    resourceId: null,
    averagePowerWatts: null,
    averageCadenceRpm: null,
    averageHeartRate: null,
    maxHeartRate: null,
    elevationGainMetres: null,
  },
};

/** Each stat's name, in the order the page reads them two by two. */
function statNames(html: string): string[] {
  return [...html.matchAll(/<dt class="activity-stat-label">([^<]*)<\/dt>/g)].map(
    ([, name]) => name!,
  );
}

/**
 * Year audit, October 2026: a ride with no distance read "Speed —" beside "Distance —". Its speed
 * is its distance over its time, so it has none; that its distance is not known is said once.
 */
it("shows no speed for a ride with no distance, and says the distance is not known", async () => {
  mocks.activity.mockResolvedValue(ride);
  const html = renderToStaticMarkup(await ActivityPage(props));
  expect(statNames(html)).toEqual(["Distance", "Time", "Effort"]);
  expect(html).toContain('<span class="type-heading">—</span>');
  expect(html).toContain("40:51");
});

it("shows a ride's speed when its distance is known", async () => {
  mocks.activity.mockResolvedValue({
    ...ride,
    actual: { ...ride.actual!, distance: { value: 20, unit: "km", metres: 20_000 } },
  });
  const html = renderToStaticMarkup(await ActivityPage(props));
  expect(statNames(html)).toEqual(["Distance", "Time", "Speed", "Effort"]);
  expect(html).toContain("29.4");
});
