// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileFields, type ProfileFieldValues } from "./profile-fields";

afterEach(cleanup);

const saved: ProfileFieldValues = {
  displayName: "Sam",
  username: "sam",
  timeZone: "Europe/Lisbon",
  preferredUnit: "kg",
  distanceUnit: "km",
  poolUnit: "m",
  swims: false,
  bodyWeightKg: 74.5,
  heightCm: 177.8,
  dateOfBirth: "1994-03-21",
  sex: "female",
  trainingGoal: "build_muscle",
};

const weightField = () => screen.getByLabelText(/^Body weight/) as HTMLInputElement;
const chooseUnit = (label: string) => fireEvent.click(screen.getByRole("radio", { name: label }));

describe("profile fields", () => {
  it("shows a saved profile in the units it was saved with", () => {
    render(<ProfileFields values={saved} />);
    expect(weightField().value).toBe("74.5");
    expect((screen.getByLabelText("Height (cm)") as HTMLInputElement).value).toBe("177.8");
  });

  it("restates the saved measurements when the unit changes", () => {
    render(<ProfileFields values={saved} />);
    chooseUnit("lb");

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
    chooseUnit("lb");

    expect(weightField().value).toBe("176.4");
    // 180 cm is 70.9 inches, which states as 5′ 11″.
    expect((screen.getByLabelText("Feet") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Inches") as HTMLInputElement).value).toBe("11");
  });

  it("comes back to the same numbers after a round trip", () => {
    render(<ProfileFields values={saved} />);
    chooseUnit("lb");
    chooseUnit("kg");

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

  it("offers the time zone as places under their regions, the saved one chosen", () => {
    render(<ProfileFields values={saved} />);
    const zone = screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement;
    expect(zone.value).toBe("Europe/Lisbon");
    const chosen = zone.selectedOptions[0]!;
    expect(chosen.textContent).toBe("Lisbon");
    expect((chosen.parentElement as HTMLOptGroupElement).label).toBe("Europe");
    // Places only: no abbreviation or offset is on the list to be chosen.
    const values = Array.from(zone.options, (option) => option.value);
    expect(values).toContain("Asia/Tokyo");
    expect(values).toContain("UTC");
    expect(values.some((value) => /^[A-Z]{3,4}$|^[+-]\d/.test(value) && value !== "UTC")).toBe(
      false,
    );
    fireEvent.change(zone, { target: { value: "Asia/Tokyo" } });
    expect(zone.value).toBe("Asia/Tokyo");
  });

  it("knows a device in Asia/Calcutta is in the saved Asia/Kolkata, and lists Kolkata once", () => {
    const before = process.env.TZ;
    // ICU, as Chrome, says Asia/Calcutta for a device in India.
    process.env.TZ = "Asia/Kolkata";
    try {
      render(<ProfileFields values={{ ...saved, timeZone: "Asia/Kolkata" }} />);
      const zone = screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement;
      expect(zone.value).toBe("Asia/Kolkata");
      expect(zone.selectedOptions[0]?.textContent).toBe("Kolkata (this device)");
      // The same place is not a mismatch with the device, nor a second choice.
      expect(screen.queryByText(/This device:/)).toBeNull();
      const options = Array.from(zone.options, (option) => option.value);
      expect(options.filter((value) => /Kolkata|Calcutta/.test(value))).toEqual(["Asia/Kolkata"]);
      // Nor is any other place listed by a name the zone database has retired.
      expect(options).not.toContain("Africa/Asmera");
      expect(options).not.toContain("America/Godthab");
      expect(options).toContain("Africa/Asmara");
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it("asks for a place where the saved zone was an abbreviation or an offset", () => {
    render(<ProfileFields values={{ ...saved, timeZone: "EST" }} />);
    const zone = screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement;
    // Nothing is chosen for them, and the field says why.
    expect(zone.value).toBe("");
    expect(zone.required).toBe(true);
    expect(zone.selectedOptions[0]?.textContent).toBe("Choose a time zone");
    expect(screen.getByText("Choose a place: “EST” can mean more than one zone.")).toBeTruthy();
    fireEvent.change(zone, { target: { value: "America/New_York" } });
    expect(zone.value).toBe("America/New_York");
    expect(screen.queryByText(/Choose a place/)).toBeNull();
  });

  it("names the field in the unit it is asking for", () => {
    render(<ProfileFields values={saved} />);
    expect(screen.getByLabelText("Body weight (kg)")).toBeTruthy();
    chooseUnit("lb");
    expect(screen.getByLabelText("Body weight (lb)")).toBeTruthy();
  });

  it("carries the distances along with the weight unit until they are set apart", () => {
    const { container } = render(
      <form>
        <ProfileFields values={{ ...saved, swims: true }} />
      </form>,
    );
    const posted = (name: string) => new FormData(container.querySelector("form")!).get(name);
    // What each unit decides is its ⓘ, not a line under the control.
    expect(
      screen.getByRole("radiogroup", { name: "Weight" }).hasAttribute("aria-describedby"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "About weight" }));
    expect(screen.getByRole("note").textContent).toMatch(/^Loads and body weight, and height/);
    fireEvent.click(screen.getByRole("button", { name: "About weight" }));
    fireEvent.click(screen.getByRole("button", { name: "About distance" }));
    expect(screen.getByRole("note").textContent).toBe(
      "Runs and rides. Carries and sleds go in metres with km, in yards with miles.",
    );

    // Pounds read miles and yard pools (ADR 0055).
    chooseUnit("lb");
    expect([posted("distanceUnit"), posted("poolUnit")]).toEqual(["mi", "yd"]);
    expect((screen.getByRole("radio", { name: "Yards" }) as HTMLInputElement).checked).toBe(true);

    // Kilometres chosen by hand beside pounds stay, whatever the weight unit does next.
    fireEvent.click(screen.getByRole("radio", { name: "km" }));
    chooseUnit("kg");
    chooseUnit("lb");
    expect([posted("distanceUnit"), posted("poolUnit")]).toEqual(["km", "yd"]);
  });

  it("keeps a distance saved apart from the weight unit where it is", () => {
    const { container } = render(
      <form>
        <ProfileFields values={{ ...saved, distanceUnit: "mi" }} />
      </form>,
    );
    const posted = (name: string) => new FormData(container.querySelector("form")!).get(name);
    chooseUnit("lb");
    chooseUnit("kg");
    expect(posted("distanceUnit")).toBe("mi");
  });

  it("asks about pools only of an account that swims, and still sends its pool", () => {
    const { container } = render(
      <form>
        <ProfileFields values={saved} />
      </form>,
    );
    expect(screen.queryByRole("radiogroup", { name: "Pools" })).toBeNull();
    chooseUnit("lb");
    // Not asked, so it goes on following the weight unit.
    expect(new FormData(container.querySelector("form")!).get("poolUnit")).toBe("yd");
  });
});
