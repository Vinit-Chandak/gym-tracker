// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SignUpForm } from "./signup-form";

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/server/actions/auth", () => ({
  signUpAction: (_: unknown, form: FormData) => signUp(form),
}));

afterEach(() => {
  cleanup();
  signUp.mockReset();
});

it("asks for a name, an email and one password, and nothing else", () => {
  render(<SignUpForm />);
  expect(screen.getByLabelText("Name")).toBeTruthy();
  expect(screen.getByLabelText("Email")).toBeTruthy();
  expect(screen.getByLabelText("Password")).toBeTruthy();
  // The password is checked by showing it, not by typing it twice; the username is made.
  expect(screen.queryByLabelText("Confirm password")).toBeNull();
  expect(screen.queryByLabelText(/username/i)).toBeNull();
});

it("shows the password on request", () => {
  render(<SignUpForm />);
  const password = screen.getByLabelText("Password") as HTMLInputElement;
  expect(password.type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(password.type).toBe("text");
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password.type).toBe("password");
});

it("keeps what was typed and says what was wrong under its field", async () => {
  signUp.mockResolvedValue({ error: "Use at least 8 characters.", field: "password" });
  render(<SignUpForm />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cara Newcomer" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "cara@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Use at least 8 characters."),
  );
  expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
  // Retyping a name and an address to fix a password is work nobody should be given.
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Cara Newcomer");
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("cara@example.com");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("short");
});
