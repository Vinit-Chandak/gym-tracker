// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { listItem } from "@/components/exercise-picker.test-data";

import { FallbackForm } from "./fallback-form";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

afterEach(cleanup);

const EXERCISES = [
  listItem("press", "Machine chest press"),
  listItem("legpress", "Leg press", { primaryMuscles: ["quads"], movementPattern: "squat" }),
];
const MACHINES = [
  { id: "m-press", name: "Chest press" },
  { id: "m-45", name: "45° leg press" },
  { id: "m-flat", name: "Horizontal leg press" },
];

function renderForm(action = vi.fn(async (..._args: [unknown, FormData]) => ({}))) {
  render(
    <FallbackForm
      action={action}
      exercises={EXERCISES}
      machines={MACHINES}
      compatibleMachines={{ press: ["m-press"], legpress: ["m-45", "m-flat"] }}
    />,
  );
  return action;
}

it("saves one fallback, offering only the machines that can do it", async () => {
  const action = renderForm();
  const save = screen.getByRole("button", { name: "Save fallback" });
  expect(save.hasAttribute("disabled")).toBe(true);
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  fireEvent.click(screen.getByRole("radio", { name: /Leg press/ }));
  const machine = screen.getByRole("combobox", { name: "Machine" }) as HTMLSelectElement;
  expect([...machine.options].map((option) => option.textContent)).toEqual([
    "Any",
    "45° leg press",
    "Horizontal leg press",
  ]);
  fireEvent.change(machine, { target: { value: "m-45" } });
  fireEvent.click(screen.getByRole("button", { name: "Save fallback" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(action.mock.calls[0]![1].get("fallbackExerciseId")).toBe("legpress");
  expect(action.mock.calls[0]![1].get("fallbackEquipmentInstanceId")).toBe("m-45");
});

it("keeps the choice through a failed save", async () => {
  const action = vi.fn().mockResolvedValueOnce({ formError: "Try again." }).mockResolvedValue({});
  renderForm(action);
  fireEvent.click(screen.getByRole("radio", { name: /Machine chest press/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save fallback" }));
  await screen.findByText("Try again.");
  expect(
    (screen.getByRole("radio", { name: /Machine chest press/ }) as HTMLInputElement).checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save fallback" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1]![1].get("fallbackExerciseId")).toBe("press");
});
