// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { FinishForm } from "./finish-form";

vi.mock("@/server/actions/sessions", () => ({ discardSessionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

afterEach(cleanup);

const props = {
  action: async () => ({}),
  initialBodyWeight: "",
  unit: "kg" as const,
  userId: "user",
  sessionId: "session",
};

it("says the last reading beside the field, never as a grey figure in it, and never submits it", () => {
  const { container } = render(<FinishForm {...props} lastBodyWeight="64.9" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" }) as HTMLInputElement;
  // A grey figure in a field is a suggestion that will be recorded (the logger's); this is not.
  expect(field.hasAttribute("placeholder")).toBe(false);
  expect(
    screen.getByText("Optional. Last reading 64.9 kg; what you type is today's."),
  ).toBeTruthy();
  expect(field.value).toBe("");
  expect(new FormData(container.querySelector("form")!).get("bodyWeight")).toBe("");
});

it("names no reading to an account that has never recorded one", () => {
  render(<FinishForm {...props} lastBodyWeight="" />);
  expect(screen.getByText("Optional. What you type is today's reading.")).toBeTruthy();
});

it("offers to discard a session with nothing logged before finishing it as a record", () => {
  render(<FinishForm {...props} lastBodyWeight="" nothingLogged />);
  expect(screen.getByText("Nothing logged.")).toBeTruthy();
  const discard = screen.getByRole("button", { name: "Discard session" });
  const finish = screen.getByRole("button", { name: "Finish anyway" });
  // Discarding comes first; finishing stays, for a day of exercises skipped with their reasons.
  expect(discard.compareDocumentPosition(finish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(finish.getAttribute("type")).toBe("submit");
  expect(screen.queryByRole("button", { name: "Finish session" })).toBeNull();
});

it("leads with Finish once something is typed, so Discard never drops it unsaid", () => {
  render(<FinishForm {...props} lastBodyWeight="" nothingLogged />);
  fireEvent.input(screen.getByRole("textbox", { name: "Notes" }), {
    target: { value: "Felt ill, went home" },
  });
  const finish = screen.getByRole("button", { name: "Finish and keep it" });
  const discard = screen.getByRole("button", { name: "Discard session and what I typed" });
  expect(finish.compareDocumentPosition(discard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Discard session" })).toBeNull();
});

it("finishes a session with sets in it as before", () => {
  render(<FinishForm {...props} lastBodyWeight="" />);
  expect(screen.getByRole("button", { name: "Finish session" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Discard session" })).toBeNull();
});
