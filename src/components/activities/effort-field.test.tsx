// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { EffortField } from "./activity-form-fields";
import { RunningForm } from "./running-form";

/**
 * The effort question at the screen: the choices offered, and the fact that the word "Effort"
 * is printed once. Both had to be corrected together — a picker of ten is only sensible while
 * the answers are that fine, and the stutter was the section heading and the field label
 * saying the same word one line apart.
 */

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(cleanup);

it("offers five steps and Not sure, and nothing between them", () => {
  render(<EffortField value="" />);
  const group = screen.getByRole("radiogroup", { name: "Effort" });
  const offered = within(group)
    .getAllByRole("radio")
    .map((radio) => (radio as HTMLInputElement).value);
  expect(offered).toEqual(["1", "2", "3", "4", "5", "unsure"]);
});

it("says what the ends of the scale mean", () => {
  render(<EffortField value="" />);
  expect(screen.getByText(/1 very easy to 5 maximal/)).toBeTruthy();
  // "Not sure" is an answer, and the hint has to keep saying so (LOG-03).
  expect(screen.getByText(/Not sure is an answer/)).toBeTruthy();
});

it("keeps the chosen answer when the form comes back with an error elsewhere", () => {
  render(<EffortField value="3" />);
  const chosen = screen.getByRole("radio", { name: "3" }) as HTMLInputElement;
  expect(chosen.defaultChecked).toBe(true);
});

it("names the field for a screen reader by the word it prints, once", () => {
  render(<EffortField value="" />);
  // One visible "Effort": the field's own name at the gutter, which the scale is labelled by.
  const visible = screen
    .getAllByText("Effort")
    .filter((node) => !node.closest(".sr-only") && !node.classList.contains("sr-only"));
  expect(visible).toHaveLength(1);
  expect(screen.getByRole("radiogroup", { name: "Effort" })).toBeTruthy();
});

/**
 * LOG-03: correcting a record whose effort is an unconfirmed legacy number keeps that number
 * unless another answer is chosen. Offering only 1–5 and Not sure pre-selected Not sure, and
 * the number went with the next save.
 */
it("offers to keep an unconfirmed legacy effort, chosen from the start", () => {
  render(<EffortField value="keep" kept={{ value: 3 }} />);
  const kept = screen.getByRole("radio", { name: "As recorded" }) as HTMLInputElement;
  expect(kept.value).toBe("keep");
  expect(kept.defaultChecked).toBe(true);
  expect(screen.getByText(/keeps the earlier 3\/5, still unconfirmed/)).toBeTruthy();
});

it("offers nothing to keep on a new log", () => {
  render(<EffortField value="" />);
  expect(screen.queryByRole("radio", { name: "As recorded" })).toBeNull();
});

it("asks the run form's effort question exactly once", () => {
  render(
    <RunningForm
      action={vi.fn(async () => ({}))}
      initial={{
        startedAt: "2026-09-18T07:00",
        environment: "outdoor",
        distanceUnit: "km",
        hours: "",
        minutes: "",
        seconds: "",
        effort: "",
      }}
      submissionKey="11111111-1111-4111-8111-111111111111"
      submitLabel="Save activity"
    />,
  );
  const visible = screen
    .getAllByText("Effort")
    .filter((node) => !node.closest(".sr-only") && !node.classList.contains("sr-only"));
  expect(visible).toHaveLength(1);
  expect(screen.getByRole("radiogroup", { name: "Effort" })).toBeTruthy();
});
