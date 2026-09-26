// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { addUp, eaten, type Meal } from "@/domain/nutrition";
import type { EntryRecord, FoodDay } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
vi.mock("@/components/shell/back-link", () => ({ BackLink: () => null }));
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

function view(
  entries: EntryRecord[],
  {
    targets = true,
    library = { foods: 0, meals: 0 },
    bodyWeightKg = 75,
  }: { targets?: boolean; library?: FoodDay["library"]; bodyWeightKg?: number | null } = {},
) {
  render(
    <FoodView
      today="2026-09-25"
      day={{
        targets: targets ? { dailyKcal: 2300, proteinPerKg: 1.8, fatPercent: 25 } : null,
        entries,
        eaten: addUp(entries.map(eaten)),
        library,
      }}
      bodyWeightKg={bodyWeightKg}
      goal="build_muscle"
    />,
  );
}

it("lists the day's six meals in the order they are eaten, each opening its own page", () => {
  view([]);
  const meals = within(screen.getByRole("list", { name: "Meals" })).getAllByRole("link");
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

it("asks for a target until there is one, naming the goal's split, meals still below it", () => {
  view([entry("lunch", "Rice", 300)], { targets: false });
  expect(screen.getByRole("heading", { name: "No daily target yet" })).toBeTruthy();
  // The split's numbers are held together by non-breaking spaces.
  expect(screen.getByText(/^Build muscle · 55\s\/\s25\s\/\s20$/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Set target" }).getAttribute("href")).toBe(
    "/food/targets",
  );
  expect(screen.getByRole("link", { name: /^Lunch/ }).textContent).toContain("300 kcal");
  expect(screen.getByRole("link", { name: "Targets Not set" })).toBeTruthy();
});

it("ends with My foods and then the targets, each a screen of its own", () => {
  view([], { library: { foods: 2, meals: 1 } });
  const links = screen.getAllByRole("link");
  expect(links.slice(-2)).toEqual([
    screen.getByRole("link", { name: "My foods 2 foods · 1 meal" }),
    screen.getByRole("link", { name: "Targets 2,300 kcal" }),
  ]);
  expect(links.slice(-2).map((link) => link.getAttribute("href"))).toEqual([
    "/food/my-foods",
    "/food/targets",
  ]);
  cleanup();
  view([]);
  expect(screen.getByRole("link", { name: "My foods" })).toBeTruthy();
});

it("says on the targets' row what stops them doing what they are for", () => {
  view([], { bodyWeightKg: null });
  expect(
    screen.getByRole("link", { name: "Targets Add your body weight for protein 2,300 kcal" }),
  ).toBeTruthy();
});

it("leads its links wherever the preview says", () => {
  render(
    <FoodView
      today="2026-09-25"
      day={{
        targets: null,
        entries: [],
        eaten: addUp([]),
        library: { foods: 0, meals: 0 },
      }}
      bodyWeightKg={null}
      goal={null}
      links={{
        meal: (meal) => `/preview/food?meal=${meal}`,
        myFoods: "/preview/food?page=my-foods",
        targets: "/preview/food?page=targets",
      }}
    />,
  );
  expect(screen.getByRole("link", { name: /^Dinner/ }).getAttribute("href")).toBe(
    "/preview/food?meal=dinner",
  );
  expect(screen.getByRole("link", { name: /^My foods/ }).getAttribute("href")).toBe(
    "/preview/food?page=my-foods",
  );
  // With no goal on the profile, targets start from 55 / 25 / 20.
  expect(screen.getByText(/^55\s\/\s25\s\/\s20$/)).toBeTruthy();
});
