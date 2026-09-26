// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { saveTargetsAction } from "@/server/actions/nutrition";

import { TargetsForm } from "./targets-form";

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, unstable_rethrow: () => {} }));
vi.mock("@/server/actions/nutrition", () => ({ saveTargetsAction: vi.fn(async () => ({})) }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const field = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });
const KCAL = "Daily target, kcal";
const PROTEIN = "Protein, g per kg of body weight";
const FAT = "Fat, % of daily target";
/** The split's numbers are held together by non-breaking spaces. */
const USE_SPLIT = /^Use 55\s\/\s25\s\/\s20$/;

it("starts a first set of targets from the goal's split, following the target as it is typed", () => {
  render(<TargetsForm targets={null} bodyWeightKg={63.5} unit="kg" goal="build_muscle" />);
  expect(field(KCAL).value).toBe("");
  expect(field(PROTEIN).value).toBe("");
  expect(field(FAT).value).toBe("25");
  expect(screen.getByText("Build muscle")).toBeTruthy();
  expect(screen.queryByText(/^Carbs /)).toBeNull();

  // 20% of 2,700 kcal is 135 g, 2.1 g/kg at 63.5 kg.
  fireEvent.change(field(KCAL), { target: { value: "2700" } });
  expect(field(PROTEIN).value).toBe("2.1");
  expect(screen.getByText("133 g at 63.5 kg")).toBeTruthy();
  expect(screen.getByText("Carbs 373 g · Fat 75 g · Protein 133 g")).toBeTruthy();
  fireEvent.change(field(KCAL), { target: { value: "3000" } });
  expect(field(PROTEIN).value).toBe("2.4");
  // Nothing to offer while the form already holds the split.
  expect(screen.queryByRole("button", { name: USE_SPLIT })).toBeNull();
  expect(screen.getByRole("button", { name: "Set target" })).toBeTruthy();
});

it("starts from 45 / 25 / 30 to lose fat, and 60 / 20 / 20 for endurance", () => {
  render(<TargetsForm targets={null} bodyWeightKg={63.5} unit="kg" goal="lose_fat" />);
  fireEvent.change(field(KCAL), { target: { value: "2200" } });
  // 30% of 2,200 kcal is 165 g, 2.6 g/kg at 63.5 kg.
  expect(field(PROTEIN).value).toBe("2.6");
  expect(field(FAT).value).toBe("25");
  cleanup();
  render(<TargetsForm targets={null} bodyWeightKg={63.5} unit="kg" goal="endurance" />);
  expect(field(FAT).value).toBe("20");
});

it("stops following the split once protein or fat is changed, and offers it back", () => {
  render(<TargetsForm targets={null} bodyWeightKg={63.5} unit="kg" goal="build_muscle" />);
  fireEvent.change(field(KCAL), { target: { value: "2700" } });
  fireEvent.change(field(PROTEIN), { target: { value: "1.8" } });
  fireEvent.change(field(KCAL), { target: { value: "2900" } });
  expect(field(PROTEIN).value).toBe("1.8");
  expect(field(FAT).value).toBe("25");
  fireEvent.click(screen.getByRole("button", { name: USE_SPLIT }));
  // 20% of 2,900 kcal is 145 g, 2.28 g/kg at 63.5 kg, kept as 2.3.
  expect(field(PROTEIN).value).toBe("2.3");
  expect(screen.queryByRole("button", { name: USE_SPLIT })).toBeNull();
});

it("shows saved targets as they are, offering the goal's split while they differ", () => {
  const { container } = render(
    <TargetsForm
      targets={{ dailyKcal: 2700, proteinPerKg: 1.8, fatPercent: 25 }}
      bodyWeightKg={63.5}
      unit="kg"
      goal="build_muscle"
    />,
  );
  expect(field(KCAL).value).toBe("2700");
  expect(field(PROTEIN).value).toBe("1.8");
  expect(screen.getByText("114 g at 63.5 kg")).toBeTruthy();
  expect(screen.getByText("Carbs 392 g · Fat 75 g · Protein 114 g")).toBeTruthy();
  expect(screen.getByRole("button", { name: USE_SPLIT })).toBeTruthy();
  fireEvent.change(field(FAT), { target: { value: "30" } });
  expect(screen.getByText("Carbs 358 g · Fat 90 g · Protein 114 g")).toBeTruthy();
  expect(Object.fromEntries(new FormData(container.querySelector("form")!))).toEqual({
    dailyKcal: "2700",
    proteinPerKg: "1.8",
    fatPercent: "30",
  });
  expect(screen.getByRole("button", { name: "Save targets" })).toBeTruthy();
});

it("takes protein from the goal's share, and says so, until there is a body weight", () => {
  render(<TargetsForm targets={null} bodyWeightKg={null} unit="kg" goal="lose_fat" />);
  expect(screen.getByText(/protein is 30% of the target until there is/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Add it in your profile" }).getAttribute("href")).toBe(
    "/profile/edit",
  );
  fireEvent.change(field(KCAL), { target: { value: "2400" } });
  expect(field(PROTEIN).value).toBe("1.8");
  expect(screen.getByText("Carbs 270 g · Fat 67 g · Protein 180 g")).toBeTruthy();
});

it("warns when protein and fat leave nothing for carbs, in the account's own unit", () => {
  render(
    <TargetsForm
      targets={{ dailyKcal: 1200, proteinPerKg: 2.2, fatPercent: 25 }}
      bodyWeightKg={120}
      unit="lb"
      goal="build_muscle"
    />,
  );
  expect(screen.getByText(/nothing left for carbs/)).toBeTruthy();
  // The weight is written in the account's own unit; the ratio stays per kilogram.
  expect(screen.getByText("264 g at 264.6 lb")).toBeTruthy();
});

it("says a goal that is not set, and starts from 55 / 25 / 20", () => {
  render(<TargetsForm targets={null} bodyWeightKg={80} unit="kg" goal={null} />);
  expect(screen.getByText("Not set")).toBeTruthy();
  fireEvent.change(field(KCAL), { target: { value: "2400" } });
  // 20% of 2,400 kcal is 120 g, 1.5 g/kg at 80 kg.
  expect(field(PROTEIN).value).toBe("1.5");
});

it("goes back to the Food screen once saved", async () => {
  render(
    <TargetsForm
      targets={{ dailyKcal: 2700, proteinPerKg: 1.8, fatPercent: 25 }}
      bodyWeightKg={63.5}
      unit="kg"
      goal="build_muscle"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/food"));
  expect(vi.mocked(saveTargetsAction)).toHaveBeenCalledOnce();
});

it("stays, with what was typed, when the save is refused", async () => {
  vi.mocked(saveTargetsAction).mockResolvedValueOnce({
    fieldErrors: { fatPercent: "Enter between 5 and 80%." },
    values: { dailyKcal: "2700", proteinPerKg: "1.8", fatPercent: "90" },
  });
  render(
    <TargetsForm
      targets={{ dailyKcal: 2700, proteinPerKg: 1.8, fatPercent: 25 }}
      bodyWeightKg={63.5}
      unit="kg"
      goal="build_muscle"
    />,
  );
  fireEvent.change(field(FAT), { target: { value: "80" } });
  fireEvent.click(screen.getByRole("button", { name: "Save targets" }));
  expect(await screen.findByText("Enter between 5 and 80%.")).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});
