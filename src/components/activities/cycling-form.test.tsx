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
