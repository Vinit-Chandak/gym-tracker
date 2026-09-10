// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileFields, type ProfileFieldValues } from "./profile-fields";

afterEach(cleanup);

const saved: ProfileFieldValues = {
  displayName: "Sam",
  timeZone: "Europe/Lisbon",
  preferredUnit: "kg",
  bodyWeightKg: 74.5,
  heightCm: 177.8,
  dateOfBirth: "1994-03-21",
  sex: "female",
  trainingGoal: "build_muscle",
};

const weightField = () => screen.getByLabelText(/^Body weight/) as HTMLInputElement;
const chooseUnit = (label: RegExp) => fireEvent.click(screen.getByRole("radio", { name: label }));

describe("profile fields", () => {
  it("shows a saved profile in the units it was saved with", () => {
    render(<ProfileFields values={saved} />);
    expect(weightField().value).toBe("74.5");
    expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("177.8");
  });

  it("restates the saved measurements when the unit changes", () => {
    render(<ProfileFields values={saved} />);
    chooseUnit(/pounds/);

    expect(weightField().value).toBe("164.2");
    expect((screen.getByLabelText("Feet") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Inches") as HTMLInputElement).value).toBe("10");
    // The centimetres field is gone, so nothing is submitted under two units at once.
    expect(screen.queryByLabelText("Height (cm)")).toBeNull();
  });

  it("carries what is being typed across the change, not what was saved", () => {
    render(<ProfileFields values={saved} />);
    fireEvent.change(weightField(), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "180" } });
    chooseUnit(/pounds/);

    expect(weightField().value).toBe("176.4");
    // 180 cm is 70.9 inches, which states as 5′ 11″.
    expect((screen.getByLabelText("Feet") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Inches") as HTMLInputElement).value).toBe("11");
  });

  it("comes back to the same numbers after a round trip", () => {
    render(<ProfileFields values={saved} />);
    chooseUnit(/pounds/);
    chooseUnit(/kilograms/);

    expect(weightField().value).toBe("74.5");
    expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("177.8");
  });

  it("leaves an unanswered profile empty rather than guessing", () => {
    render(
      <ProfileFields
        values={{
          ...saved,
          displayName: "",
          bodyWeightKg: null,
          heightCm: null,
          dateOfBirth: null,
          sex: null,
          trainingGoal: null,
        }}
      />,
    );
    expect(weightField().value).toBe("");
    expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/^Date of birth/) as HTMLInputElement).value).toBe("");
    // Nothing said about sex means the fourth option, which is a real answer.
    expect(
      (screen.getByRole("radio", { name: "Prefer not to say" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("names the field in the unit it is asking for", () => {
    render(<ProfileFields values={saved} />);
    expect(screen.getByLabelText("Body weight (kg)")).toBeTruthy();
    chooseUnit(/pounds/);
    expect(screen.getByLabelText("Body weight (lb)")).toBeTruthy();
  });
});
