// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";

import { emWidth } from "@/components/ui/fit";
import { INPUT_CLASS } from "@/components/ui/input";

import type { EntryField } from "./entry";
import { SetEditSheet, WhySheet } from "./logger-sheets";
import type { RowState } from "./use-set-rows";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

it("explains the suggestion and stops there: History is the tab behind it", () => {
  render(
    <WhySheet
      open
      onClose={() => {}}
      why={{
        tag: "Coach plan",
        figures: { load: "60", unit: "kg", count: "6", effort: "2" },
        reason: null,
        advice: null,
        basis: "Based on this exercise, 26 Sep.",
        coachNote: "Same load and reps as 26 Sep.",
        warning: null,
      }}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: "Why this suggestion", hidden: true });
  expect(sheet.textContent).toContain("Same load and reps as 26 Sep.");
  expect(sheet.textContent).toContain("Based on this exercise, 26 Sep.");
  expect(screen.queryByRole("button", { name: "History", hidden: true })).toBeNull();
});

const field = (patch: Partial<EntryField>): EntryField => ({
  field: "weight",
  unit: "kg",
  hint: null,
  foldHint: null,
  inputLabel: "Load in kilograms",
  inputMode: "decimal",
  max: 2000,
  min: 0,
  step: 2.5,
  less: "Less load",
  more: "More load",
  name: (value) => value,
  target: null,
  info: null,
  ...patch,
});

const row: RowState = {
  setIndex: 2,
  setType: "working",
  weight: "102.5",
  reps: "5",
  rir: "2",
  rpe: "",
  duration: "",
  distance: "1500",
  touched: new Set(["weight", "reps", "rir"]),
  logged: null,
  saving: false,
  error: null,
  dirty: false,
};

it("shows a set's figures whole, in the figure size, however wide they are", () => {
  render(
    <SetEditSheet
      row={row}
      title="Set 2"
      fields={[
        field({}),
        field({ field: "distance", unit: "m", inputLabel: "Metres", max: 100_000 }),
      ]}
      onUpdate={() => {}}
      onDelete={() => {}}
      onDiscard={() => {}}
      onClose={() => {}}
    />,
  );
  for (const [name, value] of [
    ["Load in kilograms", "102.5"],
    ["Metres", "1500"],
  ] as const) {
    const input = screen.getByRole("textbox", { name, hidden: true }) as HTMLInputElement;
    expect(input.value).toBe(value);
    // As wide as the figure it holds, in ems of its own size, so no digit is cut off.
    expect(parseFloat(input.style.width)).toBeGreaterThan(emWidth(value));
    expect(input.style.width.endsWith("em")).toBe(true);
    // A figure field, never a form field whose own text size wins over the figure's.
    expect(input.classList.contains("figure-input")).toBe(true);
    for (const token of INPUT_CLASS.split(" ")) expect(input.classList.contains(token)).toBe(false);
  }
});

it("opens Undo's sheet on a working set, ready to update, without touching the set", () => {
  const updates: RowState[] = [];
  const warm = { ...row, setType: "warmup" as const, rir: "" };
  render(
    <SetEditSheet
      row={warm}
      initialType="working"
      title="Set 1"
      fields={[field({})]}
      onUpdate={(next) => updates.push(next)}
      onDelete={() => {}}
      onDiscard={() => {}}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Type", hidden: true })).toHaveProperty(
    "value",
    "working",
  );
  const update = screen.getByRole("button", { name: "Update", hidden: true }) as HTMLButtonElement;
  expect(update.disabled).toBe(false);
  update.click();
  expect(updates[0]).toMatchObject({ setType: "working", typeChosen: true, autoWarmup: false });
});
