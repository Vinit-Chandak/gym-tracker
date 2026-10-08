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
  logQuickFoodAction,
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
  logQuickFoodAction: vi.fn(),
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
    logQuickFoodAction,
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
      date={TODAY}
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
const myFoods = () => within(screen.getByRole("group", { name: "Your foods and meals" }));
const inSheet = () => within(sheet());
const type = (label: string, value: string) =>
  fireEvent.change(inSheet().getByLabelText(label), { target: { value } });

it("logs a food from My foods at the amount eaten, a tap or a few digits away", async () => {
  editor();
  fireEvent.click(myFoods().getByRole("button", { name: /^Oats 100 g/ }));
  expect(inSheet().getByRole("heading", { name: "Oats" })).toBeTruthy();
  expect(sheet().textContent).toContain(
    "Per 100 g · 389 kcal · Carbs 66 g · Fat 7 g · Protein 17 g",
  );
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "100");

  // − and + step by half a portion.
  fireEvent.click(inSheet().getByRole("button", { name: "More Oats" }));
  fireEvent.click(inSheet().getByRole("button", { name: "More Oats" }));
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "200");
  expect(sheet().textContent).toContain("778 kcal");
  fireEvent.click(inSheet().getByRole("button", { name: "Less Oats" }));
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "150");
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
  fireEvent.click(inSheet().getByRole("button", { name: "More Whey" }));
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  expect((await inSheet().findByRole("alert")).textContent).toBe(OFFLINE_SUBMIT_MESSAGE);
  expect(sheet().open).toBe(true);
  expect(inSheet().getByLabelText("Amount eaten")).toHaveProperty("value", "1.5");

  // The failure is said inside the save's transition; Add comes back once it ends.
  fireEvent.click(await inSheet().findByRole("button", { name: "Add to Breakfast" }));
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

it("quick adds what was eaten from its figures alone, keeping nothing in My foods", async () => {
  editor();
  const quick = myFoods().getAllByRole("button")[0]!;
  expect(quick.textContent).toBe("Quick add Calories and macros, just this once");
  fireEvent.click(quick);
  expect(inSheet().getByRole("heading", { name: "Quick add" })).toBeTruthy();
  expect(sheet().textContent).toContain("It is not kept in My foods.");
  // What was eaten, as a whole: no portion to give, and no amount to scale it by.
  expect(inSheet().queryByLabelText("Nutrition per")).toBeNull();
  expect(inSheet().queryByLabelText("Amount eaten")).toBeNull();
  expect(inSheet().getByLabelText("Name (optional)")).toHaveProperty("value", "");

  type("kcal", "720");
  type("Carbs g", "80");
  type("Fat g", "28");
  type("Protein g", "35");
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(logQuickFoodAction).toHaveBeenCalledWith({
    submissionKey: expect.any(String),
    eatenOn: TODAY,
    meal: "breakfast",
    name: "",
    kcal: "720",
    carbsG: "80",
    fatG: "28",
    proteinG: "35",
  });
  expect(createFoodAction).not.toHaveBeenCalled();
  expect(screen.getByText("Quick add added to Breakfast.")).toBeTruthy();
});

it("names a quick add after the search it came from, and says a refused figure on its field", async () => {
  vi.mocked(logQuickFoodAction).mockResolvedValueOnce({
    ok: false,
    fieldErrors: { kcal: "Enter the kcal." },
  });
  editor();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: " thali at work " } });
  fireEvent.click(myFoods().getByRole("button", { name: /^Quick add “thali at work”/ }));
  expect(inSheet().getByLabelText("Name (optional)")).toHaveProperty("value", "thali at work");
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() =>
    expect(inSheet().getByLabelText("kcal").getAttribute("aria-invalid")).toBe("true"),
  );
  expect(sheet().open).toBe(true);
  expect(inSheet().getByRole("alert").textContent).toBe("Enter the kcal.");

  type("kcal", "650");
  fireEvent.click(inSheet().getByRole("button", { name: "Add to Breakfast" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  const [first, second] = vi.mocked(logQuickFoodAction).mock.calls.map(([draft]) => draft);
  // A retry is the same submission, so a lost reply cannot log it twice.
  expect(second!.submissionKey).toBe(first!.submissionKey);
  expect(second).toMatchObject({ name: "thali at work", kcal: "650" });
  expect(screen.getByText("thali at work added to Breakfast.")).toBeTruthy();
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

it("searches foods by name, and saved meals by name or by what they hold, meals above foods", () => {
  editor();
  // Everything in My foods can be added from here, after Quick add: the saved meals under their
  // own heading, then the foods under theirs. Nothing is made here.
  expect(myFoods().getAllByRole("button")).toHaveLength(6);
  const names = (list: string) =>
    within(screen.getByRole("list", { name: list }))
      .getAllByRole("button")
      .map((button) => button.textContent?.split(" ")[0]);
  expect(names("Meals")).toEqual(["Shake", "Usual"]);
  expect(names("Foods")).toEqual(["Oats", "Milk", "Whey"]);
  expect(screen.queryByRole("button", { name: /^New food/ })).toBeNull();
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "WHEY" } });
  expect(
    myFoods()
      .getAllByRole("button")
      .map((button) => button.textContent?.split(" ")[0]),
  ).toEqual(["Quick", "Shake", "Usual", "Whey"]);
  // A food that exists is found, not offered as a new one; with no saved meal found, their
  // heading goes too.
  fireEvent.change(search, { target: { value: "oats" } });
  expect(screen.queryByRole("button", { name: /^New food/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Shake/ })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Meals" })).toBeNull();
  // Only a search that finds nothing offers to make the food.
  fireEvent.change(search, { target: { value: "granola" } });
  expect(
    myFoods()
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Quick add “granola” Calories and macros, just this once", "New food “granola”"]);
});

it("leads every meal and food with its tile, one line each, in whole kcal and with no plus", () => {
  const { container } = editor();
  const rows = (list: string) =>
    within(screen.getByRole("list", { name: list }))
      .getAllByRole("button")
      .map((button) => button.textContent?.replace(/\s+/g, " ").trim());
  // Shake is 1.5 scoops of whey at 139 kcal a scoop: 208.5, written 209.
  expect(rows("Meals")).toEqual(["Shake Whey 209 kcal", "Usual breakfast Milk, Whey 295 kcal"]);
  // A food says its portion under its name, and what that portion comes to beside it.
  expect(rows("Foods")).toEqual([
    "Oats 100 g 389 kcal",
    "Milk 100 ml 52 kcal",
    "Whey 1 scoop 139 kcal",
  ]);
  const library = screen.getByRole("group", { name: "Your foods and meals" });
  for (const row of within(library).getAllByRole("button")) {
    expect(row.querySelector(".food-row-glyph")).toBeTruthy();
  }
  // The row is the control, so nothing trails it to say it can be added.
  expect(library.querySelector(".meal-add")).toBeNull();
  // What is already in the meal is listed the same way, under the bowl.
  const inMeal = container.querySelector('[aria-label="In breakfast"]')!;
  expect(inMeal.querySelectorAll(".food-row-glyph")).toHaveLength(2);
  expect(inMeal.textContent?.replace(/\s+/g, " ")).toContain("Milk 300 ml 156 kcal");
});

it("lists meals five and foods ten a page, starting again at the first for a search", () => {
  const foods = Array.from({ length: 12 }, (_, at) => ({
    ...OATS,
    id: `00000000-0000-4000-8000-0000000001${String(at).padStart(2, "0")}`,
    name: `Food ${at + 1}`,
  }));
  const meals = Array.from({ length: 7 }, (_, at) => ({
    ...SHAKE,
    id: `00000000-0000-4000-8000-0000000002${String(at).padStart(2, "0")}`,
    name: `Meal ${at + 1}`,
  }));
  editor({ entries: [], foods, savedMeals: meals });
  const names = (list: string) =>
    within(screen.getByRole("list", { name: list }))
      .getAllByRole("button")
      .map((button) => button.querySelector(".food-row-name")!.textContent);
  expect(names("Meals")).toEqual(["Meal 1", "Meal 2", "Meal 3", "Meal 4", "Meal 5"]);
  expect(names("Foods")).toHaveLength(10);
  const foodPages = within(screen.getByRole("navigation", { name: "Foods pages" }));
  fireEvent.click(foodPages.getByRole("button", { name: "Page 2 of 2" }));
  expect(names("Foods")).toEqual(["Food 11", "Food 12"]);
  expect(foodPages.getByRole("button", { name: "Page 2 of 2" }).getAttribute("aria-current")).toBe(
    "page",
  );
  // Turning Foods leaves Meals where it was.
  expect(names("Meals")).toEqual(["Meal 1", "Meal 2", "Meal 3", "Meal 4", "Meal 5"]);
  // A search is read from its first page.
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "food 1" } });
  expect(names("Foods")).toEqual(["Food 1", "Food 10", "Food 11", "Food 12"]);
  expect(screen.queryByRole("navigation", { name: "Foods pages" })).toBeNull();
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
  ).toEqual(["Quick add Calories and macros, just this once", "New food"]);
});
