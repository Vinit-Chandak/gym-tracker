// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { listItem } from "@/components/exercise-picker.test-data";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";

import { PickExerciseForm } from "./add-exercise-form";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

afterEach(cleanup);

/* Choose a fallback (Substitute): one exercise, its machine, and Remember. */

const EXERCISES = [
  listItem("press", "Machine chest press"),
  listItem("legpress", "Leg press", { primaryMuscles: ["quads"], movementPattern: "squat" }),
  listItem("pushup", "Push-up", { modality: "bodyweight", requiresEquipment: false }),
  listItem("rollout", "Ab wheel rollout", { modality: "bodyweight", primaryMuscles: ["abs"] }),
];

/** What a glyph draws, to tell one machine's from another's. */
const drawing = (name: GlyphName) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<Glyph name={name} />);
  return host.querySelector("svg")!.innerHTML;
};
/** The glyph beside a pinned "On …". */
const pinned = (text: string) =>
  screen.getByText(text).closest(".pinned-fact")!.querySelector("svg")!.innerHTML;
const machine = (
  id: string,
  name: string,
  typeSlug: string,
  typeCategory: "machine" | "accessory" = "machine",
) =>
  ({
    id,
    name,
    typeSlug,
    typeCategory,
    resistanceMode: typeCategory === "machine" ? "selectorized" : "bodyweight",
  }) as const;
const MACHINES = [
  machine("m-press", "Chest press", "chest_press_machine"),
  machine("m-45", "45° leg press", "leg_press_45"),
  machine("m-flat", "Horizontal leg press", "leg_press_horizontal"),
  machine("m-wheel", "Ab wheel", "ab_wheel", "accessory"),
];

function renderForm(action = vi.fn(async (..._args: [unknown, FormData]) => ({}))) {
  render(
    <PickExerciseForm
      action={action}
      exercises={EXERCISES}
      machines={MACHINES}
      machinesByExercise={{
        press: ["m-press"],
        legpress: ["m-45", "m-flat"],
        rollout: ["m-wheel"],
      }}
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
    name: "Remember for this gym",
  }) as HTMLInputElement;
  expect(remember.checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use this instead" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const data = action.mock.calls[0]![1];
  expect(data.get("exerciseId")).toBe("press");
  expect(data.get("equipmentInstanceId")).toBe("m-press");
  expect(data.get("remember")).toBe("on");
});

it("draws the one machine as what it is: the ab wheel as itself, a machine as its stack", () => {
  renderForm();
  fireEvent.click(screen.getByRole("radio", { name: /Ab wheel rollout/ }));
  // Every machine named here was drawn as a weight stack, an ab wheel and a bench included.
  expect(pinned("On Ab wheel")).toBe(drawing("abWheel"));
  fireEvent.click(screen.getByRole("radio", { name: /Machine chest press/ }));
  expect(pinned("On Chest press")).toBe(drawing("machine"));
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

it("does not offer to remember going back to the planned lift as its fallback", () => {
  render(
    <PickExerciseForm
      action={vi.fn(async () => ({}))}
      exercises={EXERCISES}
      machines={MACHINES}
      machinesByExercise={{ press: ["m-press"], legpress: ["m-45", "m-flat"] }}
      submitLabel="Use this instead"
      remember
      plannedExerciseId="legpress"
      long
    />,
  );
  const remember = () => screen.queryByRole("checkbox", { name: "Remember for this gym" });
  fireEvent.click(screen.getByRole("radio", { name: /Leg press/ }));
  expect(remember()).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: /Machine chest press/ }));
  expect(remember()).not.toBeNull();
});

it("still sends the chosen exercise when a later search hides it", async () => {
  const action = renderForm();
  fireEvent.click(screen.getByRole("radio", { name: /Machine chest press/ }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
    target: { value: "leg" },
  });
  expect(screen.queryByRole("radio", { name: /Machine chest press/ })).toBeNull();
  expect(screen.getByText("Machine chest press")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Use this instead" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(action.mock.calls[0]![1].getAll("exerciseId")).toEqual(["press"]);
});
