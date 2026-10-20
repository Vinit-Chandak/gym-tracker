// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import type { FoodDayTotal } from "@/domain/food-days";
import { addUp, eaten, type Meal } from "@/domain/nutrition";
import type { EntryRecord, FoodDay } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

/**
 * The innermost element whose whole text, its spaces read as the default matcher reads them, is
 * `text`: a figure's digits stand in a span of their own (Figures).
 */
const whole = (text: string | RegExp) => (_: string, element: Element | null) => {
  const reads = (node: Element) => {
    if (node.classList.contains("figures")) return false;
    const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof text === "string" ? value === text : text.test(value);
  };
  return element !== null && reads(element) && ![...element.children].some(reads);
};

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
vi.mock("@/components/shell/back-link", () => ({ BackLink: () => null }));
vi.mock("@/server/actions/nutrition", () => ({ readFoodMonthAction: vi.fn(async () => []) }));
const { showModal, close } = HTMLDialogElement.prototype;
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
    date,
    days = [],
  }: {
    targets?: boolean;
    library?: FoodDay["library"];
    bodyWeightKg?: number | null;
    date?: string;
    days?: FoodDayTotal[];
  } = {},
) {
  render(
    <FoodView
      today="2026-09-25"
      date={date}
      days={days}
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

it("lists the day's seven meals in the order they are eaten, each opening its own page", () => {
  view([]);
  const meals = within(screen.getByRole("list", { name: "Meals" })).getAllByRole("link");
  expect(meals.map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")])).toEqual(
    [
      ["Breakfast: nothing yet. Add", "/food/breakfast"],
      ["Morning snack: nothing yet. Add", "/food/morning-snack"],
      ["Lunch: nothing yet. Add", "/food/lunch"],
      ["Afternoon snack: nothing yet. Add", "/food/afternoon-snack"],
      ["Evening snack: nothing yet. Add", "/food/evening-snack"],
      ["Dinner: nothing yet. Add", "/food/dinner"],
      ["Late-night snack: nothing yet. Add", "/food/late-night-snack"],
    ],
  );
});

it("shows what went into each meal and what it came to, and the day's kcal eaten above", () => {
  view([
    entry("breakfast", "Milk", 155),
    entry("breakfast", "Morning dry fruits", 150),
    entry("dinner", "Home food", 200, 2),
    entry("breakfast", "Milk", 52),
  ]);
  const breakfast = screen.getByRole("link", { name: /^Breakfast/ });
  // Milk twice is still one name in the list, and both count.
  // A food row, as every list of food has: its foods on one line, its whole kcal at its end.
  expect(text(breakfast)).toBe("Breakfast Milk, Morning dry fruits 357 kcal");
  expect(text(screen.getByRole("link", { name: /^Dinner/ }))).toBe("Dinner Home food 400 kcal");
  // The day's one figure, written against its target as the macronutrients are.
  expect(text(document.querySelector(".food-eaten")!)).toBe("757 / 2,300 kcal eaten of 2,300");
  expect(
    screen.getByRole("img", {
      name: "The bowl, filled by Breakfast 357 kcal, Dinner 400 kcal: 757 of 2,300 kcal.",
    }),
  ).toBeTruthy();
});

it("leads each meal with its layer of the bowl, in the order the bowl fills", () => {
  view([
    entry("dinner", "Home food", 400),
    entry("breakfast", "Milk", 155),
    entry("lunch", "Rice", 300),
    entry("late_night_snack", "Milk", 100),
  ]);
  const swatch = (name: RegExp) =>
    screen.getByRole("link", { name }).querySelector<HTMLElement>(".meal-swatch")!.style.background;
  // Ochre, cadmium, straw, then ochre again; a meal with nothing in it has none.
  expect([/^Breakfast/, /^Lunch/, /^Dinner/, /^Late-night/, /^Morning/].map(swatch)).toEqual([
    "var(--ov-print-ochre)",
    "var(--ov-print-food)",
    "var(--ov-print-straw)",
    "var(--ov-print-ochre)",
    "",
  ]);
});

it("asks for a target until there is one, naming the goal's split, meals still below it", () => {
  view([entry("lunch", "Rice", 300)], { targets: false });
  expect(screen.getByRole("heading", { name: "No daily target yet" })).toBeTruthy();
  // Each share named, and held to its number by a non-breaking space.
  expect(
    screen.getByText(whole(/^Build muscle\s·\sCarbs\s55%\s·\sFat\s25%\s·\sProtein\s20%$/)),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Set target" }).getAttribute("href")).toBe(
    "/food/targets",
  );
  expect(screen.getByRole("link", { name: /^Lunch/ }).textContent).toContain("300 kcal");
  expect(screen.getByRole("link", { name: "Targets Not set" })).toBeTruthy();
});

it("ends with the targets and then My foods, each a screen of its own", () => {
  view([], { library: { foods: 2, meals: 1 } });
  const links = screen.getAllByRole("link");
  expect(links.slice(-2)).toEqual([
    screen.getByRole("link", { name: "Targets 2,300\u00a0kcal" }),
    // A count keeps its noun on its line, and the dot goes with the count after it.
    screen.getByRole("link", { name: "My foods 2\u00a0foods ·\u00a01\u00a0meal" }),
  ]);
  expect(links.slice(-2).map((link) => link.getAttribute("href"))).toEqual([
    "/food/targets",
    "/food/my-foods",
  ]);
  cleanup();
  view([]);
  expect(screen.getByRole("link", { name: "My foods" })).toBeTruthy();
});

it("says on the targets' tile what stops them doing what they are for", () => {
  view([], { bodyWeightKg: null });
  expect(
    screen.getByRole("link", { name: "Targets 2,300\u00a0kcal Add your body weight for protein" }),
  ).toBeTruthy();
});

it("leads its links wherever the preview says", () => {
  render(
    <FoodView
      today="2026-09-25"
      date="2024-09-25"
      day={{
        targets: null,
        entries: [],
        eaten: addUp([]),
        library: { foods: 0, meals: 0 },
      }}
      bodyWeightKg={null}
      goal={null}
      links={{
        base: "/preview/food",
        meal: (meal) => `/preview/food?meal=${meal}`,
        myFoods: "/preview/food?page=my-foods",
        targets: "/preview/food?page=targets",
      }}
    />,
  );
  expect(screen.getByRole("link", { name: /^Dinner/ }).getAttribute("href")).toBe(
    "/preview/food?meal=dinner&day=2024-09-25",
  );
  expect(screen.getByRole("link", { name: /^My foods/ }).getAttribute("href")).toBe(
    "/preview/food?page=my-foods",
  );
  // With no goal on the profile, targets start from 55 / 25 / 20, each share named.
  expect(screen.getByText(whole(/^Carbs\s55%\s·\sFat\s25%\s·\sProtein\s20%$/))).toBeTruthy();
  // The year remains visible even when the selected day is too old to appear in the strip.
  expect(
    screen.getByText("Wed 25 Sept 2024", { normalizer: (text) => text.replace(/\s+/g, " ") }),
  ).toBeTruthy();
});

it("puts the last seven days under the header, ending on today, and the month above them", () => {
  // Thursday met 2,300 kcal's band; Tuesday went past it; Wednesday stayed under it.
  view([], {
    days: [
      { date: "2026-09-22", kcal: 2700 },
      { date: "2026-09-23", kcal: 1200 },
      { date: "2026-09-24", kcal: 2300 },
    ],
  });
  expect(screen.getByRole("button", { name: "September, calendar" })).toBeTruthy();
  const days = within(screen.getByRole("navigation", { name: "Days" }));
  // The weeks in the order they are drawn: this one, where the strip rests, last.
  const newest = days.getAllByRole("list").at(-1)!;
  expect(
    within(newest)
      .getAllByRole("link")
      .map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")]),
  ).toEqual([
    ["Saturday\u00a019\u00a0September", "/food?day=2026-09-19"],
    ["Sunday\u00a020\u00a0September", "/food?day=2026-09-20"],
    ["Monday\u00a021\u00a0September", "/food?day=2026-09-21"],
    ["Tuesday\u00a022\u00a0September, over the goal", "/food?day=2026-09-22"],
    ["Wednesday\u00a023\u00a0September, food logged", "/food?day=2026-09-23"],
    ["Thursday\u00a024\u00a0September, goal met", "/food?day=2026-09-24"],
    ["Friday\u00a025\u00a0September, today", "/food"],
  ]);
  expect(days.getByRole("link", { current: "page" }).getAttribute("href")).toBe("/food");
});

it("opens a day before today with its meals on that day, and today still marked", () => {
  view([entry("dinner", "Home food", 400)], { date: "2026-09-24" });
  expect(screen.getByRole("link", { name: /^Dinner/ }).getAttribute("href")).toBe(
    "/food/dinner?day=2026-09-24",
  );
  const days = within(screen.getByRole("navigation", { name: "Days" }));
  expect(days.getByRole("link", { current: "page" }).getAttribute("aria-label")).toBe(
    "Thursday\u00a024\u00a0September",
  );
  expect(days.getByRole("link", { name: "Friday\u00a025\u00a0September, today" })).toBeTruthy();
  // My foods and the targets are the account's, not the day's, and open as ever.
  expect(screen.getByRole("link", { name: /^My foods/ }).getAttribute("href")).toBe(
    "/food/my-foods",
  );
});

it("says a day before today had none of a macronutrient, and today that there is none yet", () => {
  const fat = () => {
    fireEvent.click(screen.getByRole("button", { name: /^Fat:/ }));
    return within(screen.getByRole("dialog", { name: "Fat" }));
  };
  view([], { date: "2026-09-24" });
  expect(fat().getByText("None on this day.")).toBeTruthy();
  cleanup();
  view([]);
  expect(fat().getByText("Nothing yet today.")).toBeTruthy();
});
