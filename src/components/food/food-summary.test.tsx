// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { macroTargets, type FoodTotals } from "@/domain/nutrition";

import { FoodCard } from "./food-card";
import { FoodSummary } from "./food-summary";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const TARGET = macroTargets({ dailyKcal: 2400, proteinPerKg: 1.8, split: "body_weight" }, 75);
const eaten = (kcal: number): FoodTotals => ({ kcal, carbsG: 150, fatG: 50, proteinG: 90 });

describe("the summary", () => {
  it("says nothing of the goal while the day is still under it", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} detail />);
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
    render(<FoodSummary eaten={eaten(2160)} target={TARGET} detail />);
    expect(screen.getByText("Goal met")).toBeTruthy();
    cleanup();
    render(<FoodSummary eaten={eaten(2500)} target={TARGET} detail />);
    expect(screen.getByText("Goal met")).toBeTruthy();
    expect(screen.getByText("100 kcal over target · Goal 2,160–2,640")).toBeTruthy();
  });

  it("marks a day past the band as over", () => {
    render(<FoodSummary eaten={eaten(2641)} target={TARGET} />);
    expect(screen.getByText("Over")).toBeTruthy();
    // Only the Food screen spells out what is left.
    expect(screen.queryByText(/kcal over target/)).toBeNull();
  });

  it("gives each macronutrient its grams against its target", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Carbs150 / 315 g");
    expect(text).toContain("Fat50 / 67 g");
    expect(text).toContain("Protein90 / 135 g");
  });
});

describe("Today's card", () => {
  it("opens the Food screen, with the day's figures on it", () => {
    render(<FoodCard eaten={eaten(1200)} target={TARGET} />);
    const card = screen.getByRole("link");
    expect(card.getAttribute("href")).toBe("/today/food");
    expect(screen.getByRole("heading", { name: "Food" })).toBeTruthy();
    expect(card.textContent).toContain("1,200 / 2,400 kcal");
  });

  it("asks for a target before there is one", () => {
    render(<FoodCard eaten={eaten(640)} target={null} />);
    expect(screen.getByRole("link").textContent).toContain("Set a daily target");
    expect(screen.getByText("640 kcal logged today")).toBeTruthy();
  });
});
