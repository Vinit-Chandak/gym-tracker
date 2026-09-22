// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SwimmingForm } from "./swimming-form";

/**
 * AT-LOG-05 to AT-LOG-07 at the screen: what the swim form will and will not let somebody
 * say. The arithmetic itself is tested in the domain; this is about the choices offered.
 */

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

const action = vi.fn(async () => ({}));

const initial = {
  startedAt: "2026-09-18T07:00",
  environment: "pool",
  distanceMethod: "unknown",
  poolLengthUnit: "m",
  distanceUnit: "m",
  hours: "",
  minutes: "",
  seconds: "",
  effort: "",
};

function swim(overrides: Record<string, string> = {}) {
  return render(
    <SwimmingForm
      action={action}
      initial={{ ...initial, ...overrides }}
      submissionKey="11111111-1111-4111-8111-111111111111"
      submitLabel="Save activity"
    />,
  );
}

afterEach(cleanup);

it("opens with the measurements blank", () => {
  swim();
  expect(screen.getByLabelText("Elapsed time")).toBeTruthy();
  // Nothing is preselected about how far: a plan's target is not a result (ACTUAL-01).
  expect(screen.queryByRole("textbox", { name: "Lengths" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Distance" })).toBeNull();
});

it("works out the distance from the pool that was actually swum in", () => {
  swim({ distanceMethod: "lengths", poolLengthValue: "25", lengths: "16" });
  // One length is one trip down the pool: sixteen of them in a 25 m pool is 400 m.
  expect(screen.getByRole("status").textContent).toContain("400 m");
});

it("says the same count in yards is a different distance", () => {
  swim({
    distanceMethod: "lengths",
    poolLengthValue: "25",
    poolLengthUnit: "yd",
    lengths: "16",
  });
  const status = screen.getByRole("status").textContent ?? "";
  expect(status).toContain("400 yd");
  expect(status).toContain("365.76 m");
});

it("offers no lengths at all in open water", () => {
  swim({ environment: "open_water" });
  expect(screen.queryByRole("radio", { name: "Count lengths" })).toBeNull();
  expect(screen.getByRole("radio", { name: "Enter distance" })).toBeTruthy();
});

it("preserves a known pool when correcting a manually measured swim", () => {
  const { container } = swim({
    distanceMethod: "manual",
    distanceValue: "500",
    poolLengthValue: "25",
    poolLengthUnit: "yd",
  });
  const form = container.querySelector("form")!;
  expect(new FormData(form).get("poolLengthValue")).toBe("25");
  expect(new FormData(form).get("poolLengthUnit")).toBe("yd");

  fireEvent.click(screen.getByRole("radio", { name: "Open water" }));
  expect(new FormData(form).has("poolLengthValue")).toBe(false);
});

it("drops back to a real choice when the swim moves to open water", () => {
  swim({ distanceMethod: "lengths", poolLengthValue: "25", lengths: "16" });
  expect(screen.getByRole("textbox", { name: "Lengths" })).toBeTruthy();

  fireEvent.click(screen.getByRole("radio", { name: "Open water" }));

  // The lengths method went with the pool rather than asserting lengths in a lake.
  expect(screen.queryByRole("textbox", { name: "Lengths" })).toBeNull();
});

it("says plainly that an unknown distance stays unknown", () => {
  swim();
  expect(screen.getByText(/Nothing is made up for the distance/)).toBeTruthy();
});

it("gives no pace until a swimming time is stated", () => {
  swim({ distanceMethod: "lengths", poolLengthValue: "25", lengths: "16", minutes: "10" });
  const statuses = screen.getAllByRole("status").map((node) => node.textContent ?? "");
  expect(statuses.some((text) => text.includes("per 100"))).toBe(false);
});
