// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "./forgot-password-form";

const state = vi.hoisted(() => ({
  current: {} as { error?: string; sent?: boolean },
  dispatch: vi.fn(),
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useActionState: () => [state.current, state.dispatch, false] };
});
vi.mock("@/server/actions/auth", () => ({ requestPasswordResetAction: vi.fn() }));

afterEach(() => {
  cleanup();
  state.current = {};
  state.dispatch.mockReset();
});

it("sends the address and leaves it in the field to send again", () => {
  render(<ForgotPasswordForm />);
  const email = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
  fireEvent.change(email, { target: { value: "name@example.com" } });
  fireEvent.submit(email.form!);
  const sent = state.dispatch.mock.calls[0]?.[0] as FormData;
  expect(sent.get("email")).toBe("name@example.com");
  expect(email.value).toBe("name@example.com");
});

it("says why a request did not go through", () => {
  state.current = {
    error: "Could not reach the sign-in service. Check your connection and try again.",
  };
  render(<ForgotPasswordForm />);
  expect(screen.getByRole("alert").textContent).toContain("Could not reach the sign-in service");
});
