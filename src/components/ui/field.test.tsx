// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Field, Input } from "./input";
import { SegmentedControl } from "./segmented-control";
import { Select } from "./select";

afterEach(cleanup);

it("keeps the field name stable when validation feedback appears", () => {
  const view = render(
    <Field label="Sleep" hint="Hours">
      <Input />
    </Field>,
  );
  const input = screen.getByRole("textbox", { name: "Sleep" });
  view.rerender(
    <Field label="Sleep" error="Enter a value from 0 to 24.">
      <Input />
    </Field>,
  );
  expect(screen.getByRole("textbox", { name: "Sleep" })).toBe(input);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
    "Enter a value from 0 to 24.",
  );
});

it("labels a select without including its options in the field name", () => {
  render(
    <Field label="Machine">
      <Select>
        <option>Choose one</option>
        <option>Leg press</option>
      </Select>
    </Field>,
  );
  expect(screen.getByLabelText("Machine", { exact: true }).tagName).toBe("SELECT");
});

it("names the rating group and its individual choices without nesting labels", () => {
  const { container } = render(
    <Field group label="Energy">
      <SegmentedControl
        name="energy"
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
        ]}
      />
    </Field>,
  );
  expect(screen.getByRole("radiogroup", { name: "Energy" })).toBeTruthy();
  const radio = screen.getByRole("radio", { name: "2" }) as HTMLInputElement;
  fireEvent.click(radio);
  expect(radio.checked).toBe(true);
  expect(container.querySelector("label label")).toBeNull();
});
