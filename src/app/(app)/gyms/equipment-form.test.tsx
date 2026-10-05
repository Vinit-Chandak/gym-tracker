// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
import { EquipmentForm } from "./equipment-form";

afterEach(cleanup);

it("retains the equipment type and load unit when a form action requests a reset", () => {
  const { container } = render(
    <EquipmentForm
      action={vi.fn(async () => ({}))}
      types={[
        {
          id: "cable",
          slug: "cable-station",
          name: "Cable station",
          category: "cable",
          defaultResistanceMode: "selectorized",
          defaultUnit: "kg",
        },
      ]}
      preferredUnit="kg"
      submitLabel="Add machine"
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Equipment type" }), {
    target: { value: "cable" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Stack #" }));
  const form = container.querySelector("form")!;
  form.reset();
  expect(new FormData(form).get("equipmentTypeId")).toBe("cable");
  expect(new FormData(form).get("unit")).toBe("stack_index");
  expect((screen.getByRole("radio", { name: "Stack #" }) as HTMLInputElement).checked).toBe(true);
});

it("pins its action, and keeps the type and unit chosen through a failed save", async () => {
  const action = vi.fn().mockResolvedValueOnce({ formError: "A machine has that name." });
  render(
    <EquipmentForm
      action={action}
      types={[
        {
          id: "cable",
          slug: "cable-station",
          name: "Cable station",
          category: "cable",
          defaultResistanceMode: "selectorized",
          defaultUnit: "kg",
        },
      ]}
      preferredUnit="kg"
      submitLabel="Add machine"
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Equipment type" }), {
    target: { value: "cable" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Stack #" }));
  const add = screen.getByRole("button", { name: "Add machine" });
  expect(add.closest(".pinned-actions")).not.toBeNull();
  fireEvent.click(add);
  await screen.findByText("A machine has that name.");
  expect(
    (screen.getByRole("combobox", { name: "Equipment type" }) as HTMLSelectElement).value,
  ).toBe("cable");
  expect((screen.getByRole("radio", { name: "Stack #" }) as HTMLInputElement).checked).toBe(true);
});

it("opens on the type a workout asked about, prefilled as choosing it would", () => {
  const { container } = render(
    <EquipmentForm
      action={vi.fn(async () => ({}))}
      types={[
        {
          id: "cable",
          slug: "cable-station",
          name: "Cable station",
          category: "cable",
          defaultResistanceMode: "selectorized",
          defaultUnit: "kg",
        },
        {
          id: "hack",
          slug: "hack_squat",
          name: "Hack squat",
          category: "machine",
          defaultResistanceMode: "plate_loaded",
          defaultUnit: "kg",
        },
      ]}
      startTypeId="hack"
      preferredUnit="lb"
      submitLabel="Add machine"
    />,
  );
  const data = new FormData(container.querySelector("form")!);
  expect(data.get("equipmentTypeId")).toBe("hack");
  expect(data.get("name")).toBe("Hack squat");
  expect(data.get("resistanceMode")).toBe("plate_loaded");
  // The catalogue's kilograms become the account's unit, as choosing the type does.
  expect(data.get("unit")).toBe("lb");
});
