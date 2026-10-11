// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SentRequestRow } from "./request-row";

const actions = vi.hoisted(() => ({
  acceptRequestAction: vi.fn(),
  declineRequestAction: vi.fn(),
  cancelRequestAction: vi.fn(),
}));
vi.mock("@/server/actions/follows", () => actions);
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no <dialog> implementation; the sheet only needs these to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

const kenji = { id: "k1", username: "kenji", displayName: "Kenji Watanabe" };
const button = (name: string) => screen.getByRole("button", { name });

it("names the person asked, opens their page, and withdraws the request only once confirmed", async () => {
  actions.cancelRequestAction.mockResolvedValue(undefined);
  render(<SentRequestRow person={kenji} />);
  expect(screen.getByText("Kenji Watanabe").closest("a")?.getAttribute("href")).toBe("/u/kenji");

  fireEvent.click(button("Cancel"));
  expect(screen.getByRole("heading", { name: "Cancel request?" })).toBeTruthy();
  fireEvent.click(button("Keep"));
  expect(actions.cancelRequestAction).not.toHaveBeenCalled();

  fireEvent.click(button("Cancel"));
  fireEvent.click(button("Cancel request"));
  await waitFor(() => expect(actions.cancelRequestAction).toHaveBeenCalledWith("k1"));
});

it("says so when the request could not be withdrawn", async () => {
  actions.cancelRequestAction.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<SentRequestRow person={kenji} />);
  fireEvent.click(button("Cancel"));
  fireEvent.click(button("Cancel request"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Could not save/));
});
