// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import {
  createFoodAction,
  deleteEntryAction,
  deleteFoodAction,
  deleteSavedMealAction,
  logFoodAction,
  logSavedMealAction,
  saveMealAction,
  updateEntryAction,
  updateFoodAction,
} from "@/server/actions/nutrition";
import type {
  EntryRecord,
  FoodRecord,
  MealScreen,
  SavedMealRecord,
} from "@/server/repositories/nutrition";

import { MealEditor } from "./meal-editor";

vi.mock("@/server/actions/nutrition", () => ({
  logFoodAction: vi.fn(),
  createFoodAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  saveMealAction: vi.fn(),
  logSavedMealAction: vi.fn(),
  deleteSavedMealAction: vi.fn(),
  updateFoodAction: vi.fn(),
  deleteFoodAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

const showModal = HTMLDialogElement.prototype.showModal;
const close = HTMLDialogElement.prototype.close;
const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 88,
  });
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
});
beforeEach(() => {
  vi.clearAllMocks();
  for (const action of [
    logFoodAction,
    createFoodAction,
    updateEntryAction,
    deleteEntryAction,
    saveMealAction,
    logSavedMealAction,
    deleteSavedMealAction,
    updateFoodAction,
    deleteFoodAction,
  ]) {
    vi.mocked(action).mockResolvedValue({ ok: true });
  }
});
afterEach(cleanup);

const TODAY = "2026-09-25";
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
const MILK: FoodRecord = {
  id: "00000000-0000-4000-8000-0000000000f2",
  name: "Milk",
  portionAmount: 100,
  unit: "ml",
  kcal: 52,
  carbsG: 5,
  fatG: 2.5,
  proteinG: 3.3,
};
const WHEY: FoodRecord = {
  id: "00000000-0000-4000-8000-0000000000f3",
  name: "Whey",
  portionAmount: 1,
  unit: "scoop",
  kcal: 139,
  carbsG: 5.6,
  fatG: 1.8,
  proteinG: 25,
};

function entry(id: string, food: FoodRecord, amount: number): EntryRecord {
  const { id: foodId, ...copy } = food;
  return { id, eatenOn: TODAY, meal: "breakfast", foodId, ...copy, amount };
}
const MILK_300 = entry("00000000-0000-4000-8000-0000000000e1", MILK, 300);
const WHEY_1 = entry("00000000-0000-4000-8000-0000000000e2", WHEY, 1);

const logged = ({ id: _id, eatenOn: _day, meal: _meal, ...food }: EntryRecord) => food;
const USUAL: SavedMealRecord = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "Usual breakfast",
  items: [MILK_300, WHEY_1].map(logged),
};
const SHAKE: SavedMealRecord = {
  id: "00000000-0000-4000-8000-0000000000a2",
  name: "Shake",
  items: [{ ...logged(WHEY_1), amount: 1.5 }],
};

function editor(screenData: Partial<MealScreen> = {}) {
  return render(
    <MealEditor
      today={TODAY}
      meal="breakfast"
      screen={{
        entries: [MILK_300, WHEY_1],
        foods: [OATS, MILK, WHEY],
        savedMeals: [SHAKE, USUAL],
        ...screenData,
      }}
    />,
  );
}

const sheet = () => document.querySelector("dialog")!;
const myFoods = () => within(screen.getByRole("list", { name: "Your foods and meals" }));
const inSheet = () => within(sheet());
const type = (label: string, value: string) =>
  fireEvent.change(inSheet().getByLabelText(label), { target: { value } });

it("logs a food from My foods at the amount eaten, a tap or a few digits away", async () => {
  editor();
  fireEvent.click(myFoods().getByRole("button", { name: /^Oats 100 g/ }));
  expect(inSheet().getByRole("heading", { name: "Oats" })).toBeTruthy();
  expect(sheet().textContent).toContain("Per 100 g389 kcal · Carbs 66 g · Fat 7 g · Protein 17 g");
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "100");

  fireEvent.click(inSheet().getByRole("button", { name: "200 g" }));
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "200");
  expect(inSheet().getByRole("button", { name: "200 g" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(sheet().textContent).toContain("778 kcal");
  type("Amount eaten", "60");
  expect(sheet().textContent).toContain("233.4 kcal");
  expect(sheet().textContent).toContain("Carbs 40 g · Fat 4 g · Protein 10 g");

  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(logFoodAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    eatenOn: TODAY,
    meal: "breakfast",
    foodId: OATS.id,
    amount: "60",
  });
  expect(screen.getByText("Oats, 60 g, added to Breakfast.")).toBeTruthy();
});

it("keeps the sheet and its amount when the connection drops, and retries as the same save", async () => {
  vi.mocked(logFoodAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  editor();
  fireEvent.click(myFoods().getByRole("button", { name: /^Whey 1 scoop/ }));
  fireEvent.click(inSheet().getByRole("button", { name: "1.5 scoops" }));
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  expect((await inSheet().findByRole("alert")).textContent).toBe(OFFLINE_SUBMIT_MESSAGE);
  expect(sheet().open).toBe(true);
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "1.5");

  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  const [first, second] = vi.mocked(logFoodAction).mock.calls.map(([draft]) => draft);
  expect(second).toEqual(first);
});

it("makes a new food from what was searched for, the amount following the portion until changed", async () => {
  editor();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: " paneer " } });
  expect(screen.queryByRole("button", { name: /^Oats/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New food “paneer”" }));
  expect(inSheet().getByRole("heading", { name: "New food" })).toBeTruthy();
  expect(inSheet().getByLabelText("Name")).toHaveProperty("value", "paneer");
  expect(inSheet().getByLabelText("Nutrition per")).toHaveProperty("value", "100");
  expect(inSheet().getByLabelText("Unit")).toHaveProperty("value", "g");

  type("Nutrition per", "50");
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "50");
  type("kcal", "132.5");
  type("Protein g", "9");
  type("Amount eaten", "80");
  type("Nutrition per", "100");
  // Once changed, the amount is the athlete's own and stays put.
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "80");
  expect(sheet().textContent).toContain("106 kcal");

  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(createFoodAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    eatenOn: TODAY,
    meal: "breakfast",
    name: "paneer",
    portionAmount: "100",
    unit: "g",
    kcal: "132.5",
    carbsG: "",
    fatG: "",
    proteinG: "9",
    amount: "80",
  });
  // The search is done with: the next food starts from the whole list.
  expect(screen.getByRole("searchbox")).toHaveProperty("value", "");
});

it("puts a refused field's message on that field, and the caret in it", async () => {
  vi.mocked(createFoodAction).mockResolvedValueOnce({
    ok: false,
    fieldErrors: { name: "You already have a food called Oats.", kcal: "Enter the kcal." },
  });
  editor();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "granola" } });
  fireEvent.click(screen.getByRole("button", { name: "New food “granola”" }));
  type("Name", "oats");
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  expect(await inSheet().findByText("You already have a food called Oats.")).toBeTruthy();
  const name = inSheet().getByLabelText("Name");
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(inSheet().getByLabelText("kcal").getAttribute("aria-invalid")).toBe("true");
  await waitFor(() => expect(document.activeElement).toBe(name));
  expect(sheet().open).toBe(true);
});

it("changes how much of a food was eaten, or takes it out of the meal", async () => {
  editor();
  fireEvent.click(screen.getByRole("button", { name: /^Milk 300 ml/ }));
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "300");
  type("Amount eaten", "250");
  fireEvent.click(inSheet().getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(updateEntryAction).toHaveBeenCalledWith({ entryId: MILK_300.id, amount: "250" });

  fireEvent.click(screen.getByRole("button", { name: /^Milk 300 ml/ }));
  fireEvent.click(inSheet().getByRole("button", { name: "Remove from meal" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(deleteEntryAction).toHaveBeenCalledWith(MILK_300.id);
  expect(screen.getByText("Milk removed.")).toBeTruthy();
});

it("takes a swiped-away food out at once, and brings it back if that does not go through", async () => {
  let finish!: (value: { ok: false; error: string }) => void;
  vi.mocked(deleteEntryAction).mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const { container } = editor();
  const row = container.querySelector("[data-swipe-row]")!;
  const at = (x: number) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: 50 });
  fireEvent.pointerDown(row, at(300));
  for (const x of [280, 260, 240, 220]) fireEvent.pointerMove(row, at(x));
  fireEvent.pointerUp(row, at(220));
  // Swiping never opens the food.
  expect(document.querySelector("dialog")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Remove Milk" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /^Milk 300 ml/ })).toBeNull());
  expect(deleteEntryAction).toHaveBeenCalledWith(MILK_300.id);

  await act(async () => finish({ ok: false, error: "Something went wrong. Please try again." }));
  expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Please try again.");
  expect(screen.getByRole("button", { name: /^Milk 300 ml/ })).toBeTruthy();
});

it("shows a meal starred while it is a saved meal, and unstars it in one tap", async () => {
  editor();
  const star = screen.getByRole("button", { name: "Star" });
  expect(star.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Saved as Usual breakfast")).toBeTruthy();
  fireEvent.click(star);
  await waitFor(() => expect(deleteSavedMealAction).toHaveBeenCalledWith(USUAL.id));
  expect(await screen.findByText("Usual breakfast unstarred.")).toBeTruthy();
});

it("stars a meal under the name it is given, saying when that replaces one", async () => {
  editor({ entries: [MILK_300] });
  const star = screen.getByRole("button", { name: "Star" });
  expect(star.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(star);
  expect(inSheet().getByRole("heading", { name: "Star meal" })).toBeTruthy();
  expect(sheet().textContent).toContain("Breakfast: 1 food · 156 kcal");
  type("Name", "usual BREAKFAST");
  expect(inSheet().getByText("Replaces your saved meal Usual breakfast.")).toBeTruthy();
  type("Name", "Milk breakfast");
  expect(inSheet().queryByText(/^Replaces/)).toBeNull();
  fireEvent.click(inSheet().getByRole("button", { name: "Save meal" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(saveMealAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    eatenOn: TODAY,
    meal: "breakfast",
    name: "Milk breakfast",
  });
});

it("adds a saved meal to this meal, or deletes it, from what it holds", async () => {
  editor();
  fireEvent.click(screen.getByRole("button", { name: /^Shake/ }));
  expect(sheet().textContent).toContain("Whey 1.5 scoops");
  expect(sheet().textContent).toContain("208.5 kcal");
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(logSavedMealAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    eatenOn: TODAY,
    meal: "breakfast",
    savedMealId: SHAKE.id,
  });

  fireEvent.click(screen.getByRole("button", { name: /^Shake/ }));
  fireEvent.click(inSheet().getByRole("button", { name: "Delete saved meal" }));
  await waitFor(() => expect(deleteSavedMealAction).toHaveBeenCalledWith(SHAKE.id));
});

it("searches foods by name, and saved meals by name or by what they hold, in one list", () => {
  editor();
  // Everything in My foods is one list to add from, saved meals first; nothing is made here.
  expect(myFoods().getAllByRole("button")).toHaveLength(5);
  expect(screen.queryByRole("button", { name: /^New food/ })).toBeNull();
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "WHEY" } });
  expect(
    myFoods()
      .getAllByRole("button")
      .map((button) => button.textContent?.split(" ")[0]),
  ).toEqual(["Shake", "Usual", "Whey"]);
  // A food that exists is found, not offered as a new one.
  fireEvent.change(search, { target: { value: "oats" } });
  expect(screen.queryByRole("button", { name: /^New food/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Shake/ })).toBeNull();
  // Only a search that finds nothing offers to make the food.
  fireEvent.change(search, { target: { value: "granola" } });
  expect(
    myFoods()
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["New food “granola”"]);
});

it("leaves correcting a food to My foods: its sheet here only says how much", () => {
  editor();
  fireEvent.click(myFoods().getByRole("button", { name: /^Oats 100 g/ }));
  expect(inSheet().getByLabelText("Amount eaten")).toBeTruthy();
  expect(inSheet().queryByRole("button", { name: /^Edit/ })).toBeNull();
  expect(inSheet().queryByRole("button", { name: "Remove from My foods" })).toBeNull();
});

it("starts an account with nothing in My foods at New food, since nothing can be found", () => {
  editor({ entries: [], foods: [], savedMeals: [] });
  expect(screen.getByRole("searchbox")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Star" })).toBeNull();
  expect(
    myFoods()
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["New food"]);
});
