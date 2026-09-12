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

it("leaves an ordinary group alone", () => {
  render(<SegmentedControl name="mode" aria-label="Mode" options={RATING} defaultValue="1" />);
  const one = screen.getByRole("radio", { name: "1" }) as HTMLInputElement;
  expect(one.checked).toBe(true);
  fireEvent.click(one);
  expect(one.checked).toBe(true);
});
