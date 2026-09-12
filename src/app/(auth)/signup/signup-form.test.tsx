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

it("keeps the name and address when the attempt is refused", async () => {
  signUp.mockResolvedValue({ error: "The two passwords do not match." });
  render(<SignUpForm />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cara Newcomer" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "cara@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "one-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "another" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("The two passwords do not match."),
  );
  // Retyping a name and an address to fix a mistyped password is work nobody should be given.
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Cara Newcomer");
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("cara@example.com");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
});
