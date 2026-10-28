// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RowStepper } from "./row-stepper";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const computed = window.getComputedStyle;

/**
 * A swim's distance in a column laid out as at 1440 and 100% text: 135 pt wide, yd's target 48
 * of it with a 3-pt gap, and a 26 drawn at `drawn` px, as the column's own size says.
 */
function distance(value: string, drawn: number) {
  cleanup();
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
    element.classList.contains("row-stepper-figure")
      ? ({ columnGap: "3px", fontSize: `${drawn}px` } as CSSStyleDeclaration)
      : computed(element, pseudo),
  );
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
    return this.classList.contains("row-stepper-figure") ? 135 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("row-stepper-unit") ? 48 : 0;
  });
  render(
    <RowStepper
      label="Distance"
      defaultValue={value}
      unit="yd"
      step={25}
      max={100_000}
      less="25 yards less"
      more="25 yards more"
    />,
  );
  return (screen.getByRole("textbox", { name: "Distance" }) as HTMLInputElement).style.fontSize;
}

it("fits the figure against the size a 26 is drawn at here, not against 26", () => {
  // At 29 px, 10000 is 91 of the 84 beside yd: it steps to the 20, drawn as the ramp's token so
  // it keeps the wide screen's growth.
  expect(distance("10000", 29)).toBe("var(--ov-type-figure)");
});

it("keeps the 26 where the figure fits beside its unit", () => {
  expect(distance("1640", 29)).toBe("");
  expect(distance("1640", 26)).toBe("");
});
