import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import LeaderboardPage from "@/app/(app)/profile/friends/leaderboard/page";
import ComparePage from "./compare/page";
import PersonPage from "./page";

const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  directory: vi.fn(),
  totals: vi.fn(),
  muscles: vi.fn(),
  common: vi.fn(),
  records: vi.fn(),
  leaderboard: vi.fn(),
  circleExercises: vi.fn(),
  weights: vi.fn(),
  exerciseBests: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "viewer@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ username: "viewer", preferredUnit: "kg", timeZone: "UTC" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/queries/head-to-head", () => ({
  loadHeadToHead: mocks.head,
  hiddenTrainingLine: () => "Hidden training",
}));
vi.mock("@/server/repositories/people", () => ({ getDirectoryProfile: mocks.directory }));
vi.mock("@/server/repositories/follows", () => ({
  followState: async () => ({ outgoing: "accepted", incoming: null, followApproval: true }),
}));
vi.mock("@/server/repositories/shared-stats", () => ({
  EMPTY_TOTALS: {},
  canViewTraining: async () => true,
  readPeriodTotals: mocks.totals,
  readMuscleSets: mocks.muscles,
  readExercisesInCommon: mocks.common,
  readRecords: mocks.records,
  readLeaderboard: mocks.leaderboard,
  readCircleExercises: mocks.circleExercises,
  readBodyWeights: mocks.weights,
  readExerciseBests: mocks.exerciseBests,
}));
vi.mock("@/server/queries/leaderboard", () => ({
  loadCircle: async () => [{ id: "me" }, { id: "friend" }],
  rankCircle: () => [],
  rankExercise: () => [],
  perKgAvailable: () => false,
}));
// These controls have their own interaction tests; retain their links and explanatory
// content while checking the server page's sport selection and data access.
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title, backHref }: { title: string; backHref: string }) => (
    <header>
      <a href={backHref}>Back</a>
      <h1>{title}</h1>
    </header>
  ),
}));
vi.mock("@/components/follow-button", () => ({ FollowButton: () => null }));
vi.mock("@/components/ui/sport-period-controls", () => ({ SportPeriodControls: () => null }));
vi.mock("@/components/ui/info-tip", () => ({
  InfoTip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/app/(app)/profile/friends/leaderboard/leaderboard-controls", () => ({
  LeaderboardControls: ({ sport, mode }: { sport: string; mode: string }) => (
    <span>
      {sport}:{mode}
    </span>
  ),
}));

const me = { id: "me", username: "viewer", displayName: "Viewer", followers: 1, following: 1 };
const friend = {
  id: "friend",
  username: "friend",
  displayName: "Friend",
  followers: 1,
  following: 1,
};
const totals = {
  sessions: 3,
  workingSets: 8,
  volumeKg: 100,
  durationSeconds: 3600,
  activeDays: 2,
  records: 0,
  distanceMeters: 5000,
  bestPaceSecondsPerKm: 300,
  longestRunMeters: 5000,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.head.mockResolvedValue({
    me,
    them: friend,
    visible: true,
    relation: { outgoing: "accepted" },
  });
  mocks.directory.mockResolvedValue(friend);
  mocks.totals.mockResolvedValue(
    new Map([
      [me.id, totals],
      [friend.id, totals],
    ]),
  );
  mocks.muscles.mockResolvedValue({ chest: 8 });
  mocks.common.mockResolvedValue({ comparable: [], notComparable: 0 });
  mocks.records.mockResolvedValue([]);
  mocks.leaderboard.mockResolvedValue(new Map());
});

const props = (sport: string) => ({
  params: Promise.resolve({ username: "friend" }),
  searchParams: Promise.resolve({ sport, period: "90d" }),
});

it.each([
  ["running", "run"],
  ["run", "run"],
  ["cycling", "cycle"],
  ["cycle", "cycle"],
  ["swimming", "swim"],
  ["swim", "swim"],
])("%s comparison reads its own totals without lifting sections", async (sport, storedSport) => {
  const html = renderToStaticMarkup(await ComparePage(props(sport)));
  expect(html).not.toContain("Muscle split");
  expect(html).not.toContain("Exercises in common");
  expect(mocks.muscles).not.toHaveBeenCalled();
  expect(mocks.common).not.toHaveBeenCalled();
  expect(mocks.totals).toHaveBeenCalledWith(
    expect.anything(),
    ["me", "friend"],
    storedSport,
    expect.anything(),
  );
  expect(html).toContain(`/u/friend?sport=${storedSport}&amp;period=90d`);
});

it("lifting still renders the muscle split and exercises in common", async () => {
  const html = renderToStaticMarkup(await ComparePage(props("strength")));
  expect(html).toContain("Muscle split");
  expect(html).toContain("Exercises in common");
  expect(mocks.muscles).toHaveBeenCalledTimes(2);
  expect(mocks.common).toHaveBeenCalledOnce();
});

it.each([
  ["cycling", "cycle"],
  ["swimming", "swim"],
  ["running", "run"],
])("the %s person page carries sport and period into Compare", async (sport, storedSport) => {
  const html = renderToStaticMarkup(await PersonPage(props(sport)));
  expect(html).toContain(`/u/friend/compare?sport=${storedSport}&amp;period=90d`);
  expect(mocks.muscles).not.toHaveBeenCalled();
  expect(mocks.records).not.toHaveBeenCalled();
});

it.each([
  ["cycling", "cycle", "ride"],
  ["swimming", "swim", "swim"],
])(
  "%s leaderboard keeps participation metrics and sport-specific help",
  async (sport, storedSport, activity) => {
    const html = renderToStaticMarkup(
      await LeaderboardPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ sport, mode: "exercise" }),
      }),
    );
    expect(html).toContain(`${storedSport}:activity`);
    expect(html).toContain(`someone with no ${activity} in the period`);
    expect(html).not.toContain("Best pace");
    expect(html).not.toContain("faster pace");
    expect(mocks.circleExercises).not.toHaveBeenCalled();
    expect(mocks.leaderboard).toHaveBeenCalledWith(
      expect.anything(),
      ["me", "friend"],
      storedSport,
      "sessions",
      expect.anything(),
    );
  },
);
