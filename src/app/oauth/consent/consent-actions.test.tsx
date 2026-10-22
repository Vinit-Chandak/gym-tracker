// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ConsentActions } from "./consent-actions";

afterEach(cleanup);

it("shows the most recent refusal when the user switches from connect to decline", async () => {
  const action = vi.fn(async (_state, form: FormData) => ({
    error: form.get("decision") === "approve" ? "Could not connect." : "Could not decline.",
  }));
  render(<ConsentActions action={action} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect ChatGPT backup" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Could not connect."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Could not decline."),
  );
  expect(action).toHaveBeenCalledTimes(2);
});
