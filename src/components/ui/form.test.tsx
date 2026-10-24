// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Field, Input } from "./input";
import { FormError, useKeptForm } from "./form";
import { ScaleField } from "./scale-field";
import { SegmentedControl } from "./segmented-control";

afterEach(cleanup);

it("keeps an independent action's refusal separate from the surrounding form's field summary", () => {
  render(
    <form>
      <Field label="Body weight" error="Enter a weight.">
        <Input />
      </Field>
      <FormError />
      <FormError trackFields={false} message="Could not discard the empty session. Retry." />
    </form>,
  );
  expect(screen.getAllByRole("button", { name: "1 to fix: body weight" })).toHaveLength(1);
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.getByText("Could not discard the empty session. Retry.")).toBeTruthy();
});

it("names refused choice groups by their field rather than their first answer", () => {
  render(
    <form>
      <Field group label="Units" error="Choose a unit.">
        <SegmentedControl name="units" options={[{ value: "kg", label: "kg" }]} />
      </Field>
      <ScaleField
        label="Quality"
        name="quality"
        ends={["poor", "great"]}
        error="Choose a rating."
      />
      <FormError />
    </form>,
  );
  expect(screen.getByRole("button", { name: "2 to fix: units, quality" })).toBeTruthy();
});

it("names each refused lap field instead of the first label inside its invalid fold", () => {
  render(
    <form>
      <div data-field-error="true">
        <div className="lap-row">
          <span className="lap-row-number">Lap 1</span>
          <Field label="Distance">
            <Input />
          </Field>
          <Field label="Avg HR">
            <Input aria-invalid />
          </Field>
          <Field label="Max HR">
            <Input aria-invalid />
          </Field>
        </div>
      </div>
      <FormError />
    </form>,
  );
  expect(screen.getByRole("button", { name: "2 to fix: lap 1 avg HR, lap 1 max HR" })).toBeTruthy();
});

it("a pinned error outside its form leads to the refused field and tracks correction", async () => {
  function Example({ error }: { error?: string }) {
    return (
      <>
        <form id="food-editor">
          <Field label="Calories" error={error}>
            <Input defaultValue="-1" />
          </Field>
        </form>
        <FormError formId="food-editor" />
      </>
    );
  }
  const view = render(<Example error="Enter zero or more calories." />);
  fireEvent.click(screen.getByRole("button", { name: "1 to fix: calories" }));
  expect(document.activeElement).toBe(screen.getByLabelText("Calories"));
  view.rerender(<Example />);
  await waitFor(() => expect(screen.queryByRole("button", { name: /to fix/ })).toBeNull());
});

it("a standalone failed action offers retry without dropping the edited form", () => {
  const retry = vi.fn();
  function Example() {
    const ref = useKeptForm();
    return (
      <>
        <form ref={ref} aria-label="Edit">
          <label>
            Place
            <select defaultValue="home">
              <option value="home">Home</option>
              <option value="gym">Gym</option>
            </select>
          </label>
        </form>
        <FormError
          message="Could not save. Try again."
          action={<button onClick={retry}>Retry</button>}
        />
      </>
    );
  }
  render(<Example />);
  const choice = screen.getByLabelText("Place") as HTMLSelectElement;
  fireEvent.change(choice, { target: { value: "gym" } });
  (screen.getByRole("form", { name: "Edit" }) as HTMLFormElement).reset();
  expect(choice.value).toBe("gym");
  expect(screen.getByRole("alert").textContent).toContain("Could not save.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("lets a refused save's bar go after four seconds, the fields keeping their marks, and says it again on the next refused save", () => {
  vi.useFakeTimers();
  try {
    const { container } = render(
      <form>
        <Field label="Body weight" error="Enter a weight.">
          <Input />
        </Field>
        <FormError message="The weight was not saved." />
      </form>,
    );
    expect(screen.getByRole("button", { name: "1 to fix: body weight" })).toBeTruthy();
    expect(screen.getByText("The weight was not saved.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByRole("button", { name: "1 to fix: body weight" })).toBeNull();
    expect(screen.queryByText("The weight was not saved.")).toBeNull();
    expect(screen.getByText("Enter a weight.")).toBeTruthy();
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByRole("button", { name: "1 to fix: body weight" })).toBeTruthy();
    expect(screen.getByText("The weight was not saved.")).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps a failure with its own way out until it is taken", () => {
  vi.useFakeTimers();
  try {
    render(
      <form>
        <FormError message="Could not save." action={<button type="button">Retry</button>} />
      </form>,
    );
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("alert").textContent).toContain("Could not save.");
  } finally {
    vi.useRealTimers();
  }
});
