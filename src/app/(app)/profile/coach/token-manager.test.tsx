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

it("keeps the token's inset at its points as the text grows, so the room goes to the token", async () => {
  // As every field's (input.tsx): p-2 is in rem and doubled to 16 pt a side at 200% text.
  render(<TokenManager tokens={[]} />);
  await makeToken("ovl_coach_fourth");
  const box = screen.getByLabelText("New coach token");
  expect(box.className).not.toMatch(/(?:^|\s)p[xytrbl]?-\d/);
  expect(box.className).toContain("p-[calc(8*var(--ov-u))]");
});

it("keeps the name and expiry when a token is refused, and empties them once one is made", async () => {
  render(<TokenManager tokens={[]} />);
  const name = () => screen.getByLabelText("Name") as HTMLInputElement;
  const expiry = () => screen.getByLabelText("Expires after") as HTMLSelectElement;
  create.mockResolvedValue({
    error:
      "Could not create a token. Check your connection and that you have fewer than 10 active tokens.",
  });
  fireEvent.change(name(), { target: { value: "Track coach" } });
  fireEvent.change(expiry(), { target: { value: "365" } });
  fireEvent.click(screen.getByRole("button", { name: "Create token" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not create"));
  // React resets a form after its action: the select went back to 90 days, the name to blank.
  expect([name().value, expiry().value]).toEqual(["Track coach", "365"]);

  create.mockResolvedValue({ token: "ovl_coach_kept", expiresAt: "2027-10-21T00:00:00.000Z" });
  fireEvent.click(screen.getByRole("button", { name: "Create token" }));
  await waitFor(() =>
    expect(screen.getByLabelText("New coach token")).toHaveProperty("value", "ovl_coach_kept"),
  );
  expect([name().value, expiry().value]).toEqual(["", "90"]);
});
