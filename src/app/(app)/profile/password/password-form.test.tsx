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
    mocks.updatePasswordAction.mockResolvedValue({
      error: "The two passwords do not match.",
      field: "confirmPassword",
    });
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

    const confirmation = screen.getByLabelText("Confirm new password");
    expect(confirmation.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(confirmation, { target: { value: "Still-not-matching" } });
    expect(confirmation.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/do not match/);

    mocks.updatePasswordAction.mockResolvedValue({ done: true });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "New-password-1!" },
    });
    expect(confirmation.getAttribute("aria-invalid")).not.toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Password updated/));
    expect(screen.queryByLabelText("New password")).toBeNull();
  },
);

it.each([
  ["account", PasswordForm, "Save password"],
  ["recovery", ResetPasswordForm, "Save new password"],
] as const)(
  "keeps a refused %s password marked until that value changes",
  async (_name, Form, label) => {
    mocks.updatePasswordAction.mockResolvedValue({
      error: "That is already your password. Choose a different one.",
      field: "password",
    });
    render(<Form />);
    const password = screen.getByLabelText("New password");
    const confirmation = screen.getByLabelText("Confirm new password");
    fireEvent.change(password, { target: { value: "Already-password-1!" } });
    fireEvent.change(confirmation, { target: { value: "Already-password-1!" } });
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(password.getAttribute("aria-invalid")).toBe("true"));
    fireEvent.change(confirmation, { target: { value: "Unrelated-change-1!" } });
    expect(password.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(password, { target: { value: "short" } });
    expect(password.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(password, { target: { value: "Different-password-1!" } });
    expect(password.getAttribute("aria-invalid")).not.toBe("true");
    fireEvent.change(password, { target: { value: "Already-password-1!" } });
    expect(password.getAttribute("aria-invalid")).toBe("true");
  },
);

it("shows a disconnected retry as a form failure after a password field was corrected", async () => {
  mocks.updatePasswordAction.mockResolvedValueOnce({
    error: "The two passwords do not match.",
    field: "confirmPassword",
  });
  render(<PasswordForm />);
  const password = screen.getByLabelText("New password");
  const confirmation = screen.getByLabelText("Confirm new password");
  fireEvent.change(password, { target: { value: "New-password-1!" } });
  fireEvent.change(confirmation, { target: { value: "Mismatching-password-2!" } });
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  await waitFor(() => expect(confirmation.getAttribute("aria-invalid")).toBe("true"));
  fireEvent.change(confirmation, { target: { value: "New-password-1!" } });
  mocks.updatePasswordAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Connection lost/));
  expect(password.getAttribute("aria-invalid")).not.toBe("true");
  expect(confirmation.getAttribute("aria-invalid")).not.toBe("true");
  expect((password as HTMLInputElement).value).toBe("New-password-1!");
  expect((confirmation as HTMLInputElement).value).toBe("New-password-1!");
});
