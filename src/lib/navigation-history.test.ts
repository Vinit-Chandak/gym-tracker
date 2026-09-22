// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { previousAppPage, trackNavigationHistory } from "./navigation-history";

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  window.history.replaceState(null, "", "/");
});

it("keeps the exact previous route including history filters", () => {
  window.history.replaceState({ __NA: true }, "", "/history?kind=cycling&from=2026-09-01");
  stop = trackNavigationHistory();
  window.history.pushState({ __NA: true, tree: "next-state" }, "", "/training/activities/abc");
  expect(previousAppPage()).toBe("/history?kind=cycling&from=2026-09-01");
  expect(window.history.state.tree).toBe("next-state");
  window.history.replaceState(
    { __NA: true, tree: "new-tree" },
    "",
    "/training/activities/abc?from=history",
  );
  expect(previousAppPage()).toBe("/history?kind=cycling&from=2026-09-01");
  expect(window.history.state.tree).toBe("new-tree");
});

it("does not invent browser history for a direct link or return to a sign-in screen", () => {
  window.history.replaceState(null, "", "/training/new?sport=swimming");
  stop = trackNavigationHistory();
  expect(previousAppPage()).toBeNull();
  window.history.replaceState(null, "", "/login");
  window.history.pushState({}, "", "/today");
  expect(previousAppPage()).toBeNull();
});

it("rejects unsafe or authentication destinations in a stored history marker", () => {
  for (const path of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/auth/confirm",
    "/login?next=/history",
  ]) {
    window.history.replaceState({ overloadPreviousPage: path }, "", "/today");
    expect(previousAppPage()).toBeNull();
  }
});

it("preserves the marker across tracker remounts and restores wrapped methods", () => {
  window.history.replaceState(null, "", "/training/templates");
  const original = window.history.pushState;
  stop = trackNavigationHistory();
  window.history.pushState({}, "", "/training/templates/new");
  stop();
  expect(window.history.pushState).toBe(original);
  stop = trackNavigationHistory();
  expect(previousAppPage()).toBe("/training/templates");
});
