// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

it("greys out the last reading rather than a made-up weight, and never submits it", () => {
  const { container } = render(<FinishForm {...props} lastBodyWeight="64.9" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" }) as HTMLInputElement;
  expect(field.placeholder).toBe("64.9");
  expect(field.value).toBe("");
  // Left blank, the day gets no reading: a placeholder is not a value.
  expect(new FormData(container.querySelector("form")!).get("bodyWeight")).toBe("");
});

it("suggests no weight to an account that has never recorded one", () => {
  render(<FinishForm {...props} lastBodyWeight="" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" });
  expect(field.hasAttribute("placeholder")).toBe(false);
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

it("finishes a session with sets in it as before", () => {
  render(<FinishForm {...props} lastBodyWeight="" />);
  expect(screen.getByRole("button", { name: "Finish session" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Discard session" })).toBeNull();
});
