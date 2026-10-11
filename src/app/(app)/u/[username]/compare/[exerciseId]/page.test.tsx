import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { HeadToHeadData } from "@/components/graph/head-to-head-graph";
import { presetRange, readWindowOf } from "@/domain/graph-range";
import { todayInTimeZone } from "@/domain/program-calendar";
import { socialWindow } from "@/server/validation/period";

import CompareExercisePage from "./page";

/** The page's words with its tags left out: a figure's digits stand in a span of their own. */
const words = (html: string) => html.replace(/<[^>]*>/g, "");

const EXERCISE = "8f0c1a52-3b7e-4c1d-9a64-2f5e8d7b6c01";

const mocks = vi.hoisted(() => ({
  trend: vi.fn(),
  bests: vi.fn(async () => new Map()),
  weights: vi.fn(async () => new Map()),
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
  readBodyWeights: mocks.weights,
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

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bests.mockResolvedValue(new Map());
  mocks.weights.mockResolvedValue(new Map());
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
  // A morning in UTC: from 10:00 the latest date on Earth is already tomorrow, and a social
  // span runs on to it (`socialWindow`), which is not what this test is about.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T08:00:00Z"));
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

it("reads a best against each person's latest body weight, and says it is the latest", async () => {
  mocks.bests.mockResolvedValue(
    new Map([
      ["me", [{ metric: "e1rm", value: 145.7, occurredOn: "2025-12-15", work: null }]],
      ["friend", [{ metric: "e1rm", value: 46.3, occurredOn: "2026-09-19", work: null }]],
    ]),
  );
  mocks.weights.mockResolvedValue(
    new Map([
      ["me", { weightKg: 82.8, measuredOn: "2026-10-10" }],
      ["friend", { weightKg: 71.2, measuredOn: "2026-10-01" }],
    ]),
  );
  const html = renderToStaticMarkup(
    await CompareExercisePage({
      params: Promise.resolve({ username: "friend", exerciseId: EXERCISE }),
      searchParams: Promise.resolve({}),
    } as never),
  );
  // A lift from last December over this October's weight: the line says which weight it is.
  expect(words(html)).toContain("1.76×\u00a0latest\u00a0BW");
  expect(words(html)).toContain("0.65×\u00a0latest\u00a0BW");
  expect(words(html)).not.toMatch(/\d×\s?BW/);
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
  expect(words(html)).toContain("11\u00a0reps ·\u00a02\u00a0sets");
  expect(words(html)).toContain("2\u00a0reps ·\u00a01\u00a0set");
  expect(words(html)).not.toMatch(/\d × \d/);
  expect(html).toContain("Best set volume");
});
