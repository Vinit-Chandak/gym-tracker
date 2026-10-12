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

it("says a planned session becomes loggable again when it will", () => {
  render(<DeleteActivityButton activityId={ID} answered="reopens" />);
  arm();
  expect(
    screen.getByText(
      "This removes the log and its shared statistics, and the planned session becomes loggable again. It cannot be undone.",
    ),
  ).toBeTruthy();
});

/**
 * Liam's run answered a session of Hybrid Half Marathon, archived since (ADR 0054). Deleted, the
 * session cannot be logged again, and the question used to promise that it could: the one
 * safeguard before a delete that cannot be undone said the opposite of what would happen.
 */
it("does not promise a closed programme's session back to be logged", () => {
  render(<DeleteActivityButton activityId={ID} answered="closed" />);
  arm();
  expect(
    screen.getByText(
      "This removes the log and its shared statistics, and the planned session cannot be logged again: its programme has ended. It cannot be undone.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/becomes loggable again/)).toBeNull();
});

it("says nothing of a planned session when it answered none", () => {
  render(<DeleteActivityButton activityId={ID} answered={null} />);
  arm();
  expect(
    screen.getByText("This removes the log and its shared statistics. It cannot be undone."),
  ).toBeTruthy();
});
