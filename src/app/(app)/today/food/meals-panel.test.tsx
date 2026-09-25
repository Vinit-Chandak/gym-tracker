// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { addUp, type FoodItem } from "@/domain/nutrition";
import { OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { deleteMealAction, saveMealAction } from "@/server/actions/nutrition";
import type { MealRecord } from "@/server/repositories/nutrition";

import { MealsPanel } from "./meals-panel";

vi.mock("@/server/actions/nutrition", () => ({
  saveMealAction: vi.fn(),
  deleteMealAction: vi.fn(),
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
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const MEAL_ID = "00000000-0000-4000-8000-0000000000a2";
const STAR_ID = "00000000-0000-4000-8000-0000000000f1";

function meal(items: FoodItem[], savedMealId: string | null = null): MealRecord {
  return {
    id: MEAL_ID,
    name: "Afternoon meal 1",
    eatenOn: "2026-09-25",
    savedMealId,
    items,
    totals: addUp(items),
  };
}

const PEANUT_BUTTER: FoodItem = {
  name: "Peanut butter, 75 g",
  kcal: 441.5,
  carbsG: 15,
  fatG: 37.5,
  proteinG: 18.8,
};
const MILK: FoodItem = { name: "Milk, 250 ml", kcal: 160, carbsG: null, fatG: null, proteinG: 8.5 };

const sheet = () => document.querySelector("dialog")!;
const type = (label: string, value: string) =>
  fireEvent.change(within(sheet()).getByLabelText(label), { target: { value } });

it("adds a meal: a suggested name, running totals, rows sent as typed, and the star", async () => {
  vi.mocked(saveMealAction).mockResolvedValue({ ok: true });
  render(<MealsPanel meals={[]} suggestedName="Evening meal 1" />);
  expect(screen.getByText("Nothing logged today.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Add meal" }));
  expect(sheet().open).toBe(true);
  expect(within(sheet()).getByRole("textbox", { name: "Meal" })).toHaveProperty(
    "value",
    "Evening meal 1",
  );

  type("Food 1 name", "Peanut butter, 75 g");
  type("Food 1 kcal", "441.5");
  type("Food 1 Carbs g", "15");
  fireEvent.click(within(sheet()).getByRole("button", { name: "Add food" }));
  // The new row takes the focus, ready to be typed into.
  expect(document.activeElement).toBe(within(sheet()).getByLabelText("Food 2 name"));
  type("Food 2 kcal", "160,5");
  // A third row left blank is an extra tap, not a mistake.
  fireEvent.click(within(sheet()).getByRole("button", { name: "Add food" }));

  expect(sheet().textContent).toContain("602 kcal");
  expect(sheet().textContent).toContain("Carbs 15 g · Fat 0 g · Protein 0 g");

  const star = within(sheet()).getByRole("button", { name: "Star" });
  expect(star.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(star);
  expect(star.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(within(sheet()).getByRole("button", { name: "Save meal" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(saveMealAction).toHaveBeenCalledWith({
    mealId: undefined,
    name: "Evening meal 1",
    items: [
      { name: "Peanut butter, 75 g", kcal: "441.5", carbsG: "15", fatG: "", proteinG: "" },
      { name: "", kcal: "160.5", carbsG: "", fatG: "", proteinG: "" },
      { name: "", kcal: "", carbsG: "", fatG: "", proteinG: "" },
    ],
    starred: true,
  });
});

it("puts a refused field's message on that field, and keeps everything typed", async () => {
  vi.mocked(saveMealAction).mockResolvedValue({
    ok: false,
    fieldErrors: { "items.1.kcal": "Enter the kcal." },
  });
  render(<MealsPanel meals={[]} suggestedName="Evening meal 1" />);
  fireEvent.click(screen.getByRole("button", { name: "Add meal" }));
  type("Food 1 kcal", "300");
  fireEvent.click(within(sheet()).getByRole("button", { name: "Add food" }));
  type("Food 2 name", "Toast");
  fireEvent.click(within(sheet()).getByRole("button", { name: "Save meal" }));

  expect((await within(sheet()).findByRole("alert")).textContent).toBe("Enter the kcal.");
  const refused = within(sheet()).getByLabelText("Food 2 kcal");
  expect(refused.getAttribute("aria-invalid")).toBe("true");
  expect(within(sheet()).getByLabelText("Food 1 kcal").getAttribute("aria-invalid")).toBeNull();
  // The eye and the caret go where the problem is.
  await waitFor(() => expect(document.activeElement).toBe(refused));
  expect(sheet().open).toBe(true);
  expect(within(sheet()).getByLabelText("Food 2 name")).toHaveProperty("value", "Toast");
});

it("says a lost connection in words, and keeps the sheet as it was", async () => {
  vi.mocked(saveMealAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(<MealsPanel meals={[]} suggestedName="Evening meal 1" />);
  fireEvent.click(screen.getByRole("button", { name: "Add meal" }));
  type("Food 1 kcal", "900");
  fireEvent.click(within(sheet()).getByRole("button", { name: "Save meal" }));
  expect((await within(sheet()).findByRole("alert")).textContent).toBe(OFFLINE_SUBMIT_MESSAGE);
  expect(sheet().open).toBe(true);
  expect(within(sheet()).getByLabelText("Food 1 kcal")).toHaveProperty("value", "900");
});

it("edits a meal: its foods and its star come with it, and it saves against its own id", async () => {
  vi.mocked(saveMealAction).mockResolvedValue({ ok: true });
  render(<MealsPanel meals={[meal([PEANUT_BUTTER, MILK], STAR_ID)]} suggestedName="x" />);
  // The row shows the meal's foods and what they come to, and that it is starred.
  const row = screen.getByRole("button", { name: /^Afternoon meal 1/ });
  expect(row.textContent).toContain("602 kcal");
  expect(row.textContent).toContain("Peanut butter, 75 g");
  expect(within(row).getByRole("img", { name: "Starred" })).toBeTruthy();

  fireEvent.click(row);
  expect(within(sheet()).getByRole("heading", { name: "Edit meal" })).toBeTruthy();
  expect(within(sheet()).getByLabelText("Food 1 kcal")).toHaveProperty("value", "441.5");
  expect(within(sheet()).getByLabelText("Food 2 Carbs g")).toHaveProperty("value", "");
  expect(within(sheet()).getByRole("button", { name: "Star" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(within(sheet()).getByRole("button", { name: "Remove food 1" }));
  fireEvent.click(within(sheet()).getByRole("button", { name: "Save meal" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(saveMealAction).toHaveBeenCalledWith({
    mealId: MEAL_ID,
    name: "Afternoon meal 1",
    items: [{ name: "Milk, 250 ml", kcal: "160", carbsG: "", fatG: "", proteinG: "8.5" }],
    starred: true,
  });
});

it("deletes from the sheet too, for anyone who does not swipe", async () => {
  vi.mocked(deleteMealAction).mockResolvedValue({ ok: true });
  render(<MealsPanel meals={[meal([PEANUT_BUTTER])]} suggestedName="x" />);
  fireEvent.click(screen.getByRole("button", { name: /^Afternoon meal 1/ }));
  fireEvent.click(within(sheet()).getByRole("button", { name: "Delete meal" }));
  await waitFor(() => expect(sheet().open).toBe(false));
  expect(deleteMealAction).toHaveBeenCalledWith(MEAL_ID);
});

it("takes a swiped-away meal off the list at once, and brings it back if the delete fails", async () => {
  let finish!: (value: { ok: false; error: string }) => void;
  vi.mocked(deleteMealAction).mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const { container } = render(<MealsPanel meals={[meal([PEANUT_BUTTER])]} suggestedName="x" />);
  const row = container.querySelector("[data-swipe-row]")!;
  const at = (x: number) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: 50 });
  fireEvent.pointerDown(row, at(300));
  for (const x of [280, 260, 240, 220]) fireEvent.pointerMove(row, at(x));
  fireEvent.pointerUp(row, at(220));
  // Swiping never opens the meal.
  expect(sheet().open).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Delete Afternoon meal 1" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /^Afternoon meal 1/ })).toBeNull(),
  );
  expect(deleteMealAction).toHaveBeenCalledWith(MEAL_ID);

  await act(async () => finish({ ok: false, error: "Something went wrong. Please try again." }));
  expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Please try again.");
  expect(screen.getByRole("button", { name: /^Afternoon meal 1/ })).toBeTruthy();
});
