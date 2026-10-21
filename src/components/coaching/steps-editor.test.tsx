// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";

import { endurancePrescriptionSchema, type PrescriptionNode } from "@/domain/activity-prescription";
import type { DistanceUnit } from "@/lib/distance-units";

import { StepsEditor } from "./steps-editor";

afterEach(cleanup);

let latest: PrescriptionNode[] = [];

function Harness({
  initial = [],
  unit = "km",
}: {
  initial?: PrescriptionNode[];
  unit?: DistanceUnit;
}) {
  const [nodes, setNodes] = useState(initial);
  return (
    <StepsEditor
      nodes={nodes}
      unit={unit}
      onChange={(next) => {
        latest = next;
        setNodes(next);
      }}
    />
  );
}

/** The step or block whose title this is. */
const box = (title: string) =>
  screen.getByText(title, { selector: ".step-editor-title" }).closest("li")!;
/** A step's own fields, not a nested step's. */
const stepBox = (title: string) =>
  screen.getByText(title, { selector: ".step-editor-title" }).closest<HTMLElement>(".step-editor")!;

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

/** What the session would store, checked by the schema the server holds it to. */
const stored = () =>
  endurancePrescriptionSchema.parse({ prescriptionVersion: 1, sport: "running", nodes: latest })
    .nodes;

it("writes a distance interval session: warm-up, 8 × 800 m with jogs, cool-down", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  fireEvent.click(screen.getByRole("button", { name: "Add repeats" }));
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));

  const block = box("2. Repeat 6 times");
  type(within(block).getByLabelText("Times"), "8");
  const rep = stepBox("Work");
  expect(within(rep).getByLabelText("Metres")).toHaveProperty("value", "800");
  type(within(rep).getByLabelText("Pace per km, m:ss"), "350");
  type(within(rep).getByLabelText("Pace up to, m:ss"), "355");
  fireEvent.change(within(rep).getByLabelText("Zone"), { target: { value: "4" } });
  fireEvent.change(within(rep).getByLabelText("Zone up to"), { target: { value: "5" } });

  expect(screen.getByText("3. Cool-down", { selector: ".step-editor-title" })).toBeTruthy();
  const nodes = stored();
  expect(nodes.map((node) => (node.kind === "step" ? node.phase : "repeat"))).toEqual([
    "warmup",
    "repeat",
    "cooldown",
  ]);
  expect(nodes[1]).toMatchObject({
    kind: "repeat",
    repetitions: 8,
    steps: [
      {
        phase: "work",
        action: "run",
        target: { kind: "distance", metres: [800, 800], unit: "m" },
        paceSecondsPerKm: [230, 235],
        heartRateZones: [4, 5],
      },
      { phase: "recovery", action: "run", target: { kind: "duration", ms: [120000, 120000] } },
    ],
  });
  // The fold names what it holds, and what is set so far stands at the end of its row.
  const fold = rep.querySelector("summary")!;
  expect(fold.textContent).toContain("Pace, zone and note");
  expect(fold.textContent).toContain("3:50–3:55\u00a0/km · Zones 4–5");
});

it("writes timed intervals and walks the recovery, which then has no pace", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add repeats" }));
  const rep = stepBox("Work");
  fireEvent.change(within(rep).getByLabelText("Ends after"), { target: { value: "duration" } });
  type(within(rep).getByLabelText("Time"), "200");
  fireEvent.change(within(rep).getByLabelText("Zone"), { target: { value: "4" } });

  const recovery = stepBox("Recovery");
  type(within(recovery).getByLabelText("Pace per km, m:ss"), "700");
  fireEvent.change(within(recovery).getByLabelText("Doing"), { target: { value: "rest" } });
  expect(within(recovery).queryByLabelText("Pace per km, m:ss")).toBeNull();

  const block = stored()[0];
  expect(block).toMatchObject({
    kind: "repeat",
    steps: [
      { target: { kind: "duration", ms: [120000, 120000] }, heartRateZones: [4, 4] },
      { action: "rest", target: { kind: "duration", ms: [120000, 120000] } },
    ],
  });
  if (block?.kind !== "repeat") throw new Error("The block was not kept");
  expect(block.steps[1]).not.toHaveProperty("paceSecondsPerKm");
});

it("reads a distance in kilometres or miles, and a pace per mile", () => {
  render(<Harness unit="mi" />);
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  const step = stepBox("1. Warm-up");
  fireEvent.change(within(step).getByLabelText("Ends after"), { target: { value: "mi" } });
  type(within(step).getByLabelText("Miles"), "1.5");
  type(within(step).getByLabelText("Pace per mi, m:ss"), "900");
  expect(stored()[0]).toMatchObject({
    target: { kind: "distance", metres: [2414, 2414], unit: "mi" },
    // Nine minutes a mile is 5:35.5 a kilometre, kept to a tenth so it reads back as 9:00.
    paceSecondsPerKm: [335.5, 335.5],
  });
  expect(within(step).getByLabelText("Pace per mi, m:ss")).toHaveProperty("value", "9:00");
});

it("gives back a figure the session cannot hold, and keeps a range low to high", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  const step = stepBox("1. Warm-up");
  type(within(step).getByLabelText("Pace per km, m:ss"), "30");
  expect(within(step).getByLabelText("Pace per km, m:ss")).toHaveProperty("value", "");
  type(within(step).getByLabelText("Time"), "1500");
  type(within(step).getByLabelText("Time up to"), "1000");
  expect(stored()[0]).toMatchObject({ target: { kind: "duration", ms: [600000, 900000] } });
  type(within(step).getByLabelText("Time up to"), "");
  expect(stored()[0]).toMatchObject({ target: { kind: "duration", ms: [600000, 600000] } });
});

it("puts new work before a closing cool-down, and moves and removes steps", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  fireEvent.change(within(stepBox("1. Warm-up")).getByLabelText("Part"), {
    target: { value: "cooldown" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add repeats" }));
  expect(latest.map((node) => node.kind)).toEqual(["repeat", "step"]);

  fireEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
  expect(latest.map((node) => node.kind)).toEqual(["step", "repeat"]);
  fireEvent.click(screen.getByRole("button", { name: "Remove recovery in step 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove step 1" }));
  expect(stored()).toMatchObject([{ kind: "repeat", steps: [{ phase: "work" }] }]);
  expect(screen.queryByRole("button", { name: "Remove work in step 1" })).toBeNull();
});
