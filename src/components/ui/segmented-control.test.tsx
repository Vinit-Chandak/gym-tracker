// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { SegmentedControl } from "./segmented-control";

afterEach(cleanup);

const RATING = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
];

it("lets an optional rating be taken back by pressing it again", () => {
  const { container } = render(
    <form>
      <SegmentedControl name="rpe" aria-label="RPE" options={RATING} clearable />
    </form>,
  );
  const two = screen.getByRole("radio", { name: "2" }) as HTMLInputElement;
  fireEvent.click(two);
  expect(two.checked).toBe(true);
  expect(new FormData(container.querySelector("form")!).get("rpe")).toBe("2");

  // A radio cannot uncheck itself, so a rating given by mistake would stay given.
  fireEvent.click(two);
  expect(two.checked).toBe(false);
  expect(new FormData(container.querySelector("form")!).get("rpe")).toBeNull();
});

it("never lets a label wrap inside itself, and folds the tray evenly instead", () => {
  const { container } = render(
    <SegmentedControl
      name="period"
      aria-label="Period"
      columns={4}
      options={[
        { value: "7d", label: "7 days" },
        { value: "30d", label: "30 days" },
        { value: "90d", label: "90 days" },
        { value: "1y", label: "1 year" },
      ]}
    />,
  );
  const tray = screen.getByRole("radiogroup", { name: "Period" });
  // Each label's one-line copy is what its segment cannot be narrower than.
  expect(
    [...tray.querySelectorAll(".segment-label")].map((label) => label.getAttribute("data-label")),
  ).toEqual(["7 days", "30 days", "90 days", "1 year"]);
  // What each needs on a row, its label on one line, decides where the tray folds.
  expect(tray.style.getPropertyValue("--fold-w1")).toMatch(/^max\(var\(--ov-target\), 3\.\d+em/);
  expect(tray.style.getPropertyValue("--fold-r2")).toContain("var(--fold-w0)");
  // A break stands between each two segments, unseen and unheard.
  const breaks = container.querySelectorAll(".fold-break");
  expect(breaks).toHaveLength(3);
  for (const fold of breaks) expect(fold.getAttribute("aria-hidden")).toBe("true");
  expect(screen.getAllByRole("radio")).toHaveLength(4);
});

it("leaves an ordinary group alone", () => {
  render(<SegmentedControl name="mode" aria-label="Mode" options={RATING} defaultValue="1" />);
  const one = screen.getByRole("radio", { name: "1" }) as HTMLInputElement;
  expect(one.checked).toBe(true);
  fireEvent.click(one);
  expect(one.checked).toBe(true);
});
