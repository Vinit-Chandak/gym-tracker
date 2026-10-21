// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SavedBar } from "./saved-bar";

const deleted = vi.hoisted(() => vi.fn(async () => ({ ok: true }) as const));
vi.mock("@/server/actions/activities", () => ({ deleteActivityAction: deleted }));
afterEach(() => {
  cleanup();
  deleted.mockClear();
});

const ID = "fc0aa2bc-9610-4174-86a3-58d01aaef9a2";

it("says a new run was kept, as a status, and Undo removes it and goes back to its tab", async () => {
  render(<SavedBar activityId={ID} said="Run saved as intervals" undo origin="today" />);
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Run saved as intervals");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  });
  expect(deleted).toHaveBeenCalledWith(ID, "today");
});

it("offers no Undo for a correction, which would delete the record rather than the change", () => {
  render(<SavedBar activityId={ID} said="Changes saved" undo={false} origin={null} />);
  expect(screen.getByRole("status").textContent).toContain("Changes saved");
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});
