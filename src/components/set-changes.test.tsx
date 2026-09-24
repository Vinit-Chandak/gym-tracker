// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SET_CHANGES_COOKIE } from "@/lib/set-changes";

const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/server/actions/refresh", () => ({ refreshScreenAction: refresh }));
const address = vi.hoisted(() => ({ pathname: "/today", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => address.pathname,
  useSearchParams: () => new URLSearchParams(address.search),
}));

import { FreshAfterSets, NEW_RENDER_GRACE_MS } from "./fresh-after-sets";
import { recordSetChange, setChangesMade } from "./set-changes";

afterEach(() => {
  cleanup();
  refresh.mockReset();
  refresh.mockImplementation(async () => {});
  vi.restoreAllMocks();
  Object.assign(address, { pathname: "/today", search: "" });
});

const change = { sessionId: "session", workoutExerciseId: "slot", setIndex: 1, set: null };

function Screen({ seen }: { seen: number }) {
  return (
    <FreshAfterSets seen={seen} loading={<p>Loading</p>}>
      <p>Screen</p>
    </FreshAfterSets>
  );
}

/** A refresh the test lets land when it chooses. */
function pendingRefresh() {
  let land: (outcome?: Error) => void = () => {};
  refresh.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        land = (outcome) => (outcome ? reject(outcome) : resolve());
      }),
  );
  return (outcome?: Error) => land(outcome);
}

it("stamps every set change in the cookie the server reads, each above the last", () => {
  const before = setChangesMade();
  recordSetChange(change);
  const first = setChangesMade();
  recordSetChange(change);
  const second = setChangesMade();
  expect(first).toBeGreaterThan(before);
  expect(second).toBeGreaterThan(first);
  expect(document.cookie).toContain(`${SET_CHANGES_COOKIE}=${second}`);
});

it("keeps stamps rising in this tab when the cookie is lost", () => {
  recordSetChange(change);
  const before = setChangesMade();
  document.cookie = `${SET_CHANGES_COOKIE}=; path=/; max-age=0`;
  expect(setChangesMade()).toBe(0);
  recordSetChange(change);
  expect(setChangesMade()).toBeGreaterThan(before);
});

it("stamps a change in a tab opened after the cookie was lost above every earlier one", async () => {
  recordSetChange(change);
  const earlier = setChangesMade();
  document.cookie = `${SET_CHANGES_COOKIE}=; path=/; max-age=0`;
  // A new tab starts with nothing of its own; only the clock says its change came later.
  vi.resetModules();
  const newTab = await import("./set-changes");
  vi.spyOn(Date, "now").mockReturnValue(earlier + 60_000);
  newTab.recordSetChange(change);
  expect(newTab.setChangesMade()).toBe(earlier + 60_000);
});

it("shows a screen rendered after the latest set change as it is", () => {
  recordSetChange(change);
  render(<Screen seen={setChangesMade()} />);
  screen.getByText("Screen");
  expect(refresh).not.toHaveBeenCalled();
});

it("shows the loading state for an older copy while it is rendered again, then the new render", async () => {
  recordSetChange(change);
  const made = setChangesMade();
  const land = pendingRefresh();

  const { rerender } = render(<Screen seen={made - 1} />);
  screen.getByText("Loading");
  expect(screen.queryByText("Screen")).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);

  // The refresh answers before the router shows the new render it carries: the older copy is
  // not shown in between, even for a moment.
  await act(async () => land());
  screen.getByText("Loading");
  expect(screen.queryByText("Screen")).toBeNull();

  // The new render has seen the change.
  rerender(<Screen seen={made} />);
  screen.getByText("Screen");
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("shows the older copy as it is when it cannot be rendered again", async () => {
  recordSetChange(change);
  const land = pendingRefresh();
  render(<Screen seen={setChangesMade() - 1} />);
  screen.getByText("Loading");

  await act(async () => land(new Error("offline")));
  screen.getByText("Screen");
});

it("renders one copy again once, never in a loop", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    recordSetChange(change);
    const older = setChangesMade() - 1;
    const land = pendingRefresh();
    render(<Screen seen={older} />);
    // A second mount while the first refresh is on its way does not ask again.
    render(<Screen seen={older} />);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Had the new render never come, the copy is shown once the wait is over, not fetched again.
    await act(async () => land());
    expect(screen.getAllByText("Loading")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(NEW_RENDER_GRACE_MS));
    expect(screen.getAllByText("Screen")).toHaveLength(2);
    cleanup();
    render(<Screen seen={older} />);
    screen.getByText("Screen");
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("renders each screen and each later change again on its own", async () => {
  recordSetChange(change);
  const older = setChangesMade() - 1;
  await act(async () => {
    render(<Screen seen={older} />);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  cleanup();

  // Another address is another copy.
  address.search = "from=2026-09-01";
  await act(async () => {
    render(<Screen seen={older} />);
  });
  expect(refresh).toHaveBeenCalledTimes(2);

  // A set saved while a screen is shown makes it older too.
  await act(async () => recordSetChange(change));
  expect(refresh).toHaveBeenCalledTimes(3);
});
