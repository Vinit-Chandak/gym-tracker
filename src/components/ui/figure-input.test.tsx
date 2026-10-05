// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";

import { FigureInput } from "./figure-input";

afterEach(cleanup);

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <FigureInput
      aria-label="Reps"
      inputMode="numeric"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

/** A key as the browser sends it: the field as it would read, and what was typed. */
const key = (input: HTMLElement, value: string, data: string | null, inputType = "insertText") =>
  fireEvent.input(input, { target: { value }, data, inputType });

it("replaces the figure with the first key, wherever the caret stood", () => {
  render(<Field initial="12" />);
  const input = screen.getByRole("textbox", { name: "Reps" }) as HTMLInputElement;
  fireEvent.focus(input);
  expect(input.hasAttribute("data-replacing")).toBe(true);
  // iOS can leave the caret after the figure, so the browser's own reading is "125".
  key(input, "125", "5");
  expect(input.value).toBe("5");
  expect(input.hasAttribute("data-replacing")).toBe(false);
  // After the first key, keys edit what was typed.
  key(input, "50", "0");
  expect(input.value).toBe("50");
});

it("clears the figure with a delete, and selects nothing when there is nothing to replace", () => {
  render(<Field initial="60" />);
  const input = screen.getByRole("textbox", { name: "Reps" }) as HTMLInputElement;
  fireEvent.focus(input);
  key(input, "6", null, "deleteContentBackward");
  expect(input.value).toBe("");
  fireEvent.blur(input);
  fireEvent.focus(input);
  expect(input.hasAttribute("data-replacing")).toBe(false);
});

it("stops replacing when the field is left untouched", () => {
  render(<Field initial="8" />);
  const input = screen.getByRole("textbox", { name: "Reps" }) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(input.hasAttribute("data-replacing")).toBe(false);
  expect(input.value).toBe("8");
});
