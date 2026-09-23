// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SET_CHANGES_COOKIE } from "@/lib/set-changes";

const refresh = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/server/actions/refresh", () => ({ refreshScreenAction: refresh }));

import { RefreshWhenSetsChange } from "./refresh-when-sets-change";
import { recordSetChange, setChangesMade } from "./set-changes";

afterEach(cleanup);

const change = { sessionId: "session", workoutExerciseId: "slot", setIndex: 1, set: null };

it("counts every set change in the cookie the server reads", () => {
  const before = setChangesMade();
  recordSetChange(change);
  recordSetChange(change);
  expect(setChangesMade()).toBe(before + 2);
  expect(document.cookie).toContain(`${SET_CHANGES_COOKIE}=${before + 2}`);
});

it("keeps counting up when the cookie is lost", () => {
  const before = setChangesMade();
  document.cookie = `${SET_CHANGES_COOKIE}=; path=/; max-age=0`;
  expect(setChangesMade()).toBe(0);
  recordSetChange(change);
  expect(setChangesMade()).toBe(before + 1);
});

it("renders a screen again only when it predates a set change, and never twice for it", () => {
  refresh.mockClear();
  recordSetChange(change);
  const made = setChangesMade();

  render(<RefreshWhenSetsChange seen={made} />);
  expect(refresh).not.toHaveBeenCalled();
  cleanup();

  render(<RefreshWhenSetsChange seen={made - 1} />);
  expect(refresh).toHaveBeenCalledTimes(1);
  cleanup();

  // Had the new copy still predated the change, it is not fetched again in a loop.
  render(<RefreshWhenSetsChange seen={made - 1} />);
  expect(refresh).toHaveBeenCalledTimes(1);
  cleanup();

  recordSetChange(change);
  render(<RefreshWhenSetsChange seen={made} />);
  expect(refresh).toHaveBeenCalledTimes(2);
});
