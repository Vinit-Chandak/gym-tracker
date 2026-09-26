// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { SetTable } from "./set-table";

afterEach(cleanup);
const base = {
  setIndex: 1,
  setType: "working" as const,
  weight: 20,
  unit: "kg" as const,
  reps: 8,
  rir: 2,
  rpe: 7,
  durationSeconds: null,
  distanceMeters: null,
};

it("shows RIR for repetitions without substituting an RPE value", () => {
  render(<SetTable sets={[base]} unitLabel="kg" />);
  expect(screen.getByRole("columnheader", { name: "RIR" })).toBeTruthy();
  expect(
    within(screen.getAllByRole("row")[1]!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["20", "8", "2"]);
});

it.each([
  { measure: "durationSeconds", amount: 45, heading: "Seconds" },
  { measure: "distanceMeters", amount: 40, heading: "Metres" },
])("shows recorded RPE for $heading", ({ measure, amount, heading }) => {
  render(
    <SetTable sets={[{ ...base, reps: null, rir: null, [measure]: amount }]} unitLabel="kg" />,
  );
  expect(screen.getByRole("columnheader", { name: "RPE" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
  expect(
    within(screen.getAllByRole("row")[1]!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["20", String(amount), "7"]);
});

it("keeps each result and effort unit when historical sets use different measurements", () => {
  render(
    <SetTable
      sets={[
        base,
        { ...base, setIndex: 2, reps: null, rir: null, durationSeconds: 45 },
        { ...base, setIndex: 3, reps: null, rir: null, distanceMeters: 40, rpe: null },
      ]}
      unitLabel="kg"
    />,
  );
  expect(screen.getByRole("columnheader", { name: "Result" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Effort" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "8 reps" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "45 seconds" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "40 metres" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "2 RIR" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "7 RPE" })).toBeTruthy();
  expect(within(screen.getAllByRole("row")[3]!).getAllByRole("cell")[2]!.textContent).toBe("—");
});
