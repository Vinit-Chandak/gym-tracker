// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
