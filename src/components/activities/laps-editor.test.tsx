// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { PlannedLap, PostedLap } from "@/lib/run-laps";

import { LapsEditor } from "./laps-editor";

afterEach(cleanup);

const planned: PlannedLap[] = [
  { phase: "warmup", asked: { distanceValue: 2, distanceUnit: "km" } },
  { phase: "work", asked: { distanceValue: 800, distanceUnit: "m" } },
  { phase: "recovery", asked: { durationMs: 120_000 } },
];

function posted(container: HTMLElement): PostedLap[] {
  const input = container.querySelector<HTMLInputElement>('input[name="laps"]')!;
  return input.value ? (JSON.parse(input.value) as PostedLap[]) : [];
}

it("lays out the plan's laps empty, and fills in the plan's figures only when asked", () => {
  const { container } = render(<LapsEditor initial={undefined} planned={planned} readIn="km" />);
  fireEvent.click(screen.getByText("Laps and intervals"));
  fireEvent.click(screen.getByRole("button", { name: "Lay out the plan’s 3 laps" }));

  // What the plan asked shows in the fields, and is not what happened.
  expect(screen.getAllByLabelText("Distance")[1]).toHaveProperty("placeholder", "800");
  expect(posted(container).map((lap) => [lap.distanceValue, lap.durationMs])).toEqual([
    [null, null],
    [null, null],
    [null, null],
  ]);

  fireEvent.change(screen.getAllByLabelText("Distance")[0]!, { target: { value: "2.1" } });
  fireEvent.click(screen.getByRole("button", { name: "Fill in the planned distances and times" }));
  // A figure the athlete typed stays theirs; the rest take the plan's, each in its own measure.
  expect(
    posted(container).map((lap) => [lap.distanceValue, lap.distanceUnit, lap.durationMs]),
  ).toEqual([
    [2.1, "km", null],
    [800, "m", null],
    [null, "m", 120_000],
  ]);
  expect(
    screen.queryByRole("button", { name: "Fill in the planned distances and times" }),
  ).toBeNull();
});
