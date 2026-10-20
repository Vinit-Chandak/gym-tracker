// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CyclingForm } from "./cycling-form";

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(cleanup);

const props = {
  action: async () => ({}),
  submissionKey: "ride-submission",
  submitLabel: "Save ride",
};

it("asks about assistance outdoors only, and keeps the answer while it is indoors", () => {
  // An indoor ride's edit asked "Not sure / Unassisted / Assisted" of a trainer.
  const { container } = render(
    <CyclingForm
      {...props}
      initial={{ startedAt: "2026-10-11T09:48", environment: "indoor", assistance: "assisted" }}
    />,
  );
  const form = container.querySelector("form")!;
  expect(screen.queryByRole("radiogroup", { name: "Assistance" })).toBeNull();
  // Still sent as it was, so saving an indoor ride rewrites nothing it did not ask.
  expect(new FormData(form).get("assistance")).toBe("assisted");

  fireEvent.click(screen.getByRole("radio", { name: "Outdoor" }));
  expect(screen.getByRole("radiogroup", { name: "Assistance" })).toBeTruthy();
  expect(new FormData(form).get("environment")).toBe("outdoor");
});

it("opens a ride in the rider's miles, its climb in feet, and posts both as stored until changed", () => {
  const { container } = render(
    <CyclingForm
      {...props}
      initial={{
        startedAt: "2026-10-11T09:48",
        environment: "outdoor",
        distanceValue: "40",
        distanceUnit: "km",
        elevationGainMetres: "89",
      }}
      readIn="mi"
    />,
  );
  const posted = () => new FormData(container.querySelector("form")!);
  expect((screen.getByLabelText("Distance") as HTMLInputElement).value).toBe("24");
  expect((screen.getByLabelText("Distance, after the point") as HTMLInputElement).value).toBe("85");
  // Optional at the end of its name and read with it; what was entered under it.
  expect(screen.getByText("Entered as 40 km")).toBeTruthy();
  const distance = screen.getByRole("textbox", { name: "Distance" });
  const said = (distance.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent);
  expect(said).toContain("Optional");
  expect([posted().get("distanceValue"), posted().get("distanceUnit")]).toEqual(["40", "km"]);
  // 89 m is 292 ft, said in feet beside miles and kept in metres.
  const climb = screen.getByLabelText("Elevation gain ft") as HTMLInputElement;
  expect(climb.value).toBe("292");
  expect(posted().get("elevationGainMetres")).toBe("89");
  fireEvent.change(climb, { target: { value: "300" } });
  expect(posted().get("elevationGainMetres")).toBe("91.44");
});

it("opens a ride with no distance in the rider's own unit", () => {
  const { container } = render(
    <CyclingForm
      {...props}
      initial={{ startedAt: "2026-10-11T09:48", environment: "indoor", distanceUnit: "km" }}
      readIn="mi"
    />,
  );
  expect(new FormData(container.querySelector("form")!).get("distanceUnit")).toBe("mi");
  expect(screen.getByLabelText("Elevation gain ft")).toBeTruthy();
});

it("names the date among what it folds away, so a ride logged late can be dated", () => {
  const { container } = render(
    <CyclingForm {...props} initial={{ startedAt: "2026-10-11T09:48", environment: "indoor" }} />,
  );
  expect(container.querySelector("summary")?.textContent).toBe("Date, notes, heart rate, more");
  expect(screen.getByLabelText(/^When/)).toBeTruthy();
});

/**
 * WCAG review S4: a required field folded away (the date, the start time, which of two repeated
 * times) left Save doing nothing, the browser unable to show its message. The fold opens itself
 * when the browser finds one invalid, so it can.
 */
it("opens its fold when a required field in it is invalid", () => {
  const { container } = render(
    <CyclingForm {...props} initial={{ startedAt: "", environment: "indoor" }} />,
  );
  const fold = container.querySelector("details")!;
  expect(fold.open).toBe(false);
  expect(container.querySelector("form")!.checkValidity()).toBe(false);
  expect(fold.open).toBe(true);
});
