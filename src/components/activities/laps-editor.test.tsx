// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";

import type { PlannedLap, PostedLap } from "@/lib/run-laps";

import { LapsEditor, lapRowsFrom } from "./laps-editor";

afterEach(cleanup);

const planned: PlannedLap[] = [
  { phase: "warmup", asked: { distanceValue: 2, distanceUnit: "km" } },
  { phase: "work", asked: { distanceValue: 800, distanceUnit: "m" } },
  { phase: "recovery", asked: { durationMs: 120_000 } },
];

/** The editor as the run form holds it: its rows in the form's state. */
function Laps({
  initial,
  plan = [],
  errors,
  submitted,
}: {
  initial?: string;
  plan?: PlannedLap[];
  errors?: Record<string, string>;
  submitted?: string[];
}) {
  const [rows, setRows] = useState(() => lapRowsFrom(initial));
  return (
    <form>
      <LapsEditor
        rows={rows}
        onRowsChange={setRows}
        planned={plan}
        readIn="km"
        errors={errors}
        submitted={submitted ?? rows.map((row) => row.key)}
      />
    </form>
  );
}

function posted(container: HTMLElement): PostedLap[] {
  const input = container.querySelector<HTMLInputElement>('input[name="laps"]')!;
  return input.value ? (JSON.parse(input.value) as PostedLap[]) : [];
}

const lap = (index: number) => within(screen.getAllByRole("listitem")[index]!);

it("lays out the plan's laps empty, and fills in the plan's figures only when asked", () => {
  const { container } = render(<Laps plan={planned} />);
  fireEvent.click(screen.getByText("Laps and intervals"));
  fireEvent.click(screen.getByRole("button", { name: "Lay out the plan’s 3 laps" }));

  // What the plan asked shows in the fields, and is not what happened.
  expect(screen.getAllByLabelText("Distance")[1]).toHaveProperty("placeholder", "800");
  expect(posted(container).map((entry) => [entry.distanceValue, entry.durationMs])).toEqual([
    [null, null],
    [null, null],
    [null, null],
  ]);

  fireEvent.change(screen.getAllByLabelText("Distance")[0]!, { target: { value: "2.1" } });
  fireEvent.click(screen.getByRole("button", { name: "Fill in the planned distances and times" }));
  // A figure the athlete typed stays theirs; the rest take the plan's, each in its own measure.
  expect(
    posted(container).map((entry) => [entry.distanceValue, entry.distanceUnit, entry.durationMs]),
  ).toEqual([
    [2.1, "km", null],
    [800, "m", null],
    [null, "m", 120_000],
  ]);
  expect(
    screen.queryByRole("button", { name: "Fill in the planned distances and times" }),
  ).toBeNull();
});

it("gives every lap a kind: a rep copies the last rep's distance, a recovery the last rest", () => {
  const { container } = render(<Laps />);
  fireEvent.click(screen.getByText("Laps and intervals"));
  fireEvent.click(screen.getByRole("button", { name: "+ Rep" }));
  fireEvent.change(lap(0).getByLabelText("Distance"), { target: { value: "0.47" } });
  fireEvent.change(lap(0).getByLabelText("Unit"), { target: { value: "km" } });
  fireEvent.change(lap(0).getByLabelText("Time"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Recovery" }));
  fireEvent.change(lap(1).getByLabelText("Time"), { target: { value: "130" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Rep" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Recovery" }));

  expect(
    posted(container).map((entry) => [
      entry.phase,
      entry.distanceValue,
      entry.distanceUnit,
      entry.durationMs,
    ]),
  ).toEqual([
    ["work", 0.47, "km", 120_000],
    ["recovery", null, "km", 90_000],
    // The rep's distance is the last rep's; its time is its own, still to be typed.
    ["work", 0.47, "km", null],
    // The rest is the last rest's time, and a standing rest has no distance.
    ["recovery", null, "km", 90_000],
  ]);
  // Kinds are said as a session's parts are, and a rest with no distance reads Standing.
  expect((lap(2).getByLabelText("Lap 3 kind") as HTMLSelectElement).selectedOptions[0]!.text).toBe(
    "Rep",
  );
  expect(lap(1).getByLabelText("Distance")).toHaveProperty("placeholder", "Standing");
  expect(
    [...(lap(0).getByLabelText("Lap 1 kind") as HTMLSelectElement).options].map(
      (option) => option.text,
    ),
  ).toEqual(["Warm-up", "Rep", "Recovery", "Cool-down"]);
});

it("keeps a lap from before laps had a kind as a Lap until it is given one", () => {
  render(
    <Laps
      initial={JSON.stringify([
        {
          phase: null,
          distanceValue: 1,
          distanceUnit: "km",
          durationMs: 300_000,
          averageHeartRate: null,
          maxHeartRate: null,
        },
      ])}
    />,
  );
  const kind = lap(0).getByLabelText("Lap 1 kind") as HTMLSelectElement;
  expect(kind.selectedOptions[0]!.text).toBe("Lap");
  fireEvent.change(kind, { target: { value: "warmup" } });
  expect([...kind.options].map((option) => option.text)).not.toContain("Lap");
});

it("says a refused lap's problem at that lap, on the fields at fault", () => {
  const laps = JSON.stringify([
    { phase: "work", distanceValue: 400, distanceUnit: "m", durationMs: 90_000 },
    { phase: "recovery", distanceValue: null, distanceUnit: "m", durationMs: null },
  ]);
  render(<Laps initial={laps} errors={{ "laps.1": "Give lap 2 a distance, a time or both." }} />);
  expect(lap(1).getByRole("alert").textContent).toBe("Give lap 2 a distance, a time or both.");
  expect(lap(1).getByLabelText("Distance").getAttribute("aria-invalid")).toBe("true");
  expect(lap(1).getByLabelText("Time").getAttribute("aria-invalid")).toBe("true");
  expect(lap(0).queryByRole("alert")).toBeNull();
  expect(lap(0).getByLabelText("Time").getAttribute("aria-invalid")).toBeNull();
});
