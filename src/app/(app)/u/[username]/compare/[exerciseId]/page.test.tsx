import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import type { HeadToHeadData } from "@/components/graph/head-to-head-graph";
import { presetRange, readWindowOf } from "@/domain/graph-range";
import { todayInTimeZone } from "@/domain/program-calendar";

import CompareExercisePage from "./page";

const EXERCISE = "8f0c1a52-3b7e-4c1d-9a64-2f5e8d7b6c01";

const mocks = vi.hoisted(() => ({
  trend: vi.fn(),
  graph: vi.fn((_props: { data: HeadToHeadData }) => null),
}));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "viewer@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ username: "viewer", preferredUnit: "lb", timeZone: "UTC" }),
}));
vi.mock("@/server/queries/graph-range", () => ({ rememberedRange: async () => "3m" }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/queries/head-to-head", () => ({
  loadHeadToHead: async () => ({
    me: { id: "me", username: "viewer", displayName: "Viewer" },
    them: { id: "friend", username: "friend", displayName: "Friend" },
    visible: true,
  }),
  hiddenTrainingLine: () => "Hidden training",
}));
vi.mock("@/server/queries/leaderboard", () => ({
  loadCircle: async () => [{ id: "me" }, { id: "friend" }],
  rankExercise: () => [],
}));
vi.mock("@/server/repositories/shared-stats", () => ({
  getComparableExercise: async () => ({
    id: EXERCISE,
    name: "Barbell bench press",
    region: "chest",
    modality: "barbell",
    defaultPrescriptionType: "reps",
  }),
  readExerciseBests: async () => new Map(),
  readBodyWeights: async () => new Map(),
  readExerciseTrend: mocks.trend,
}));
vi.mock("@/components/graph/head-to-head-graph", () => ({ HeadToHeadGraph: mocks.graph }));
vi.mock("@/components/graph/graph-range-context", () => ({
  GraphRangeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/compare-header", () => ({ CompareHeader: () => null }));
vi.mock("@/components/friends-board-card", () => ({ FriendsBoardCard: () => null }));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/ui/info-tip", () => ({
  InfoTip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trend.mockResolvedValue(
    new Map([
      ["me", [{ date: "2026-09-10", value: 100, workoutSessionId: "w1", sharedId: "s0" }]],
      [
        "friend",
        [
          { date: "2026-09-12", value: 90, workoutSessionId: "w2", sharedId: "s2" },
          { date: "2026-09-20", value: 92.5, workoutSessionId: "w3", sharedId: null },
        ],
      ],
    ]),
  );
});

it("draws the head to head over the span every graph shares, each point opening its record", async () => {
  const html = renderToStaticMarkup(
    await CompareExercisePage({
      params: Promise.resolve({ username: "friend", exerciseId: EXERCISE }),
      searchParams: Promise.resolve({ period: "7d" }),
    } as never),
  );
  expect(html).toContain("Trend");
  const today = todayInTimeZone("UTC");
  // The remembered span decides what is read, whatever period the URL still carries.
  expect(mocks.trend.mock.calls[0]![4]).toMatchObject(readWindowOf({ preset: "3m" }, today));
  const { data } = mocks.graph.mock.calls[0]![0];
  expect(data.range).toEqual(presetRange("3m", today));
  expect(data.names).toEqual(["You", "Friend"]);
  expect(data.unit).toBe("lb");
  // Loads in the reader's unit; yours open your workout, theirs the session they shared.
  expect(data.lines[0]).toEqual([
    { date: "2026-09-10", value: 220.5, href: "/workouts/w1?from=shared" },
  ]);
  expect(data.lines[1].map((point) => point.href)).toEqual(["/u/friend/activities/s2", null]);
});
