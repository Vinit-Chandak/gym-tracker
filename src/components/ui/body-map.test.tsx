// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { emptyMuscleVolume } from "@/domain/muscle-volume";
import { BodyMap } from "./body-map";

afterEach(cleanup);

it("offers native keyboard controls for selecting and clearing a muscle", () => {
  render(<BodyMap volume={{ ...emptyMuscleVolume(), chest: 6 }} totalSets={6} />);
  const table = screen.getByText("Number of sets").closest("details")!;
  expect(table.open).toBe(false);
  fireEvent.click(table.querySelector("summary")!);
  expect(table.open).toBe(true);
  const choice = screen.getByRole("button", { name: "Chest" });
  choice.focus();
  expect(document.activeElement).toBe(choice);
  expect(choice.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(choice);
  expect(choice.getAttribute("aria-pressed")).toBe("true");
  // The week is named over the map, so the muscle's line names none.
  expect(screen.getByRole("status").textContent).toBe("Chest · 6 sets");
  expect(screen.getByRole("rowheader", { name: "Chest" })).toBeTruthy();
  fireEvent.click(choice);
  expect(choice.getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByRole("status")).toBeNull();
});
