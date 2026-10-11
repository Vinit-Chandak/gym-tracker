// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { CompareTable, percentLabel } from "./compare-table";

afterEach(cleanup);

const names: [string, string] = ["Vinit", "Phani"];

it("puts the two people across the top and says the difference from the viewer's side", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "volume",
          label: "Total volume",
          a: { value: 6240, text: "6,240 kg" },
          b: { value: 5200, text: "5,200 kg" },
        },
      ]}
    />,
  );
  const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
  expect(headers).toEqual(["Metric", "You", "Phani"]);
  expect(screen.getByText("+20%").className).toContain("text-success");
  // The leading value is the heavier one.
  expect(screen.getByText("6,240 kg").className).toContain("font-semibold");
  expect(screen.getByText("5,200 kg").className).not.toContain("font-semibold");
});

it("says who leads in words where there is no percentage, and mutes the side that has nothing", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "records",
          label: "Records set",
          a: { value: 3, text: "3" },
          b: { value: null, text: "0" },
        },
        {
          key: "runs",
          label: "Runs",
          a: { value: 0, text: "0" },
          b: { value: 2, text: "2" },
        },
        {
          key: "active_days",
          label: "Active days",
          a: { value: 0, text: "0" },
          b: { value: null, text: "0" },
        },
      ]}
    />,
  );
  const [records, runs, days] = screen.getAllByRole("rowheader");
  // Three records against none: ahead, by no percentage, so said, and never "↑ —".
  expect(records!.textContent).toBe("Records set↑ You lead");
  expect(runs!.textContent).toBe("Runs↓ They lead");
  // Nothing on either side: no leader, so the dash.
  expect(days!.textContent).toBe("Active days—");
  expect(screen.getByText("3").className).toContain("font-semibold");
  expect(screen.getAllByText("0")[0]!.className).toContain("text-ink-muted");
});

it("keeps the leader for a screen reader beside a percentage", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        { key: "w", label: "Workouts", a: { value: 6, text: "6" }, b: { value: 5, text: "5" } },
      ]}
    />,
  );
  expect(screen.getByRole("rowheader").textContent).toBe("Workouts↑ You lead +20%");
});

it("puts the day, the work and the body-weight ratio under a value", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "top_weight",
          label: "Top weight",
          a: { value: 88, text: "88 kg", sub: ["12 reps · 4 sets", "8 Sept 2026", "1.18× BW"] },
          b: { value: 85, text: "85 kg", sub: ["1 Sept 2026"] },
        },
      ]}
    />,
  );
  expect(screen.getByText("12 reps · 4 sets")).toBeTruthy();
  expect(screen.getByText("1.18× BW")).toBeTruthy();
  expect(screen.getByText("+3.5%")).toBeTruthy();
});

it("labels equal and behind without colour, and lets a faster pace lead", () => {
  expect(percentLabel({ leader: null, percent: 0 })).toBe("=");
  expect(percentLabel({ leader: "b", percent: -16.7 })).toBe("−16.7%");
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "workouts",
          label: "Workouts",
          a: { value: 5, text: "5" },
          b: { value: 6, text: "6" },
        },
        {
          key: "best_pace",
          label: "Best pace",
          lowerIsBetter: true,
          a: { value: 330, text: "5:30 /km" },
          b: { value: 360, text: "6:00 /km" },
        },
      ]}
    />,
  );
  expect(screen.getByText("−16.7%").className).toContain("text-ink-muted");
  expect(screen.getByText("−8.3%").className).toContain("text-success");
  expect(screen.getByText("5:30 /km").className).toContain("font-semibold");
});
