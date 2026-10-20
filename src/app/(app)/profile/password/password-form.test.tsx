// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updatePasswordAction: vi.fn() }));
vi.mock("@/server/actions/auth", () => mocks);

import { PasswordForm } from "./password-form";
import { ResetPasswordForm } from "../../../(auth)/reset-password/reset-password-form";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each([
  ["account", PasswordForm, "Save password"],
  ["recovery", ResetPasswordForm, "Save new password"],
] as const)(
  "keeps both %s password fields when a correction is needed",
  async (_name, Form, label) => {
    mocks.updatePasswordAction.mockResolvedValue({ error: "The two passwords do not match." });
    render(<Form />);
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "New-password-1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "New-password-2!" },
    });
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/do not match/));
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe(
      "New-password-1!",
    );
    expect((screen.getByLabelText("Confirm new password") as HTMLInputElement).value).toBe(
      "New-password-2!",
    );

    mocks.updatePasswordAction.mockResolvedValue({ done: true });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "New-password-1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Password updated/));
    expect(screen.queryByLabelText("New password")).toBeNull();
  },
);
