import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { holdHyphens } from "@/lib/facts";
import LeaderboardPage from "@/app/(app)/profile/friends/leaderboard/page";
import ComparePage from "./compare/page";
import PersonPage from "./page";

/** The page's words with its tags left out: a figure's digits stand in a span of their own. */
const words = (html: string) => html.replace(/<[^>]*>/g, "");

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
  profile: vi.fn(),
  sharedSports: vi.fn(),
  enabledSports: vi.fn(),
  rankCircle: vi.fn(),
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
vi.mock("@/server/queries/profile", () => ({ readProfile: mocks.profile }));
vi.mock("@/server/repositories/follows", () => ({
  followState: async () => ({ outgoing: "accepted", incoming: null, followApproval: true }),
}));
vi.mock("@/server/repositories/shared-stats", () => ({
  EMPTY_TOTALS: {},
  canViewTraining: async () => true,
  readPeriodTotals: mocks.totals,
  readGroupSets: mocks.muscles,
  readExercisesInCommon: mocks.common,
  readRecords: mocks.records,
  readLeaderboard: mocks.leaderboard,
  readCircleExercises: mocks.circleExercises,
  readBodyWeights: mocks.weights,
  readExerciseBests: mocks.exerciseBests,
  readDistanceUnits: async () => ({ run: "mi", cycle: "km", swim: "m" }),
  readSharedSports: mocks.sharedSports,
}));
vi.mock("@/server/repositories/sport-preferences", () => ({
  enabledSportsFor: mocks.enabledSports,
}));
vi.mock("@/server/queries/leaderboard", () => ({
  loadCircle: async () => [{ id: "me" }, { id: "friend" }],
  rankCircle: mocks.rankCircle,
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
  PageHeader: ({
    title,
    backHref,
    backLabel,
  }: {
    title: string;
    backHref: string;
    backLabel?: string;
  }) => (
    <header>
      <a href={backHref}>{backLabel ?? "Back"}</a>
      <h1>{title}</h1>
    </header>
  ),
}));
vi.mock("@/components/follow-button", () => ({ FollowButton: () => null }));
vi.mock("@/components/ui/sport-span-controls", () => ({
  SportSpanControls: ({ sport, sports }: { sport: string; sports: string[] }) => (
    <span>
      tabs:{sports.join(",")}|{sport}
    </span>
  ),
}));
vi.mock("@/components/graph/graph-range-context", () => ({
  GraphRangeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/info-tip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/info-tip")>()),
  InfoTip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/app/(app)/profile/friends/leaderboard/leaderboard-controls", () => ({
  LeaderboardControls: ({
    sport,
    sports,
    mode,
  }: {
    sport: string;
    sports: string[];
    mode: string;
  }) => (
    <span>
      {sport}:{mode}|tabs:{sports.join(",")}
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
  mocks.muscles.mockResolvedValue({ Chest: 8 });
  mocks.common.mockResolvedValue({ comparable: [], notComparable: 0 });
  mocks.records.mockResolvedValue([]);
  mocks.leaderboard.mockResolvedValue(new Map());
  mocks.sharedSports.mockResolvedValue(new Set(["workout"]));
  mocks.enabledSports.mockResolvedValue(["strength", "running"]);
  mocks.rankCircle.mockReturnValue([]);
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
  // Back to the person, by name, in the same sport; the span is the one every graph shares.
  expect(html).toContain(`href="/u/friend?sport=${storedSport}">Friend</a>`);
});

it("lifting still renders the muscle split and exercises in common", async () => {
  const html = renderToStaticMarkup(await ComparePage(props("strength")));
  expect(html).toContain("Muscle split");
  expect(html).toContain("Exercises in common");
  expect(mocks.muscles).toHaveBeenCalledTimes(2);
  expect(mocks.common).toHaveBeenCalledOnce();
});

it("lists the exercises in common at the gutter, unboxed, each name held at its hyphens", async () => {
  mocks.common.mockResolvedValue({
    comparable: [{ id: "e1", name: "Archer push-up", region: "chest" }],
    notComparable: 0,
  });
  const html = renderToStaticMarkup(await ComparePage(props("strength")));
  // In a box, its rows inset a rem each side, "Seated dumbbell shoulder press" took three lines
  // at 200% text: a list to choose from puts its names at the gutter (DESIGN.md, One Left Edge).
  expect(html).not.toContain("box-rows");
  expect(html).toContain('<li class="nav-row-item"><a href="/u/friend/compare/e1">');
  expect(html).toContain(holdHyphens("Archer push-up"));
});

it("keeps the exercises in common's label and note at their names' edge", async () => {
  mocks.common.mockResolvedValue({
    comparable: [{ id: "e1", name: "Bulgarian split squat", region: "quads" }],
    notComparable: 1,
  });
  const html = renderToStaticMarkup(await ComparePage(props("strength")));
  const start = html.lastIndexOf("<section", html.indexOf("Exercises in common"));
  const section = html.slice(start, html.indexOf("</section>", start));
  expect(section).toContain("1 machine exercise in common is not compared");
  // The label and the note stood a quarter rem in from the names under them (One Left Edge).
  expect(section).not.toContain("px-1");
});

it.each([
  ["cycling", "cycle"],
  ["swimming", "swim"],
  ["running", "run"],
])("the %s person page carries its sport into Compare", async (sport, storedSport) => {
  const html = renderToStaticMarkup(await PersonPage(props(sport)));
  expect(html).toContain(`href="/u/friend/compare?sport=${storedSport}"`);
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

it("reads a running comparison's distances and paces in the viewer's own unit", async () => {
  const html = renderToStaticMarkup(await ComparePage(props("run")));
  // 5 km and 5:00 /km, for a viewer who runs in miles.
  expect(words(html)).toContain("3.1\u00a0mi");
  expect(words(html)).toContain("8:03\u00a0/mi");
  // Only the rule in the help still says "1 km"; no figure does.
  expect(html).not.toMatch(/\d(<\/span>)?\s*km</);
  expect(words(html)).toContain("3.11\u00a0mi");
});

it.each([
  [true, "As your followers see it."],
  [false, "Sharing is off: followers see only your profile card."],
])("your own page, sharing %s, says what a follower sees", async (shareTraining, line) => {
  mocks.directory.mockResolvedValue(me);
  mocks.profile.mockResolvedValue({ shareTraining });
  const html = renderToStaticMarkup(await PersonPage(props("strength")));
  expect(html).toContain(line);
  // Where it is changed is a link, not directions to it.
  expect(html).toMatch(/<a [^>]*href="\/profile\/privacy"[^>]*>Privacy<\/a>/);
  expect(html).not.toContain("Profile › Privacy");
  expect(mocks.profile).toHaveBeenCalledWith(expect.anything(), "me");
});

it("heads a person's span bests as best lifts, not as records Compare would not count", async () => {
  mocks.records.mockResolvedValue([
    {
      exercise: {
        id: "press",
        name: "Incline dumbbell press",
        modality: "dumbbell",
        defaultPrescriptionType: "reps",
      },
      metric: "e1rm",
      value: 25.2,
      occurredOn: "2026-10-01",
    },
  ]);
  const html = renderToStaticMarkup(await PersonPage(props("strength")));
  expect(html).toContain("Best lifts");
  expect(html).toContain("Incline dumbbell press");
  expect(html).not.toMatch(/>Records</);
});

describe("the sports on offer", () => {
  const bare = {
    params: Promise.resolve({ username: "friend" }),
    searchParams: Promise.resolve({}),
  };

  it("gives a person's page a tab for each sport they share, and none they do not", async () => {
    // Sofia lifts and shares her rides; swimming is off (or never done), so it has no tab.
    mocks.sharedSports.mockResolvedValue(new Set(["cycle", "workout"]));
    const html = renderToStaticMarkup(await PersonPage(props("strength")));
    expect(html).toContain("tabs:workout,cycle|workout");
    expect(mocks.sharedSports).toHaveBeenCalledWith(expect.anything(), ["friend"]);
  });

  it("opens on the first sport a person does when the link names none", async () => {
    mocks.sharedSports.mockResolvedValue(new Set(["cycle"]));
    const html = renderToStaticMarkup(await PersonPage(bare));
    expect(html).toContain("tabs:cycle|cycle");
    expect(mocks.totals).toHaveBeenCalledWith(
      expect.anything(),
      ["friend"],
      "cycle",
      expect.anything(),
    );
    expect(html).toContain('href="/u/friend/compare?sport=cycle"');
  });

  it("shows your own page with the sports a follower would see, not the ones only turned on", async () => {
    mocks.directory.mockResolvedValue(me);
    mocks.profile.mockResolvedValue({ shareTraining: true });
    // Swimming on in your sports but never shared: a follower has no swimming to see.
    mocks.enabledSports.mockResolvedValue(["strength", "swimming"]);
    mocks.sharedSports.mockResolvedValue(new Set(["workout"]));
    const html = renderToStaticMarkup(await PersonPage(bare));
    expect(html).toContain("tabs:workout|workout");
    expect(html).not.toContain("swim");
  });

  it("keeps a sport a link asked for, beside the ones done", async () => {
    const html = renderToStaticMarkup(await PersonPage(props("swimming")));
    expect(html).toContain("tabs:workout,swim|swim");
  });

  it("compares in a sport either of you does: shared by either, or on in yours", async () => {
    mocks.sharedSports.mockResolvedValue(new Set(["workout", "cycle"]));
    mocks.enabledSports.mockResolvedValue(["strength", "running"]);
    const html = renderToStaticMarkup(await ComparePage(bare));
    expect(html).toContain("tabs:workout,run,cycle|workout");
    expect(mocks.sharedSports).toHaveBeenCalledWith(expect.anything(), ["me", "friend"]);
    expect(mocks.enabledSports).toHaveBeenCalledWith(expect.anything(), "me");
    expect(html).toContain('href="/u/friend?sport=workout"');
  });

  it("ranks in the viewer's own sports, and a sport a link asked for", async () => {
    mocks.enabledSports.mockResolvedValue(["strength", "cycling"]);
    const board = async (searchParams: Record<string, string>) =>
      renderToStaticMarkup(
        await LeaderboardPage({
          params: Promise.resolve({}),
          searchParams: Promise.resolve(searchParams),
        }),
      );
    expect(await board({})).toContain("workout:activity|tabs:workout,cycle");
    expect(await board({ sport: "running" })).toContain("run:activity|tabs:workout,run,cycle");
    mocks.enabledSports.mockResolvedValue(["swimming"]);
    expect(await board({})).toContain("swim:activity|tabs:swim");
  });
});

describe("a board with nobody on it", () => {
  const row = (key: string, value: number | null, rank: number | null) => ({
    key,
    username: key,
    displayName: null,
    value,
    occurredOn: null,
    rank,
  });
  const board = async (searchParams: Record<string, string>) =>
    renderToStaticMarkup(
      await LeaderboardPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve(searchParams),
      }),
    );

  it("says nobody ran in the period, rather than ranking everyone as a dash", async () => {
    mocks.rankCircle.mockReturnValue([row("me", null, null), row("friend", null, null)]);
    const html = await board({ sport: "running" });
    expect(html).toContain("No runs in the last 30 days.");
    expect(html).not.toContain("@friend");
    const pace = await board({ sport: "running", metric: "best_pace", period: "7d" });
    expect(pace).toContain("No runs of 1 km or more in the last 7 days.");
  });

  it("ranks as before once anybody has a number, the rest trailing as a dash", async () => {
    mocks.rankCircle.mockReturnValue([row("friend", 3, 1), row("me", null, null)]);
    const html = await board({ sport: "running" });
    expect(html).toContain("@friend");
    expect(html).not.toContain("No runs in");
  });
});

it("names the person once, in the title, not again on the card under it", async () => {
  const html = renderToStaticMarkup(await PersonPage(props("strength")));
  expect(html).toContain("<h1>Friend</h1>");
  expect(html).not.toContain("person-card-name");
  expect(html).toContain("@friend");
});
