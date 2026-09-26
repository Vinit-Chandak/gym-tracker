// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { macroTargets, type Food, type FoodTotals, type Meal } from "@/domain/nutrition";

import { FoodSummary } from "./food-summary";
import type { EatenEntry } from "./macro-bars";

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
afterEach(cleanup);

// 135 g of protein at 75 kg, 67 g of fat (a quarter of 2,400 kcal) and 315 g of carbohydrate.
const TARGET = macroTargets(
  { dailyKcal: 2400, proteinPerKg: 1.8, fatPercent: 25 },
  75,
  "build_muscle",
);
const eaten = (kcal: number, macros: Partial<FoodTotals> = {}): FoodTotals => ({
  kcal,
  carbsG: 150,
  fatG: 50,
  proteinG: 90,
  ...macros,
});

function entry(meal: Meal, food: Food, amount: number): EatenEntry {
  return { ...food, foodId: null, amount, meal };
}
const WHEY: Food = {
  name: "Whey",
  portionAmount: 1,
  unit: "scoop",
  kcal: 139,
  carbsG: 5.6,
  fatG: 1.8,
  proteinG: 25,
};
const MILK: Food = {
  name: "Milk",
  portionAmount: 100,
  unit: "ml",
  kcal: 52,
  carbsG: 5,
  fatG: 2.5,
  proteinG: 3.3,
};
const HOME: Food = {
  name: "Home food",
  portionAmount: 1,
  unit: "serving",
  kcal: 200,
  carbsG: null,
  fatG: null,
  proteinG: null,
};

describe("the summary", () => {
  it("shows exact kcal at the fractional edges of the goal band", () => {
    const target = macroTargets({ dailyKcal: 501, proteinPerKg: 1.8, fatPercent: 25 }, null, null);
    render(<FoodSummary eaten={eaten(551.2)} target={target} entries={[]} />);
    expect(screen.getByText("Over")).toBeTruthy();
    expect(screen.getByText("50.2 kcal over target · Goal 450.9–551.1")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("551.2 of 501 kcal");
  });

  it("says nothing of the goal while the day is still under it", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} entries={[]} />);
    expect(screen.queryByText("Goal met")).toBeNull();
    expect(screen.queryByText("Over")).toBeNull();
    expect(screen.getByText("1,200 kcal left · Goal 2,160–2,640")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "1,200 of 2,400 kcal. The goal is met from 2,160 to 2,640 kcal.",
      }),
    ).toBeTruthy();
  });

  it("marks the goal met anywhere in the band, either side of the target", () => {
    render(<FoodSummary eaten={eaten(2160)} target={TARGET} entries={[]} />);
    expect(screen.getByText("Goal met")).toBeTruthy();
    cleanup();
    render(<FoodSummary eaten={eaten(2500)} target={TARGET} entries={[]} />);
    expect(screen.getByText("Goal met")).toBeTruthy();
    expect(screen.getByText("100 kcal over target · Goal 2,160–2,640")).toBeTruthy();
  });

  it("marks a day past the band as over, and by how much", () => {
    render(<FoodSummary eaten={eaten(2641)} target={TARGET} entries={[]} />);
    expect(screen.getByText("Over")).toBeTruthy();
    expect(screen.getByText("241 kcal over target · Goal 2,160–2,640")).toBeTruthy();
  });

  it("gives each macronutrient its grams against its target, in the split's order", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} entries={[]} />);
    const macros = within(screen.getByRole("list", { name: "Carbs, fat and protein" }));
    expect(macros.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Carbs150 / 315 g",
      "Fat50 / 67 g",
      "Protein90 / 135 g",
    ]);
  });
});

describe("a macronutrient's bar", () => {
  it("turns carbohydrate and fat red past their targets, and protein green once reached", () => {
    render(
      <FoodSummary
        eaten={eaten(2300, { carbsG: 315, fatG: 70, proteinG: 140 })}
        target={TARGET}
        entries={[]}
      />,
    );
    const carbs = screen.getByRole("button", { name: "Carbs: 315 of 315 g" });
    const fat = screen.getByRole("button", { name: "Fat: 70 of 67 g, over" });
    const protein = screen.getByRole("button", { name: "Protein: 140 of 135 g, reached" });
    // The bar is the last thing in each: its own colour at the target, red past it, green
    // once protein is reached.
    const fill = (button: HTMLElement) => button.lastElementChild!.firstElementChild!.className;
    expect(fill(carbs)).toContain("bg-series-2");
    expect(fill(fat)).toContain("bg-over");
    expect(fill(protein)).toContain("bg-success");
    expect(fat.querySelector(".text-over")).toBeTruthy();
    expect(carbs.querySelector(".text-over")).toBeNull();
  });

  it("opens today's foods, ranked by what they gave, with each one's share", () => {
    const entries = [
      entry("breakfast", MILK, 250),
      entry("breakfast", WHEY, 1),
      entry("lunch", HOME, 2),
      entry("dinner", MILK, 200),
    ];
    render(
      <FoodSummary eaten={eaten(1000, { proteinG: 39.9 })} target={TARGET} entries={entries} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Protein:/ }));
    const sheet = screen.getByRole("dialog", { name: "Protein" });
    expect(within(sheet).getByText("40 of 135 g · 95 g to go")).toBeTruthy();
    const rows = within(sheet).getAllByRole("listitem");
    // Milk twice is one row, added up; the food with no protein figure closes the list.
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Whey Breakfast · 1 scoop 25 g 63%",
      "Milk Breakfast, Dinner · 450 ml 15 g 37%",
      "Home food Lunch · 2 servings —",
    ]);
  });

  it("says when there is nothing yet to rank", () => {
    render(<FoodSummary eaten={eaten(0)} target={TARGET} entries={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Fat:/ }));
    expect(
      within(screen.getByRole("dialog", { name: "Fat" })).getByText("Nothing yet today."),
    ).toBeTruthy();
  });
});
