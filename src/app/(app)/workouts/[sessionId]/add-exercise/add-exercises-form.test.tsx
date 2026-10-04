// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { listItem } from "@/components/exercise-picker.test-data";
import { OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";

import { AddExercisesForm } from "./add-exercises-form";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

const EXERCISES = [
  listItem("press", "Machine chest press"),
  listItem("legpress", "Leg press", { primaryMuscles: ["quads"], movementPattern: "squat" }),
  listItem("curl", "Leg curl", { primaryMuscles: ["hamstrings"], movementPattern: "hinge" }),
  listItem("pushup", "Push-up", { modality: "bodyweight", requiresEquipment: false }),
  listItem("pulldown", "Lat pulldown", { primaryMuscles: ["lats"], movementPattern: "pull" }),
];

const MACHINES = [
  { id: "m-press", name: "Chest press" },
  { id: "m-45", name: "45° leg press" },
  { id: "m-flat", name: "Horizontal leg press" },
  { id: "m-curl-a", name: "Leg curl by the window" },
  { id: "m-curl-b", name: "Leg curl at the back" },
];

function renderForm(
  action = vi.fn(async (..._args: [unknown, FormData]) => ({})),
  props: Partial<Parameters<typeof AddExercisesForm>[0]> = {},
) {
  render(
    <AddExercisesForm
      action={action}
      exercises={EXERCISES}
      machines={MACHINES}
      machinesByExercise={{
        press: ["m-press"],
        legpress: ["m-45", "m-flat"],
        curl: ["m-curl-a", "m-curl-b"],
      }}
      preferredMachines={{ curl: "m-curl-b" }}
      inWorkout={["pushup"]}
      {...props}
    />,
  );
  return action;
}

const tick = (name: RegExp) => fireEvent.click(screen.getByRole("checkbox", { name }));
const search = (query: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Search exercises" }), {
    target: { value: query },
  });
const sent = (action: ReturnType<typeof vi.fn>, call = 0) => {
  const data = action.mock.calls[call]![1] as FormData;
  return {
    key: data.get("submissionKey"),
    exercises: data.getAll("exerciseId"),
    machines: data.getAll("equipmentInstanceId"),
  };
};

it("adds what was chosen across searches straight away, in that order, naming the machines", async () => {
  const action = renderForm();
  expect(screen.getByRole("button", { name: "Add to session" }).hasAttribute("disabled")).toBe(
    true,
  );
  search("push");
  tick(/Push-up/);
  search("chest");
  tick(/Machine chest press/);
  search("");
  tick(/Leg curl/);
  expect(screen.getByRole("status").textContent).toBe("3 selected");
  fireEvent.click(screen.getByRole("button", { name: "Add 3 exercises" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).toBeNull();
  const { key, exercises, machines } = sent(action);
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(exercises).toEqual(["pushup", "press", "curl"]);
  // Push-up needs none, the press has one machine, the curl keeps the athlete's own choice.
  expect(machines).toEqual(["", "m-press", "m-curl-b"]);
});

it("asks only the machine question there is, then adds from the review", async () => {
  const action = renderForm();
  tick(/Machine chest press/);
  tick(/Leg press/);
  fireEvent.click(screen.getByRole("button", { name: "Add 2 exercises" }));
  const dialog = await screen.findByRole("dialog", { name: "Which machine?" });
  expect(action).not.toHaveBeenCalled();
  expect(within(dialog).queryByText("Machine chest press")).toBeNull();
  const machine = within(dialog).getByRole("combobox", { name: "Machine" });
  expect((machine as HTMLSelectElement).selectedOptions[0]?.textContent).toBe("Machine not chosen");
  fireEvent.change(machine, { target: { value: "m-flat" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add 2 exercises" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(sent(action).machines).toEqual(["m-press", "m-flat"]);
});

it("does not ask again once asked: Add then adds with Machine not chosen", async () => {
  const action = renderForm();
  tick(/Leg press/);
  fireEvent.click(screen.getByRole("button", { name: "Add 1 exercise" }));
  fireEvent.click(await screen.findByRole("button", { name: "Close sheet" }));
  fireEvent.click(screen.getByRole("button", { name: "Add 1 exercise" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(sent(action)).toMatchObject({ exercises: ["legpress"], machines: [""] });
});

it("opens the selection to review and remove, saying what is already in the workout", async () => {
  renderForm();
  tick(/Push-up/);
  tick(/Lat pulldown/);
  fireEvent.click(screen.getByRole("button", { name: "Review 2 selected exercises" }));
  const dialog = await screen.findByRole("dialog", { name: "Selected exercises" });
  expect(within(dialog).getByText("Already in this workout")).toBeTruthy();
  expect(within(dialog).getByText("Machine not chosen")).toBeTruthy();
  expect(within(dialog).getByText("No machine needed")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove Push-up" }));
  expect(within(dialog).queryByText("Push-up")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("1 selected");
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove Lat pulldown" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Add to session" })).toBeTruthy();
});

it("keeps the selection and its key through a lost connection, so a retry adds once", async () => {
  const action = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ formError: "That session no longer exists." });
  renderForm(action);
  tick(/Machine chest press/);
  tick(/Push-up/);
  fireEvent.click(screen.getByRole("button", { name: "Add 2 exercises" }));
  expect(await screen.findByText(OFFLINE_SUBMIT_MESSAGE)).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: /Push-up/ }) as HTMLInputElement).checked).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add 2 exercises" }));
  expect(await screen.findByText("That session no longer exists.")).toBeTruthy();
  expect(sent(action, 1)).toEqual(sent(action, 0));
});

it("holds at twenty, saying why", () => {
  const name = (n: number) => `Move ${String(n).padStart(2, "0")}`;
  const many = Array.from({ length: 21 }, (_, n) => listItem(`e${n}`, name(n + 1)));
  renderForm(undefined, { exercises: many, inWorkout: [] });
  for (let n = 1; n <= 21; n += 1) tick(new RegExp(`^${name(n)}`));
  expect(screen.getByRole("status").textContent).toBe("20 is the most you can add at once.");
  expect((screen.getByRole("checkbox", { name: /^Move 21/ }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect(screen.getByRole("button", { name: "Add 20 exercises" })).toBeTruthy();
});
