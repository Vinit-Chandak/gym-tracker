import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import type { HeadToHeadData } from "@/components/graph/head-to-head-graph";
import { presetRange, readWindowOf } from "@/domain/graph-range";
import { todayInTimeZone } from "@/domain/program-calendar";
import { socialWindow } from "@/server/validation/period";

import CompareExercisePage from "./page";

const EXERCISE = "8f0c1a52-3b7e-4c1d-9a64-2f5e8d7b6c01";

const mocks = vi.hoisted(() => ({
  trend: vi.fn(),
  bests: vi.fn(),
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
  readExerciseBests: mocks.bests,
  readBodyWeights: async () => new Map(),
  readExerciseTrends: mocks.trend,
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
  mocks.bests.mockResolvedValue(new Map());
  mocks.trend.mockResolvedValue(
    new Map([
      [
        "e1rm",
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
      ],
      [
        "most_reps",
        new Map([
          ["me", [{ date: "2026-09-10", value: 8, workoutSessionId: "w1", sharedId: "s0" }]],
        ]),
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
  // Up to now, as every friend's window runs: a friend ahead of the reader still counts.
  const window = readWindowOf({ preset: "3m" }, today);
  expect(mocks.trend.mock.calls[0]![4]).toMatchObject(socialWindow(window.from, window.to, "UTC"));
  // Every measure the movement has, as an exercise's own graph offers them, primary first.
  expect(mocks.trend.mock.calls[0]![3]).toEqual([
    "e1rm",
    "top_weight",
    "best_set_volume",
    "most_reps",
  ]);
  const { data } = mocks.graph.mock.calls[0]![0];
  expect(data.range).toEqual(presetRange("3m", today));
  expect(data.names).toEqual(["You", "Friend"]);
  expect(data.unit).toBe("lb");
  expect(data.measures.map((measure) => measure.metric)).toEqual([
    "e1rm",
    "top_weight",
    "best_set_volume",
    "most_reps",
  ]);
  // Loads in the reader's unit; yours open your workout, theirs the session they shared.
  const [e1rm, , , reps] = data.measures;
  expect(e1rm!.lines[0]).toEqual([
    { date: "2026-09-10", value: 220.5, href: "/workouts/w1?from=shared" },
  ]);
  expect(e1rm!.lines[1].map((point) => point.href)).toEqual(["/u/friend/activities/s2", null]);
  // Reps are counted, not converted.
  expect(reps!.lines[0][0]!.value).toBe(8);
});

it("names each number under a top weight, and calls a set's volume what it is", async () => {
  mocks.bests.mockResolvedValue(
    new Map([
      [
        "me",
        [
          {
            metric: "top_weight",
            value: 15,
            occurredOn: "2026-10-07",
            work: { sets: 2, reps: 11 },
          },
          { metric: "best_set_volume", value: 165, occurredOn: "2026-10-07", work: null },
        ],
      ],
      [
        "friend",
        [{ metric: "top_weight", value: 25, occurredOn: "2026-02-26", work: { sets: 1, reps: 2 } }],
      ],
    ]),
  );
  const html = renderToStaticMarkup(
    await CompareExercisePage({
      params: Promise.resolve({ username: "friend", exerciseId: EXERCISE }),
      searchParams: Promise.resolve({}),
    } as never),
  );
  // Two sets at the top weight, the better of them eleven reps: never "2 × 11".
  expect(html).toContain("11 reps · 2 sets");
  expect(html).toContain("2 reps · 1 set");
  expect(html).not.toMatch(/\d × \d/);
  expect(html).toContain("Best set volume");
});
