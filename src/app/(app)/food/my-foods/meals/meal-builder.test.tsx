// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { deleteSavedMealAction, saveLibraryMealAction } from "@/server/actions/nutrition";
import type { FoodRecord, SavedMealRecord } from "@/server/repositories/nutrition";

import { MealBuilder } from "./meal-builder";

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, unstable_rethrow: () => {} }));
vi.mock("@/server/actions/nutrition", () => ({
  saveLibraryMealAction: vi.fn(),
  deleteSavedMealAction: vi.fn(),
}));

const showModal = HTMLDialogElement.prototype.showModal;
const close = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveLibraryMealAction).mockResolvedValue({ ok: true });
  vi.mocked(deleteSavedMealAction).mockResolvedValue({ ok: true });
});
afterEach(cleanup);

const OATS: FoodRecord = {
  id: "00000000-0000-4000-8000-0000000000f1",
  name: "Oats",
  portionAmount: 100,
  unit: "g",
  kcal: 389,
  carbsG: 66.3,
  fatG: 6.9,
  proteinG: 16.9,
};
const WHEY: FoodRecord = {
  id: "00000000-0000-4000-8000-0000000000f2",
  name: "Whey",
  portionAmount: 1,
  unit: "scoop",
  kcal: 139,
  carbsG: 5.6,
  fatG: 1.8,
  proteinG: 25,
};
const MILK: FoodRecord = {
  id: "00000000-0000-4000-8000-0000000000f3",
  name: "Milk",
  portionAmount: 100,
  unit: "ml",
  kcal: 52,
  carbsG: 5,
  fatG: 2.5,
  proteinG: 3.3,
};
const USUAL: SavedMealRecord = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "Usual breakfast",
  // Saved when oats were 379 kcal: the meal keeps what it saved.
  items: [
    { ...OATS, kcal: 379, foodId: OATS.id, amount: 80 },
    { ...WHEY, foodId: WHEY.id, amount: 1 },
  ],
};

const sheet = () => document.querySelector("dialog")!;
const inSheet = () => within(sheet());
const inMeal = () => within(screen.getByRole("list", { name: "In this meal" }));

it("builds a new meal from My foods, each food at the amount its sheet is given", async () => {
  render(<MealBuilder saved={null} foods={[OATS, WHEY, MILK]} />);
  expect(screen.queryByRole("list", { name: "In this meal" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete meal" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Usual breakfast" } });

  fireEvent.click(screen.getByRole("button", { name: /^Oats 100 g/ }));
  expect(inSheet().getByRole("heading", { name: "Oats" })).toBeTruthy();
  fireEvent.change(inSheet().getByLabelText("Amount"), { target: { value: "80" } });
  fireEvent.click(inSheet().getByRole("button", { name: "Add to meal" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: /^Whey 1 scoop/ }));
  fireEvent.click(inSheet().getByRole("button", { name: "Add to meal" }));

  expect(
    inMeal()
      .getAllByRole("button", { name: /kcal/ })
      .map((row) => row.textContent?.replace(/\s+/g, " ").trim()),
  ).toEqual(["Oats 80 g 311.2 kcal", "Whey 1 scoop 139 kcal"]);
  expect(screen.getByText("450.2")).toBeTruthy();
  expect(screen.getByText("Carbs 59 g · Fat 7 g · Protein 39 g")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/food/my-foods"));
  expect(saveLibraryMealAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    savedMealId: undefined,
    name: "Usual breakfast",
    items: [
      { foodId: OATS.id, amount: "80" },
      { foodId: WHEY.id, amount: "1" },
    ],
  });
});

it("changes a saved meal, keeping the foods it holds as they were saved", async () => {
  render(<MealBuilder saved={USUAL} foods={[OATS, WHEY, MILK]} />);
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Usual breakfast");
  // 80 g of oats saved at 379 kcal per 100 g.
  expect(inMeal().getByRole("button", { name: /^Oats/ }).textContent).toContain("303.2 kcal");

  fireEvent.click(inMeal().getByRole("button", { name: /^Oats/ }));
  fireEvent.change(inSheet().getByLabelText("Amount"), { target: { value: "60" } });
  fireEvent.click(inSheet().getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  fireEvent.click(inMeal().getByRole("button", { name: /^Whey/ }));
  fireEvent.click(inSheet().getByRole("button", { name: "Remove from meal" }));
  fireEvent.click(screen.getByRole("button", { name: /^Milk 100 ml/ }));
  fireEvent.change(inSheet().getByLabelText("Amount"), { target: { value: "250" } });
  fireEvent.click(inSheet().getByRole("button", { name: "Add to meal" }));

  fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
  await waitFor(() => expect(saveLibraryMealAction).toHaveBeenCalledOnce());
  expect(saveLibraryMealAction).toHaveBeenCalledWith({
    submissionKey: undefined,
    savedMealId: USUAL.id,
    name: "Usual breakfast",
    items: [
      { keep: 0, amount: "60" },
      { foodId: MILK.id, amount: "250" },
    ],
  });
});

it("checks an amount before it goes into the meal", () => {
  render(<MealBuilder saved={null} foods={[OATS]} />);
  fireEvent.click(screen.getByRole("button", { name: /^Oats 100 g/ }));
  fireEvent.change(inSheet().getByLabelText("Amount"), { target: { value: "2000" } });
  fireEvent.click(inSheet().getByRole("button", { name: "Add to meal" }));
  // 2,000 g of oats is 1,326 g of carbohydrate.
  expect(inSheet().getByText("That comes to more than 1,000 g of carbs.")).toBeTruthy();
  expect(sheet().open).toBe(true);
});

it("says what stops a meal from being saved, and keeps it when the connection drops", async () => {
  vi.mocked(saveLibraryMealAction).mockResolvedValueOnce({
    ok: false,
    fieldErrors: { name: "Name this meal.", items: "Add a food to this meal." },
  });
  render(<MealBuilder saved={null} foods={[OATS]} />);
  fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
  expect(await screen.findByText("Name this meal.")).toBeTruthy();
  expect(screen.getByText("Add a food to this meal.")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));

  vi.mocked(saveLibraryMealAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
  expect(await screen.findByText(OFFLINE_SUBMIT_MESSAGE)).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
});

it("deletes a saved meal and goes back to My foods", async () => {
  render(<MealBuilder saved={USUAL} foods={[OATS]} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete meal" }));
  await waitFor(() => expect(deleteSavedMealAction).toHaveBeenCalledWith(USUAL.id));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/food/my-foods"));
});

it("says to make a food first when My foods has none", () => {
  render(<MealBuilder saved={null} foods={[]} />);
  expect(screen.getByText("No foods yet. Make one in My foods first.")).toBeTruthy();
  expect(screen.queryByRole("searchbox")).toBeNull();
});
