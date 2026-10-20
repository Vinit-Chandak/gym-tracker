// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OccurrenceActions } from "./occurrence-actions";

vi.mock("@/server/actions/occurrences", () => ({
  removeOccurrenceAction: vi.fn(),
  reopenOccurrenceAction: vi.fn(),
  rescheduleOccurrenceAction: vi.fn(),
  skipOccurrenceAction: vi.fn(),
}));
afterEach(cleanup);

const skipped = {
  occurrenceId: "00000000-0000-4000-8000-000000000001",
  skipped: true,
  scheduledOn: "2026-10-01",
  today: "2026-10-12",
  standalone: false,
};

/**
 * Review, 12 October 2026: "Pick up from today" skips every run it passes, and each one's page
 * offers "Put it back". Put back, a run the sequence went past is owed before everything after
 * it, so the programme goes back to it, cycles back for an old one; that is a tap away beside
 * the button, before it is tapped, not found out on Today after.
 */
it("keeps what putting a passed run back does a tap away beside the button", () => {
  render(<OccurrenceActions {...skipped} putBackGoesNext />);
  expect(screen.getByRole("button", { name: "Put it back" })).toBeTruthy();
  expect(screen.queryByText(/Today offers it next/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About putting it back" }));
  expect(
    screen.getByText("The programme goes back to this session, and Today offers it next."),
  ).toBeTruthy();
});

it("says nothing about a run still ahead of the programme", () => {
  render(<OccurrenceActions {...skipped} />);
  expect(screen.getByRole("button", { name: "Put it back" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "About putting it back" })).toBeNull();
  // How skipping works is not said on the page.
  expect(screen.queryByText(/stay in the programme/)).toBeNull();
});

/**
 * Impeccable review, 20 October 2026: the page had two black primaries, Log it and Move it.
 * Logging is its one primary; moving stands quieter, and says nothing about what moves.
 */
it("moves the session with a quieter button than logging", () => {
  render(<OccurrenceActions {...skipped} skipped={false} />);
  const move = screen.getByRole("button", { name: "Move it" });
  expect(move.classList).not.toContain("bg-ink");
  expect(move.classList).toContain("bg-surface-control");
  expect(screen.queryByText(/Only this session moves/)).toBeNull();
});

/** Removing has no undo: armed, it says so once and names what the second tap does. */
it("asks twice before taking a session off the calendar", () => {
  render(<OccurrenceActions {...skipped} skipped={false} standalone />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from the calendar" }));
  expect(screen.getByText("It cannot be undone.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove this session" })).toBeTruthy();
  expect(screen.queryByText(/Scheduled/)).toBeNull();
});
