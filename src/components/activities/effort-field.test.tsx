// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";

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

it("names the field for a screen reader without printing the word twice", () => {
  render(
    <Section title="Effort">
      <Card>
        <EffortField value="" />
      </Card>
    </Section>,
  );
  // One visible "Effort" — the section heading. The field's own label is still in the
  // accessibility tree, which is what `getByRole` below reads it by.
  const visible = screen
    .getAllByText("Effort")
    .filter((node) => !node.closest(".sr-only") && !node.classList.contains("sr-only"));
  expect(visible).toHaveLength(1);
  expect(visible[0]?.tagName).toBe("H2");
  expect(screen.getByRole("radiogroup", { name: "Effort" })).toBeTruthy();
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
