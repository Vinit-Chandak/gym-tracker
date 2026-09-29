// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { emptyMuscleVolume } from "@/domain/muscle-volume";
import { BodyMap } from "./body-map";

afterEach(cleanup);

it("offers native keyboard controls for selecting and clearing a muscle", () => {
  render(<BodyMap volume={{ ...emptyMuscleVolume(), chest: 6 }} totalSets={6} />);
  const choice = screen.getByRole("button", { name: "Chest" });
  choice.focus();
  expect(document.activeElement).toBe(choice);
  expect(choice.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(choice);
  expect(choice.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("status").textContent).toContain("Chest · 6 sets this week");
  expect(screen.getByRole("rowheader", { name: "Chest" })).toBeTruthy();
  fireEvent.click(choice);
  expect(choice.getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByRole("status")).toBeNull();
});
