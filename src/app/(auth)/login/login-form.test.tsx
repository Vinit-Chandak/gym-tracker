// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const state = vi.hoisted(() => ({
  current: {} as { error?: string; field?: string },
  dispatch: vi.fn(),
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useActionState: () => [state.current, state.dispatch, false] };
});
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/auth", () => ({ signInAction: vi.fn() }));

afterEach(() => {
  cleanup();
  state.current = {};
  state.dispatch.mockReset();
});

it("puts a field's own error under that field and marks it", () => {
  state.current = {
    error: "Enter a valid email address, such as name@example.com.",
    field: "email",
  };
  render(<LoginForm />);
  const email = screen.getByRole("textbox", { name: "Email" });
  expect(email.getAttribute("aria-invalid")).toBe("true");
  const said = document.getElementById(email.getAttribute("aria-describedby")!.split(" ")[0]!);
  expect(said?.textContent).toBe("Enter a valid email address, such as name@example.com.");
});

it("ties a sign-in that did not work to both fields", () => {
  state.current = { error: "That email and password combination did not work." };
  const { container } = render(<LoginForm />);
  for (const input of container.querySelectorAll("input[name=email], input[name=password]")) {
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const said = document.getElementById(input.getAttribute("aria-describedby")!);
    expect(said?.textContent).toBe("That email and password combination did not work.");
  }
});

it("shows the password on request, and keeps what was typed", () => {
  const { container } = render(<LoginForm />);
  const password = container.querySelector("input[name=password]") as HTMLInputElement;
  fireEvent.change(password, { target: { value: "secret" } });
  expect(password.type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(password.type).toBe("text");
  expect(password.value).toBe("secret");
});

it("sends what was typed and leaves it in the fields", () => {
  const { container } = render(<LoginForm />);
  const email = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
  const password = container.querySelector("input[name=password]") as HTMLInputElement;
  fireEvent.change(email, { target: { value: "name@example.com" } });
  fireEvent.change(password, { target: { value: "secret" } });
  fireEvent.submit(email.form!);
  const sent = state.dispatch.mock.calls[0]?.[0] as FormData;
  expect(sent.get("email")).toBe("name@example.com");
  expect(sent.get("password")).toBe("secret");
  expect(email.value).toBe("name@example.com");
  expect(password.value).toBe("secret");
});
