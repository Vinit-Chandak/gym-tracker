// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { deleteSavedMealAction, logSavedMealAction } from "@/server/actions/nutrition";

import { StarredMeals } from "./starred-meals";

vi.mock("@/server/actions/nutrition", () => ({
  logSavedMealAction: vi.fn(),
  deleteSavedMealAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const MEALS = [
  { id: "00000000-0000-4000-8000-0000000000f1", name: "Protein shake", kcal: 280 },
  { id: "00000000-0000-4000-8000-0000000000f2", name: "Oats and milk", kcal: 463.5 },
];

it("adds a starred meal to today in one tap", async () => {
  vi.mocked(logSavedMealAction).mockResolvedValue({ ok: true });
  render(<StarredMeals meals={MEALS} />);
  fireEvent.click(screen.getByRole("button", { name: "Protein shake 280 kcal" }));
  await waitFor(() => expect(screen.getByText("Protein shake added to today.")).toBeTruthy());
  expect(logSavedMealAction).toHaveBeenCalledWith(MEALS[0]!.id);
  expect(deleteSavedMealAction).not.toHaveBeenCalled();
});

it("unstars a meal from Edit, and only from Edit", async () => {
  vi.mocked(deleteSavedMealAction).mockResolvedValue({ ok: true });
  render(<StarredMeals meals={MEALS} />);
  expect(screen.queryByRole("button", { name: /^Unstar/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Unstar Oats and milk" }));
  await waitFor(() => expect(deleteSavedMealAction).toHaveBeenCalledWith(MEALS[1]!.id));
  expect(logSavedMealAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("button", { name: "Oats and milk 464 kcal" })).toBeTruthy();
});

it("says so when a meal could not be added", async () => {
  vi.mocked(logSavedMealAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(<StarredMeals meals={MEALS} />);
  fireEvent.click(screen.getByRole("button", { name: "Protein shake 280 kcal" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Protein shake was not added. Check your connection and try again.",
  );
});
