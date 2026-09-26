// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScheduleForm } from "./schedule-form";
import { PrescriptionEditor } from "./prescription-editor";
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
afterEach(cleanup);
const sports = ["running", "cycling", "swimming"] as const;

it("offers only matching templates and drops the old revision when switching sport", () => {
  const { container } = render(
    <ScheduleForm
      action={async () => ({})}
      sport="running"
      sports={sports}
      today="2026-09-22"
      templates={[
        {
          id: "run",
          revisionId: "run-v1",
          sport: "running",
          name: "Easy run",
          summary: "30 minutes",
        },
        {
          id: "swim",
          revisionId: "swim-v1",
          sport: "swimming",
          name: "Pool lengths",
          summary: "1000 m",
        },
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText("Template", { exact: true }), {
    target: { value: "run" },
  });
  expect((container.querySelector('[name="templateRevisionId"]') as HTMLInputElement).value).toBe(
    "run-v1",
  );
  fireEvent.click(screen.getByRole("radio", { name: "Swimming" }));
  expect(screen.queryByRole("option", { name: /Easy run/ })).toBeNull();
  expect(screen.getByRole("option", { name: /Pool lengths/ })).toBeTruthy();
  expect((container.querySelector('[name="templateRevisionId"]') as HTMLInputElement).value).toBe(
    "",
  );
});

it("switches both template distance controls into swimming units", () => {
  render(
    <PrescriptionEditor
      action={async () => ({})}
      sport="running"
      sports={sports}
      initial={{ stepTargetKind: "distance", distanceUnit: "mi", stepDistanceUnit: "mi" }}
      submitLabel="Save template"
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Swimming" }));
  expect(screen.queryByRole("radio", { name: "mi" })).toBeNull();
  const groups = screen
    .getAllByRole("radiogroup", { hidden: true })
    .filter((group) =>
      ["Distance unit", "Repetition unit"].includes(group.getAttribute("aria-label") ?? ""),
    );
  expect(groups).toHaveLength(2);
  for (const group of groups)
    expect(group.querySelector("input:checked")?.getAttribute("value")).toBe("m");
});
