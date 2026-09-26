// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { USERNAME_CHECK_DELAY_MS, UsernameField } from "./username-field";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/server/actions/people", () => ({
  checkUsernameAction: (candidate: string) => check(candidate),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  check.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const field = () => screen.getByLabelText("Username") as HTMLInputElement;
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const settle = () => act(() => vi.advanceTimersByTimeAsync(USERNAME_CHECK_DELAY_MS));

it("says why a name breaks the rules without asking the server", async () => {
  render(<UsernameField />);
  type("Vi");
  await settle();
  expect(screen.getByText("Use 3 to 20 characters.")).toBeTruthy();
  type("coach");
  await settle();
  expect(screen.getByText("That name is reserved.")).toBeTruthy();
  expect(check).not.toHaveBeenCalled();
});

it("asks the server once typing pauses, and reports the answer", async () => {
  check.mockResolvedValue("taken");
  render(<UsernameField />);
  type("phan");
  type("phani");
  type("phani03");
  expect(check).not.toHaveBeenCalled();
  await settle();
  expect(check).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledWith("phani03");
  expect(screen.getByRole("alert").textContent).toBe("That username is taken.");

  check.mockResolvedValue("available");
  type("phani04");
  await settle();
  expect(screen.getByText("Available.")).toBeTruthy();
});

it("does not call your own current username taken", async () => {
  check.mockResolvedValue("taken");
  render(<UsernameField defaultValue="vinit" current="vinit" />);
  await settle();
  expect(check).not.toHaveBeenCalled();
  type("vinit2");
  type("vinit");
  await settle();
  expect(check).not.toHaveBeenCalled();
  expect(screen.getByText("This is your current username.")).toBeTruthy();
});

it("shows the server's refusal until the field is edited again", async () => {
  check.mockResolvedValue("available");
  const { rerender } = render(<UsernameField defaultValue="vinit" current="vinit" />);
  rerender(<UsernameField defaultValue="vinit" current="vinit" error="That username is taken." />);
  expect(screen.getByRole("alert").textContent).toBe("That username is taken.");
  type("vinit_c");
  await settle();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Available.")).toBeTruthy();
});

it("does not leave a failed availability request checking forever", async () => {
  check.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<UsernameField />);
  type("alex123");
  await settle();
  expect(screen.queryByText("Checking…")).toBeNull();
  expect(
    screen.getByText("Could not check availability. It will be checked when you save."),
  ).toBeTruthy();
  expect(field().value).toBe("alex123");
  check.mockResolvedValueOnce("available");
  type("alex1234");
  await settle();
  expect(screen.getByText("Available.")).toBeTruthy();
});
