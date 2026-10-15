// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import {
  createLibraryFoodAction,
  deleteFoodAction,
  deleteSavedMealAction,
  updateFoodAction,
} from "@/server/actions/nutrition";
import type { FoodRecord, SavedMealRecord } from "@/server/repositories/nutrition";

import { MyFoodsView } from "./my-foods-view";

vi.mock("@/server/actions/nutrition", () => ({
  createFoodAction: vi.fn(),
  createLibraryFoodAction: vi.fn(),
  updateFoodAction: vi.fn(),
  deleteFoodAction: vi.fn(),
  deleteSavedMealAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => {},
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
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
  window.history.replaceState(null, "", "/food/my-foods");
  for (const action of [
    createLibraryFoodAction,
    updateFoodAction,
    deleteFoodAction,
    deleteSavedMealAction,
  ]) {
    vi.mocked(action).mockResolvedValue({ ok: true });
  }
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
const USUAL: SavedMealRecord = {
  id: "00000000-0000-4000-8000-0000000000s1",
  name: "Usual breakfast",
  items: [
    { ...OATS, foodId: OATS.id, amount: 80 },
    { ...WHEY, foodId: WHEY.id, amount: 1 },
  ],
};

const sheet = () => document.querySelector("dialog")!;
const inSheet = () => within(sheet());
const type = (label: string, value: string) =>
  fireEvent.change(inSheet().getByLabelText(label), { target: { value } });

function view(library = { foods: [OATS, WHEY], savedMeals: [USUAL] }) {
  return render(<MyFoodsView library={library} />);
}

it("lists meals, then foods, under New food and New meal", () => {
  const { container } = view();
  expect(screen.getByRole("button", { name: "New food" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "New meal" }).getAttribute("href")).toBe(
    "/food/my-foods/meals/new",
  );
  const meal = within(screen.getByRole("list", { name: "Meals" })).getByRole("link");
  // A meal page's row: what it holds, and what that comes to in whole kcal.
  expect(meal.textContent?.replace(/\s+/g, " ").trim()).toBe("Usual breakfast Oats, Whey 450 kcal");
  expect(meal.getAttribute("href")).toBe(`/food/my-foods/meals/${USUAL.id}`);
  expect(
    within(screen.getByRole("list", { name: "Foods" }))
      .getAllByRole("button", { name: /^(Oats|Whey)/ })
      .map((button) => button.textContent?.replace(/\s+/g, " ").trim()),
  ).toEqual(["Oats 100 g 389 kcal", "Whey 1 scoop 139 kcal"]);
  // Every row is led by its tile, as a meal's page's are: a plus, a star, a bowl. Nothing trails
  // a row but what it comes to: the row is the control.
  const rows = container.querySelectorAll(".food-row");
  expect(rows).toHaveLength(5);
  for (const row of rows) expect(row.querySelector(".food-row-glyph")).toBeTruthy();
  expect(container.querySelector(".meal-add, .food-row > svg")).toBeNull();
});

it("keeps a new food without logging it: no amount eaten, and Save food", async () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "New food" }));
  expect(inSheet().getByRole("heading", { name: "New food" })).toBeTruthy();
  expect(inSheet().queryByLabelText("Amount eaten")).toBeNull();
  type("Name", "Paneer");
  type("kcal", "265");
  type("Protein g", "18.3");
  fireEvent.click(inSheet().getByRole("button", { name: "Save food" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(createLibraryFoodAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    name: "Paneer",
    portionAmount: "100",
    unit: "g",
    kcal: "265",
    carbsG: "",
    fatG: "",
    proteinG: "18.3",
  });
  expect(screen.getByText("Paneer saved to My foods.")).toBeTruthy();
});

it("names a new food after a search that finds nothing", () => {
  view();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "whey" } });
  // The meal holds whey, so it is found by what it holds.
  expect(screen.getByRole("link", { name: /^Usual breakfast/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Oats/ })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "granola" } });
  expect(screen.queryByRole("list", { name: "Foods" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New food “granola”" }));
  expect(inSheet().getByLabelText("Name")).toHaveProperty("value", "granola");
});

it("corrects a food from its sheet, or removes it from there", async () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: /^Oats 100 g/ }));
  expect(inSheet().getByRole("heading", { name: "Edit food" })).toBeTruthy();
  type("kcal", "379");
  fireEvent.click(inSheet().getByRole("button", { name: "Save food" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(updateFoodAction).toHaveBeenCalledWith(
    expect.objectContaining({ foodId: OATS.id, kcal: "379" }),
  );

  fireEvent.click(screen.getByRole("button", { name: /^Oats 100 g/ }));
  fireEvent.click(inSheet().getByRole("button", { name: "Remove from My foods" }));
  await waitFor(() => expect(deleteFoodAction).toHaveBeenCalledWith(OATS.id));
});

it("removes a swiped-away food or meal at once, and brings it back if that fails", async () => {
  let fail!: (value: { ok: false; error: string }) => void;
  vi.mocked(deleteFoodAction).mockImplementationOnce(
    () => new Promise((resolve) => (fail = resolve)),
  );
  view();
  fireEvent.click(screen.getByRole("button", { name: "Remove Oats", hidden: true }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /^Oats 100 g/ })).toBeNull());
  await act(async () => fail({ ok: false, error: "That food is no longer in your foods." }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Oats 100 g/ })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Remove Usual breakfast", hidden: true }));
  await waitFor(() => expect(deleteSavedMealAction).toHaveBeenCalledWith(USUAL.id));
  expect(await screen.findByText("Usual breakfast removed from My foods.")).toBeTruthy();
});

it("keeps its search and pages in the URL, so Back from a meal returns to them", () => {
  const foods = Array.from({ length: 12 }, (_, at) => ({
    ...OATS,
    id: `00000000-0000-4000-8000-0000000001${String(at).padStart(2, "0")}`,
    name: `Food ${at + 1}`,
  }));
  const meals = Array.from({ length: 7 }, (_, at) => ({
    ...USUAL,
    id: `00000000-0000-4000-8000-0000000002${String(at).padStart(2, "0")}`,
    name: `Meal ${at + 1}`,
  }));
  const names = (list: string) =>
    [...screen.getByRole("list", { name: list }).querySelectorAll(".food-row-name")].map(
      (name) => name.textContent,
    );
  window.history.replaceState(null, "", "/food/my-foods?meals=2");
  view({ foods, savedMeals: meals });
  expect(names("Meals")).toEqual(["Meal 6", "Meal 7"]);
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Foods pages" })).getByRole("button", {
      name: "Page 2 of 2",
    }),
  );
  expect(names("Foods")).toEqual(["Food 11", "Food 12"]);
  expect(window.location.search).toBe("?meals=2&foods=2");

  // A search is kept as well, and read from each section's first page.
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "food 1" } });
  expect(window.location.search).toBe("?q=food+1");
  expect(names("Foods")).toEqual(["Food 1", "Food 10", "Food 11", "Food 12"]);

  // Opened again, as Back opens it, the page is as it was left.
  cleanup();
  view({ foods, savedMeals: meals });
  expect(screen.getByRole("searchbox")).toHaveProperty("value", "food 1");
  expect(names("Foods")).toEqual(["Food 1", "Food 10", "Food 11", "Food 12"]);
});

it("starts empty with New food and New meal alone", () => {
  view({ foods: [], savedMeals: [] });
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("list", { name: "Meals" })).toBeNull();
  expect(screen.queryByRole("list", { name: "Foods" })).toBeNull();
  expect(screen.getByRole("button", { name: "New food" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "New meal" })).toBeTruthy();
});
