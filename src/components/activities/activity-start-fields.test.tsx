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
  fireEvent.change(screen.getByLabelText(/^When/), { target: { value: "2025-11-02T01:30" } });
  // The label asks the question, naming the time; no sentence under it explains the clocks.
  const select = screen.getByRole("combobox", {
    name: /^01:30 happens twice here\. Which one\?/,
  }) as HTMLSelectElement;
  expect(select.tagName).toBe("SELECT");
  expect(select.required).toBe(true);
  expect(select.value).toBe("");
  expect(screen.getByRole("option", { name: "The first (UTC−04:00)" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "The second (UTC−05:00)" })).toBeTruthy();
  fireEvent.change(select, { target: { value: "-300" } });
  expect(new FormData(select.form!).get("startedAtOffsetMinutes")).toBe("-300");
  fireEvent.change(screen.getByLabelText(/^When/), { target: { value: "2025-11-02T03:00" } });
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(new FormData(document.querySelector("form")!).get("startedAtOffsetMinutes")).toBe("");
});

it("preselects a saved activity's actual offset but asks again after the date is changed", () => {
  show({
    startedAt: "2025-11-02T01:30",
    recordedTimeZone: "America/New_York",
    startedAtOffsetMinutes: "-300",
  });
  expect(screen.getByRole("combobox", { name: /happens twice here/ })).toHaveProperty(
    "value",
    "-300",
  );
  fireEvent.change(screen.getByLabelText(/^When/), { target: { value: "2025-11-02T01:45" } });
  expect(screen.getByRole("combobox", { name: /^01:45 happens twice here/ })).toHaveProperty(
    "value",
    "",
  );
});

it("requires the actual start time for a chosen previous date and posts both parts together", () => {
  show({
    entryDate: "2026-10-15",
    entryTime: "",
    latestDate: "2026-10-16",
    recordedTimeZone: "Asia/Kolkata",
  });
  const time = screen.getByLabelText(/^Start time/) as HTMLInputElement;
  expect(time.value).toBe("");
  expect(time.required).toBe(true);
  fireEvent.change(time, { target: { value: "08:30" } });
  expect(new FormData(time.form!).get("startedAt")).toBe("2026-10-15T08:30");
  fireEvent.change(screen.getByLabelText("Training date"), { target: { value: "2026-10-14" } });
  expect(new FormData(time.form!).get("startedAt")).toBe("2026-10-14T08:30");
});

/** The time zone a time is read in is its unit: in view at the label's end while it is typed. */
it("says the time zone at the end of the time's label", () => {
  show({ entryDate: "2026-10-15", entryTime: "", recordedTimeZone: "Asia/Kolkata" });
  const label = screen.getByText("Start time").closest("div")!;
  expect(label.textContent).toContain("Asia/Kolkata");
  expect(screen.queryByText(/When you actually trained/)).toBeNull();
});
