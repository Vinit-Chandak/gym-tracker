// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/server/actions/profile", () => ({ saveOnboardingProfileAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("@/components/username-field", () => ({ UsernameField: () => null }));

import { basicProfileInputSchema } from "@/server/validation/profile";

import { ProfileStepForm } from "./profile-step-form";

afterEach(cleanup);

const values = {
  displayName: "Sam",
  username: "sam",
  timeZone: "Europe/London",
  preferredUnit: "kg" as const,
  bodyWeightKg: null,
  heightCm: null,
  dateOfBirth: null,
  sex: null,
  trainingGoal: null,
};

it("asks Which sounds like you once, on the first step, with nothing chosen for you", () => {
  render(<ProfileStepForm {...values} trainingExperience={null} />);
  const group = screen.getByRole("radiogroup", { name: "Which sounds like you?" });
  const options = screen.getAllByRole("radio").filter((radio) => group.contains(radio));
  expect(options.map((radio) => radio.getAttribute("value"))).toEqual(["new", "experienced"]);
  expect(options.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  expect(screen.getByLabelText("I'm new to this")).toBeTruthy();
  expect(screen.getByLabelText("I already train")).toBeTruthy();
});

it("shows the answer already given, and requires one", () => {
  render(<ProfileStepForm {...values} trainingExperience="experienced" />);
  expect((screen.getByLabelText("I already train") as HTMLInputElement).checked).toBe(true);
  const base = {
    displayName: "",
    username: "sam_1",
    timeZone: "Europe/London",
    preferredUnit: "kg",
  };
  expect(basicProfileInputSchema.safeParse(base).success).toBe(false);
  expect(
    basicProfileInputSchema.safeParse({ ...base, trainingExperience: "new" }).data
      ?.trainingExperience,
  ).toBe("new");
});
