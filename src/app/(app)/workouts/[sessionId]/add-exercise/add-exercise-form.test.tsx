// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { listItem } from "@/components/exercise-picker.test-data";

import { PickExerciseForm } from "./add-exercise-form";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

afterEach(cleanup);

/* Choose a fallback (Substitute): one exercise, its machine, and Remember. */

const EXERCISES = [
  listItem("press", "Machine chest press"),
  listItem("legpress", "Leg press", { primaryMuscles: ["quads"], movementPattern: "squat" }),
  listItem("pushup", "Push-up", { modality: "bodyweight", requiresEquipment: false }),
];
const MACHINES = [
  { id: "m-press", name: "Chest press" },
  { id: "m-45", name: "45° leg press" },
  { id: "m-flat", name: "Horizontal leg press" },
];

function renderForm(action = vi.fn(async (..._args: [unknown, FormData]) => ({}))) {
  render(
    <PickExerciseForm
      action={action}
      exercises={EXERCISES}
      machines={MACHINES}
      machinesByExercise={{ press: ["m-press"], legpress: ["m-45", "m-flat"] }}
      submitLabel="Use this instead"
      remember
      long
    />,
  );
  return action;
}

it("stays a single choice, with Remember ticked, naming the one machine there is", async () => {
  const action = renderForm();
  expect(screen.queryAllByRole("checkbox", { name: /chest press/i })).toHaveLength(0);
  fireEvent.click(screen.getByRole("radio", { name: /Machine chest press/ }));
  expect(screen.getByText("On Chest press")).toBeTruthy();
  const remember = screen.getByRole("checkbox", {
    name: "Remember this as the fallback at this gym",
  }) as HTMLInputElement;
  expect(remember.checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use this instead" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const data = action.mock.calls[0]![1];
  expect(data.get("exerciseId")).toBe("press");
  expect(data.get("equipmentInstanceId")).toBe("m-press");
  expect(data.get("remember")).toBe("on");
});

it("asks which machine when there are several, never calling a machine exercise not on one", () => {
  renderForm();
  fireEvent.click(screen.getByRole("radio", { name: /Leg press/ }));
  const machine = screen.getByRole("combobox", { name: "Machine" }) as HTMLSelectElement;
  expect([...machine.options].map((option) => option.textContent)).toEqual([
    "Machine not chosen",
    "45° leg press",
    "Horizontal leg press",
  ]);
  fireEvent.click(screen.getByRole("radio", { name: /Push-up/ }));
  expect(screen.getByText("No machine needed.")).toBeTruthy();
});

it("keeps the choice and the machine through a failed save, so a retry sends them again", async () => {
  const action = vi
    .fn()
    .mockResolvedValueOnce({
      formError: "Choose an available machine for this exercise at this gym.",
    })
    .mockResolvedValueOnce({});
  renderForm(action);
  fireEvent.click(screen.getByRole("radio", { name: /Leg press/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "Machine" }), {
    target: { value: "m-flat" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use this instead" }));
  await screen.findByText("Choose an available machine for this exercise at this gym.");
  expect((screen.getByRole("radio", { name: /Leg press/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use this instead" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1]![1].get("exerciseId")).toBe("legpress");
  expect(action.mock.calls[1]![1].get("equipmentInstanceId")).toBe("m-flat");
});
