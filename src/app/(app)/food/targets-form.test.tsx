// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { TargetsForm } from "./targets-form";

vi.mock("@/server/actions/nutrition", () => ({ saveTargetsAction: vi.fn(async () => ({})) }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const field = (name: string) => screen.getByRole("textbox", { name });

it("works out the grams as the target is typed, protein from the body weight", () => {
  render(<TargetsForm targets={null} bodyWeightKg={75} unit="kg" submitLabel="Set target" />);
  expect(screen.queryByText(/^Carbs /)).toBeNull();
  fireEvent.change(field("Daily target, kcal"), { target: { value: "2400" } });
  expect(screen.getByText("Carbs 315 g · Fat 67 g · Protein 135 g")).toBeTruthy();
  expect(screen.getByText("135 g at 75 kg")).toBeTruthy();
  fireEvent.change(field("Protein, g per kg of body weight"), { target: { value: "2" } });
  expect(screen.getByText("Carbs 300 g · Fat 67 g · Protein 150 g")).toBeTruthy();
  fireEvent.change(field("Protein, g per kg of body weight"), { target: { value: "1.84" } });
  expect(screen.getByText("Carbs 315 g · Fat 67 g · Protein 135 g")).toBeTruthy();
  expect(screen.getByText("135 g at 75 kg")).toBeTruthy();
});

it("keeps protein per kilogram while the fixed split hides it", () => {
  const { container } = render(
    <TargetsForm
      targets={{ dailyKcal: 2400, proteinPerKg: 2.2, split: "body_weight" }}
      bodyWeightKg={75}
      unit="kg"
      submitLabel="Save targets"
    />,
  );
  // The label keeps its numbers together with non-breaking spaces.
  fireEvent.click(screen.getByRole("radio", { name: /^55\s\/\s25\s\/\s20$/ }));
  expect(screen.queryByRole("textbox", { name: "Protein, g per kg of body weight" })).toBeNull();
  expect(screen.getByText("Carbs 330 g · Fat 67 g · Protein 120 g")).toBeTruthy();
  const form = new FormData(container.querySelector("form")!);
  expect(Object.fromEntries(form)).toEqual({
    dailyKcal: "2400",
    split: "fixed_55_25_20",
    proteinPerKg: "2.2",
  });
});

it("says why protein is not from body weight when there is none to go on", () => {
  render(<TargetsForm targets={null} bodyWeightKg={null} unit="kg" submitLabel="Set target" />);
  expect(screen.getByRole("link", { name: "Add it in your profile" }).getAttribute("href")).toBe(
    "/profile/edit",
  );
  fireEvent.change(field("Daily target, kcal"), { target: { value: "2400" } });
  expect(screen.getByText("Carbs 330 g · Fat 67 g · Protein 120 g")).toBeTruthy();
});

it("warns when protein and fat leave nothing for carbs", () => {
  render(
    <TargetsForm
      targets={{ dailyKcal: 1200, proteinPerKg: 2.2, split: "body_weight" }}
      bodyWeightKg={120}
      unit="lb"
      submitLabel="Save targets"
    />,
  );
  expect(screen.getByText(/nothing left for carbs/)).toBeTruthy();
  // The weight is written in the account's own unit; the ratio stays per kilogram.
  expect(screen.getByText("264 g at 264.6 lb")).toBeTruthy();
});
