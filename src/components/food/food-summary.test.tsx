// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { macroTargets, type FoodTotals } from "@/domain/nutrition";

import { FoodSummary } from "./food-summary";

afterEach(cleanup);

const TARGET = macroTargets({ dailyKcal: 2400, proteinPerKg: 1.8, split: "body_weight" }, 75);
const eaten = (kcal: number): FoodTotals => ({ kcal, carbsG: 150, fatG: 50, proteinG: 90 });

describe("the summary", () => {
  it("shows exact kcal at the fractional edges of the goal band", () => {
    const target = macroTargets(
      { dailyKcal: 501, proteinPerKg: 1.8, split: "fixed_55_25_20" },
      null,
    );
    render(<FoodSummary eaten={eaten(551.2)} target={target} />);
    expect(screen.getByText("Over")).toBeTruthy();
    expect(screen.getByText("50.2 kcal over target · Goal 450.9–551.1")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("551.2 of 501 kcal");
  });
  it("says nothing of the goal while the day is still under it", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} />);
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
    render(<FoodSummary eaten={eaten(2160)} target={TARGET} />);
    expect(screen.getByText("Goal met")).toBeTruthy();
    cleanup();
    render(<FoodSummary eaten={eaten(2500)} target={TARGET} />);
    expect(screen.getByText("Goal met")).toBeTruthy();
    expect(screen.getByText("100 kcal over target · Goal 2,160–2,640")).toBeTruthy();
  });

  it("marks a day past the band as over, and by how much", () => {
    render(<FoodSummary eaten={eaten(2641)} target={TARGET} />);
    expect(screen.getByText("Over")).toBeTruthy();
    expect(screen.getByText("241 kcal over target · Goal 2,160–2,640")).toBeTruthy();
  });

  it("gives each macronutrient its grams against its target", () => {
    render(<FoodSummary eaten={eaten(1200)} target={TARGET} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Carbs150 / 315 g");
    expect(text).toContain("Fat50 / 67 g");
    expect(text).toContain("Protein90 / 135 g");
  });
});
