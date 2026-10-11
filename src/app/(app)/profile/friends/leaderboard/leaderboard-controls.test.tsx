// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LeaderboardControls, type ExerciseChoice } from "./leaderboard-controls";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/profile/friends/leaderboard",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const none: ExerciseChoice = { options: [], selected: null, metric: null, metrics: [] };

/** The labels of the radio groups drawn, top to bottom. */
const groups = () => screen.queryAllByRole("radiogroup").map((g) => g.getAttribute("aria-label"));

it("keeps Activity | Exercise on top whichever sport the board is on", () => {
  // A lifter alone: one sport, so no sport switch, and the two boards.
  render(
    <LeaderboardControls
      sport="workout"
      sports={["workout"]}
      mode="activity"
      activityMetric="workouts"
      period="30d"
      exercise={none}
    />,
  );
  expect(groups()).toEqual(["Leaderboard", "Period"]);
  cleanup();

  // The same lifter on a running board a link opened: the same top row, the sport under it.
  // It read "Lifting | Running" alone, as though it were another page.
  render(
    <LeaderboardControls
      sport="run"
      sports={["workout", "run"]}
      mode="activity"
      activityMetric="runs"
      period="30d"
      exercise={none}
    />,
  );
  expect(groups()).toEqual(["Leaderboard", "Sport", "Period"]);
  expect(screen.getByRole("radio", { name: "Activity" })).toHaveProperty("checked", true);
});

it("turns to lifting when Exercise is chosen from another sport's board", () => {
  navigation.search = "sport=run&metric=distance";
  render(
    <LeaderboardControls
      sport="run"
      sports={["workout", "run"]}
      mode="activity"
      activityMetric="distance"
      period="30d"
      exercise={none}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Exercise" }));
  const url = new URL(String(navigation.replace.mock.calls[0]![0]), "https://example.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({ sport: "workout", mode: "exercise" });
});

it("asks no sport on the Exercise board, which ranks lifts", () => {
  render(
    <LeaderboardControls
      sport="workout"
      sports={["workout", "run"]}
      mode="exercise"
      activityMetric="workouts"
      period="30d"
      exercise={none}
    />,
  );
  expect(groups()).toEqual(["Leaderboard"]);
});

it("offers no Activity | Exercise to someone who does not lift", () => {
  render(
    <LeaderboardControls
      sport="swim"
      sports={["swim"]}
      mode="activity"
      activityMetric="sessions"
      period="30d"
      exercise={none}
    />,
  );
  expect(groups()).toEqual(["Period"]);
});
