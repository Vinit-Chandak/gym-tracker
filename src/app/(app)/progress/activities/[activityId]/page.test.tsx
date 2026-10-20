import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { AD_HOC_ORIGIN, plannedOrigin, reportedEffort } from "@/domain/activity";
import type { ActivityRecord } from "@/server/repositories/activities";
import type { NamedOccurrence } from "@/server/repositories/occurrences";

import ActivityPage, { generateMetadata } from "./page";

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
// Where Back goes when there is no page before it, as the page gives it.
vi.mock("@/components/shell/back-link", () => ({
  BackLink: ({ fallback }: { fallback: string }) => <a data-back={fallback} />,
}));
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
} as unknown as PageProps<"/progress/activities/[activityId]">;

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

/**
 * Year audit, October 2026: a ride opened by a link of its own lit Training while its Back said
 * History. With no page before it, Back goes to the tab its link names, History with none, which
 * is the tab lit (NAV-03).
 */
it("goes back to the tab its link names, and to History when it names none", async () => {
  const opened = (search: Record<string, string>) =>
    ({ ...props, searchParams: Promise.resolve(search) }) as typeof props;
  expect(renderToStaticMarkup(await ActivityPage(opened({ from: "today" })))).toContain(
    'data-back="/today"',
  );
  expect(renderToStaticMarkup(await ActivityPage(opened({})))).toContain(
    'data-back="/progress/history"',
  );
});

/**
 * What it counts as is one row (Information map: its page › Counts as): the session it answered
 * and the day it was planned for, or Unplanned, opening Counts as. A session whose programme has
 * ended keeps its answer (ADR 0054), so its row opens that session's page instead.
 */
it("says what it counts as in one row, opening Counts as or its ended session", async () => {
  const countsAs = (html: string) =>
    /<a href="([^"]+)">(?:(?!<\/a>).)*Counts as(?:(?!<\/a>).)*?<span class="nav-row-value">([^<]*)</.exec(
      html,
    );
  const planned = countsAs(renderToStaticMarkup(await ActivityPage(props)));
  expect(planned?.[1]).toBe(`/progress/activities/${run.id}/counts-as`);
  expect(planned?.[2]).toMatch(/^Easy run ·\u00a0Sat\u00a014\u00a0Feb/);

  mocks.named.mockResolvedValue({ ...session, closed: true });
  expect(countsAs(renderToStaticMarkup(await ActivityPage(props)))?.[1]).toBe(
    `/plan/sessions/${OCCURRENCE}`,
  );

  mocks.activity.mockResolvedValue({ ...run, origin: AD_HOC_ORIGIN });
  const unplanned = countsAs(renderToStaticMarkup(await ActivityPage(props)));
  expect(unplanned?.[1]).toBe(`/progress/activities/${run.id}/counts-as`);
  expect(unplanned?.[2]).toBe("Unplanned");
});

/** A swim timed end to end has no pace: its dash says so, and why is a tap away beside it. */
it("keeps why a swim has no pace behind the info tip beside its dash", async () => {
  mocks.activity.mockResolvedValue({
    ...run,
    sport: "swimming",
    durationMs: 1_800_000,
    origin: AD_HOC_ORIGIN,
    actual: {
      sport: "swimming",
      environment: "pool",
      elapsedMs: 1_800_000,
      activeMs: null,
      distanceMethod: "manual",
      distance: { value: 1000, unit: "m", metres: 1000 },
      poolLength: null,
      lengths: null,
      stroke: "unspecified",
      strokeCount: null,
      resourceId: null,
      averageHeartRate: null,
      maxHeartRate: null,
    },
  });
  const html = renderToStaticMarkup(await ActivityPage(props));
  expect(html).toContain('aria-label="About pace"');
  expect(html).not.toContain("Elapsed time only");
});

/** The document is named as the screen's title is, which the route announcer reads (m7). */
it("names the document by the record's own title, else its sport's word", async () => {
  expect((await generateMetadata(props)).title).toBe("Run");
  mocks.activity.mockResolvedValue({ ...run, title: "Sunday long run" });
  expect((await generateMetadata(props)).title).toBe("Sunday long run");
});
