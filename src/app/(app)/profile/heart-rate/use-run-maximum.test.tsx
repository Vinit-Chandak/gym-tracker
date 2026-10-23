// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/server/actions/heart-rate", () => ({
  adoptRunMaxHeartRateAction: vi.fn(async () => ({ ok: false })),
}));
import { UseRunMaximum } from "./use-run-maximum";
afterEach(cleanup);
it("explains when a previously offered run reading is no longer available", async () => {
  render(<UseRunMaximum bpm={195} on="21 Oct" />);
  fireEvent.click(screen.getByRole("button", { name: "Use 195 as my maximum" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/no longer available/);
});
