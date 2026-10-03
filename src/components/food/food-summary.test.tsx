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

/** Text as it reads on the screen, one space between the parts of a row. */
const read = (element: Element) => element.textContent?.replace(/\s+/g, " ").trim();

describe("the day", () => {
  it("says what was eaten as its one figure, against its target, and leaves where that stands to the bowl", () => {
    const entries = [entry("breakfast", WHEY, 2), entry("lunch", HOME, 3)];
    render(<FoodSummary eaten={eaten(878)} target={TARGET} entries={entries} />);
    // "878 / 2,400 kcal" on the screen, "878 kcal eaten of 2,400" aloud.
    expect(read(screen.getByText(/^kcal/).parentElement!)).toBe("878 / 2,400 kcal eaten of 2,400");
    // Nothing left, over or met is written out: where the day stands is the bowl's to show.
    expect(document.body.textContent).not.toMatch(/left|over|Goal/);
    expect(
      screen.getByRole("img", {
        name: "The bowl, filled by Breakfast 278 kcal, Lunch 600 kcal: 878 of 2,400 kcal.",
      }),
    ).toBeTruthy();
  });

  it("heaps the bowl over its rim past the target, to the tenth of a kcal", () => {
    const target = macroTargets({ dailyKcal: 501, proteinPerKg: 1.8, fatPercent: 25 }, null, null);
    render(
      <FoodSummary eaten={eaten(551.2)} target={target} entries={[entry("dinner", MILK, 1060)]} />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "The bowl heaped over its rim, filled by Dinner 551.2 kcal: 551.2 of 501 kcal.",
    );
  });

  it("says an empty bowl is empty", () => {
    render(<FoodSummary eaten={eaten(0)} target={TARGET} entries={[]} />);
    expect(screen.getByRole("img", { name: "The bowl, empty: 0 of 2,400 kcal." })).toBeTruthy();
  });

  it("draws no bowl and no macronutrients without a target, only what was eaten", () => {
    render(<FoodSummary eaten={eaten(300)} target={null} entries={[entry("lunch", HOME, 1.5)]} />);
    expect(read(document.body)).toBe("300 kcal eaten");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("gives each macronutrient its grams against its target, in the split's order", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} entries={[]} />);
    const macros = within(screen.getByRole("list", { name: "Carbs, fat and protein" }));
    expect(macros.getAllByRole("button").map(read)).toEqual([
      "Carbs 150 / 315 g",
      "Fat 50 / 67 g",
      "Protein 90 / 135 g",
    ]);
  });
});

const ink = (button: HTMLElement) =>
  (button.querySelector(".macro-rail-ink") as HTMLElement).style.width;
const tick = (button: HTMLElement) => button.querySelector<HTMLElement>(".macro-rail-tick");

describe("a macronutrient's rail", () => {
  it("fills with what was eaten of its target", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} entries={[]} />);
    expect(screen.getAllByRole("button").map(ink)).toEqual([
      `${(150 / TARGET.carbsG) * 100}%`,
      `${(50 / TARGET.fatG) * 100}%`,
      `${(90 / TARGET.proteinG) * 100}%`,
    ]);
  });

  it("runs on past a tick at a limit passed, and says over or reached by name", () => {
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
    // At its target a limit is full; past it the rail is what was eaten, the target a tick.
    expect(ink(carbs)).toBe("100%");
    expect(tick(carbs)).toBeNull();
    expect(ink(fat)).toBe("100%");
    expect(tick(fat)!.style.left).toBe(`${(TARGET.fatG / 70) * 100}%`);
    // Protein is a minimum: reaching it fills the rail, and there is nothing to pass.
    expect(ink(protein)).toBe("100%");
    expect(tick(protein)).toBeNull();
    // Ink alone says it: nothing is drawn beside a name.
    for (const button of [carbs, fat, protein])
      expect(button.querySelectorAll("svg")).toHaveLength(0);
  });

  it("opens today's foods as plain rows, ranked by what they gave", () => {
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
    expect(read(sheet)).toContain("40 g of 135 g 95 g to go");
    const rows = within(sheet).getAllByRole("listitem");
    // Milk twice is one row, added up; the food with no protein figure closes the list.
    expect(rows.map(read)).toEqual([
      "Whey Breakfast · 1 scoop 25 g",
      "Milk Breakfast, Dinner · 450 ml 15 g",
      "Home food Lunch · 2 servings — no figure",
    ]);
    // Grams only: no share of the day, and one bar, at the top.
    expect(sheet.textContent).not.toContain("%");
    expect(sheet.querySelectorAll("span[aria-hidden] > span")).toHaveLength(1);
  });

  it("says where the day stands in words: left, to go, reached or over", () => {
    render(
      <FoodSummary
        eaten={eaten(2300, { carbsG: 150, fatG: 70, proteinG: 140 })}
        target={TARGET}
        entries={[]}
      />,
    );
    const standing = (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}:`) }));
      const sheet = screen.getByRole("dialog", { name });
      const text = read(sheet.querySelector("p")!.parentElement!);
      fireEvent.click(within(sheet).getByRole("button", { name: "Close sheet" }));
      return text;
    };
    // Carbohydrate and fat are limits, so what remains of them is left; protein is still to go.
    expect(standing("Carbs")).toBe("150 g of 315 g 165 g left");
    expect(standing("Fat")).toBe("70 g of 67 g 3 g over");
    expect(standing("Protein")).toBe("140 g of 135 g Reached");
  });

  it("says when there is nothing yet to rank", () => {
    render(<FoodSummary eaten={eaten(0)} target={TARGET} entries={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Fat:/ }));
    expect(
      within(screen.getByRole("dialog", { name: "Fat" })).getByText("Nothing yet today."),
    ).toBeTruthy();
  });
});
