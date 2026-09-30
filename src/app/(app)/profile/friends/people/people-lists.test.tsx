// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { previousAppPage, trackNavigationHistory } from "@/lib/navigation-history";
import { removeFollowerAction, unfollowAction } from "@/server/actions/follows";

import { PeopleLists } from "./people-lists";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const { subscribeNavigation } = await import("@/lib/navigation-history");
  return {
    useRouter: () => router,
    // Model Next's documented subscription to native history changes, including popstate.
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(subscribeNavigation, () => window.location.search)),
  };
});
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/server/actions/follows", () => ({
  removeFollowerAction: vi.fn(),
  unfollowAction: vi.fn(),
}));
let stopTracking: () => void;
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/profile/friends/people");
  stopTracking = trackNavigationHistory();
});
afterEach(() => {
  cleanup();
  stopTracking();
});

const following = [{ id: "alice", username: "alice", displayName: "Alice" }];
const followers = [{ id: "bob", username: "bob", displayName: "Bob" }];

it.each([
  ["", "Following (0)"],
  ["?people=following", "Following (0)"],
  ["?people=followers", "Followers (0)"],
  ["?people=unknown", "Following (0)"],
  ["?people=followers&people=following", "Following (0)"],
])("keeps the server's default and deep-link selection for %s", (query, label) => {
  window.history.replaceState(null, "", `/profile/friends/people${query}`);
  render(<PeopleLists following={[]} followers={[]} />);
  expect((screen.getByRole("radio", { name: label }) as HTMLInputElement).checked).toBe(true);
});

it("switches loaded lists immediately and replaces the URL without a router request", () => {
  window.history.replaceState(null, "", "/profile/friends");
  window.history.pushState(
    null,
    "",
    "/profile/friends/people?people=following&source=profile#lists",
  );
  const entries = window.history.length;
  render(<PeopleLists following={following} followers={followers} />);
  expect(screen.getByText("Alice")).toBeTruthy();

  fireEvent.click(screen.getByRole("radio", { name: "Followers (1)" }));

  expect(screen.getByText("Bob")).toBeTruthy();
  expect(screen.queryByText("Alice")).toBeNull();
  expect(window.location.search).toBe("?people=followers&source=profile");
  expect(window.location.hash).toBe("#lists");
  expect(window.history.length).toBe(entries);
  expect(previousAppPage()).toBe("/profile/friends");
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();
  expect(removeFollowerAction).not.toHaveBeenCalled();
  expect(unfollowAction).not.toHaveBeenCalled();
});

it("follows browser Back and Forward instead of retaining a stale selected tab", async () => {
  window.history.replaceState(null, "", "/profile/friends/people?people=following");
  window.history.pushState(null, "", "/profile/friends/people?people=followers");
  render(<PeopleLists following={following} followers={followers} />);
  expect(screen.getByText("Bob")).toBeTruthy();

  act(() => window.history.back());
  await waitFor(() => expect(screen.getByText("Alice")).toBeTruthy());
  expect(screen.queryByText("Bob")).toBeNull();

  act(() => window.history.forward());
  await waitFor(() => expect(screen.getByText("Bob")).toBeTruthy());
  expect(screen.queryByText("Alice")).toBeNull();
});

it("uses refreshed server lists without resetting the URL's selection", () => {
  const { rerender } = render(<PeopleLists following={following} followers={followers} />);
  fireEvent.click(screen.getByRole("radio", { name: "Followers (1)" }));
  // A follow action revalidates this page and replaces its list props.
  rerender(<PeopleLists following={following} followers={[]} />);
  expect(screen.getByText("Nobody follows you yet.")).toBeTruthy();
  expect(screen.queryByText("Bob")).toBeNull();
  expect((screen.getByRole("radio", { name: "Followers (0)" }) as HTMLInputElement).checked).toBe(
    true,
  );

  act(() => window.history.replaceState(null, "", "/profile/friends/people?people=following"));
  expect(screen.getByText("Alice")).toBeTruthy();
});
