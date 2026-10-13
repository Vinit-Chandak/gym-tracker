// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { SpeechTextarea } from "./dictation";
import { Field, Input, Textarea } from "./input";
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

it("keeps a field's insets at their points as the text grows, so the room goes to the value", () => {
  // Tailwind's own scale is in rem: px-4 doubled with the text, and "Tokyo Powerhouse" read
  // "Tokyo Powerho…" in its field at 200%. A field's insets are the component scale's points.
  const { container } = render(
    <>
      <Input aria-label="Name" />
      <Textarea aria-label="Notes" />
      <Select aria-label="Goal">
        <option>Get stronger</option>
      </Select>
      <SpeechTextarea label="your brief" value="" onChange={() => {}} />
    </>,
  );
  const fields = [...container.querySelectorAll("input, textarea, select")];
  expect(fields).toHaveLength(4);
  for (const field of fields) {
    expect(field.className).not.toMatch(/(?:^|\s)p[xytrbl]?-\d/);
    expect(field.className).toMatch(/(?:^|\s)p[xl]?-\[calc\(\d+\*var\(--ov-u\)\)\]/);
  }
  expect(screen.getByRole("textbox", { name: "Name" }).className).toContain(
    "px-[calc(16*var(--ov-u))]",
  );
  // The select keeps its words clear of the chevron, which alone grows with the text.
  const chevron = container.querySelector("select + svg")!;
  expect(chevron.getAttribute("class")).not.toMatch(/(?:^|\s)right-\d/);
  expect(screen.getByRole("combobox", { name: "Goal" }).className).toContain(
    "pr-[calc(20*var(--ov-u)+var(--ov-icon-control))]",
  );
});
