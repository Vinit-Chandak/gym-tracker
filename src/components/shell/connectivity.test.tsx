// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Connectivity } from "./connectivity";

function connection(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

const height = () => document.documentElement.style.getPropertyValue("--connectivity-height");

beforeEach(() => {
  // The notice wraps to two lines on a phone.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: 57,
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

it("says nothing while connected", () => {
  render(<Connectivity />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(height()).toBe("");
});

it("gives its measured height to the workout's layer while offline, and takes it back", () => {
  render(<Connectivity />);
  act(() => connection(false));
  expect(screen.getByRole("status").textContent).toMatch(/You're offline/);
  // A workout's layer starts its header under the notice by this (globals.css).
  expect(height()).toBe("57px");
  act(() => connection(true));
  expect(screen.queryByRole("status")).toBeNull();
  expect(height()).toBe("");
});

it("takes the height back when it leaves the page offline", () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const view = render(<Connectivity />);
  expect(height()).toBe("57px");
  view.unmount();
  expect(height()).toBe("");
});
