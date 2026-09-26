// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PEOPLE_SEARCH_DELAY_MS, PeopleSearch } from "./people-search";

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/server/actions/people", () => ({ searchPeopleAction: search }));
vi.mock("@/components/follow-button", () => ({ FollowButton: () => null }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const type = (value: string) =>
  fireEvent.change(screen.getByRole("searchbox"), { target: { value } });
const settle = () => act(() => vi.advanceTimersByTimeAsync(PEOPLE_SEARCH_DELAY_MS));

it("shows a recoverable failure and retries the same search without losing it", async () => {
  search.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce([]);
  render(<PeopleSearch />);
  type("alex");
  await settle();
  expect(screen.getByRole("alert").textContent).toBe("Could not load people. Please try again.");
  expect(screen.getByRole("status").textContent).not.toBe("Searching");
  expect(screen.queryByText(/Nobody called that/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  await settle();
  expect(search).toHaveBeenNthCalledWith(2, "alex");
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("alex");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText(/Nobody called that/)).toBeTruthy();
});

it("ignores an old search failure after the query has changed", async () => {
  let rejectOld!: (error: Error) => void;
  search
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        }),
    )
    .mockResolvedValueOnce([]);
  render(<PeopleSearch />);
  type("alex");
  await settle();
  type("priya");
  await settle();
  await act(async () => rejectOld(new Error("Old request failed")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText(/Nobody called that/)).toBeTruthy();
});
