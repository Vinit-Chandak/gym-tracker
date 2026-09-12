// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/server/actions/onboarding", () => ({ addStarterEquipmentAction: vi.fn() }));
import { EquipmentStepForm } from "./equipment-step-form";
import type { EquipmentTypeOption } from "@/server/repositories/equipment";
afterEach(cleanup);
const types = [
  { id: "press", name: "Chest press", category: "machine" },
  { id: "row", name: "Seated row", category: "machine" },
  { id: "cable", name: "Cable station", category: "cable" },
  { id: "barbell", name: "Barbell", category: "free_weight" },
] as EquipmentTypeOption[];
it("selects every registerable machine even during a search and clears the selection", () => {
  const { container } = render(<EquipmentStepForm gymId="gym" types={types} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "press" } });
  fireEvent.click(screen.getByRole("button", { name: "Select all machines" }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  expect(new FormData(container.querySelector("form")!).getAll("equipmentTypeIds")).toEqual([
    "press",
    "row",
    "cable",
  ]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Chest press" }));
  expect(new FormData(container.querySelector("form")!).getAll("equipmentTypeIds")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(new FormData(container.querySelector("form")!).getAll("equipmentTypeIds")).toEqual([]);
});
