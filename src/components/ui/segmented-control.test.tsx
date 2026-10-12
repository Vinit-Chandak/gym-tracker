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
  // With 0.75rem either side of its words: a column tray folds before its pills lose that.
  expect(tray.style.getPropertyValue("--fold-w1")).toMatch(/em \+ 1\.5rem\)$/);
  expect(tray.style.getPropertyValue("--fold-r2")).toContain("var(--fold-w0)");
  // A break stands between each two segments, unseen and unheard.
  const breaks = container.querySelectorAll(".fold-break");
  expect(breaks).toHaveLength(3);
  for (const fold of breaks) expect(fold.getAttribute("aria-hidden")).toBe("true");
  expect(screen.getAllByRole("radio")).toHaveLength(4);
});

it("folds a scale only under its figures, which keep their fixed target", () => {
  const { container } = render(
    <SegmentedControl
      name="effort"
      aria-label="Effort"
      columns={6}
      scale
      options={[
        ...["1", "2", "3", "4", "5"].map((value) => ({ value, label: value })),
        { value: "unsure", label: "Not sure" },
      ]}
    />,
  );
  const tray = screen.getByRole("radiogroup", { name: "Effort" });
  // A figure needs its 44-pt target, which does not grow with the text, or its Jost digits.
  expect(tray.style.getPropertyValue("--fold-w0")).toMatch(
    /^max\(calc\(44 \* var\(--ov-u\)\), 0\.614 \* var\(--ov-type-figure\)/,
  );
  expect(tray.style.getPropertyValue("--fold-w5")).toMatch(/^max\(var\(--ov-target\)/);
  // Only the break after 5 ever starts a row: no fold falls among the figures.
  const breaks = [...container.querySelectorAll<HTMLElement>(".fold-break")];
  expect(breaks.map((fold) => fold.style.flexBasis === "0px")).toEqual([
    true,
    true,
    true,
    true,
    false,
  ]);
});

it("leaves an ordinary group alone", () => {
  render(<SegmentedControl name="mode" aria-label="Mode" options={RATING} defaultValue="1" />);
  const one = screen.getByRole("radio", { name: "1" }) as HTMLInputElement;
  expect(one.checked).toBe(true);
  fireEvent.click(one);
  expect(one.checked).toBe(true);
});

it("draws its tray off the card it sits in, and never leaves one segment alone", () => {
  render(
    <SegmentedControl
      name="resistanceMode"
      aria-label="Load"
      columns={3}
      options={["Free weight", "Plate-loaded", "Weight stack", "Bodyweight", "Cardio"].map(
        (label) => ({ value: label, label }),
      )}
    />,
  );
  const tray = screen.getByRole("radiogroup", { name: "Load" });
  // The tray token: the surface on the ground, surface 2 in a box (globals.css).
  expect(tray.className).toContain("bg-tray");
  expect(tray.className).not.toMatch(/\bbg-surface\b/);
  // Five, three and two, then one a row: never Cardio alone under two rows of two.
  expect(
    ["--fold-r0", "--fold-r1", "--fold-r2", "--fold-r3"].map(
      (name) => tray.style.getPropertyValue(name) !== "",
    ),
  ).toEqual([true, true, true, false]);
});
