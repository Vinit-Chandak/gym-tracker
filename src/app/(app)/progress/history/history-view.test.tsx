// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { HistoryView, type HistoryItem } from "./history-view";

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
    range: { from: "2026-09-01", to: "2026-09-26" },
    items,
    gyms: [],
    truncated: false,
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
      range={{ from: "2026-09-01", to: "2026-09-28" }}
      gyms={[]}
      truncated={false}
      items={[
        {
          id: "lift",
          kind: "workout",
          date: "2026-09-28T13:30:00.000Z",
          day: "2026-09-28",
          title: "Ad hoc session",
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
  const lift = screen.getByRole("link", { name: /Ad hoc session/ });
  expect(lift.textContent).toContain("13 sets");
  expect(lift.textContent).toContain("19:00 · Anytime Fitness");
  expect(screen.getByRole("img", { name: "Workout" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Recovery" })).toBeTruthy();
  expect(screen.getByText("2 entries")).toBeTruthy();
});
