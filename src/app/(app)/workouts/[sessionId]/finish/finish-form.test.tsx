// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { FinishForm } from "./finish-form";

vi.mock("@/server/actions/sessions", () => ({ discardSessionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

afterEach(cleanup);

/** What a control is described by, in order: its aside, then the line under it. */
const described = (control: Element) =>
  (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

const props = {
  action: async () => ({}),
  initialBodyWeight: "",
  unit: "kg" as const,
  userId: "user",
  sessionId: "session",
};

it("says the last reading under the field, never as a grey figure in it, and never submits it", () => {
  const { container } = render(<FinishForm {...props} lastBodyWeight="64.9" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" }) as HTMLInputElement;
  // A grey figure in a field is a suggestion that will be recorded (the logger's); this is not.
  expect(field.hasAttribute("placeholder")).toBe(false);
  // Optional is the label's aside; the line under the field is the figure it remembers.
  expect(described(field)).toEqual(["Optional", "Last 64.9\u00a0kg"]);
  expect(field.value).toBe("");
  expect(new FormData(container.querySelector("form")!).get("bodyWeight")).toBe("");
});

it("names no reading to an account that has never recorded one", () => {
  render(<FinishForm {...props} lastBodyWeight="" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" });
  expect(described(field)).toEqual(["Optional"]);
});

it("asks the coach's questions in the notes' example only while there is a coach", () => {
  render(<FinishForm {...props} lastBodyWeight="" coach />);
  expect(screen.getByRole("textbox", { name: "Notes" }).getAttribute("placeholder")).toBe(
    "How it went, anything the coach should know…",
  );
  cleanup();

  render(<FinishForm {...props} lastBodyWeight="" />);
  expect(screen.getByRole("textbox", { name: "Notes" }).getAttribute("placeholder")).toBe(
    "How it went…",
  );
  expect(screen.queryByText(/coach/)).toBeNull();
});

it("offers to discard a session with nothing logged before finishing it as a record", () => {
  render(<FinishForm {...props} lastBodyWeight="" nothingLogged />);
  // Said once, over the way out, whose buttons say what each keeps or drops.
  expect(screen.getAllByText(/Nothing logged/)).toHaveLength(1);
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

it("finishes a workout left open as of its last set, and says so on the button", () => {
  const { container } = render(
    <FinishForm {...props} lastBodyWeight="" asOf="Sat 10 Oct, 19:30" />,
  );
  const finish = screen.getByRole("button", { name: "Finish it as of Sat 10 Oct, 19:30" });
  expect(finish.getAttribute("type")).toBe("submit");
  expect(new FormData(container.querySelector("form")!).get("asOf")).toBe("last-set");
  cleanup();

  // Not left open, it finishes now, and asks for nothing else.
  const fresh = render(<FinishForm {...props} lastBodyWeight="" />);
  expect(screen.getByRole("button", { name: "Finish session" })).toBeTruthy();
  expect(new FormData(fresh.container.querySelector("form")!).get("asOf")).toBeNull();
});
