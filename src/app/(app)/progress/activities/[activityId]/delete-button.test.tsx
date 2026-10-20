// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { DeleteActivityButton } from "./delete-button";

const deleted = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/activities", () => ({ deleteActivityAction: deleted }));
afterEach(cleanup);

const ID = "fc0aa2bc-9610-4174-86a3-58d01aaef9a2";

/** Tapped once, it asks; the question is everything deleting will do. */
function arm() {
  fireEvent.click(screen.getByRole("button", { name: "Delete activity" }));
  expect(deleted).not.toHaveBeenCalled();
}

it("says a planned session can be logged again when it will", () => {
  render(<DeleteActivityButton activityId={ID} noun="run" answered="reopens" />);
  arm();
  expect(
    screen.getByText("Deletes this run for good. Its planned session can be logged again."),
  ).toBeTruthy();
  // Armed, the button says what it does, not how to tap it.
  expect(screen.getByRole("button", { name: "Delete this run" })).toBeTruthy();
  expect(screen.queryByText(/Tap again/)).toBeNull();
});

/**
 * Liam's run answered a session of Hybrid Half Marathon, archived since (ADR 0054). Deleted, the
 * session cannot be logged again, and the question used to promise that it could: the one
 * safeguard before a delete that cannot be undone said the opposite of what would happen.
 */
it("does not promise a closed programme's session back to be logged", () => {
  render(<DeleteActivityButton activityId={ID} noun="run" answered="closed" />);
  arm();
  expect(
    screen.getByText(
      "Deletes this run for good. Its programme has ended, so the session cannot be logged again.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/can be logged again/)).toBeNull();
});

it("says nothing of a planned session when it answered none", () => {
  render(<DeleteActivityButton activityId={ID} noun="ride" answered={null} />);
  arm();
  expect(screen.getByText("Deletes this ride for good.")).toBeTruthy();
});
