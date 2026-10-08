// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { HISTORY_PAGE_SIZE, HistoryView, type HistoryItem } from "./history-view";

const navigation = vi.hoisted(() => ({ query: "kind=run" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/progress/history",
}));
// The regression is the history list's URL-driven filtering, not the sheet primitives.
vi.mock("../progress-sections", () => ({ ProgressSections: () => null }));
afterEach(cleanup);

it("replaces local filters when Back or a deep link changes the URL", () => {
  const items: HistoryItem[] = [
    {
      id: "1",
      kind: "run",
      date: "2026-09-26",
      day: "2026-09-26",
      title: "Morning run",
      subtitle: "",
      meta: "",
      gymId: null,
      exercises: [],
    },
    {
      id: "2",
      kind: "workout",
      date: "2026-09-25",
      day: "2026-09-25",
      title: "Evening lift",
      subtitle: "",
      meta: "",
      gymId: null,
      exercises: [],
    },
  ];
  const props = {
    today: "2026-10-07",
    range: { from: "2026-09-01", to: "2026-09-26" },
    items,
    gyms: [],
  };
  const { rerender } = render(<HistoryView {...props} />);
  expect(screen.getByText("Morning run")).toBeTruthy();
  expect(screen.queryByText("Evening lift")).toBeNull();
  navigation.query = "kind=workout";
  rerender(<HistoryView {...props} />);
  expect(screen.getByText("Evening lift")).toBeTruthy();
  expect(screen.queryByText("Morning run")).toBeNull();
  navigation.query = "";
  rerender(<HistoryView {...props} />);
  expect(screen.getByText("Morning run")).toBeTruthy();
  expect(screen.getByText("Evening lift")).toBeTruthy();
});

it("lists each entry under its day, its mark naming the sport", () => {
  navigation.query = "";
  render(
    <HistoryView
      today="2026-10-07"
      range={{ from: "2026-09-01", to: "2026-09-28" }}
      gyms={[]}

      items={[
        {
          id: "lift",
          kind: "workout",
          date: "2026-09-28T13:30:00.000Z",
          day: "2026-09-28",
          title: "Unplanned session",
          subtitle: "19:00 · Anytime Fitness",
          meta: "13 sets",
          gymId: null,
          exercises: [],
          href: "/workouts/lift",
        },
        {
          id: "sleep",
          kind: "recovery",
          date: "2026-09-27",
          day: "2026-09-27",
          title: "Recovery",
          subtitle: "Sleep 7.5 h · Fatigue 4 · Soreness 2",
          meta: "",
          gymId: null,
          exercises: [],
        },
      ]}
    />,
  );
  expect(screen.getByRole("heading", { name: "Mon 28 Sept" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Sun 27 Sept" })).toBeTruthy();
  const lift = screen.getByRole("link", { name: /Unplanned session/ });
  expect(lift.textContent).toContain("13 sets");
  expect(lift.textContent).toContain("19:00 · Anytime Fitness");
  expect(screen.getByRole("img", { name: "Workout" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Recovery" })).toBeTruthy();
  expect(screen.getByText("2 entries")).toBeTruthy();
});

it("lists ten entries a page, newest first, and turns the page with its tabs", () => {
  window.scrollTo = vi.fn();
  window.history.replaceState(null, "", "/progress/history");
  const items: HistoryItem[] = Array.from({ length: 23 }, (_, index) => {
    const day = `2026-09-${String(28 - index).padStart(2, "0")}`;
    return {
      id: String(index),
      kind: "workout",
      date: day,
      day,
      title: `Workout ${index + 1}`,
      subtitle: "",
      meta: "",
      gymId: null,
      exercises: [],
    };
  });
  const props = {
    today: "2026-10-07",
    range: { from: "2026-09-01", to: "2026-09-28" },
    items,
    gyms: [],
  };
  navigation.query = "";
  const { rerender } = render(<HistoryView {...props} />);
  expect(HISTORY_PAGE_SIZE).toBe(10);
  expect(screen.getByText("23 entries · page 1 of 3")).toBeTruthy();
  expect(screen.getByText("Workout 1")).toBeTruthy();
  expect(screen.getByText("Workout 10")).toBeTruthy();
  expect(screen.queryByText("Workout 11")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Page 2 of 3" }));
  expect(window.location.search).toBe("?page=2");
  expect(window.scrollTo).toHaveBeenCalled();
  // The URL is what the list reads, so Back from an entry returns to the same page.
  navigation.query = "page=2";
  rerender(<HistoryView {...props} />);
  expect(screen.getByText("Workout 11")).toBeTruthy();
  expect(screen.queryByText("Workout 10")).toBeNull();
  // A page past the end reads as the last one.
  navigation.query = "page=9";
  rerender(<HistoryView {...props} />);
  expect(screen.getByText("Workout 23")).toBeTruthy();
  // Where the list stops short of its dates, its last page says where, and only its last.
  rerender(<HistoryView {...props} stopsAfter="2026-09-06" />);
  expect(screen.getByRole("note").textContent).toContain("The list ends at");
  navigation.query = "page=2";
  rerender(<HistoryView {...props} stopsAfter="2026-09-06" />);
  expect(screen.queryByRole("note")).toBeNull();
});
