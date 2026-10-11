// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/actions/onboarding", () => ({ saveYouStepAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => {},
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import { YouStep } from "./you-step";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function show(patch: Partial<Parameters<typeof YouStep>[0]> = {}) {
  const { container } = render(
    <YouStep
      name="Bea Newcomer"
      experience={null}
      sports={null}
      units={{ weight: "kg", distance: "km", pool: "m" }}
      zone="Europe/London"
      language="en-GB"
      {...patch}
    />,
  );
  const sent = () => Object.fromEntries(new FormData(container.querySelector("form")!).entries());
  return { sent };
}

it("greets by the name given at sign-up and asks nothing given there again", () => {
  show();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome, Bea");
  expect(screen.queryByLabelText(/username/i)).toBeNull();
  expect(screen.queryByLabelText(/what should we call you/i)).toBeNull();
});

/** Audit B10: running was ticked for every new account. */
it("ticks nothing until the athlete does", () => {
  const { sent } = show();
  for (const sport of ["Strength", "Running", "Cycling", "Swimming"])
    expect(
      (screen.getByRole("checkbox", { name: new RegExp(sport) }) as HTMLInputElement).checked,
    ).toBe(false);
  expect(sent().sports).toBe("");
});

it("counts the athlete's own path in its dots, and finishes a swimmer here", () => {
  show();
  fireEvent.click(screen.getByRole("radio", { name: /I already train/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Strength/ }));
  expect(
    screen.getAllByRole("listitem").filter((dot) => dot.classList.contains("steps-dot")),
  ).toHaveLength(4);
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Strength/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Swimming/ }));
  expect(screen.queryByRole("list", { name: "Setup progress" })).toBeNull();
  expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
});

it("says the units and the zone as one line, naming only what a chosen sport uses", () => {
  const { sent } = show({
    units: { weight: "lb", distance: "mi", pool: "yd" },
    zone: "America/New_York",
  });
  expect(document.querySelector(".units-line-text")!.textContent).toBe("lb · New York time");
  fireEvent.click(screen.getByRole("checkbox", { name: /Running/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Swimming/ }));
  expect(document.querySelector(".units-line-text")!.textContent).toBe(
    "lb · miles · yard pools · New York time",
  );
  expect(sent()).toMatchObject({
    preferredUnit: "lb",
    distanceUnit: "mi",
    poolUnit: "yd",
    timeZone: "America/New_York",
    sports: "running,swimming",
  });
});

it("changes the units from the sheet", () => {
  const { sent } = show();
  fireEvent.click(screen.getByRole("checkbox", { name: /Running/ }));
  fireEvent.click(screen.getByRole("button", { name: "Change units and time zone" }));
  fireEvent.click(screen.getByRole("radio", { name: "lb" }));
  fireEvent.click(screen.getByRole("radio", { name: "mi" }));
  expect(sent()).toMatchObject({ preferredUnit: "lb", distanceUnit: "mi" });
  expect(document.querySelector(".units-line-text")!.textContent).toBe("lb · miles · London time");
});

/** The phone's zone, as the device in India that ICU, as Chrome, says is in Asia/Calcutta. */
function inIndia(check: () => void) {
  const before = process.env.TZ;
  process.env.TZ = "Asia/Kolkata";
  try {
    check();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

it("starts the account in the phone's zone by its place's current name", () => {
  inIndia(() => {
    const { sent } = show({ zone: null });
    // Asia/Kolkata, which every Postgres the save is checked against knows.
    expect(sent().timeZone).toBe("Asia/Kolkata");
    expect(document.querySelector(".units-line-text")!.textContent).toBe("kg · Kolkata time");
  });
});

it("knows the phone is in a zone saved by its old name, and lists the place once", () => {
  inIndia(() => {
    const { sent } = show({ zone: "Asia/Calcutta" });
    expect(sent().timeZone).toBe("Asia/Calcutta");
    expect(document.querySelector(".units-line-text")!.textContent).toBe("kg · Kolkata time");
    fireEvent.click(screen.getByRole("button", { name: "Change units and time zone" }));
    const zone = screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement;
    expect(zone.value).toBe("Asia/Calcutta");
    // The same place is the phone's, under the name it was saved by, and not a second choice.
    const phone = zone.querySelector<HTMLOptionElement>('optgroup[label="This phone"] option')!;
    expect(phone.value).toBe("Asia/Calcutta");
    expect(phone.textContent).toMatch(/^Kolkata · /);
    const options = Array.from(zone.options, (option) => option.value);
    expect(options).not.toContain("Asia/Kolkata");
    // Nor is any other place listed by a name the zone database has retired.
    expect(options).not.toContain("Africa/Asmera");
    expect(options).toContain("Africa/Asmara");
  });
});
