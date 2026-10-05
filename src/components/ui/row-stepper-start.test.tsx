// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { RowStepper } from "./row-stepper";

afterEach(cleanup);

const hours = (start?: number | null) =>
  render(
    <RowStepper
      label="Hours last night"
      name="sleepHours"
      unit="h"
      start={start}
      step={0.5}
      max={24}
      less="Half an hour less"
      more="Half an hour more"
    />,
  );

const figure = () =>
  (screen.getByRole("textbox", { name: "Hours last night" }) as HTMLInputElement).value;

it("starts a blank from the last answer, so a usual night is one tap away", () => {
  hours(7.5);
  expect(figure()).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Half an hour more" }));
  expect(figure()).toBe("7.5");
  fireEvent.click(screen.getByRole("button", { name: "Half an hour more" }));
  expect(figure()).toBe("8");
});

it("goes a step under the last answer on −, from a blank", () => {
  hours(7.5);
  fireEvent.click(screen.getByRole("button", { name: "Half an hour less" }));
  expect(figure()).toBe("7");
});

it("steps from nothing as before when there is no last answer", () => {
  hours(null);
  expect(
    (screen.getByRole("button", { name: "Half an hour less" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Half an hour more" }));
  expect(figure()).toBe("0.5");
});
