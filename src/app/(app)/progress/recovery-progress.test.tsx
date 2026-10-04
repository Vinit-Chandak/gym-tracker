// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { RecoveryReading } from "@/domain/recovery";
import { RecoveryProgress } from "./recovery-progress";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 320 } }]);
      }
      disconnect() {}
    },
  );
});
afterEach(cleanup);
const reading = (overrides: Partial<RecoveryReading>): RecoveryReading => ({
  id: "one",
  date: "2026-09-22",
  recordedAt: "2026-09-22T07:00:00Z",
  source: "workout",
  sessionId: "one",
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  ...overrides,
});

it("opens a recorded measure when only fatigue was answered, and allows an explicit empty measure", () => {
  const onSelect = vi.fn();
  const readings = [reading({ fatigue: 4 })];
  const view = render(<RecoveryProgress readings={readings} selected={null} onSelect={onSelect} />);
  expect((screen.getByRole("radio", { name: "Fatigue" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("img", { name: /Fatigue, 1 reading/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Sleep" }));
  expect(onSelect).toHaveBeenCalledWith("sleepHours");
  view.rerender(<RecoveryProgress readings={readings} selected="sleepHours" onSelect={onSelect} />);
  expect(screen.getByText(/Sleep was not recorded/)).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(<RecoveryProgress readings={readings} selected="fatigue" onSelect={onSelect} />);
  expect(screen.getByRole("img", { name: /Fatigue, 1 reading/ })).toBeTruthy();
});

it("no longer offers energy, and a link that still names it opens a measure that was recorded", () => {
  render(
    <RecoveryProgress
      readings={[reading({ energy: 2, fatigue: 4 })]}
      selected="energy"
      onSelect={() => {}}
    />,
  );
  expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
    "Sleep",
    "Sleep quality",
    "Fatigue",
    "Soreness",
  ]);
  expect((screen.getByRole("radio", { name: "Fatigue" }) as HTMLInputElement).checked).toBe(true);
});

it("shows real latest values and averages without treating missing responses as zero", () => {
  render(
    <RecoveryProgress
      readings={[
        reading({ id: "first", fatigue: 2 }),
        reading({ id: "middle", fatigue: null, soreness: 2 }),
        reading({ id: "last", fatigue: 5, sessionId: "last" }),
      ]}
      selected="fatigue"
      onSelect={() => {}}
    />,
  );
  // The latest on its tile, the average under the chart, and only the answers given counted.
  expect(screen.getByRole("radio", { name: "Fatigue" }).parentElement!.textContent).toContain(
    "5 / 5",
  );
  expect(screen.getByText("Range average").parentElement!.textContent).toContain("3.5 / 5");
  expect(screen.getByText("2 readings")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /View values/ }));
  const values = screen.getByRole("button", { name: /View values/ }).nextElementSibling!;
  expect(
    within(values as HTMLElement)
      .getAllByRole("listitem")
      .map((row) => row.lastElementChild!.textContent),
  ).toEqual(["5 / 5", "2 / 5"]);
  expect(screen.getAllByRole("link")[0]!.getAttribute("href")).toBe("/workouts/last");
});

it("keeps zero hours and decimal sleep answers exact", () => {
  render(
    <RecoveryProgress
      readings={[reading({ sleepHours: 7.25 }), reading({ id: "zero", sleepHours: 0 })]}
      selected="sleepHours"
      onSelect={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /View values/ }));
  const list = screen.getByRole("button", { name: /View values/ }).nextElementSibling!;
  expect(
    within(list as HTMLElement)
      .getAllByRole("listitem")
      .map((row) => row.lastElementChild!.textContent),
  ).toEqual(["0 h", "7.25 h"]);
});

it("explains an empty range without inventing scores", () => {
  render(<RecoveryProgress readings={[]} selected="fatigue" onSelect={() => {}} />);
  expect(screen.getByText("No check-ins in this range")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to Today" }).getAttribute("href")).toBe("/today");
  expect(screen.queryByRole("img")).toBeNull();
});
