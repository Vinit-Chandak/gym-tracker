// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CustomExerciseForm } from "./custom-exercise-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/server/actions/manual-training", () => ({
  createCustomExerciseAction: vi.fn(async () => ({
    ok: false,
    error: "Choose the registered equipment for this exercise.",
  })),
}));
afterEach(cleanup);

it("marks the missing machine and keeps the other choices until the machine is corrected", async () => {
  render(
    <CustomExerciseForm machines={[{ id: "machine", name: "Chest press", gymName: "Gym" }]} />,
  );
  fireEvent.change(screen.getByLabelText("Exercise name"), {
    target: { value: "Slow chest press" },
  });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "strength" } });
  fireEvent.change(screen.getByLabelText("Equipment / movement type"), {
    target: { value: "machine" },
  });
  fireEvent.change(screen.getByLabelText("How is one set measured?"), {
    target: { value: "reps" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save exercise" }));
  await screen.findByText("Choose the registered equipment for this exercise.");
  const machine = screen.getByLabelText("Machine");
  expect(machine.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(screen.getByLabelText("Exercise name"), { target: { value: "Chest press" } });
  expect(machine.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByLabelText("Equipment / movement type")).toHaveProperty("value", "machine");
  fireEvent.change(machine, { target: { value: "machine" } });
  expect(machine.getAttribute("aria-invalid")).not.toBe("true");
});
