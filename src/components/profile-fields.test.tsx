// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileFields, type ProfileFieldValues } from "./profile-fields";

vi.mock("@/server/actions/people", () => ({ checkUsernameAction: vi.fn() }));
afterEach(cleanup);

const saved: ProfileFieldValues = {
  displayName: "Sam",
  username: "sam",
  preferredUnit: "kg",
  heightCm: 177.8,
  dateOfBirth: "1994-03-21",
  sex: "female",
  trainingGoal: "build_muscle",
};

/** What the form would send, as the server reads it. */
const posted = (container: HTMLElement) =>
  Object.fromEntries(new FormData(container.querySelector("form")!));

describe("profile fields", () => {
  it("asks who the person is, and nothing of units, the zone or body weight", () => {
    render(<ProfileFields values={saved} />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Username" })).toBeTruthy();
    expect(screen.getByLabelText(/^Date of birth/)).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Sex" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Training goal" })).toBeTruthy();
    // Units and time zone, and Today › Log › Body weight, are where those are set now.
    expect(screen.queryByRole("radiogroup", { name: "Weight" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Distance" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Time zone" })).toBeNull();
    expect(screen.queryByLabelText(/^Body weight/)).toBeNull();
  });

  it("asks the height in centimetres for an account in kilograms, and says so", () => {
    const { container } = render(
      <form>
        <ProfileFields values={saved} />
      </form>,
    );
    expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("177.8");
    expect(posted(container)).toMatchObject({ heightUnit: "cm", heightCm: "177.8" });
    // Where its measure is chosen is its ⓘ.
    fireEvent.click(screen.getByRole("button", { name: "About height (cm)" }));
    expect(screen.getByRole("note").textContent).toContain("Units and time zone");
  });

  it("asks it in feet and inches for an account in pounds, and says so", () => {
    const { container } = render(
      <form>
        <ProfileFields values={{ ...saved, preferredUnit: "lb" }} />
      </form>,
    );
    expect((screen.getByLabelText("Feet") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Inches") as HTMLInputElement).value).toBe("10");
    expect(screen.queryByLabelText("Height (cm)")).toBeNull();
    expect(posted(container)).toMatchObject({
      heightUnit: "ftin",
      heightFeet: "5",
      heightInches: "10",
    });
    fireEvent.click(screen.getByRole("button", { name: "About height" }));
    expect(screen.getByRole("note").textContent).toContain("Units and time zone");
  });

  it("leaves an unanswered profile empty rather than guessing", () => {
    render(
      <ProfileFields
        values={{
          ...saved,
          displayName: "",
          heightCm: null,
          dateOfBirth: null,
          sex: null,
          trainingGoal: null,
        }}
      />,
    );
    expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/^Date of birth/) as HTMLInputElement).value).toBe("");
    // Nothing said about sex means the fourth option, which is a real answer.
    expect(
      (screen.getByRole("radio", { name: "Prefer not to say" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("keeps every answer when a refused save resets the form", () => {
    const { container } = render(
      <form>
        <ProfileFields values={{ ...saved, sex: null }} />
      </form>,
    );
    fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("radio", { name: "Male" }));
    container.querySelector("form")!.reset();
    expect(posted(container)).toMatchObject({
      heightCm: "180",
      sex: "male",
      trainingGoal: "build_muscle",
      dateOfBirth: "1994-03-21",
    });
  });
});
