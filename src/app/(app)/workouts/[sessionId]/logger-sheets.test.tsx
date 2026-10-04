// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";

import { WhySheet } from "./logger-sheets";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

it("explains the suggestion and stops there: History is the tab behind it", () => {
  render(
    <WhySheet
      open
      onClose={() => {}}
      why={{
        tag: "Coach plan",
        figures: { load: "60", unit: "kg", count: "6", effort: "2" },
        reason: null,
        advice: null,
        basis: "Based on this exercise, 26 Sep.",
        coachNote: "Same load and reps as 26 Sep.",
        warning: null,
      }}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: "Why this suggestion", hidden: true });
  expect(sheet.textContent).toContain("Same load and reps as 26 Sep.");
  expect(sheet.textContent).toContain("Based on this exercise, 26 Sep.");
  expect(screen.queryByRole("button", { name: "History", hidden: true })).toBeNull();
});
