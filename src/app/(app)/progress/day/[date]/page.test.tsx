import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import DayPage from "./page";

const mocks = vi.hoisted(() => ({ workouts: [] as unknown[], activities: [] as unknown[] }));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "kenji@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "Asia/Tokyo" }),
}));
vi.mock("@/server/queries/set-changes", () => ({ seenSetChanges: async () => 0 }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/activity-analytics", () => ({
  readActivityDays: async () => ({ items: mocks.activities }),
}));
vi.mock("@/server/repositories/training-data", () => ({
  readWorkouts: async () => ({ workouts: mocks.workouts, prints: new Map() }),
}));
vi.mock("@/server/repositories/sport-preferences", () => ({ unitsBySport: async () => ({}) }));
vi.mock("@/components/fresh-after-sets", () => ({
  FreshAfterSets: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/art/art", () => ({ Art: () => null }));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// Kenji's squat day, started at 10:30 in Tokyo on Sunday 11 October and still open.
const squatDay = {
  id: "00000000-0000-4000-8000-000000000036",
  startedAt: new Date("2026-10-11T01:30:00Z"),
  completedAt: null as Date | null,
  title: null,
  day: { name: "Squat day" },
  gym: { name: "Tokyo Powerhouse" },
  exercises: [{ sets: [{ setType: "warmup" }, { setType: "working" }, { setType: "working" }] }],
};

const props = {
  params: Promise.resolve({ date: "2026-10-11" }),
} as unknown as PageProps<"/progress/day/[date]">;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T03:00:00Z"));
  mocks.workouts = [squatDay];
  mocks.activities = [];
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * Year audit, October 2026, at 200% text: the open workout's line broke "Tokyo Powerhouse · In" /
 * "progress". Its state is held whole, as Today holds it, so the line breaks before the dot.
 */
it("holds an open workout's state whole on its line", async () => {
  const html = renderToStaticMarkup(await DayPage(props));
  expect(html).toContain("Tokyo Powerhouse · In progress");
  expect(html).not.toContain("In progress");
});

it("keeps a finished workout's figures with their words", async () => {
  mocks.workouts = [{ ...squatDay, completedAt: new Date("2026-10-11T02:42:00Z") }];
  const html = renderToStaticMarkup(await DayPage(props));
  // Its figures in Jost, whose zero is plain.
  expect(html).toContain(
    'Tokyo Powerhouse · <span class="figures">72</span> min · <span class="figures">2</span> sets',
  );
});

/**
 * Year audit, October 2026: a ride opened from the day lit Training while its Back said History.
 * Each record the day opens names History, as the day is Progress's (NAV-03); the open workout
 * is Today's and names nothing.
 */
it("opens each finished record under History", async () => {
  mocks.workouts = [
    squatDay,
    {
      ...squatDay,
      id: "done",
      startedAt: new Date("2026-10-11T00:00:00Z"),
      completedAt: new Date("2026-10-11T01:00:00Z"),
    },
  ];
  mocks.activities = [
    {
      id: "ride",
      sport: "cycling",
      startedAt: new Date("2026-10-11T08:00:00Z"),
      title: null,
      environment: null,
      durationMs: 2_400_000,
      distanceMetres: null,
      stroke: null,
    },
  ];
  const html = renderToStaticMarkup(await DayPage(props));
  expect(html).toContain('href="/training/activities/ride?from=history"');
  expect(html).toContain('href="/workouts/done?from=history"');
  expect(html).toContain(`href="/workouts/${squatDay.id}"`);
});
