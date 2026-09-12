// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TokenManager } from "./token-manager";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/server/actions/coach-tokens", () => ({
  createCoachTokenAction: (_previous: unknown, form: FormData) => create(form),
  revokeCoachTokenAction: vi.fn(),
}));

const clipboard = { writeText: vi.fn() };

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  clipboard.writeText.mockReset().mockResolvedValue(undefined);
  create.mockReset();
});
afterEach(cleanup);

async function makeToken(token: string) {
  create.mockResolvedValue({ token, expiresAt: "2026-12-11T00:00:00.000Z" });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My coach" } });
  fireEvent.click(screen.getByRole("button", { name: "Create token" }));
  await waitFor(() =>
    expect(screen.getByLabelText("New coach token")).toHaveProperty("value", token),
  );
}

it("only vouches for the token that was actually copied", async () => {
  render(<TokenManager tokens={[]} />);
  await makeToken("ovl_coach_first");
  fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());

  // A second token replaces the first in the same panel. It has not been copied, and this one
  // is shown only once, so the button must not still say it has.
  await makeToken("ovl_coach_second");
  expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Copy token" })).toBeTruthy();
});

it("says so when the clipboard refuses, instead of looking like nothing happened", async () => {
  render(<TokenManager tokens={[]} />);
  await makeToken("ovl_coach_third");
  clipboard.writeText.mockRejectedValue(new Error("Write permission denied."));
  fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("copy it by hand"));
  expect(screen.getByRole("button", { name: "Copy token" })).toBeTruthy();
  expect((screen.getByLabelText("New coach token") as HTMLTextAreaElement).value).toBe(
    "ovl_coach_third",
  );
});
