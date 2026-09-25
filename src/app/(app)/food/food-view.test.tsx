// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { addUp, eaten, type Meal } from "@/domain/nutrition";
import type { EntryRecord } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
vi.mock("@/components/shell/back-link", () => ({ BackLink: () => null }));
vi.mock("@/server/actions/nutrition", () => ({ saveTargetsAction: vi.fn(async () => ({})) }));
afterEach(cleanup);

/** What a row reads as, the spaces kept for screen readers collapsed. */
const text = (element: Element) => element.textContent?.replace(/\s+/g, " ").trim();

let ids = 0;
function entry(meal: Meal, name: string, kcal: number, amount = 1): EntryRecord {
  return {
    id: `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    eatenOn: "2026-09-25",
    meal,
    foodId: null,
    name,
    portionAmount: 1,
    unit: "serving",
    kcal,
    carbsG: null,
    fatG: null,
    proteinG: 10,
    amount,
  };
}

function view(entries: EntryRecord[], targets = true) {
  render(
    <FoodView
      today="2026-09-25"
      day={{
        targets: targets ? { dailyKcal: 2300, proteinPerKg: 1.8, split: "body_weight" } : null,
        entries,
        eaten: addUp(entries.map(eaten)),
      }}
      bodyWeightKg={75}
      unit="kg"
    />,
  );
}

it("lists the day's six meals in the order they are eaten, each opening its own page", () => {
  view([]);
  const meals = within(screen.getByRole("list")).getAllByRole("link");
  expect(meals.map((link) => [text(link), link.getAttribute("href")])).toEqual([
    ["Breakfast nothing yet", "/food/breakfast"],
    ["Morning snack nothing yet", "/food/morning-snack"],
    ["Lunch nothing yet", "/food/lunch"],
    ["Afternoon snack nothing yet", "/food/afternoon-snack"],
    ["Dinner nothing yet", "/food/dinner"],
    ["Evening snack nothing yet", "/food/evening-snack"],
  ]);
});

it("shows what went into each meal and what it came to, and the day's total above", () => {
  view([
    entry("breakfast", "Milk", 155),
    entry("breakfast", "Morning dry fruits", 150),
    entry("dinner", "Home food", 200, 2),
    entry("breakfast", "Milk", 52),
  ]);
  const breakfast = screen.getByRole("link", { name: /^Breakfast/ });
  // Milk twice is still one name in the list, and both count.
  expect(text(breakfast)).toBe("Breakfast Milk, Morning dry fruits 357 kcal");
  expect(text(screen.getByRole("link", { name: /^Dinner/ }))).toBe("Dinner Home food 400 kcal");
  expect(document.body.textContent).toContain("757 / 2,300 kcal");
});

it("opens with setting a target until there is one, meals still below it", () => {
  view([entry("lunch", "Rice", 300)], false);
  expect(screen.getByRole("heading", { name: "Set a daily target" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /^Lunch/ }).textContent).toContain("300 kcal");
  expect(screen.queryByText("Targets")).toBeNull();
});

it("leads a meal's row wherever the preview says", () => {
  render(
    <FoodView
      today="2026-09-25"
      day={{ targets: null, entries: [], eaten: addUp([]) }}
      bodyWeightKg={null}
      unit="kg"
      mealHref={(meal) => `/preview/food?meal=${meal}`}
    />,
  );
  expect(screen.getByRole("link", { name: /^Dinner/ }).getAttribute("href")).toBe(
    "/preview/food?meal=dinner",
  );
});
