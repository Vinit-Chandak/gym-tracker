// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ActivityStartFields } from "./activity-form-fields";

afterEach(cleanup);

function show(initial: Record<string, string>) {
  return render(
    <form>
      <ActivityStartFields values={(key) => initial[key] ?? ""} />
    </form>,
  );
}

it("uses the native selector only for a repeated time and submits the chosen offset", () => {
  show({ startedAt: "2025-11-02T00:30", recordedTimeZone: "America/New_York" });
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "2025-11-02T01:30" } });
  const select = screen.getByRole("combobox", { name: "Which time?" }) as HTMLSelectElement;
  expect(select.tagName).toBe("SELECT");
  expect(select.required).toBe(true);
  expect(select.value).toBe("");
  expect(screen.getByRole("option", { name: "First occurrence (UTC−04:00)" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Second occurrence (UTC−05:00)" })).toBeTruthy();
  fireEvent.change(select, { target: { value: "-300" } });
  expect(new FormData(select.form!).get("startedAtOffsetMinutes")).toBe("-300");
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "2025-11-02T03:00" } });
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(new FormData(document.querySelector("form")!).get("startedAtOffsetMinutes")).toBe("");
});

it("preselects a saved activity's actual offset but asks again after the date is changed", () => {
  show({
    startedAt: "2025-11-02T01:30",
    recordedTimeZone: "America/New_York",
    startedAtOffsetMinutes: "-300",
  });
  expect(screen.getByRole("combobox", { name: "Which time?" })).toHaveProperty("value", "-300");
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "2025-11-02T01:45" } });
  expect(screen.getByRole("combobox", { name: "Which time?" })).toHaveProperty("value", "");
});
