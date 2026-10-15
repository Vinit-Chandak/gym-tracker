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
  expect(screen.getByRole("status").textContent).toContain("400\u00a0m");
});

it("says the same count in yards is a different distance", () => {
  swim({
    distanceMethod: "lengths",
    poolLengthValue: "25",
    poolLengthUnit: "yd",
    lengths: "16",
  });
  const status = screen.getByRole("status").textContent ?? "";
  expect(status).toContain("400\u00a0yd");
  expect(status).toContain("365.76\u00a0m");
});

it("says a pool's distance once to a swimmer who swims in its unit, and in theirs otherwise", () => {
  const lengths = { distanceMethod: "lengths", poolLengthValue: "25", lengths: "84" };
  const inYards = { ...lengths, poolLengthUnit: "yd" };
  render(
    <SwimmingForm
      action={action}
      initial={{ ...initial, ...inYards }}
      submissionKey="11111111-1111-4111-8111-111111111111"
      submitLabel="Save activity"
      readIn="yd"
    />,
  );
  // A yard swimmer in a yard pool: "2,100 yd", not "2,100 yd · 1,920.24 m".
  expect(screen.getByRole("status").textContent).toBe("2,100\u00a0yd");
  cleanup();
  render(
    <SwimmingForm
      action={action}
      initial={{ ...initial, ...lengths }}
      submissionKey="11111111-1111-4111-8111-111111111111"
      submitLabel="Save activity"
      readIn="yd"
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("2,100\u00a0m ·\u00a02,296.59\u00a0yd");
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

it("opens a distance entered in metres in the swimmer's yards, and keeps it until it is changed", () => {
  // Liam swims in yards; his open-water swim was entered as 1500 m, and its page reads 1,640 yd.
  const { container } = render(
    <SwimmingForm
      action={action}
      initial={{
        ...initial,
        environment: "open_water",
        distanceMethod: "manual",
        distanceValue: "1500",
        distanceUnit: "m",
      }}
      submissionKey="11111111-1111-4111-8111-111111111111"
      submitLabel="Save changes"
      readIn="yd"
    />,
  );
  const distance = screen.getByLabelText("Distance") as HTMLInputElement;
  expect(distance.value).toBe("1640");
  expect(screen.getByText("Entered as 1,500 m")).toBeTruthy();
  const posted = () => new FormData(container.querySelector("form")!);
  // Saved as it is, nothing is converted: the swim is still the 1500 m it was entered as.
  expect([posted().get("distanceValue"), posted().get("distanceUnit")]).toEqual(["1500", "m"]);
  fireEvent.change(distance, { target: { value: "1650" } });
  expect([posted().get("distanceValue"), posted().get("distanceUnit")]).toEqual(["1650", "yd"]);
  expect(screen.queryByText(/Entered as/)).toBeNull();
});
