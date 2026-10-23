// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { SportChoice } from "./sport-choice";

afterEach(cleanup);

it("confirms a saved selection, then removes confirmation for unsaved choices", async () => {
  const action = vi.fn(async () => ({}));
  render(
    <SportChoice
      action={action}
      sports={ACTIVITY_SPORTS}
      enabled={["running"]}
      submitLabel="Save"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Sports saved");
  fireEvent.click(screen.getByRole("checkbox", { name: "Swimming" }));
  expect(screen.queryByText("Sports saved")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Sports saved");
  expect(action).toHaveBeenCalledTimes(2);
});

it("keeps a failed choice available to retry and displays field-level refusals", async () => {
  const action = vi
    .fn()
    .mockResolvedValueOnce({ fieldErrors: { sports: "Choose a valid sport." } })
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({});
  render(
    <SportChoice
      action={action}
      sports={ACTIVITY_SPORTS}
      enabled={["running"]}
      submitLabel="Save"
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Swimming" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Choose a valid sport.");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Connection lost/));
  expect(screen.getByRole("checkbox", { name: "Swimming" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Sports saved");
});
