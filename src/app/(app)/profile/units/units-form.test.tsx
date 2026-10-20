// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnitsForm, type UnitsValues } from "./units-form";

vi.mock("@/server/actions/profile", () => ({ saveUnitsAction: vi.fn(async () => ({})) }));
afterEach(cleanup);

const saved: UnitsValues = {
  timeZone: "Europe/Lisbon",
  preferredUnit: "kg",
  distanceUnit: "km",
  poolUnit: "m",
  swims: false,
};

const chooseUnit = (label: string) => fireEvent.click(screen.getByRole("radio", { name: label }));

/** What the form would send, as the server reads it. */
const posted = (container: HTMLElement, name: string) =>
  new FormData(container.querySelector("form")!).get(name);

describe("units and time zone", () => {
  it("holds the weight, the distance and the zone, with Save", () => {
    render(<UnitsForm values={saved} />);
    expect(screen.getByRole("radiogroup", { name: "Weight" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Distance" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Time zone" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    // Who the person is, and body weight, are other screens'.
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByLabelText(/^Body weight/)).toBeNull();
  });

  it("offers the time zone as places under their regions, the saved one chosen", () => {
    render(<UnitsForm values={saved} />);
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
      render(<UnitsForm values={{ ...saved, timeZone: "Asia/Kolkata" }} />);
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
    render(<UnitsForm values={{ ...saved, timeZone: "EST" }} />);
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

  it("carries the distances along with the weight unit until they are set apart", () => {
    const { container } = render(<UnitsForm values={{ ...saved, swims: true }} />);
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
    expect([posted(container, "distanceUnit"), posted(container, "poolUnit")]).toEqual([
      "mi",
      "yd",
    ]);
    expect((screen.getByRole("radio", { name: "Yards" }) as HTMLInputElement).checked).toBe(true);

    // Kilometres chosen by hand beside pounds stay, whatever the weight unit does next.
    fireEvent.click(screen.getByRole("radio", { name: "km" }));
    chooseUnit("kg");
    chooseUnit("lb");
    expect([posted(container, "distanceUnit"), posted(container, "poolUnit")]).toEqual([
      "km",
      "yd",
    ]);
  });

  it("keeps a distance saved apart from the weight unit where it is", () => {
    const { container } = render(<UnitsForm values={{ ...saved, distanceUnit: "mi" }} />);
    chooseUnit("lb");
    chooseUnit("kg");
    expect(posted(container, "distanceUnit")).toBe("mi");
  });

  it("asks about pools only of an account that swims, and still sends its pool", () => {
    const { container } = render(<UnitsForm values={saved} />);
    expect(screen.queryByRole("radiogroup", { name: "Pools" })).toBeNull();
    chooseUnit("lb");
    // Not asked, so it goes on following the weight unit.
    expect(posted(container, "poolUnit")).toBe("yd");
  });

  it("does not let an action reset the units chosen", () => {
    const { container } = render(<UnitsForm values={{ ...saved, timeZone: "UTC" }} />);
    chooseUnit("lb");
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "Asia/Tokyo" },
    });
    container.querySelector("form")!.reset();
    expect((screen.getByRole("radio", { name: "lb" }) as HTMLInputElement).checked).toBe(true);
    expect(posted(container, "preferredUnit")).toBe("lb");
    // The distance that followed the weight unit stays where it followed it to.
    expect(posted(container, "distanceUnit")).toBe("mi");
    expect(posted(container, "timeZone")).toBe("Asia/Tokyo");
  });
});
